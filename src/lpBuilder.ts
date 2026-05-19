import { Recipe, Demand } from './types';
import { isRaw } from './utils';

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
}

export interface LpOutput {
  lpString: string;
  varNames: string[];
  missing: string[];
}

export function buildLp(input: LpInput): LpOutput {
  const { mainActive, powerActive, residentActive, stationActive, specialActive = [], tradeActive = [], ignored, demands, externalSupplies,
          reductionFactor, steamLowMode, excludedOutputs, excludedInputs, constraintMode, allowExternal,
          optimizationMode, customWeights, fixedUnityProduction = 0, fixedUnityConsumption = 0 } = input;
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

  // 判断物品是否为持续类型（不缩放）
  const isContinuous = (item: string): boolean => {
    return item === 'electricity' || item === 'computing' || item === '人力' || item === 'mechanical power';
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
          const buyItem = Object.keys(recipe.outputs)[0];
          const buyRate = recipe.outputs[buyItem];
          const contract = tradeActive.find(t => t.id === recipe.id) as any;
          const unityPer100 = contract?.unity_per_100_bought || 0;
          coeff = (buyRate / 100) * unityPer100;
        }
      } else if (target === 'area') {
        coeff = 1;
      } else if (target === 'raw') {
        for (const [item, qty] of Object.entries(recipe.inputs)) {
          if (isRaw(item)) {
            // 原矿消耗不缩放（因为原矿输入本身是持续？但原矿也是间歇产出，需要缩放？这里简化：不缩放）
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
  } else {
    let target = optimizationMode;
    if (target === 'cohesion') {
      const coeffs = computeTargetCoeffs('cohesion');
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
    } else {
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
  }

  if (!objExpr) objExpr = '0';

  let lp = `MIN\nOBJ: ${objExpr}\nST\n`;

  residentVarNames.forEach(v => { lp += ` ${v} = 1\n`; });
  stationVarNames.forEach(v => { lp += ` ${v} = 1\n`; });
  specialVarNames.forEach(v => { lp += ` ${v} = 1\n`; });

  // 构建约束表达式
  const makeExpr = (recipes: Recipe[], vars: string[], it: string): string => {
    let expr = '';
    recipes.forEach((r, i) => {
      // 贸易配方特殊处理（已为每分钟速率，不缩放）
      if (r.module === 'trade') {
        let c = 0;
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
        return; // 跳过后续缩放逻辑
      }

      // 以下为非贸易配方的缩放逻辑
      let c = 0;
      // 决定缩放系数
      let scale = 1;
      const isContinuousItem = isContinuous(it);
      const isMaintenanceOutput = (it === 'maintenance i' || it === 'maintenance ii' || it === 'maintenance iii') && r.outputs[it];
      
      if (r.outputs[it]) {
        if (isMaintenanceOutput) scale = 60 / r.duration;       // 维护产出缩放
        else if (!isContinuousItem) scale = 60 / r.duration;   // 普通物品产出缩放
        // 持续物品产出不缩放 (scale=1)
      }
      if (r.inputs[it]) {
        if (!isContinuousItem) scale = 60 / r.duration;        // 普通物品输入缩放
        // 持续物品输入不缩放 (scale=1)
      }
      // 注意：upkeep 永远不缩放，保持 scale=1
      
      if (r.outputs[it]) c += scale * r.outputs[it];
      if (r.inputs[it]) c -= scale * r.inputs[it];
      if (r.upkeep[it]) {
        const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
        c -= r.upkeep[it] * (1 - reduction);   // upkeep 不缩放
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
  [...items].forEach((it, idx) => rows[it] = `r${idx}`);

  items.forEach(it => {
    if (it === 'research') return;
    if (it === 'steam (high)' || it === 'steam (super)') {
      const expr = allExpr(it);
      if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
      return;
    }
    if (it === 'steam (low)') {
      if (steamLowMode === 'internal') {
        const expr = makeExpr(powerActive, powerVarNames, it);
        if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
        return;
      }
    }

    const expr = allExpr(it);
    const totalDr = demands.filter(d => d.item === it).reduce((s, d) => s + d.rate, 0);
    const supply = externalSupplyMap.get(it) || 0;

    if (demandSet.has(it)) {
      const effectiveDr = Math.max(0, totalDr - supply);
      if (expr) lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
      else lp += ` ${rows[it]}: 0 >= ${effectiveDr}\n`;
    } else if (supply > 0) {
      if (!consumers.has(it)) {
        missing.push(it);
        return;
      }
      if (expr) lp += ` ${rows[it]}: ${expr} = ${-supply}\n`;
    } else {
      const isExcludedOutput = excludedOutputs.has(it);
      const isExcludedInput = excludedInputs.has(it);
      const hasProducer = producers.has(it);
      const hasConsumer = consumers.has(it);
      if (isAllowExternal && !hasProducer && hasConsumer) return;
      if ((isExcludedOutput && hasProducer) || (isExcludedInput && hasConsumer)) return;
      const shouldConstrain = (hasProd: boolean, hasCons: boolean): boolean => {
        if (constraintMode === 'noProdOrCons') return hasProd && hasCons;
        return hasProd;
      };
      if (!shouldConstrain(hasProducer, hasConsumer)) return;
      if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
    }
  });

  return { lpString: lp + 'END\n', varNames, missing };
}