// 科研相关计算（纯函数，不使用 LP 求解器）
import { GameData, LabMeta } from '../types';

// ==================== 科研消耗公式 ====================

/** 公式编译缓存：同一公式只编译一次（逐级求和时需要反复求值） */
const formulaCache = new Map<string, ((x: number) => number) | null>();

const compileFormula = (formula: string): ((x: number) => number) | null => {
  if (formulaCache.has(formula)) return formulaCache.get(formula)!;
  let fn: ((x: number) => number) | null = null;
  try {
    // 仅允许数字、运算符、括号、空格和变量 x
    if (/^[\d\s+\-*/().x^]+$/.test(formula)) {
      // 将数学公式中的 ^ (幂运算) 替换为 JS 的 ** 运算符
      const jsFormula = formula.replace(/\^/g, '**');
      fn = new Function('x', `return ${jsFormula}`) as (x: number) => number;
    }
  } catch {
    fn = null;
  }
  formulaCache.set(formula, fn);
  return fn;
};

/**
 * 计算 costFormula 在指定等级 x 的值（把科技从 x 级升到 x+1 级需要的科研点）
 * 只允许数字、运算符、括号、空格和变量 x（^ 视为乘方）
 */
export const evalResearchCost = (formula: string | undefined, x: number): number | null => {
  if (!formula) return null;
  const fn = compileFormula(formula);
  if (!fn) return null;
  try {
    const v = fn(x);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

/** 单级消耗明细 */
export interface ResearchStep {
  level: number;      // 该级的起始等级（升到 level+1）
  cost: number;       // 该级消耗科研点
  cumulative: number; // 累计科研点
}

/** 区间科研消耗结果 */
export interface ResearchCostResult {
  total: number;          // 总科研点
  levels: number;         // 跨越的等级数
  steps: ResearchStep[];  // 逐级明细
  missing: boolean;       // 是否存在无法解析的等级（公式异常）
}

/**
 * 计算科技从 fromLevel 升到 toLevel 需要的科研点（逐级累加，不做任何循环/递归依赖）
 */
export const researchCostBetween = (
  formula: string | undefined,
  fromLevel: number,
  toLevel: number
): ResearchCostResult => {
  const from = Math.max(0, Math.floor(fromLevel) || 0);
  const to = Math.max(from, Math.floor(toLevel) || 0);
  const steps: ResearchStep[] = [];
  let total = 0;
  let missing = false;
  for (let i = from; i < to; i++) {
    const c = evalResearchCost(formula, i);
    if (c === null) {
      missing = true;
      continue;
    }
    total += c;
    steps.push({ level: i, cost: c, cumulative: total });
  }
  return { total, levels: to - from, steps, missing };
};

/** 某科技累计到 level 级的消耗（0→level） */
export const researchCostUpTo = (formula: string | undefined, level: number): number =>
  researchCostBetween(formula, 0, level).total;

// ==================== 研究所科研点产量 ====================

export type LabMultiplierKind = 'population' | 'edict' | 'office' | 'station';

export interface LabMultiplierEntry {
  kind: LabMultiplierKind;
  label: string;   // 显示名称
  percent: number; // 加成百分比（可为负）
  factor: number;  // 实际乘数
}

export interface LabOutputResult {
  hasLab: boolean;                 // 是否找到研究所配置
  isBasicLab: boolean;             // 基础研究所（固定 3 点/台）
  hasRecipe: boolean;              // 高级研究所是否选择了配方
  baseOutput: number;              // 基础研究产出 /分
  equipmentConsumption: number;    // 设备消耗总量 /分
  equipmentDetails: { name: string; rate: number }[];
  multipliers: LabMultiplierEntry[];
  totalMultiplier: number;
  finalOutput: number;             // 最终研究产出 /分
}

export interface LabOutputInput {
  labLevel: string;
  labCount: number;
  labMeta: LabMeta[];
  recipeEnabled: Record<string, boolean>;
  gameData: GameData | null;
  population: number;
  edictLevels: Record<number, number>;
  officeLevels: number[];
  stationLevel: number;
}

/**
 * 根据研究所设置计算科研点产量（/分）
 * 与求解器 buildActiveRecipes 中的研究所产出保持一致
 */
export const computeLabResearchOutput = (input: LabOutputInput): LabOutputResult => {
  const {
    labLevel, labCount, labMeta, recipeEnabled,
    gameData, population, edictLevels, officeLevels, stationLevel,
  } = input;

  const meta = labMeta.find(l => l.buildingId === labLevel);
  const empty: LabOutputResult = {
    hasLab: false, isBasicLab: false, hasRecipe: false,
    baseOutput: 0, equipmentConsumption: 0, equipmentDetails: [],
    multipliers: [], totalMultiplier: 1, finalOutput: 0,
  };
  if (!meta) return empty;

  // 判断是否为不消耗设备的基础研究所
  const isBasicLab = labLevel === 'ResearchLab' || meta.name?.toLowerCase() === 'research lab';

  let baseOutput = 0;
  let equipmentConsumption = 0;
  const equipmentDetails: { name: string; rate: number }[] = [];
  let hasRecipe = false;

  if (isBasicLab) {
    baseOutput = 3 * labCount;
  } else {
    for (const r of meta.recipes) {
      if (!recipeEnabled[r.id]) continue;
      hasRecipe = true;
      for (const [item, qty] of Object.entries(r.inputs)) {
        if (item.toLowerCase().includes('lab equipment')) {
          const rate = (60 / r.duration) * (qty as number) * labCount;
          equipmentConsumption += rate;
          equipmentDetails.push({ name: item, rate });
        }
      }
    }
    baseOutput = equipmentConsumption; // 每消耗 1 设备产出 1 研究
  }

  // 加成（乘算）
  const multipliers: LabMultiplierEntry[] = [];
  const popPercent = population * 0.005;
  multipliers.push({
    kind: 'population',
    label: `人口 (${population.toLocaleString()}人)`,
    percent: popPercent,
    factor: 1 + population * 0.00005,
  });

  if (gameData) {
    const edict = gameData.edicts.find(e => e.name === '研究效率');
    if (edict) {
      const idx = gameData.edicts.indexOf(edict);
      const lvl = edictLevels[idx] ?? -1;
      if (lvl >= 0) {
        const eff = edict.effectPerLevel[lvl] || 0;
        multipliers.push({ kind: 'edict', label: '法令 "研究效率"', percent: eff * 100, factor: 1 + eff });
      }
    }
    const office = gameData.office.find(o => o.name === '研究效率');
    if (office) {
      const idx = gameData.office.indexOf(office);
      const lvl = officeLevels[idx] || 0;
      if (lvl > 0) {
        const eff = (office.effectPerLevel || 0) * lvl;
        multipliers.push({ kind: 'office', label: `办公 "研究效率" Lv${lvl}`, percent: eff * 100, factor: 1 + eff });
      }
    }
  }

  multipliers.push({
    kind: 'station',
    label: `空间站等级 Lv${stationLevel}`,
    percent: stationLevel * 5,
    factor: 1 + stationLevel * 0.05,
  });

  const totalMultiplier = multipliers.reduce((m, e) => m * e.factor, 1);

  return {
    hasLab: true,
    isBasicLab,
    hasRecipe,
    baseOutput,
    equipmentConsumption,
    equipmentDetails,
    multipliers,
    totalMultiplier,
    finalOutput: baseOutput * totalMultiplier,
  };
};

// ==================== 格式化 ====================

/** 格式化大数字：12.3K / 1.23M */
export const formatPoints = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
};

/**
 * 格式化时长（游戏内分钟）
 * 只做单位换算，不涉及任何迭代
 */
export const formatDuration = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 分钟';
  if (minutes < 1) return `${Math.round(minutes * 60)} 秒`;
  if (minutes < 60) return `${minutes.toFixed(1)} 分钟`;
  const totalMinutes = Math.round(minutes);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (mins > 0 && days === 0) parts.push(`${mins} 分`);
  return parts.join(' ') || '0 分钟';
};

/** 时长的简短描述：额外给出总小时 / 总天 */
export const formatDurationDetail = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 分钟';
  const hours = minutes / 60;
  const days = hours / 24;
  const parts = [`${Math.round(minutes).toLocaleString()} 分钟`];
  if (hours >= 1) parts.push(`${hours.toFixed(1)} 小时`);
  if (days >= 1) parts.push(`${days.toFixed(2)} 天`);
  return parts.join(' = ');
};
