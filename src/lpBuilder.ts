import { Recipe, Demand } from './types';
import { isRaw, isNonScalable } from './utils';

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
  integerMode?: 'continuous' | 'ceil' | 'heuristic' | 'milp';
  redundancy?: number;
  milpTimeLimit?: number;
  fixedMachines?: Record<string, number>;
  // 人力约束：false 时强制人力 <= 人口，true 时跳过人力约束
  relaxLabor?: boolean;
  // 居民模块最小比例（r0 >= value），undefined 表示不加此约束
  minResidentValue?: number;
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
    integerMode = 'continuous', redundancy = 0, milpTimeLimit = 30,
    fixedMachines = {},
    relaxLabor = false,
    minResidentValue,
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
        coeff = 1;
      } else if (target === 'raw') {
        for (const [item, qty] of Object.entries(recipe.inputs)) {
          if (isRaw(item)) {
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
    let idx = 0;
    for (let t = 0; t < targets.length; t++) {
      if (weights[t] === 0) continue;
      const coeffs = computeTargetCoeffs(targets[t]);
      for (let i = 0; i < coeffs.length; i++) {
        totalCoeffs[idx + i] += weights[t] * coeffs[i];
      }
      idx += coeffs.length;
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

  let lp = `MIN\nOBJ: ${objExpr}\nST\n`;

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
        if (isMaintenanceOutput) scale = 60 / r.duration;
        else if (!isContinuousItem) scale = 60 / r.duration;
      }
      if (r.inputs[it]) {
        if (!isContinuousItem) scale = 60 / r.duration;
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
    return parts.join(' + ');
  };

  const producers = new Set<string>();
  const consumers = new Set<string>();
  allActive.forEach(r => {
    Object.keys(r.outputs).forEach(k => { if (!ignored.has(k) && !excludedOutputs.has(k) && !excludedInputs.has(k)) producers.add(k); });
    Object.keys(r.inputs).forEach(k => { if (!ignored.has(k) && !excludedOutputs.has(k) && !excludedInputs.has(k)) consumers.add(k); });
    Object.keys(r.upkeep).forEach(k => { if (!ignored.has(k) && !excludedOutputs.has(k) && !excludedInputs.has(k)) consumers.add(k); });
  });

  const demandSet = new Set(demands.map(d => d.item));

  // 人力约束：居民模块产出人口作为人力供给上限，注入隐式零需求以生成 >= 0 约束
  if (!relaxLabor && producers.has('人力') && consumers.has('人力')) {
    demandSet.add('人力');
  }
  const items = new Set([...demandSet].filter(i => !ignored.has(i) && !excludedOutputs.has(i) && !excludedInputs.has(i)));
  producers.forEach(i => { if (!demandSet.has(i)) items.add(i); });
  consumers.forEach(i => items.add(i));
  ['steam (high)', 'steam (super)', 'steam (low)'].forEach(s => {
    if (producers.has(s) || consumers.has(s)) items.add(s);
  });

  let missing: string[] = [];
  if (!isAllowExternal) {
    missing = [...consumers].filter(i => !producers.has(i) && !ignored.has(i) && !excludedOutputs.has(i) && !excludedInputs.has(i) && !demandSet.has(i));
    for (const d of demands) {
      if (!ignored.has(d.item) && !excludedOutputs.has(d.item) && !excludedInputs.has(d.item) && !producers.has(d.item)) {
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
    return exprs.filter(e => e.trim() !== '').join(' + ');
  };

  // ========== 3. 为每个物品生成约束 ==========
  for (const it of items) {
    if (it === 'research') continue;

    // 跳过那些已经在 powerSpecialItems 中的物品，后面单独处理
    if (powerSpecialItems.has(it)) continue;

    // 普通物品：全局平衡（所有配方一起）
    if (it === 'steam (low)') {
      // 根据 steamLowMode 决定是内部平衡还是全局平衡（已在全局平衡中）
      if (steamLowMode === 'shared') {
        const expr = allExpr(it);
        if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
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
      if (expr) {
        lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
        if (integerMode !== 'continuous' && it !== '人力') {
          const upperBound = effectiveDr * (1 + redundancy);
          lp += ` ${rows[it]}_upper: ${expr} <= ${upperBound}\n`;
        }
      } else {
        lp += ` ${rows[it]}: 0 >= ${effectiveDr}\n`;
      }
    } else if (supply > 0) {
      if (!consumers.has(it)) {
        if (!missing.includes(it)) missing.push(it);
        continue;
      }
      if (expr) lp += ` ${rows[it]}: ${expr} = ${-supply}\n`;
    } else {
      const isExcludedOutput = excludedOutputs.has(it);
      const isExcludedInput = excludedInputs.has(it);
      const hasProducer = producers.has(it);
      const hasConsumer = consumers.has(it);
      if (isAllowExternal && !hasProducer && hasConsumer) continue;
      // 同时在排除产出和排除输入 → 不约束
      if (isExcludedOutput && isExcludedInput) continue;
      // 排除输入：允许净消耗但不允许净产出 → <= 0
      if (isExcludedInput && hasConsumer && expr) {
        lp += ` ${rows[it]}: ${expr} <= 0\n`;
        continue;
      }
      // 排除产出：允许净产出但不允许净消耗 → >= 0
      if (isExcludedOutput && hasProducer && expr) {
        lp += ` ${rows[it]}: ${expr} >= 0\n`;
        continue;
      }
      const shouldConstrain = (hasProd: boolean, hasCons: boolean): boolean => {
        if (constraintMode === 'noProdOrCons') return hasProd && hasCons;
        return hasProd;
      };
      if (!shouldConstrain(hasProducer, hasConsumer)) continue;
      if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
    }
  }

  // ========== 4. 特殊物品的独立方程（电力模块 vs 主模块） ==========
  // 扩展特殊物品：如果 steamLowMode === 'internal'，把 steam (low) 也加入
  const allSpecialItems = new Set(powerSpecialItems);
  if (steamLowMode === 'internal') {
    allSpecialItems.add('steam (low)');
  }

  for (const it of allSpecialItems) {
    // 主模块方程：仅使用非电力配方
    const mainExpr = combineExprs(
      makeExpr(mainActive, mainVarNames, it),
      makeExpr(residentActive, residentVarNames, it),
      makeExpr(stationActive, stationVarNames, it),
      makeExpr(specialActive, specialVarNames, it),
      makeExpr(tradeActive, tradeVarNames, it)
    );
    if (mainExpr) {
      lp += ` ${rows[it]}_main: ${mainExpr} = 0\n`;
    }

    // 电力模块方程：仅使用电力配方
    const powerExpr = makeExpr(powerActive, powerVarNames, it);
    if (powerExpr) {
      lp += ` ${rows[it]}_power: ${powerExpr} = 0\n`;
    }
  }

  // 添加固定变量等式约束（在 INTEGER 声明之前）
  if (Object.keys(fixedMachines).length > 0) {
    for (const [varName, value] of Object.entries(fixedMachines)) {
      lp += ` ${varName} = ${value}\n`;
    }
  }

  // 居民模块最小比例（r0 >= minResidentValue）
  if (minResidentValue !== undefined && residentVarNames.length > 0) {
    lp += ` ${residentVarNames[0]} >= ${minResidentValue}\n`;
  }

  // 添加整数声明（仅在 milp 模式下）
  if (integerMode === 'milp') {
    const integerVars = varNames.filter(v => !v.startsWith('r') && !v.startsWith('s') && !v.startsWith('t'));
    if (integerVars.length) {
      lp += '\nINTEGER\n ' + integerVars.join(' ') + '\n';
    }
  }
  return { lpString: lp + 'END\n', varNames, missing };
}