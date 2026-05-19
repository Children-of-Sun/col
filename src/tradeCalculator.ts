import { DockLevel, TradeContract, TradeFuel, Recipe, TradeParams, GameData } from './types';

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

const MODULE_SPEEDS: Record<string, number> = { S: 125, M: 250, L: 500 };

function getModuleCapacity(slots: number): number {
  return slots <= 4 ? 800 : 1200;
}

function getDockMaintenance(slots: number, moduleCount: number, moduleSize: 'S' | 'M' | 'L') {
  let workers = slots * 2;
  const moduleWorkerMap: Record<string, number> = { S: 2, M: 3, L: 4 };
  workers += moduleCount * moduleWorkerMap[moduleSize];
  let electricity = slots * 100 + moduleCount * 50;
  let maintI = slots * 1 + moduleCount * 1;
  let maintII = slots * 0.5 + moduleCount * 0.5;
  let maintIII = 0;
  return { workers, electricity, maintI, maintII, maintIII };
}

function getTravelInfo(gameData: GameData | null, slots: number, fuelRaw: string, mode: string) {
  if (gameData?.ship_fuel_configs) {
    const dockKey = `dock_${slots}`;
    const dock = gameData.ship_fuel_configs[dockKey];
    if (dock && dock[fuelRaw] && dock[fuelRaw][mode]) {
      return {
        travelTime: dock[fuelRaw][mode].fuel_per_trip,
        fuelPerTrip: dock[fuelRaw][mode].travel_time_min,
      };
    }
  }
  return { travelTime: 3, fuelPerTrip: 200 };
}

export function buildTradeRecipesFromParams(params: {
  tradeContracts: TradeContract[];
  selectedIds: string[];
  baySlots: number;
  moduleSize: 'S' | 'M' | 'L';
  fuelTypeRaw: string;
  travelMode: 'normal' | 'special';
  profitBonus: number;
  unityDiscount: number;
  gameData: GameData | null;
  translation: Record<string, string>;
}): Recipe[] {
  const {
    tradeContracts,
    selectedIds,
    baySlots,
    moduleSize,
    fuelTypeRaw,
    travelMode,
    profitBonus,
    unityDiscount,
    gameData,
    translation,
  } = params;

  const moduleSpeed = MODULE_SPEEDS[moduleSize];
  const moduleCapacity = getModuleCapacity(baySlots);
  const { travelTime, fuelPerTrip } = getTravelInfo(gameData, baySlots, fuelTypeRaw, travelMode);
  const profitFactor = 1 + profitBonus / 100;
  const unityDiscountFactor = 1 - unityDiscount / 100;

  const recipes: Recipe[] = [];

  for (const contract of tradeContracts) {
    if (!selectedIds.includes(contract.id)) continue;

    // 计算最佳贸易方案
    const adjustedContract = { ...contract, buyRate: contract.buyRate * profitFactor };
    const { buyAmount, sellAmount, durationMinutes, buyModules, sellModules } = calculateTrade(
      adjustedContract,
      { level: 1, slots: baySlots, moduleCapacity, speedMultiplier: 1 },
      { name: fuelTypeRaw, speedMultiplier: 1, consumptionPerTrip: fuelPerTrip, cohesionCost: 0 },
      travelTime
    ) || { buyAmount: 0, sellAmount: 0, durationMinutes: 1, buyModules: 0, sellModules: 0 };

    if (buyAmount === 0) continue;

    const perMinBuy = buyAmount / durationMinutes;
    const perMinSell = sellAmount / durationMinutes;
    const perMinFuel = fuelPerTrip / durationMinutes;
    const totalModules = buyModules + sellModules;
    const { workers, electricity, maintI, maintII, maintIII } = getDockMaintenance(baySlots, totalModules, moduleSize);
    const perMinWorkers = workers / durationMinutes;
    const perMinElectricity = electricity / durationMinutes;
    const perMinMaintI = maintI / durationMinutes;
    const perMinMaintII = maintII / durationMinutes;
    const perMinMaintIII = maintIII / durationMinutes;

    const recipe: Recipe = {
      id: `trade_${contract.id}`,
      name: `贸易: ${translation[contract.name?.toLowerCase()] || contract.name || contract.id}`,
      buildingId: 'trade',
      buildingName: translation['trade dock'] || '贸易码头',
      category: '贸易',
      buildingLevel: 0,
      duration: 1,
      inputs: {
        [contract.sellItem.toLowerCase()]: perMinSell,
        [fuelTypeRaw.toLowerCase()]: perMinFuel,
      },
      outputs: {
        [contract.buyItem.toLowerCase()]: perMinBuy,
      },
      upkeep: {
        '人力': perMinWorkers,
        'electricity': perMinElectricity,
        ...(perMinMaintI > 0 && { 'maintenance i': perMinMaintI }),
        ...(perMinMaintII > 0 && { 'maintenance ii': perMinMaintII }),
        ...(perMinMaintIII > 0 && { 'maintenance iii': perMinMaintIII }),
      },
      powerMultiplier: 1,
      workers: perMinWorkers,
      isSolar: false,
      isHidden: false,
      module: 'trade',
    };
    recipes.push(recipe);
  }

  return recipes;
}