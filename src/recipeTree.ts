// 配方树计算引擎 — 简化模式
import { Recipe } from './types';
import { isRaw } from './utils';

// ========== 类型定义 ==========

export interface TreeNode {
  item: string;              // 物品名（小写）— 本节点生产的物品
  rate: number;              // 此节点需要的速率（/min）
  recipe: Recipe | null;     // 使用的配方（基础矿石为 null）
  machines: number;          // 所需机器数
  children: TreeNode[];      // 子节点（原料）
  depth: number;             // 深度
  isCycle: boolean;          // 是否为循环节点
  cycleRate?: number;        // 循环中自产比例
  requestedItem?: string;    // 父节点请求此节点的原料名（边上的物料）
}

export interface TreeInput {
  item: string;              // 目标物品
  rate: number;              // 目标速率 /min
  recipes: Recipe[];         // 所有可用配方
  precision?: number;        // 精度阈值（默认 0.01 = 1%）
  recipeOverrides?: Record<string, string>; // item → recipeId 手动覆盖
}

// ========== 辅助函数 ==========

/** 计算配方对某物品的每分钟产出量 */
export function recipeOutputPerMin(recipe: Recipe, item: string): number {
  const qty = recipe.outputs[item];
  if (!qty) return 0;
  if (recipe.duration <= 0) return 0;
  return (qty * 60) / recipe.duration;
}

/** 计算配方对某物品的每分钟消耗量 */
export function recipeInputPerMin(recipe: Recipe, item: string): number {
  const qty = recipe.inputs[item];
  if (!qty) return 0;
  if (recipe.duration <= 0) return 0;
  return (qty * 60) / recipe.duration;
}

/** 获取生产某物品的所有配方，按产出速率降序。可传入启用的配方/建筑 ID 过滤。 */
export function getRecipesForItem(item: string, allRecipes: Recipe[], enabledRecipeIds?: Set<string>, enabledBuildingIds?: Set<string>): Recipe[] {
  const lower = item.toLowerCase();
  const hasFilter = enabledRecipeIds && enabledBuildingIds;
  return allRecipes
    .filter(r => {
      if (!r.outputs[lower] || r.isHidden || r.module === 'power' || r.module === 'trade') return false;
      if (hasFilter) {
        if (!enabledRecipeIds!.has(r.id)) return false;
        if (!enabledBuildingIds!.has(r.buildingId)) return false;
      }
      return true;
    })
    .sort((a, b) => recipeOutputPerMin(b, lower) - recipeOutputPerMin(a, lower));
}

/** 获取消费某物品作为原料的所有配方 */
export function getRecipesConsumingItem(item: string, allRecipes: Recipe[]): Recipe[] {
  const lower = item.toLowerCase();
  return allRecipes
    .filter(r => r.inputs[lower] && !r.isHidden && r.module !== 'power' && r.module !== 'trade')
    .sort((a, b) => (b.inputs[lower] * 60 / b.duration) - (a.inputs[lower] * 60 / a.duration));
}

/** 获取某物品的所有基础材料（递归展平到矿石） */
export function getBaseMaterials(
  item: string,
  rate: number,
  allRecipes: Recipe[],
  overrides: Record<string, string> = {},
  buildingOverrides: Record<string, string> = {},
  depth: number = 0,
  visited: Set<string> = new Set(),
  enabledRecipeIds?: Set<string>,
  enabledBuildingIds?: Set<string>,
): TreeNode[] {
  const lower = item.toLowerCase();

  // 基础矿石 —— 递归终点
  if (isRaw(lower)) {
    return [{
      item: lower, rate, recipe: null, machines: 0,
      children: [], depth, isCycle: false,
    }];
  }

  // 循环检测
  if (visited.has(lower)) {
    return [{
      item: lower, rate, recipe: null, machines: 0,
      children: [], depth, isCycle: true, cycleRate: 0,
    }];
  }

  const allItemRecipes = getRecipesForItem(lower, allRecipes, enabledRecipeIds, enabledBuildingIds);
  if (allItemRecipes.length === 0) {
    return [{
      item: lower, rate, recipe: null, machines: 0,
      children: [], depth, isCycle: false,
    }];
  }

  // 建筑覆盖：如果指定了 buildingId，优先从该建筑的配方中选
  const bldOverrideId = buildingOverrides[lower];
  const candidateRecipes = bldOverrideId
    ? allItemRecipes.filter(r => r.buildingId === bldOverrideId)
    : allItemRecipes;
  const effectiveRecipes = candidateRecipes.length > 0 ? candidateRecipes : allItemRecipes;

  // 配方选择：优先覆盖，否则选最快的
  const overrideId = overrides[lower];
  const picked = overrideId
    ? effectiveRecipes.find(r => r.id === overrideId) || effectiveRecipes[0]
    : effectiveRecipes[0];

  const perMin = recipeOutputPerMin(picked, lower);
  if (perMin <= 0) {
    return [{
      item: lower, rate, recipe: picked, machines: 0,
      children: [], depth, isCycle: false,
    }];
  }

  const machines = rate / perMin;

  // 递归计算原料需求
  const newVisited = new Set(visited);
  newVisited.add(lower);

  const children: TreeNode[] = [];
  for (const [inputItem, qty] of Object.entries(picked.inputs)) {
    const inputRate = machines * recipeInputPerMin(picked, inputItem);
    if (inputRate <= 0) continue;
    const childNodes = getBaseMaterials(inputItem, inputRate, allRecipes, overrides, buildingOverrides, depth + 1, newVisited, enabledRecipeIds, enabledBuildingIds);
    // 标记父节点请求此子节点提供的原料名（边上流动的物料）
    for (const cn of childNodes) cn.requestedItem = inputItem;
    children.push(...childNodes);
  }

  // 合并同物品子节点
  const merged = mergeChildren(children);

  return [{
    item: lower,
    rate,
    recipe: picked,
    machines,
    children: merged,
    depth,
    isCycle: false,
  }];
}

/** 合并同物品的子节点（不同配方可能产生相同原料） */
function mergeChildren(children: TreeNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const child of children) {
    const existing = map.get(child.item);
    if (existing) {
      existing.rate += child.rate;
      if (existing.recipe && child.recipe && existing.recipe.id === child.recipe.id) {
        existing.machines = existing.rate / recipeOutputPerMin(existing.recipe, existing.item);
      }
    } else {
      map.set(child.item, { ...child });
    }
  }
  return [...map.values()].sort((a, b) => b.rate - a.rate);
}

// ========== 循环处理：代数求解 ==========

export interface CycleInfo {
  items: Set<string>;
  externalInput: number;      // 外部输入的速率
  selfRatio: number;          // 循环自产比例 (0-1)
  solvedRate: number;         // 考虑循环后的实际可用速率
}

/**
 * 尝试为循环节点做简单代数求解
 * 循环公式: total = external + selfRatio * total
 * 解得: total = external / (1 - selfRatio)
 * selfRatio < 1 时收敛，否则需要外部提供全部
 */
export function solveCycle(
  item: string,
  externalRate: number,
  allRecipes: Recipe[],
): CycleInfo | null {
  const recipes = getRecipesForItem(item, allRecipes);
  if (recipes.length === 0) return null;

  const recipe = recipes[0];
  let selfRatio = 0;

  // 检查配方是否产出自身原料
  for (const [inputItem] of Object.entries(recipe.inputs)) {
    if (inputItem === item) {
      const inputPerMin = recipeInputPerMin(recipe, item);
      const outputPerMin = recipeOutputPerMin(recipe, item);
      if (outputPerMin > 0) {
        selfRatio = inputPerMin / outputPerMin;
      }
    }
  }

  if (selfRatio >= 1) {
    // 不收敛 —— 需要外部提供全部
    return { items: new Set([item]), externalInput: externalRate, selfRatio, solvedRate: externalRate };
  }

  if (selfRatio <= 0) {
    return null; // 无循环
  }

  const solvedRate = externalRate / (1 - selfRatio);

  return {
    items: new Set([item]),
    externalInput: externalRate,
    selfRatio,
    solvedRate,
  };
}

// ========== 汇总计算 ==========

export interface TreeSummary {
  nodes: TreeNode[];
  totalOres: Record<string, number>;      // 总矿石消耗 /min
  totalMachines: Record<string, number>;  // 每种建筑所需台数
  totalLabor: number;                      // 总人力
  totalElectricity: number;                // 总电力
  totalComputing: number;                  // 总算力
  totalMaintenance: Record<string, number>;// 各级维护消耗 /min
  maxDepth: number;
}

/** 从根节点收集汇总数据 */
export function summarizeTree(roots: TreeNode[]): TreeSummary {
  const totalOres: Record<string, number> = {};
  const totalMachines: Record<string, number> = {};
  const totalMaintenance: Record<string, number> = {};
  let totalLabor = 0;
  let totalElectricity = 0;
  let totalComputing = 0;
  let maxDepth = 0;

  function walk(node: TreeNode) {
    maxDepth = Math.max(maxDepth, node.depth);
    if (node.recipe) {
      const key = node.recipe.buildingName;
      totalMachines[key] = (totalMachines[key] || 0) + node.machines;
      totalLabor += node.machines * (node.recipe.workers || 0);
      totalElectricity += node.machines * (node.recipe.upkeep['electricity'] || 0);
      totalComputing += node.machines * (node.recipe.upkeep['computing'] || 0);
      for (const [upk, qty] of Object.entries(node.recipe.upkeep)) {
        if (upk.startsWith('maintenance')) {
          totalMaintenance[upk] = (totalMaintenance[upk] || 0) + node.machines * qty;
        }
      }
    } else if (!node.recipe && node.children.length === 0) {
      totalOres[node.item] = (totalOres[node.item] || 0) + node.rate;
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return { nodes: roots, totalOres, totalMachines, totalLabor, totalElectricity, totalComputing, totalMaintenance, maxDepth };
}

// ========== 重新计算（修改节点后） ==========

/** 修改某个节点的速率后重新计算子树 */
export function recalculateAt(node: TreeNode, newRate: number, allRecipes: Recipe[]): TreeNode {
  if (!node.recipe) {
    return { ...node, rate: newRate };
  }
  const perMin = recipeOutputPerMin(node.recipe, node.item);
  const machines = perMin > 0 ? newRate / perMin : 0;
  const newChildren = node.children.map(child => {
    let childRate = 0;
    for (const [inItem, qty] of Object.entries(node.recipe!.inputs)) {
      if (inItem === child.item) {
        childRate = machines * recipeInputPerMin(node.recipe!, inItem);
      }
    }
    // 如果子节点有配方，重新计算；否则保持原样（矿石节点）
    return child.recipe
      ? recalculateAt(child, childRate || child.rate, allRecipes)
      : { ...child, rate: childRate || child.rate };
  });
  return { ...node, rate: newRate, machines, children: newChildren };
}
