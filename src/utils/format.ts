/**
 * 共享格式化工具函数
 * 提供电力、算力等单位的自动转换和格式化
 */

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
