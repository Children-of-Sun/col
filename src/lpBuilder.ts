import { Recipe, Demand, RedundancyResource } from './types';
import { isRaw, isOre, isNonScalable } from './utils';

// 全局调试标志
const DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('factoryDebug') === 'true';

export interface LpInput {
  mainActive: Recipe[];
  powerActive: Recipe[];
  residentActive: Recipe[];
  stationActive: Recipe[];
  specialActive?: Recipe[];
  tradeActive?: Recipe[];
  ignored: Set<string>;
  demands: Demand[];
  externalSupplies: { item: string; rate: number }[];
  reductionFactor: number;
  steamLowMode: 'internal' | 'shared';
  excludedOutputs: Set<string>;
  excludedInputs: Set<string>;
  constraintMode?: 'noProd' | 'noProdOrCons';
  allowExternal?: boolean;
  optimizationMode: 'machines' | 'labor' | 'cohesion' | 'area' | 'raw' | 'custom';
  customWeights?: { machines: number; labor: number; cohesion: number; area: number; raw: number };
  fixedUnityProduction?: number;
  fixedUnityConsumption?: number;
  // 新增字段
  integerMode?: 'continuous' | 'ceil' | 'rounding' | 'milp';
  milpTimeLimit?: number;
  recipeIntegerEnabled?: Record<string, boolean>;
  fixedMachines?: Record<string, number>;
  // 人力约束：false 时强制人力 <= 人口，true 时跳过人力约束
  relaxLabor?: boolean;
  // 居民模块最小比例（r0 >= value），undefined 表示不加此约束
  minResidentValue?: number;
  // 资源冗余设置
  enableRedundancy?: boolean;
  globalLower?: number;
  globalUpper?: number;
  redundancyResources?: Record<string, RedundancyResource>;
  buildingSizes?: Record<string, { width: number; height: number }>;
  excludePowerFootprint?: boolean;
  excludeTradeFootprint?: boolean;
}

export interface LpOutput {
  lpString: string;
  varNames: string[];
  missing: string[];
}

export function buildLp(input: LpInput): LpOutput {
  const { 
    mainActive, powerActive, residentActive, stationActive, specialActive = [], tradeActive = [], 
    ignored, demands, externalSupplies, reductionFactor, steamLowMode, excludedOutputs, excludedInputs, 
    constraintMode, allowExternal, optimizationMode, customWeights, 
    fixedUnityProduction = 0, fixedUnityConsumption = 0,
    integerMode = 'continuous', milpTimeLimit = 30,
    fixedMachines = {},
    relaxLabor = false,
    minResidentValue,
    enableRedundancy = false,
    globalLower = 100,
    globalUpper = 100,
    redundancyResources = {},
    recipeIntegerEnabled = {},
    buildingSizes = {} as Record<string, { width: number; height: number }>,
    excludePowerFootprint = false,
    excludeTradeFootprint = false,
  } = input;
  
  const isAllowExternal = allowExternal ?? false;

  const externalSupplyMap = new Map<string, number>();
  for (const s of externalSupplies) {
    externalSupplyMap.set(s.item, s.rate);
  }

  const allActive = [...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive];

  const mainVarNames = mainActive.map((_, i) => `x${i}`);
  const powerVarNames = powerActive.map((_, i) => `p${i}`);
  const residentVarNames = residentActive.map((_, i) => `r${i}`);
  const stationVarNames = stationActive.map((_, i) => `s${i}`);
  const specialVarNames = specialActive.map((_, i) => `t${i}`);
  const tradeVarNames = tradeActive.map((_, i) => `tr${i}`);
  const varNames = [...mainVarNames, ...powerVarNames, ...residentVarNames, ...stationVarNames, ...specialVarNames, ...tradeVarNames];

  const isContinuous = (item: string): boolean => {
    return isNonScalable(item);
  };

  // 辅助函数：计算每个配方对某个目标的贡献系数（每单位变量）
  const computeTargetCoeffs = (target: string): number[] => {
    const coeffs: number[] = [];
    const allRecipes = [...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive];
    for (const recipe of allRecipes) {
      let coeff = 0;
      if (target === 'machines') {
        coeff = recipe.isSolar ? 0.01 : 1;
      } else if (target === 'labor') {
        coeff = recipe.upkeep['人力'] || 0;
      } else if (target === 'cohesion') {
        if (recipe.module === 'trade') {
          const unityPer100 = recipe.tradeUnityPer100 || 0;
          const buyItem = Object.keys(recipe.outputs)[0];
          const buyRate = recipe.outputs[buyItem];
          coeff = (buyRate / 100) * unityPer100;
        }
      } else if (target === 'area') {
        // 电力模块不计入占地 → 系数=0
        if (excludePowerFootprint && recipe.module === 'power') {
          coeff = 0;
        } else if (recipe.module === 'trade') {
          // 贸易不计入占地 → 系数=0
          if (excludeTradeFootprint) {
            coeff = 0;
          } else {
            // 贸易占地 = 码头 + 模块
            let area = 0;
            const dockKey = (recipe._tradeDockName || '').toLowerCase();
            const modKey = (recipe._tradeModuleName || '').toLowerCase();
            const dockSize = buildingSizes[dockKey];
            const modSize = buildingSizes[modKey];
            if (dockSize) area += dockSize.width * dockSize.height;
            if (modSize) area += modSize.width * modSize.height;
            coeff = area || 1;
          }
        } else {
          const key = recipe.buildingName?.toLowerCase?.() || '';
          const size = buildingSizes[key];
          coeff = size ? size.width * size.height : 1;
        }
      } else if (target === 'raw') {
        for (const [item, qty] of Object.entries(recipe.inputs)) {
          if (isOre(item)) {
            coeff += qty;
          }
        }
      }
      coeffs.push(coeff);
    }
    return coeffs;
  };

  // 构建目标函数字符串
  let objExpr = '';
  const allVarLists = [mainVarNames, powerVarNames, residentVarNames, stationVarNames, specialVarNames, tradeVarNames];
  const allRecipesList = [mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive];

  if (optimizationMode === 'custom' && customWeights) {
    const targets = ['machines', 'labor', 'cohesion', 'area', 'raw'];
    const weights = [customWeights.machines, customWeights.labor, customWeights.cohesion, customWeights.area, customWeights.raw];
    const totalCoeffs: number[] = new Array(varNames.length).fill(0);
    for (let t = 0; t < targets.length; t++) {
      if (weights[t] === 0) continue;
      const coeffs = computeTargetCoeffs(targets[t]);
      for (let i = 0; i < coeffs.length; i++) {
        totalCoeffs[i] += weights[t] * coeffs[i];
      }
    }
    const terms: string[] = [];
    for (let i = 0; i < varNames.length; i++) {
      if (Math.abs(totalCoeffs[i]) > 1e-9) {
        terms.push(`${totalCoeffs[i].toFixed(6)} ${varNames[i]}`);
      }
    }
    objExpr = terms.join(' + ');
  } else if (optimizationMode === 'cohesion') {
    const cohesionCoeffs = computeTargetCoeffs('cohesion');
    const machineCoeffs = computeTargetCoeffs('machines');
    const terms: string[] = [];
    let idx = 0;
    for (let i = 0; i < allRecipesList.length; i++) {
      const vars = allVarLists[i];
      const recipes = allRecipesList[i];
      for (let j = 0; j < recipes.length; j++) {
        const cohesion = cohesionCoeffs[idx + j];
        const machines = machineCoeffs[idx + j];
        const total = cohesion + machines * 0.0001;
        if (Math.abs(total) > 1e-9) {
          terms.push(`${total.toFixed(6)} ${vars[j]}`);
        }
      }
      idx += recipes.length;
    }
    objExpr = terms.join(' + ');
    if (DEBUG) {
      console.log('=== 凝聚力模式目标函数 ===');
      console.log(objExpr || '0');
    }
  } else {
    const target = optimizationMode === 'labor' ? 'labor' : (optimizationMode === 'area' ? 'area' : (optimizationMode === 'raw' ? 'raw' : 'machines'));
    const coeffs = computeTargetCoeffs(target);
    const terms: string[] = [];
    let idx = 0;
    for (let i = 0; i < allRecipesList.length; i++) {
      const vars = allVarLists[i];
      const recipes = allRecipesList[i];
      for (let j = 0; j < recipes.length; j++) {
        const coeff = coeffs[idx + j];
        if (Math.abs(coeff) > 1e-9) {
          terms.push(`${coeff.toFixed(6)} ${vars[j]}`);
        }
      }
      idx += recipes.length;
    }
    objExpr = terms.join(' + ');
  }

  if (!objExpr) objExpr = '0';

  let lp = `Minimize\n obj: ${objExpr}\nSubject To\n`;

  // 固定空间站、特殊模块数量为 1（居民模块自由缩放，不再固定）
  stationVarNames.forEach(v => { lp += ` ${v} = 1\n`; });
  specialVarNames.forEach(v => { lp += ` ${v} = 1\n`; });

  // 构建约束表达式
  const makeExpr = (recipes: Recipe[], vars: string[], it: string): string => {
    let expr = '';
    recipes.forEach((r, i) => {
      let c = 0;
      if (r.module === 'trade') {
        if (r.outputs[it]) c += r.outputs[it];
        if (r.inputs[it]) c -= r.inputs[it];
        if (r.upkeep[it]) {
          const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
          c -= r.upkeep[it] * (1 - reduction);
        }
        if (Math.abs(c) > 1e-9) {
          if (expr) expr += ' ';
          if (c >= 0 && expr) expr += '+ ';
          expr += c >= 0 ? `${c} ${vars[i]}` : `- ${-c} ${vars[i]}`;
        }
        return;
      }

      let scale = 1;
      const isContinuousItem = isContinuous(it);
      const isMaintenanceOutput = (it === 'maintenance i' || it === 'maintenance ii' || it === 'maintenance iii') && r.outputs[it];
      
      if (r.outputs[it]) {
        if (r.duration <= 0) { /* skip division by zero, treat as non-scalable */ }
        else if (isMaintenanceOutput) scale = 60 / r.duration;
        else if (!isContinuousItem) scale = 60 / r.duration;
      }
      if (r.inputs[it]) {
        if (r.duration > 0 && !isContinuousItem) scale = 60 / r.duration;
      }
      
      if (r.outputs[it]) c += scale * r.outputs[it];
      if (r.inputs[it]) c -= scale * r.inputs[it];
      if (r.upkeep[it]) {
        const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
        c -= r.upkeep[it] * (1 - reduction);
      }
      if (Math.abs(c) > 1e-9) {
        if (expr) expr += ' ';
        if (c >= 0 && expr) expr += '+ ';
        expr += c >= 0 ? `${c} ${vars[i]}` : `- ${-c} ${vars[i]}`;
      }
    });
    return expr;
  };

  const allExpr = (it: string) => {
    const e1 = makeExpr(mainActive, mainVarNames, it);
    const e2 = makeExpr(powerActive, powerVarNames, it);
    const e3 = makeExpr(residentActive, residentVarNames, it);
    const e4 = makeExpr(stationActive, stationVarNames, it);
    const e5 = makeExpr(specialActive, specialVarNames, it);
    const e6 = makeExpr(tradeActive, tradeVarNames, it);
    const parts = [e1, e2, e3, e4, e5, e6].filter(Boolean);
    return parts.join(' + ').replace(/\+\s*-/g, '- ');
  };

  // 仅计算消费项（输入+维护），返回正系数字符串，用于中间产物冗余约束
  const makeNegExprOnly = (recipes: Recipe[], vars: string[], it: string): string => {
    let expr = '';
    recipes.forEach((r, i) => {
      let c = 0;
      if (r.module === 'trade') {
        if (r.inputs[it]) c += r.inputs[it];
        if (r.upkeep[it]) {
          const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
          c += r.upkeep[it] * (1 - reduction);
        }
        if (Math.abs(c) > 1e-9) {
          if (expr) expr += ' + ';
          expr += `${c} ${vars[i]}`;
        }
        return;
      }
      let scale = 1;
      if (r.inputs[it]) {
        if (r.duration > 0 && !isContinuous(it)) scale = 60 / r.duration;
      }
      if (r.inputs[it]) c += scale * r.inputs[it];
      if (r.upkeep[it]) {
        const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
        c += r.upkeep[it] * (1 - reduction);
      }
      if (Math.abs(c) > 1e-9) {
        if (expr) expr += ' + ';
        expr += `${c} ${vars[i]}`;
      }
    });
    return expr;
  };

  const allNegExpr = (it: string) => {
    const parts = [
      makeNegExprOnly(mainActive, mainVarNames, it),
      makeNegExprOnly(powerActive, powerVarNames, it),
      makeNegExprOnly(residentActive, residentVarNames, it),
      makeNegExprOnly(stationActive, stationVarNames, it),
      makeNegExprOnly(specialActive, specialVarNames, it),
      makeNegExprOnly(tradeActive, tradeVarNames, it),
    ].filter(Boolean);
    return parts.join(' + ');
  };

  // 解析表达式字符串为 {coeff, varName} 数组
  const parseExpr = (expr: string): { coeff: number; varName: string }[] => {
    if (!expr.trim()) return [];
    const terms: { coeff: number; varName: string }[] = [];
    // 先在 ' + ' 和 ' - ' 处分割，保留分隔符
    const tokens = expr.split(/( \+ | - )/);
    let sign = 1;
    for (const tok of tokens) {
      if (tok === ' + ') { sign = 1; continue; }
      if (tok === ' - ') { sign = -1; continue; }
      const trimmed = tok.trim();
      if (!trimmed) continue;
      // 处理前导负号：表达式以负项开头时（如 "- 24 x118 + 24 x124"），
      // split 产生的第一个 token 会是 "- 24 x118"，其中 "- " 不是分隔符而是系数符号
      let termSign = 1;
      let content = trimmed;
      if (content.startsWith('-')) {
        termSign = -1;
        content = content.slice(1).trim();
      }
      const m = content.match(/^([\d.]+)\s+(.+)$/);
      if (m) {
        terms.push({ coeff: sign * termSign * parseFloat(m[1]), varName: m[2].trim() });
      }
    }
    return terms;
  };

  // 构建合并表达式: netExpr - slack * negExpr
  const buildSlackExpr = (netExpr: string, negExpr: string, slack: number): string => {
    if (Math.abs(slack) < 1e-9) return netExpr;
    // 合并两个表达式中的系数
    const coeffMap: Record<string, number> = {};
    for (const { coeff, varName } of parseExpr(netExpr)) {
      coeffMap[varName] = (coeffMap[varName] || 0) + coeff;
    }
    for (const { coeff, varName } of parseExpr(negExpr)) {
      // negExpr 的系数是正数，减去 slack * coeff
      coeffMap[varName] = (coeffMap[varName] || 0) - slack * coeff;
    }
    const parts: string[] = [];
    for (const [varName, coeff] of Object.entries(coeffMap)) {
      if (Math.abs(coeff) < 1e-9) continue;
      if (parts.length === 0) {
        parts.push(coeff >= 0 ? `${coeff} ${varName}` : `- ${-coeff} ${varName}`);
      } else {
        parts.push(coeff >= 0 ? `+ ${coeff} ${varName}` : `- ${-coeff} ${varName}`);
      }
    }
    return parts.join(' ') || '0';
  };

  const producers = new Set<string>();
  const consumers = new Set<string>();
  allActive.forEach(r => {
    Object.keys(r.outputs).forEach(k => { if (!ignored.has(k)) producers.add(k); });
    Object.keys(r.inputs).forEach(k => { if (!ignored.has(k)) consumers.add(k); });
    Object.keys(r.upkeep).forEach(k => { if (!ignored.has(k)) consumers.add(k); });
  });

  const demandSet = new Set(demands.map(d => d.item));

  // 人力约束：居民模块产出人口作为人力供给上限，注入隐式零需求以生成 >= 0 约束
  if (!relaxLabor && producers.has('人力') && consumers.has('人力')) {
    demandSet.add('人力');
  }
  const items = new Set([...demandSet].filter(i => !ignored.has(i)));
  producers.forEach(i => { if (!demandSet.has(i)) items.add(i); });
  consumers.forEach(i => items.add(i));
  ['steam (high)', 'steam (super)', 'steam (low)'].forEach(s => {
    if (producers.has(s) || consumers.has(s)) items.add(s);
  });

  let missing: string[] = [];
  if (!isAllowExternal) {
    missing = [...consumers].filter(i => !producers.has(i) && !ignored.has(i) && !demandSet.has(i));
    for (const d of demands) {
      if (!ignored.has(d.item) && !producers.has(d.item)) {
        if (!missing.includes(d.item)) missing.push(d.item);
      }
    }
  }

  const rows: Record<string, string> = {};
  [...items].forEach((it, idx) => rows[it] = `c${idx}`);

  // ========== 1. 定义需要在电力模块单独处理的物品 ==========
  const powerSpecialItems = new Set(['steam (high)', 'steam (super)', 'mechanical power']);

  // ========== 2. 辅助函数：合并多个表达式 ==========
  const combineExprs = (...exprs: string[]): string => {
    return exprs.filter(e => e.trim() !== '').join(' + ').replace(/\+\s*-/g, '- ');
  };

  // ========== 2.5. 冗余因子辅助函数 ==========
  const getRedundancyFactors = (item: string): { lowerFactor: number; upperFactor: number } | null => {
    if (!enableRedundancy) return null;
    const res = redundancyResources[item];
    // 显式关闭的才退出：res 存在且 enabled 严格为 false
    // 不在 map 中的物品自动视为启用（{enabled:true, lower:100, upper:100}）
    // 不在 map 中 → 不参与冗余（opt-in 模式）
    if (!res) return null;
    // 显式关闭
    if (res.enabled === false) return null;
    const rl = res.lower;
    const ru = res.upper;
    // 独立回退：每个值为 100% 时自动使用全局值（各自独立判断，而非绑在一起）
    const lowerPct = rl === 100 ? globalLower : rl;
    const upperPct = ru === 100 ? globalUpper : ru;
    // lower 和 upper 各自独立：用户可设 lower=100% + upper=120% 得到范围 [100%,120%]，
    // 也可设 lower=120% + upper=120% 强制精确 120% 生产
    const effectiveLowerPct = lowerPct;
    // 连续解模式下限不得低于 100%（避免需求不满足）
    // 整数/圆整模式有明确上/下限，直接使用用户设定值
    const clampLower = integerMode !== 'milp' && integerMode !== 'rounding';
    const lowerFactor = clampLower ? Math.max(effectiveLowerPct, 100) / 100 : effectiveLowerPct / 100;
    const upperFactor = upperPct / 100;
    return { lowerFactor, upperFactor };
  };

  // [DIAGNOSTIC] 冗余设置摘要
  if (enableRedundancy && DEBUG) {
    const explicitlyConfigured = Object.keys(redundancyResources).filter(k => redundancyResources[k]?.enabled === true);
    const explicitlyDisabled = Object.keys(redundancyResources).filter(k => redundancyResources[k]?.enabled === false);
    console.warn('[冗余] buildLp 入参:', {
      enableRedundancy,
      globalLower,
      globalUpper,
      integerMode,
      itemsInLoop: [...items].length,
      explicitlyConfigured: explicitlyConfigured.length,
      explicitlyDisabled: explicitlyDisabled.length,
      configuredItems: explicitlyConfigured,
      disabledItems: explicitlyDisabled,
      note: '仅显式启用的物品参与冗余（opt-in），未配置物品不受影响',
    });
  }

  // ========== 3. 为每个物品生成约束 ==========
  let redundancyAppliedCount = 0;
  const redundancyAppliedItems: string[] = [];
  for (const it of items) {
    if (it === 'research') continue;

    // 跳过那些已经在 powerSpecialItems 中的物品，后面单独处理
    if (powerSpecialItems.has(it)) continue;

    // 普通物品：全局平衡（所有配方一起）
    if (it === 'steam (low)') {
      // 根据 steamLowMode 决定是内部平衡还是全局平衡（已在全局平衡中）
      if (steamLowMode === 'shared') {
        const se = allExpr(it);
        if (se) {
          // 宽松模式下无消费者则跳过
          if (!producers.has(it) || !consumers.has(it)) {
            // 低压蒸汽：有生产者+无消费者 或 无生产者+有消费者 都跳过约束
          } else {
            lp += ` ${rows[it]}: ${se} = 0\n`;
          }
        }
      } else if (steamLowMode === 'internal') {
        // 内部模式：由电力模块单独处理（已在 powerSpecialItems 中，不会走到这里）
        // 但为了完整性，这里什么都不做（因为 internal 时 steam(low) 会在后面单独处理）
        // 注意：下面会单独处理 powerSpecialItems 中的 steam(low)
      }
      continue;
    }

    // 普通物品的全局平衡方程
    const expr = allExpr(it);
    const totalDr = demands.filter(d => d.item === it).reduce((s, d) => s + d.rate, 0);
    const supply = externalSupplyMap.get(it) || 0;

    if (demandSet.has(it)) {
      const effectiveDr = Math.max(0, totalDr - supply);
      const rf = getRedundancyFactors(it);
      if (expr) {
        if (rf) {
          redundancyAppliedCount++;
          redundancyAppliedItems.push(`${it}(L=${rf.lowerFactor.toFixed(2)} U=${rf.upperFactor.toFixed(2)})`);
          const negExpr = allNegExpr(it);
          // 基础需求约束
          lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
          // 冗余下限：production >= lowerFactor * (consumption + demand)
          const lowerSlack = rf.lowerFactor - 1;
          const lowerExpr = buildSlackExpr(expr, negExpr, lowerSlack);
          if (Math.abs(lowerSlack) > 1e-9) {
            // 下限 != 1.0 时才添加额外约束（=1.0 时与基础约束完全重复）
            lp += ` ${rows[it]}_red_lower: ${lowerExpr} >= ${rf.lowerFactor * effectiveDr}\n`;
          }
          // 冗余上限：production <= upperFactor * (consumption + demand)
          if (it !== '人力' && rf.upperFactor > 1.0) {
            const upperSlack = rf.upperFactor - 1;
            const upperExpr = buildSlackExpr(expr, negExpr, upperSlack);
            lp += ` ${rows[it]}_red_upper: ${upperExpr} <= ${rf.upperFactor * effectiveDr}\n`;
          }
        } else {
          lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
        }
      } else {
        lp += ` ${rows[it]}: 0 >= ${effectiveDr}\n`;
      }
    } else if (Math.abs(supply) > 1e-9) {
      // 正供给：外部输入；负供给：强制输出（用于取整模式填补差额）
      if (supply > 0 && !consumers.has(it)) {
        if (!missing.includes(it)) missing.push(it);
        continue;
      }
      const rfSupply = getRedundancyFactors(it);
      if (rfSupply && expr) {
        if (supply < 0) {
          // 负供给 = 强制产出（取整模式填补差额）
          lp += ` ${rows[it]}: ${expr} >= ${-supply}\n`;
          const negExprSupply = allNegExpr(it);
          if (rfSupply.lowerFactor === rfSupply.upperFactor) {
            // 最小值 = 最大值：精确等式
            const slack = rfSupply.lowerFactor - 1;
            const slackExpr = buildSlackExpr(expr, negExprSupply, slack);
            lp += ` ${rows[it]}_red_eq: ${slackExpr} = ${rfSupply.lowerFactor * (-supply)}\n`;
          } else {
            // 范围约束
            const lowerSlackSupply = rfSupply.lowerFactor - 1;
            const lowerExprSupply = buildSlackExpr(expr, negExprSupply, lowerSlackSupply);
            lp += ` ${rows[it]}_red_lower: ${lowerExprSupply} >= ${rfSupply.lowerFactor * (-supply)}\n`;
            if (it !== '人力' && rfSupply.upperFactor > 1.0) {
              const upperSlackSupply = rfSupply.upperFactor - 1;
              const upperExprSupply = buildSlackExpr(expr, negExprSupply, upperSlackSupply);
              lp += ` ${rows[it]}_red_upper: ${upperExprSupply} <= ${rfSupply.upperFactor * (-supply)}\n`;
            }
          }
        } else {
          // 正供给：外部输入
          lp += ` ${rows[it]}: ${expr} <= ${-(supply * rfSupply.lowerFactor)}\n`;
          if (it !== '人力' && rfSupply.upperFactor > 1.0) {
            lp += ` ${rows[it]}_upper: ${expr} >= ${-(supply * rfSupply.upperFactor)}\n`;
          }
        }
        redundancyAppliedCount++;
        redundancyAppliedItems.push(`${it}(供给 L=${rfSupply.lowerFactor.toFixed(2)} U=${rfSupply.upperFactor.toFixed(2)})`);
      } else {
        if (expr) lp += ` ${rows[it]}: ${expr} = ${-supply}\n`;
      }
    } else {
      const isExcludedOutput = excludedOutputs.has(it);
      const isExcludedInput = excludedInputs.has(it);
      const hasProducer = producers.has(it);
      const hasConsumer = consumers.has(it);

      // 允许外部供给：无生产者的物品从外部获取（两种模式均适用）
      if (isAllowExternal && !hasProducer && hasConsumer) continue;

      // 同时在排除产出和排除输入 → 不约束
      if (isExcludedOutput && isExcludedInput) continue;

      // 约束模式检查（优先于排除列表）
      const shouldConstrain = (hasProd: boolean, hasCons: boolean): boolean => {
        if (constraintMode === 'noProdOrCons') return hasProd && hasCons;
        return hasProd;
      };
      if (!shouldConstrain(hasProducer, hasConsumer)) {
        // 常规模式下，无生产者但有消费者的物品（且不允许外部供给）→ 标记缺失
        if (constraintMode !== 'noProdOrCons' && !isAllowExternal && !hasProducer && hasConsumer) {
          if (!missing.includes(it)) missing.push(it);
          if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
        }
        continue;
      }

      // 排除输入：允许净消耗但不允许净产出 → <= 0（冗余：允许消耗在范围内浮动）
      if (isExcludedInput && hasConsumer && expr) {
        const rfExIn = getRedundancyFactors(it);
        if (rfExIn) {
          const negExprExIn = allNegExpr(it);
          if (rfExIn.lowerFactor === rfExIn.upperFactor) {
            // 最小值 = 最大值：精确等式
            const slack = rfExIn.lowerFactor - 1;
            const slackExpr = buildSlackExpr(expr, negExprExIn, slack);
            lp += ` ${rows[it]}: ${slackExpr} = 0\n`;
          } else {
            const lowerSlackIn = rfExIn.lowerFactor - 1;
            const lowerExprIn = buildSlackExpr(expr, negExprExIn, lowerSlackIn);
            lp += ` ${rows[it]}: ${lowerExprIn} >= 0\n`;
            if (it !== '人力' && rfExIn.upperFactor > 1.0) {
              const upperSlackIn = rfExIn.upperFactor - 1;
              const upperExprIn = buildSlackExpr(expr, negExprExIn, upperSlackIn);
              lp += ` ${rows[it]}_upper: ${upperExprIn} <= 0\n`;
            }
          }
          redundancyAppliedCount++;
          redundancyAppliedItems.push(`${it}(排除输入 L=${rfExIn.lowerFactor.toFixed(2)} U=${rfExIn.upperFactor.toFixed(2)})`);
        } else {
          lp += ` ${rows[it]}: ${expr} <= 0\n`;
        }
        continue;
      }
      // 排除产出：允许净产出但不允许净消耗 → >= 0（冗余：允许产出在范围内浮动）
      if (isExcludedOutput && hasProducer && expr) {
        const rfExOut = getRedundancyFactors(it);
        if (rfExOut) {
          const negExprExOut = allNegExpr(it);
          if (rfExOut.lowerFactor === rfExOut.upperFactor) {
            // 最小值 = 最大值：精确等式
            const slack = rfExOut.lowerFactor - 1;
            const slackExpr = buildSlackExpr(expr, negExprExOut, slack);
            lp += ` ${rows[it]}: ${slackExpr} = 0\n`;
          } else {
            const lowerSlackOut = rfExOut.lowerFactor - 1;
            const lowerExprOut = buildSlackExpr(expr, negExprExOut, lowerSlackOut);
            lp += ` ${rows[it]}: ${lowerExprOut} >= 0\n`;
            if (it !== '人力' && rfExOut.upperFactor > 1.0) {
              const upperSlackOut = rfExOut.upperFactor - 1;
              const upperExprOut = buildSlackExpr(expr, negExprExOut, upperSlackOut);
              lp += ` ${rows[it]}_upper: ${upperExprOut} <= 0\n`;
            }
          }
          redundancyAppliedCount++;
          redundancyAppliedItems.push(`${it}(排除产出 L=${rfExOut.lowerFactor.toFixed(2)} U=${rfExOut.upperFactor.toFixed(2)})`);
        } else {
          lp += ` ${rows[it]}: ${expr} >= 0\n`;
        }
        continue;
      }
      if (expr) {
        const rf = getRedundancyFactors(it);
        if (rf) {
          const negExpr = allNegExpr(it);
          if (rf.lowerFactor === rf.upperFactor) {
            // 最小值 = 最大值：精确约束 production = factor * consumption
            const slack = rf.lowerFactor - 1;
            const slackExpr = buildSlackExpr(expr, negExpr, slack);
            lp += ` ${rows[it]}: ${slackExpr} = 0\n`;
          } else {
            // 范围约束：下限 ≥ 允许超产，上限 ≤ 封顶
            const lowerSlack = rf.lowerFactor - 1;
            const lowerExpr = buildSlackExpr(expr, negExpr, lowerSlack);
            lp += ` ${rows[it]}: ${lowerExpr} >= 0\n`;
            if (it !== '人力' && rf.upperFactor > 1.0) {
              const upperSlack = rf.upperFactor - 1;
              const upperExpr = buildSlackExpr(expr, negExpr, upperSlack);
              lp += ` ${rows[it]}_upper: ${upperExpr} <= 0\n`;
            }
          }
          redundancyAppliedCount++;
          redundancyAppliedItems.push(`${it}(中间产物 L=${rf.lowerFactor.toFixed(2)} U=${rf.upperFactor.toFixed(2)})`);
        } else {
          if (!hasConsumer) {
            lp += ` ${rows[it]}: ${expr} >= 0\n`;
          } else {
            lp += ` ${rows[it]}: ${expr} = 0\n`;
          }
        }
      }
    }
  }

  // ========== 4. 特殊物品的独立方程（电力模块 vs 主模块） ==========
  // 扩展特殊物品：如果 steamLowMode === 'internal'，把 steam (low) 也加入
  const allSpecialItems = new Set(powerSpecialItems);
  if (steamLowMode === 'internal') {
    allSpecialItems.add('steam (low)');
  }

  for (const it of allSpecialItems) {
    // 低压蒸汽：有生产者+无消费者 或 无生产者+有消费者 都跳过约束
    if (it === 'steam (low)' && (!producers.has(it) || !consumers.has(it))) continue;
    const rf = getRedundancyFactors(it);

    // 主模块方程：仅使用非电力配方
    const mainExpr = combineExprs(
      makeExpr(mainActive, mainVarNames, it),
      makeExpr(residentActive, residentVarNames, it),
      makeExpr(stationActive, stationVarNames, it),
      makeExpr(specialActive, specialVarNames, it),
      makeExpr(tradeActive, tradeVarNames, it)
    );

    // 电力模块方程：仅使用电力配方
    const powerExpr = makeExpr(powerActive, powerVarNames, it);

    if (rf) {
      const mainNegExpr = combineExprs(
        makeNegExprOnly(mainActive, mainVarNames, it),
        makeNegExprOnly(residentActive, residentVarNames, it),
        makeNegExprOnly(stationActive, stationVarNames, it),
        makeNegExprOnly(specialActive, specialVarNames, it),
        makeNegExprOnly(tradeActive, tradeVarNames, it)
      );
      const powerNegExpr = makeNegExprOnly(powerActive, powerVarNames, it);

      const useEqual = rf.lowerFactor === rf.upperFactor;

      if (mainExpr) {
        if (useEqual) {
          const slack = rf.lowerFactor - 1;
          const slackExpr = buildSlackExpr(mainExpr, mainNegExpr, slack);
          lp += ` ${rows[it]}_main: ${slackExpr} = 0\n`;
        } else {
          const lowerSlack = rf.lowerFactor - 1;
          const mainLowerExpr = buildSlackExpr(mainExpr, mainNegExpr, lowerSlack);
          lp += ` ${rows[it]}_main: ${mainLowerExpr} >= 0\n`;
          if (it !== '人力' && rf.upperFactor > 1.0) {
            const upperSlack = rf.upperFactor - 1;
            const mainUpperExpr = buildSlackExpr(mainExpr, mainNegExpr, upperSlack);
            lp += ` ${rows[it]}_main_upper: ${mainUpperExpr} <= 0\n`;
          }
        }
      }
      if (powerExpr) {
        if (useEqual) {
          const slack = rf.lowerFactor - 1;
          const slackExpr = buildSlackExpr(powerExpr, powerNegExpr, slack);
          lp += ` ${rows[it]}_power: ${slackExpr} = 0\n`;
        } else {
          const lowerSlack = rf.lowerFactor - 1;
          const powerLowerExpr = buildSlackExpr(powerExpr, powerNegExpr, lowerSlack);
          lp += ` ${rows[it]}_power: ${powerLowerExpr} >= 0\n`;
          if (it !== '人力' && rf.upperFactor > 1.0) {
            const upperSlack = rf.upperFactor - 1;
            const powerUpperExpr = buildSlackExpr(powerExpr, powerNegExpr, upperSlack);
            lp += ` ${rows[it]}_power_upper: ${powerUpperExpr} <= 0\n`;
          }
        }
      }
      redundancyAppliedCount++;
      redundancyAppliedItems.push(`${it}(特殊 L=${rf.lowerFactor.toFixed(2)} U=${rf.upperFactor.toFixed(2)})`);
    } else {
      if (mainExpr) {
        lp += ` ${rows[it]}_main: ${mainExpr} = 0\n`;
      }
      if (powerExpr) {
        lp += ` ${rows[it]}_power: ${powerExpr} = 0\n`;
      }
    }
  }

  // 添加固定变量等式约束（在 INTEGER 声明之前）
  if (Object.keys(fixedMachines).length > 0) {
    for (const [varName, value] of Object.entries(fixedMachines)) {
      lp += ` c_fix_${varName}: ${varName} = ${value}\n`;
    }
  }

  // 居民模块最小比例（r0 >= minResidentValue）
  if (minResidentValue !== undefined && residentVarNames.length > 0) {
    if (ignored.has('人力')) {
      // 忽略人力时固定居民模块 = pop/1000，防止浮动
      lp += ` c_res_fix: ${residentVarNames[0]} = ${minResidentValue}\n`;
    } else {
      lp += ` c_res_min: ${residentVarNames[0]} >= ${minResidentValue}\n`;
    }
  }

  // 添加整数声明（仅在 milp 模式下）
  // 仅对用户开启了"取整"开关的配方变量标记 INTEGER
  // 贸易、农场、特殊、居民、空间站配方保持连续
  if (integerMode === 'milp') {
    const agriVarNames = new Set(
      mainActive.filter(r => r.category === '农业').map((_, i) => `x${i}`)
    );
    const integerVars = varNames.filter(v => {
      if (v.startsWith('r') || v.startsWith('s') || v.startsWith('t') || v.startsWith('tr')) return false;
      if (agriVarNames.has(v)) return false;
      // x prefix = mainActive, p prefix = powerActive
      if (v.startsWith('x')) {
        const idx = parseInt(v.slice(1), 10);
        const recipe = mainActive[idx];
        return recipe ? recipeIntegerEnabled[recipe.id] === true : false;
      }
      if (v.startsWith('p')) {
        const idx = parseInt(v.slice(1), 10);
        const recipe = powerActive[idx];
        return recipe ? recipeIntegerEnabled[recipe.id] === true : false;
      }
      return false;
    });
    if (integerVars.length) {
      lp += '\nBounds\n';
      lp += '\nInteger\n';
      for (const v of integerVars) lp += ` ${v}\n`;
    }
  }
  // [DIAGNOSTIC] 冗余约束应用摘要
  if (enableRedundancy && DEBUG) {
    const maintenanceItems = ['maintenance i', 'maintenance ii', 'maintenance iii'];
    const maintenanceStatus = maintenanceItems.map(mi => {
      const rf = getRedundancyFactors(mi);
      const hasProd = producers.has(mi);
      const hasCons = consumers.has(mi);
      return {
        item: mi,
        hasProducer: hasProd,
        hasConsumer: hasCons,
        redundancyFactor: rf ? `L=${rf.lowerFactor.toFixed(2)} U=${rf.upperFactor.toFixed(2)}` : '未应用',
        constraintType: rf
          ? (rf.lowerFactor === rf.upperFactor ? '精确等式(=0)' : '范围约束(>=0, <=0)')
          : (hasCons ? '精确平衡(=0)' : (hasProd ? '允许盈余(>=0)' : '无约束')),
      };
    });
    console.warn('[冗余] 约束生成摘要:', {
      totalDemandItems: [...demandSet].length,
      redundancyAppliedCount,
      redundancyAppliedItems,
      maintenanceStatus,
      excludedOutputs: [...excludedOutputs],
      excludedInputs: [...excludedInputs],
      ignored: [...ignored],
      itemsInLoop: [...items],
    });
  }
  return { lpString: lp + 'END\n', varNames, missing };
}