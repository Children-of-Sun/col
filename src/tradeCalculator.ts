import { DockLevel, TradeContract, TradeFuel } from './types';

export interface TradeResult {
  buyAmount: number;      // 单次贸易买入量
  sellAmount: number;     // 单次贸易卖出量
  durationMinutes: number; // 单次贸易总耗时（分钟）
  slotsUsed: number;      // 使用的模块总数
  buyModules: number;     // 用于买入的模块数
  sellModules: number;    // 用于卖出的模块数
}

/**
 * 计算单次贸易的最大可行运量及耗时
 * @param contract 贸易合同（比例）
 * @param dock 码头等级配置
 * @param fuel 燃料配置
 * @param baseTravelMinutes 基础航行时间（分钟，可配置为固定值或从游戏数据读取）
 */
export function calculateTrade(
  contract: TradeContract,
  dock: DockLevel,
  fuel: TradeFuel,
  baseTravelMinutes: number = 30
): TradeResult | null {
  const { slots, moduleCapacity } = dock;
  const speedFactor = dock.speedMultiplier * fuel.speedMultiplier;
  const travelTime = baseTravelMinutes / speedFactor;
  
  // 归一化比例：使其中一个为 1
  const sellPerBuy = contract.sellRate / contract.buyRate; // 每买入1单位需卖出多少
  const buyPerSell = contract.buyRate / contract.sellRate; // 每卖出1单位可买入多少
  
  let bestBuyAmount = 0;
  let bestSellAmount = 0;
  let bestBuyModules = 0;
  let bestSellModules = 0;
  
  // 遍历所有可能的模块分配方案（买入模块数 m，卖出模块数 n = slots - m）
  for (let m = 0; m <= slots; m++) {
    const n = slots - m;
    if (n < 0) continue;
    
    // 方案一：买入模块装满，计算所需卖出量
    const buyAmount1 = m * moduleCapacity;
    const sellAmount1 = buyAmount1 * sellPerBuy;
    if (sellAmount1 <= n * moduleCapacity + 1e-6) {
      if (buyAmount1 > bestBuyAmount) {
        bestBuyAmount = buyAmount1;
        bestSellAmount = sellAmount1;
        bestBuyModules = m;
        bestSellModules = n;
      }
    }
    
    // 方案二：卖出模块装满，计算所得买入量
    const sellAmount2 = n * moduleCapacity;
    const buyAmount2 = sellAmount2 * buyPerSell;
    if (buyAmount2 <= m * moduleCapacity + 1e-6) {
      if (buyAmount2 > bestBuyAmount) {
        bestBuyAmount = buyAmount2;
        bestSellAmount = sellAmount2;
        bestBuyModules = m;
        bestSellModules = n;
      }
    }
  }
  
  if (bestBuyAmount === 0) return null;
  
  // 计算装卸时间：取较慢的一方
  let loadingTime = 0;
  if (bestBuyModules > 0) loadingTime = Math.max(loadingTime, bestBuyAmount / (bestBuyModules * moduleCapacity));
  if (bestSellModules > 0) loadingTime = Math.max(loadingTime, bestSellAmount / (bestSellModules * moduleCapacity));
  
  const totalDuration = travelTime + loadingTime;
  
  return {
    buyAmount: bestBuyAmount,
    sellAmount: bestSellAmount,
    durationMinutes: totalDuration,
    slotsUsed: slots,
    buyModules: bestBuyModules,
    sellModules: bestSellModules,
  };
}