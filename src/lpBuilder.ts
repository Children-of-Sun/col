import { Recipe, Demand } from './types';
import { isNonScalable } from './utils';

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
}

export interface LpOutput {
  lpString: string;
  varNames: string[];
  missing: string[];
}

export function buildLp(input: LpInput): LpOutput {
  const { mainActive, powerActive, residentActive, stationActive, specialActive = [], tradeActive = [], ignored, demands, externalSupplies,
          reductionFactor, steamLowMode, excludedOutputs, excludedInputs, constraintMode, allowExternal } = input;
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

  const objExpr = [
    ...mainVarNames.map((v, i) => mainActive[i].isSolar ? `0.01 ${v}` : v),
    ...powerVarNames.map((v, i) => powerActive[i].isSolar ? `0.01 ${v}` : v),
    ...residentVarNames.map(v => v),
    ...stationVarNames.map(v => v),
    ...specialVarNames.map(v => v),
    ...tradeVarNames.map(v => v),
  ].join(' + ');

  let lp = `MIN\nOBJ: ${objExpr}\nST\n`;

  residentVarNames.forEach(v => { lp += ` ${v} = 1\n`; });
  stationVarNames.forEach(v => { lp += ` ${v} = 1\n`; });
  specialVarNames.forEach(v => { lp += ` ${v} = 1\n`; });

  const makeExpr = (recipes: Recipe[], vars: string[], it: string): string => {
    let expr = '';
    recipes.forEach((r, i) => {
      let c = 0;
      // 不可缩放物品（电力、算力、人力、维护等）不缩放，其他物品按周期缩放
      const shouldScale = !isNonScalable(it) && r.module !== 'resident' && r.module !== 'station' && r.module !== 'special' && r.module !== 'trade';
      const scale = shouldScale ? (60 / r.duration) : 1;
      if (r.outputs[it]) c += scale * r.outputs[it];
      if (r.inputs[it]) c -= scale * r.inputs[it];
      if (r.upkeep[it]) {
        const reduction = it.startsWith('maintenance') ? reductionFactor : 0;
        c -= scale * r.upkeep[it] * (1 - reduction);
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
    // 研究点不参与 LP 平衡
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
      if (expr) {
        lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
      } else {
        lp += ` ${rows[it]}: 0 >= ${effectiveDr}\n`;
      }
    } else if (supply > 0) {
      if (!consumers.has(it)) {
        missing.push(it);
        return;
      }
      if (expr) {
        lp += ` ${rows[it]}: ${expr} = ${-supply}\n`;
      }
    } else {
      const isExcludedOutput = excludedOutputs.has(it);
      const isExcludedInput = excludedInputs.has(it);
      const hasProducer = producers.has(it);
      const hasConsumer = consumers.has(it);

      if (isAllowExternal && !hasProducer && hasConsumer) {
        return;
      }
      if ((isExcludedOutput && hasProducer) || (isExcludedInput && hasConsumer)) {
        return;
      }

      const shouldConstrain = (hasProd: boolean, hasCons: boolean): boolean => {
        if (constraintMode === 'noProdOrCons') {
          return hasProd && hasCons;
        }
        return hasProd;
      };
      if (!shouldConstrain(hasProducer, hasConsumer)) {
        return;
      }
      if (expr) {
        lp += ` ${rows[it]}: ${expr} = 0\n`;
      }
    }
  });

  return { lpString: lp + 'END\n', varNames, missing };
}