/**
 * 共享格式化工具函数
 * 提供电力、算力等单位的自动转换和格式化
 */

import { Recipe } from '../types';

/** 判断物品是否为持续类型（不缩放） */
export const isContinuous = (item: string): boolean => {
  return item === 'electricity' || item === 'computing' || item === '人力' || item === 'mechanical power';
};

// ========== 电力格式化 ==========

/** 电力单位转换（kW → MW / GW），带符号（净产出用） */
export const formatPowerSigned = (val: number): string => {
  const sign = val >= 0 ? '+' : '-';
  const absVal = Math.abs(val);
  if (absVal >= 1_000_000) return `${sign}${(absVal / 1_000_000).toFixed(2)} GW`;
  if (absVal >= 1000) return `${sign}${(absVal / 1000).toFixed(2)} MW`;
  return `${sign}${absVal.toFixed(2)} kW`;
};

/** 电力单位转换，不带符号（产出/消耗用） */
export const formatPowerValue = (val: number): string => {
  const absVal = Math.abs(val);
  if (absVal >= 1_000_000) return (absVal / 1_000_000).toFixed(2) + ' GW';
  if (absVal >= 1000) return (absVal / 1000).toFixed(2) + ' MW';
  return absVal.toFixed(2) + ' kW';
};

// ========== 算力格式化 ==========

/** 算力单位转换（TF → PF），带符号（净产出用） */
export const formatComputingSigned = (val: number): string => {
  const sign = val >= 0 ? '+' : '-';
  const absVal = Math.abs(val);
  if (absVal >= 1000) return `${sign}${(absVal / 1000).toFixed(2)} PF`;
  return `${sign}${absVal.toFixed(2)} TF`;
};

/** 算力单位转换，不带符号（产出/消耗用） */
export const formatComputingValue = (val: number): string => {
  const absVal = Math.abs(val);
  if (absVal >= 1000) return (absVal / 1000).toFixed(2) + ' PF';
  return absVal.toFixed(2) + ' TF';
};

// ========== 占地面积 ==========

/**
 * 计算单个配方的占地面积（小格）
 */
export function computeRecipeArea(
  recipe: Recipe,
  machineCount: number,
  buildingSizes: Record<string, { width: number; height: number }>
): number {
  if (machineCount < 1e-6) return 0;
  // 模块：占地 = Σ 内部建筑占地 × 数量 × 单元数
  if (recipe._moduleParts && recipe._moduleParts.length > 0) {
    let area = 0;
    for (const part of recipe._moduleParts) {
      const key = part.buildingName?.toLowerCase?.() || '';
      const size = buildingSizes[key];
      if (size) area += size.width * size.height * part.count;
    }
    return area * machineCount;
  }
  if (recipe.module === 'trade') {
    let area = 0;
    const dockKey = (recipe._tradeDockName || '').toLowerCase();
    const modKey = (recipe._tradeModuleName || '').toLowerCase();
    const dockSize = buildingSizes[dockKey];
    const modSize = buildingSizes[modKey];
    const baySlots = recipe._tradeBaySlots || 0;
    if (dockSize) area += dockSize.width * dockSize.height;
    if (modSize) area += modSize.width * modSize.height * baySlots;
    return area * machineCount;
  }
  const key = recipe.buildingName?.toLowerCase?.() || '';
  const size = buildingSizes[key];
  return size ? size.width * size.height * machineCount : 0;
}

/**
 * 格式化占地面积，层级显示。
 * 16小格 = 1格, 16格 = 1中格, 64中格 = 1大格
 * 不取整，保留小数
 */
// ========== 智能数值截断 ==========

/**
 * 智能四舍五入：小数部分 < 整数部分 5% 时截断为整数，否则保留两位小数。
 * 值为零时直接返回 '0'。
 */
export function smartRound(value: number, showFull: boolean): { text: string; title: string } {
  if (Math.abs(value) < 1e-9) return { text: '0', title: '0' };
  const title = value.toFixed(4);
  if (showFull) return { text: value.toFixed(1), title };
  const absVal = Math.abs(value);
  const intPart = Math.floor(absVal);
  if (intPart > 0) {
    const decPart = absVal - intPart;
    if (decPart / intPart < 0.05) return { text: Math.round(value).toString(), title };
  }
  return { text: value.toFixed(1), title };
}

/** 电力智能格式化：先 smartRound 再 formatPowerSigned */
export function formatPowerSmart(raw: number, showFull: boolean): { text: string; title: string } {
  if (Math.abs(raw) < 1e-9) return { text: '0', title: '0' };
  const rounded = smartRound(raw, showFull);
  const numVal = Number(rounded.text);
  if (isNaN(numVal)) return { text: formatPowerValue(raw), title: raw.toFixed(4) };
  return { text: formatPowerValue(numVal), title: raw.toFixed(4) };
}

/** 算力智能格式化：先 smartRound 再 formatComputingValue（无符号） */
export function formatComputingSmart(raw: number, showFull: boolean): { text: string; title: string } {
  if (Math.abs(raw) < 1e-9) return { text: '0', title: '0' };
  const rounded = smartRound(raw, showFull);
  const numVal = Number(rounded.text);
  if (isNaN(numVal)) return { text: formatComputingValue(raw), title: raw.toFixed(4) };
  return { text: formatComputingValue(numVal), title: raw.toFixed(4) };
}

/** 净产出/净消耗数值格式化：最多8位有效数字，最多4位小数 */
export function formatNetValue(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  const absVal = Math.abs(value);
  let decimals: number;
  if (absVal >= 1) {
    const intDigits = Math.floor(Math.log10(absVal)) + 1;
    decimals = Math.min(4, Math.max(0, 8 - intDigits));
  } else {
    decimals = 4;
  }
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals);
}

export function formatFootprint(smallCells: number): string {
  if (smallCells < 0.0005) return '0小格';

  const LARGE = 16384;  // 64中格 × 256小格/中格 = 16384
  const MEDIUM = 256;   // 16格 × 16小格/格 = 256小格
  const CELL = 16;      // 16小格 = 1格

  const large = Math.floor(smallCells / LARGE);
  smallCells -= large * LARGE;

  const medium = Math.floor(smallCells / MEDIUM);
  smallCells -= medium * MEDIUM;

  const cell = Math.floor(smallCells / CELL);
  smallCells -= cell * CELL;

  const small = smallCells; // 剩余小格，可能带小数

  const parts: string[] = [];
  if (large > 0) parts.push(`${large}大格`);
  if (medium > 0) parts.push(`${medium}中格`);
  if (cell > 0) parts.push(`${cell}格`);
  if (small >= 0.0005 || parts.length === 0) {
    parts.push(`${Number(small.toFixed(2))}小格`);
  }
  return parts.join('');
}
