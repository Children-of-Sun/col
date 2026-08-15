import { Module, Recipe } from '../types';
import { isNonScalable } from '../utils';

/** 农业倍率（输出/水），与农业模块一致 */
export interface AgriMultipliers {
  output: number;
  water: number;
}

/** 判断配方是否属于农业（仅 FarmT1~T4 农场建筑 / 农业系统动态配方） */
export function isAgricultureRecipe(r: Recipe): boolean {
  return !!r.buildingId && r.buildingId.startsWith('FarmT') || r.category === '农业';
}

/**
 * 将模块展开为总配方（显示与求解共用同一逻辑）
 * - 输入/输出：内部各配方按每分钟缩放（60/duration × 数量）后求和
 * - 维护/人力/电力/算力：按内部建筑数量累加（每分钟值，不缩放）
 * - 机器数：内部数量之和（_moduleMachineTotal）
 * - 农业配方（agri 传入时）：产出 ×agri.output，水消耗 ×agri.water（独立农业加成；
 *   农业模块动态配方 agri_* 已含倍率，不再重复加成）
 * - 含农业配方时标记 _moduleIsAgriculture（结果中归入农业模块）
 * - recipeAlias：模块引用的配方 id → 实际配方 id（用于把原始农场配方映射到农业模块动态配方）
 */
export function buildModuleRecipe(
  bp: Module,
  recipes: Recipe[],
  agri?: AgriMultipliers,
  recipeAlias?: Map<string, string>,
): Recipe | null {
  const inputs: Record<string, number> = {};
  const outputs: Record<string, number> = {};
  const upkeep: Record<string, number> = {};
  const partsMeta: { recipeId: string; name: string; count: number; buildingId: string; buildingName: string; isSolar: boolean }[] = [];
  // 除数 N（默认 1）：每个配方数量 = 基准数量 ÷ N
  const div = bp.divisor && bp.divisor > 0 ? bp.divisor : 1;
  let machineTotal = 0;
  let hasValidPart = false;
  let hasAgriculture = false;

  for (const part of bp.parts || []) {
    if (!part || part.count <= 0) continue;
    const rid = recipeAlias?.get(part.recipeId) || part.recipeId;
    let r = recipes.find(x => x.id === rid);
    // alias 指向的动态配方不存在（如农业模块未启用该作物）→ 回退模块引用的原始配方
    if (!r && rid !== part.recipeId) r = recipes.find(x => x.id === part.recipeId);
    if (!r) continue;
    hasValidPart = true;
    const isAgriPart = isAgricultureRecipe(r);
    if (isAgriPart) hasAgriculture = true;
    // 农业加成：仅对未预乘倍率的原始农场配方应用（agri_* 动态配方已含倍率）
    const isAgriBonus = !!agri && isAgriPart && !r.id.startsWith('agri_');
    const partCount = part.count / div;
    // 等效机器数：太阳能面板按 0.01 台计（与 LP 目标函数一致）
    machineTotal += partCount * (r.isSolar ? 0.01 : 1);
    partsMeta.push({ recipeId: r.id, name: r.name, count: partCount, buildingId: r.buildingId, buildingName: r.buildingName, isSolar: !!r.isSolar });
    const scale = (60 / (r.duration > 0 ? r.duration : 60)) * partCount;
    for (const [item, qty] of Object.entries(r.inputs)) {
      // 连续型物品（电力/算力/机械能/人力/维护/focus）不按配方周期缩放，与 LP 一致
      const itemScale = isNonScalable(item) ? partCount : scale;
      // 农业配方：水消耗应用农业水倍率
      const mul = isAgriBonus && item.toLowerCase() === 'water' ? agri!.water : 1;
      inputs[item] = (inputs[item] || 0) + qty * itemScale * mul;
    }
    for (const [item, qty] of Object.entries(r.outputs)) {
      // 连续型物品不按配方周期缩放，与 LP 一致
      const itemScale = isNonScalable(item) ? partCount : scale;
      // 农业配方：产出应用农业产量倍率
      const mul = isAgriBonus ? agri!.output : 1;
      outputs[item] = (outputs[item] || 0) + qty * itemScale * mul;
    }
    for (const [item, qty] of Object.entries(r.upkeep)) {
      upkeep[item] = (upkeep[item] || 0) + qty * partCount;
    }
  }

  if (!hasValidPart) return null;

  return {
    id: `md_${bp.id}`,
    name: bp.name,
    buildingId: 'module',
    buildingName: bp.name,
    category: bp.category || '模块',
    buildingLevel: 0,
    duration: 60,
    inputs,
    outputs,
    upkeep,
    powerMultiplier: 1,
    workers: upkeep['人力'] || 0,
    isSolar: false,
    isHidden: false,
    module: 'main',
    _moduleParts: partsMeta,
    _moduleMachineTotal: machineTotal,
    _moduleIsAgriculture: hasAgriculture,
  };
}

/**
 * 净输入/净输出：同一物品的产出与消耗相互抵消，用于简化显示
 * @param inputs  每分钟输入记录
 * @param outputs 每分钟输出记录
 */
export function getNetFromRecords(
  inputs: Record<string, number>,
  outputs: Record<string, number>,
): { inputs: Record<string, number>; outputs: Record<string, number> } {
  const netInputs: Record<string, number> = {};
  const netOutputs: Record<string, number> = {};
  // 仅跳过纯消耗类（人力/维护/凝聚力，在"维护"行单独显示）；
  // 电力/算力是重要产出（发电设施等），参与净额显示
  const SKIP = new Set(['人力', 'maintenance i', 'maintenance ii', 'maintenance iii', '凝聚力']);
  const items = new Set([...Object.keys(inputs), ...Object.keys(outputs)]);
  for (const item of items) {
    if (SKIP.has(item)) continue;
    const net = (outputs[item] || 0) - (inputs[item] || 0);
    if (Math.abs(net) < 0.001) continue; // 相互抵消（净额≈0），不显示
    if (net > 0) netOutputs[item] = net;
    else netInputs[item] = -net;
  }
  return { inputs: netInputs, outputs: netOutputs };
}

/** 模块净输入/净输出：内部产出与消耗的同一物品相互抵消，用于简化显示 */
export function getModuleNetIO(recipe: Recipe): {
  inputs: Record<string, number>;
  outputs: Record<string, number>;
} {
  return getNetFromRecords(recipe.inputs, recipe.outputs);
}
