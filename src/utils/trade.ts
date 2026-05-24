import { Recipe, TradeContract } from '../types';
import { t } from '../utils';

// 码头槽位 → 建筑 ID
const dockBuildingIdMap: Record<number, string> = { 2: 'CargoDepotT1', 4: 'CargoDepotT2', 6: 'CargoDepotT3', 8: 'CargoDepotT4' };
// 模块尺寸 → 建筑 ID
const moduleBuildingIdMap: Record<string, string> = { S: 'moduleST1', M: 'ModuleT2', L: 'ModuleT3' };

// 查找建筑（优先从 gameData.machines_and_buildings，回退到 fullData）
const findBuilding = (id: string, gameData: any, fullData: any) => {
  const source = gameData?.machines_and_buildings || fullData?.machines_and_buildings;
  return source?.find((b: any) => b.id === id);
};

// 获取航行信息
function getTravelInfo(slots: number, fuelRaw: string, mode: string, gameData: any) {
  if (gameData?.ship_fuel_configs) {
    const dockKey = `dock_${slots}`;
    const dock = gameData.ship_fuel_configs[dockKey];
    if (dock && dock[fuelRaw] && dock[fuelRaw][mode]) {
      return {
        travelTime: dock[fuelRaw][mode].fuel_per_trip,   // 时间（分钟）
        fuelPerTrip: dock[fuelRaw][mode].travel_time_min, // 燃料（单位）
      };
    }
  }
  return { travelTime: 3, fuelPerTrip: 200 };
}

// 最佳贸易分配计算
function computeBestTrade(contract: TradeContract, slots: number, moduleSpeed: number, moduleCapacity: number) {
  const { buyRate, sellRate } = contract;
  let bestBuy = 0, bestSell = 0, bestM = 0, bestN = 0, bestLoadTime = 0;
  for (let m = 1; m < slots; m++) {
    const n = slots - m;
    const buy1 = Math.floor(m * moduleCapacity);
    const sell1 = Math.floor(buy1 * (sellRate / buyRate));
    const loadBuy1 = m > 0 ? buy1 / (m * moduleSpeed) : 0;
    const loadSell1 = n > 0 ? sell1 / (n * moduleSpeed) : 0;
    const load1 = Math.max(loadBuy1, loadSell1);
    if (sell1 <= n * moduleCapacity && buy1 > bestBuy) {
      bestBuy = buy1; bestSell = sell1; bestM = m; bestN = n; bestLoadTime = load1;
    }
    const sell2 = Math.floor(n * moduleCapacity);
    const buy2 = Math.floor(sell2 * (buyRate / sellRate));
    const loadBuy2 = m > 0 ? buy2 / (m * moduleSpeed) : 0;
    const loadSell2 = n > 0 ? sell2 / (n * moduleSpeed) : 0;
    const load2 = Math.max(loadBuy2, loadSell2);
    if (buy2 <= m * moduleCapacity && buy2 > bestBuy) {
      bestBuy = buy2; bestSell = sell2; bestM = m; bestN = n; bestLoadTime = load2;
    }
  }
  return { buy: bestBuy, sell: bestSell, m: bestM, n: bestN, loadTime: bestLoadTime };
}

// 获取码头和模块的消耗（每分钟原始值，但返回的是每趟总消耗，需要除以总时间）
function getDockAndModuleConsumption(slots: number, moduleSize: string, totalModules: number, gameData: any, fullData: any) {
  const dockId = dockBuildingIdMap[slots];
  const moduleId = moduleBuildingIdMap[moduleSize];
  const dockBuilding = findBuilding(dockId, gameData, fullData);
  const moduleBuilding = findBuilding(moduleId, gameData, fullData);

  let workers = dockBuilding?.workers || 0;
  let electricity = dockBuilding?.electricity_consumed || 0;
  let maintI = 0, maintII = 0, maintIII = 0;
  const dockMaintUnit = (dockBuilding?.maintenance_cost_units || '').toLowerCase();
  const dockMaintQty = dockBuilding?.maintenance_cost_quantity || 0;
  if (dockMaintUnit === 'maintenance i') maintI += dockMaintQty;
  else if (dockMaintUnit === 'maintenance ii') maintII += dockMaintQty;
  else if (dockMaintUnit === 'maintenance iii') maintIII += dockMaintQty;

  const moduleWorkers = moduleBuilding?.workers || 0;
  const moduleElectricity = moduleBuilding?.electricity_consumed || 0;
  const moduleMaintUnit = (moduleBuilding?.maintenance_cost_units || '').toLowerCase();
  const moduleMaintQty = moduleBuilding?.maintenance_cost_quantity || 0;

  workers += moduleWorkers * totalModules;
  electricity += moduleElectricity * totalModules;
  if (moduleMaintUnit === 'maintenance i') maintI += moduleMaintQty * totalModules;
  else if (moduleMaintUnit === 'maintenance ii') maintII += moduleMaintQty * totalModules;
  else if (moduleMaintUnit === 'maintenance iii') maintIII += moduleMaintQty * totalModules;

  return { workers, electricity, maintI, maintII, maintIII };
}

// 统一的贸易配方生成函数
export function buildTradeRecipe(params: {
  contract: TradeContract;
  baySlots: number;
  moduleSize: 'S' | 'M' | 'L';
  fuelTypeRaw: string;
  travelMode: 'normal' | 'special';
  profitBonusPercent: number;      // 利润加成百分比（例如 20 → 20%）
  unityDiscountPercent: number;    // 凝聚力减免百分比（例如 10 → -10%）
  gameData: any;
  fullData: any;
  translation: Record<string, string>;
  edictLevels: Record<number, number>;
  researchLevels: number[];
}): { recipe: Recipe | null; displayData: any } {
  const { contract, baySlots, moduleSize, fuelTypeRaw, travelMode, profitBonusPercent, unityDiscountPercent, gameData, fullData, translation, edictLevels, researchLevels } = params;

  const moduleSpeed = { S: 125, M: 250, L: 500 }[moduleSize];
  const moduleCapacity = baySlots <= 4 ? 800 : 1200;
  const { travelTime, fuelPerTrip } = getTravelInfo(baySlots, fuelTypeRaw, travelMode, gameData);

  // 计算燃料减免系数（相乘）
  let fuelMultiplier = 1;
  if (gameData) {
    // 法令：节省船舶燃料
    const fuelEdict = gameData.edicts.find((e: any) => e.name === '节省船舶燃料');
    if (fuelEdict) {
      const idx = gameData.edicts.indexOf(fuelEdict);
      const lvl = edictLevels[idx] ?? -1;
      if (lvl >= 0) {
        const reduction = fuelEdict.effectPerLevel[lvl] || 0; // 正值，例如 0.15
        fuelMultiplier *= (1 - reduction);
      }
    }
    // 研究：船舰燃料消耗
    const fuelResearch = gameData.research.find((r: any) => r.name === '船舰燃料消耗');
    if (fuelResearch) {
      const idx = gameData.research.indexOf(fuelResearch);
      const lvl = researchLevels[idx] || 0;
      if (lvl > 0) {
        const reduction = fuelResearch.effectPerLevel[0] || 0; // 负值，例如 -0.01
        fuelMultiplier *= (1 + reduction * lvl);
      }
    }
  }
  const adjustedFuelPerTrip = fuelPerTrip * fuelMultiplier;

  const profitFactor = 1 + profitBonusPercent / 100;
  const unityDiscountFactor = 1 - unityDiscountPercent / 100;

  const adjustedContract = { ...contract, buyRate: contract.buyRate * profitFactor };
  const { buy, sell, m, n, loadTime } = computeBestTrade(adjustedContract, baySlots, moduleSpeed, moduleCapacity);
  if (buy === 0) return { recipe: null, displayData: null };

  const totalTime = travelTime + loadTime;
  const totalModules = m + n;

  const { workers, electricity, maintI, maintII, maintIII } = getDockAndModuleConsumption(baySlots, moduleSize, totalModules, gameData, fullData);

  const perMinBuy = buy / totalTime;
  const perMinSell = sell / totalTime;
  const perMinFuel = adjustedFuelPerTrip / totalTime;
// 人力、电力、维护等建筑消耗已经是每分钟值，不需要除以时间
const perMinWorkers = workers;
const perMinElectricity = electricity;
const perMinMaintI = maintI;
const perMinMaintII = maintII;
const perMinMaintIII = maintIII;
  const perMinUnityDirect = (perMinBuy / 100) * (contract.unity_per_100_bought || 0) * unityDiscountFactor;
  const perMinUnityMaintenance = (contract.unity_per_month || 0) * unityDiscountFactor;

  const recipe: Recipe = {
    id: `trade_${contract.id}`,
    name: `贸易: ${t(contract.name || contract.id, translation)}`,
    buildingId: 'trade',
    buildingName: t('贸易码头', translation),
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
      'maintenance i': perMinMaintI,
      'maintenance ii': perMinMaintII,
      'maintenance iii': perMinMaintIII,
      '凝聚力': perMinUnityDirect,
    },
    powerMultiplier: 1,
    workers: perMinWorkers,
    isSolar: false,
    isHidden: false,
    module: 'trade',
    tradeUnityDirect: perMinUnityDirect,
    tradeUnityMaintenance: perMinUnityMaintenance,
  };

  const displayData = {
    buyAmount: buy,
    sellAmount: sell,
    loadTime,
    travelTime,
    totalTime,
    buyPerMin: perMinBuy,
    sellPerMin: perMinSell,
    fuelPerTrip: adjustedFuelPerTrip,
    fuelPerMin: perMinFuel,
    unityPerMin: perMinUnityDirect,
    unityPerMonthEffective: perMinUnityMaintenance,
    m,
    n,
    workers,
    electricity,
    maintI,
    maintII,
    maintIII,
  };

  return { recipe, displayData };
}