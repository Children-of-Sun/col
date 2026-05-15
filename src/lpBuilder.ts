import { Recipe, Demand } from './types';
import { isRaw, isPowerItem } from './utils';

export interface LpInput {
  mainActive: Recipe[];
  powerActive: Recipe[];
  residentActive: Recipe[];   // 居民模块配方，通常只有一个
  stationActive: Recipe[];     // 空间站模块配方
  specialActive?: Recipe[];     // 特殊模块配方（雕像、研究所等）
  ignored: Set<string>;
  demands: Demand[];
  externalSupplies: { item: string; rate: number }[];
  reductionFactor: number;
  steamLowMode: 'internal' | 'shared';
  excludedItems: Set<string>;
  constraintMode?: 'noProd' | 'noProdOrCons';  // 约束模式
  allowExternal?: boolean;       // 允许外部供给
}

export interface LpOutput {
  lpString: string;
  varNames: string[];
  missing: string[];
}

export function buildLp(input: LpInput): LpOutput {
  const { mainActive, powerActive, residentActive, stationActive, ignored, demands, externalSupplies,
          reductionFactor, steamLowMode, excludedItems, constraintMode, allowExternal } = input;
  const specialActive = input.specialActive || [];
  const isAllowExternal = allowExternal ?? false;

  // 构建外部供给映射
  const externalSupplyMap = new Map<string, number>();
  for (const s of externalSupplies) {
    externalSupplyMap.set(s.item, s.rate);
  }

  // 合并数组用于全局计算（producers/consumers 等）
  const allActive = [...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive];

  // 变量名：主模块 x0,x1,... 电力模块 p0,p1,... 居民模块 r0,r1,... 空间站模块 s0,s1,... 特殊模块 t0,t1,...
  const mainVarNames = mainActive.map((_, i) => `x${i}`);
  const powerVarNames = powerActive.map((_, i) => `p${i}`);
  const residentVarNames = residentActive.map((_, i) => `r${i}`);
  const stationVarNames = stationActive.map((_, i) => `s${i}`);
  const specialVarNames = specialActive.map((_, i) => `t${i}`);
  const varNames = [...mainVarNames, ...powerVarNames, ...residentVarNames, ...stationVarNames, ...specialVarNames];

  // 目标函数：居民配方变量固定为1（不参与最小化）
  const objExpr = [
    ...mainVarNames.map((v, i) => mainActive[i].isSolar ? `0.01 ${v}` : v),
    ...powerVarNames.map((v, i) => powerActive[i].isSolar ? `0.01 ${v}` : v),
  ].join(' + ');

  let lp = `MIN\nOBJ: ${objExpr}\nST\n`;

  // 固定居民模块数量为 1
  residentVarNames.forEach(v => {
    lp += ` ${v} = 1\n`;
  });

  // 固定空间站模块数量为 1
  stationVarNames.forEach(v => {
    lp += ` ${v} = 1\n`;
  });

  // 固定特殊模块数量为 1（雕像和研究所的数量已缩放到配方数据中）
  specialVarNames.forEach(v => {
    lp += ` ${v} = 1\n`;
  });

  // 辅助函数：根据配方数组和变量名构建表达式
  const makeExpr = (recipes: Recipe[], vars: string[], it: string): string => {
    let expr = '';
    recipes.forEach((r, i) => {
      let c = 0;
      // 居民、空间站、特殊模块不缩放（duration 已设为 60，变量固定为1）
      const isScalable = !isPowerItem(it) && r.module !== 'resident' && r.module !== 'station' && r.module !== 'special';
      const scale = isScalable ? (60 / r.duration) : 1;
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

  // 合并五个模块（主模块、电力、居民、空间站、特殊）
  const allExpr = (it: string) => {
    const e1 = makeExpr(mainActive, mainVarNames, it);
    const e2 = makeExpr(powerActive, powerVarNames, it);
    const e3 = makeExpr(residentActive, residentVarNames, it);
    const e4 = makeExpr(stationActive, stationVarNames, it);
    const e5 = makeExpr(specialActive, specialVarNames, it);
    const parts = [e1, e2, e3, e4, e5].filter(Boolean);
    return parts.join(' + ');
  };

  // 计算全局生产者和消费者（用于 missing）
  const producers = new Set<string>();
  const consumers = new Set<string>();
  allActive.forEach(r => {
    Object.keys(r.outputs).forEach(k => { if (!ignored.has(k) && !excludedItems.has(k)) producers.add(k); });
    Object.keys(r.inputs).forEach(k => { if (!ignored.has(k) && !excludedItems.has(k)) consumers.add(k); });
    Object.keys(r.upkeep).forEach(k => { if (!ignored.has(k) && !excludedItems.has(k)) consumers.add(k); });
  });

  const demandSet = new Set(demands.map(d => d.item));
  const items = new Set([...demandSet].filter(i => !ignored.has(i) && !excludedItems.has(i)));
  producers.forEach(i => { if (!demandSet.has(i)) items.add(i); });
  consumers.forEach(i => items.add(i));
  // 蒸汽项目务必加入
  ['steam (high)', 'steam (super)', 'steam (low)'].forEach(s => {
    if (producers.has(s) || consumers.has(s)) items.add(s);
  });

  // 计算 missing 时，如果 allowExternal 为 true，则直接设为空数组
  let missing: string[] = [];
  if (!isAllowExternal) {
    missing = [...consumers].filter(i => !producers.has(i) && !ignored.has(i) && !excludedItems.has(i) && !demandSet.has(i));
    for (const d of demands) {
      if (!ignored.has(d.item) && !excludedItems.has(d.item) && !producers.has(d.item)) {
        if (!missing.includes(d.item)) missing.push(d.item);
      }
    }
  }

  // 行标签
  const rows: Record<string, string> = {};
  [...items].forEach((it, idx) => rows[it] = `r${idx}`);

  items.forEach(it => {
    // 蒸汽高压/超高压
    if (it === 'steam (high)' || it === 'steam (super)') {
      const expr = allExpr(it);
      if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
      return;
    }

    // 蒸汽低压
    if (it === 'steam (low)') {
      if (steamLowMode === 'internal') {
        const expr = makeExpr(powerActive, powerVarNames, it); // 仅电力模块
        if (expr) lp += ` ${rows[it]}: ${expr} = 0\n`;
        return;
      }
      // shared 模式：不额外处理，交给下面普通物品逻辑
      // 不 return，继续
    }

    // 普通物品
    const expr = allExpr(it);
    const totalDr = demands.filter(d => d.item === it).reduce((s, d) => s + d.rate, 0);
    const supply = externalSupplyMap.get(it) || 0;  // 外部供给量

    if (demandSet.has(it)) {
      // 有用户需求：需求可被外部供给抵消
      const effectiveDr = Math.max(0, totalDr - supply);
      if (expr) {
        lp += ` ${rows[it]}: ${expr} >= ${effectiveDr}\n`;
      } else {
        lp += ` ${rows[it]}: 0 >= ${effectiveDr}\n`;
      }
    } else if (supply > 0) {
      // 无用户需求，但有外部供给：必须全部消耗
      if (!consumers.has(it)) {
        // 没有消耗配方，标记为 missing（无消费者），不添加约束
        missing.push(it);
        return;
      }
      if (expr) {
        // 强制总净产出 = -supply，即必须消耗掉外部供给
        lp += ` ${rows[it]}: ${expr} = ${-supply}\n`;
      }
    } else {
      // 无外部供给，无用户需求

      // 关键修改：如果 allowExternal 为 true，且该物品没有生产者，但有消耗，则跳过约束（允许外部补给）
      if (isAllowExternal && !producers.has(it) && consumers.has(it)) {
        return; // 不添加任何约束，相当于可以从外部无限获取
      }

      // 约束模式处理
      const shouldConstrain = (hasProducer: boolean, hasConsumer: boolean): boolean => {
        if (constraintMode === 'noProdOrCons') {
          // 宽松模式：没有生产者或没有消费者都不约束
          return hasProducer && hasConsumer;
        }
        // 常规模式（noProd）：只有没有生产者时才不约束
        // 有生产的物品必须被消耗（或通过demand排出）
        return hasProducer;
      };

      if (!shouldConstrain(producers.has(it), consumers.has(it))) {
        // 不约束，忽略（允许自由获取/排放）
        return;
      }
      // 正常中间产物，强制平衡
      if (expr) {
        lp += ` ${rows[it]}: ${expr} = 0\n`;
      }
    }
  });

  return { lpString: lp + 'END\n', varNames, missing };
}
