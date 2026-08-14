// src/utils.ts
const DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('factoryDebug') === 'true';

const RAW_ITEMS = new Set([
  "limestone","wood","rock","quartz","coal","sand","sulfur","salt","stone",
  "iron ore","copper ore","uranium ore","gold ore","bauxite","titanium ore",
  "seawater","air","water","crude oil","imported goods","retired waste","spent mox","人力"
]);

export const POWER_KEYWORDS = [
  'super-pressure turbine',
  'high-pressure turbine',
  'low-pressure turbine',
  'boiler',
  'diesel generator',
  'nuclear reactor',
  'power generator',
  'solar panel',
  'fast breeder reactor'
];

export const NON_SCALABLE_ITEMS = new Set([
  'electricity',
  'computing',
  'mechanical power',
  '人力',
  'maintenance i',
  'maintenance ii',
  'maintenance iii',
  'focus'
]);

export function t(key: string | undefined, translation: Record<string, string>): string {
  if (!key) return '';
  return translation[key.toLowerCase()] || key;
}

export function isRaw(item: string): boolean {
  return RAW_ITEMS.has(item?.toLowerCase());
}

// 仅矿石（9种不可再生矿物）
const ORE_ITEMS = new Set([
  "iron ore","copper ore","coal","limestone","quartz",
  "gold ore","uranium ore","bauxite","titanium ore",
  "crude oil",
]);

export function isOre(item: string): boolean {
  return ORE_ITEMS.has(item?.toLowerCase());
}

export function isPowerItem(name: string): boolean {
  return name === 'mechanical power' || name === 'electricity' || name === 'computing';
}

export function isPowerBuilding(name: string): boolean {
  return POWER_KEYWORDS.some(k => name.toLowerCase().includes(k));
}

export function isNonScalable(item: string): boolean {
  return NON_SCALABLE_ITEMS.has(item.toLowerCase());
}

export function getMaintenanceReduction(count: number): number {
  if (count <= 0) return 0;
  let total = 0.04;
  if (count >= 2) total += 0.02;
  if (count >= 3) total += 0.01;
  let addition = 0.005;
  for (let i = 4; i <= count; i++) { total += addition; addition /= 2; }
  // 几何级数收敛于 0.08，Math.min(total, 1) 理论上不可达，保留作为安全上限
  return Math.min(total, 1);
}

export const HIDDEN_SERIES = [
  'Cargo depot','Unit module','Loose module','Fluid module',
  'Unit storage','Loose storage','Fluid storage','Research lab'
];

export const ROCKET_BASE = [
  { name:"Rocket T1", crewBase:4, cargoBase:40, crewMax:8, cargoMax:80, crewKey:"rocket t1 rlp", cargoKey:"rocket t1 thing" },
  { name:"Rocket T2", crewBase:12, cargoBase:120, crewMax:24, cargoMax:240, crewKey:"rocket t2 rlp", cargoKey:"rocket t2 thing" }
];

export const STATION_PARTS_RATE = 0.25;
export const CREW_SUPPLIES_RATE = 0.4;
export const SPACE_CARGO_ITEMS = new Set(["station parts","crew supplies","electronics iv","asteroid booster parts","space probe parts"]);

export function getSeriesName(
  buildingId: string,
  mainSeriesList: { name: string; levels: { buildingId: string }[] }[],
  powerSeriesList: { name: string; levels: { buildingId: string }[] }[]
): string {
  return mainSeriesList.find(s => s.levels.some(lv => lv.buildingId === buildingId))?.name ||
         powerSeriesList.find(s => s.levels.some(lv => lv.buildingId === buildingId))?.name || '';
}

import { GameData, Edict, Office, Research, Recipe, TradeContract, SolverResult } from './types';

export function getRecycleRate(
  base: number,
  edicts: Edict[],
  edictLevels: Record<number, number>,
  office: Office[],
  officeLevels: number[]
) {
  let rate = base;
  edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && e.targetCategory === 'recycle') {
      rate += e.effectPerLevel[lvl] || 0;
    }
  });
  office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (o.targetCategory === 'recycle' && lvl > 0) {
      rate += o.effectPerLevel * lvl;
    }
  });
  return Math.max(0, rate);
}

export function calcResidentDemands(
  data: GameData,
  pop: number,
  housingIdx: number,
  selectedFoods: Set<string>,
  selectedMedical: string | null,
  selectedOthers: Set<string>,
  edictLevels: Record<number, number>,
  officeLevels: number[],
  researchLevels: number[],
  recycleRate: number,
  stationLevel: number = 0,
  medicalMultiplier: number = 1
) {
  const factor = data.populationScale > 0 ? pop / data.populationScale : 0;
  const housing = data.housingTiers[housingIdx] || { multipliers: {}, unityMultiplierConditions: [] };

  let catMods: Record<string, number> = {};
  let itemMods: Record<string, number> = {};
  let itemUnityMods: Record<string, number> = {}; // 特定物品的凝聚力乘数

  // 定义需要特殊处理的法令名称
  const unityBonusEdicts = ['更多家具用品', '更多家电', '更多消费电子产品'];

  let edictUnityProduction = 0;     // 法令提供的正凝聚力
  let unityConsumptionFromEdicts = 0; // 法令消耗的凝聚力（绝对值）

  data.edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && lvl < e.effectPerLevel.length) {
      const eff = e.effectPerLevel[lvl];
      const unityValue = e.unityPerLevel[lvl] || 0;

      if (e.targetCategory && e.targetCategory !== 'none' && !e.itemEffect) {
        // 农业提振不应影响居民食物消耗
        if (e.name !== '农业提振') {
          const cats = Array.isArray(e.targetCategory) ? e.targetCategory : [e.targetCategory];
          for (const cat of cats) {
            catMods[cat] = (catMods[cat] || 1) * (1 - eff);
          }
        }
      }
      if (e.itemEffect) {
        e.itemEffect.forEach(item => {
          const itemKey = item.toLowerCase();
          // 需求减少效果始终应用
          itemMods[itemKey] = (itemMods[itemKey] || 1) * (1 - eff);
          // 只有特定法令才应用凝聚力加成
          if (unityBonusEdicts.includes(e.name)) {
            itemUnityMods[itemKey] = (itemUnityMods[itemKey] || 1) * (1 + unityValue);
          }
        });
      }
      // 凝聚力分为产量（正值）和消耗（负值）
      if (unityValue > 0) {
        // 三个特殊法令的凝聚力已通过 itemUnityMods 处理，不在此累加
        if (!unityBonusEdicts.includes(e.name)) {
          edictUnityProduction += unityValue;
        }
      } else if (unityValue < 0) {
        unityConsumptionFromEdicts += -unityValue;
      }
    }
  });

  data.office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (lvl > 0 && o.targetCategory && o.targetCategory !== 'none') {
      const cats = Array.isArray(o.targetCategory) ? o.targetCategory : [o.targetCategory];
      cats.forEach(cat => {
        if (cat === 'recycle' || cat === 'unity' || cat === 'none') return;
        // 办公的 effectPerLevel 负值表示减少，正值表示增加，因此使用 (1 + effectPerLevel * lvl)
        catMods[cat] = (catMods[cat] || 1) * (1 + o.effectPerLevel * lvl);
      });
    }
  });

  data.research.forEach((r, i) => {
    const lvl = researchLevels[i] || 0;
    if (lvl > 0) {
      const targets = Array.isArray(r.targetCategory) ? r.targetCategory : [r.targetCategory];
      targets.forEach((t, idx) => {
        if (t === 'recycle' || t === 'unity' || t === 'none') return;
        // 作物产量研究不应影响居民食物需求，跳过 food 类别
        if (t === 'food') return;
        const eff = Array.isArray(r.effectPerLevel) ? (r.effectPerLevel[idx] || 0) : r.effectPerLevel;
        if (r.name === '作物产量' && t === 'Water') {
          // 作物产量研究第二效果：增加水消耗（eff 为正）
          itemMods['Water'] = (itemMods['Water'] || 1) * (1 + eff * lvl);
        } else {
          // 其他研究，统一使用 (1 + eff * lvl)（正为增加，负为减少）
          catMods[t] = (catMods[t] || 1) * (1 + eff * lvl);
        }
      });
    }
  });

  const foodGroups: Record<string, string[]> = {};
  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' && svc['Food Category']) {
      const grp = svc['Food Category'];
      if (!foodGroups[grp]) foodGroups[grp] = [];
      foodGroups[grp].push(name);
    }
  }
  const activeGroups: Record<string, string[]> = {};
  for (const [grp, items] of Object.entries(foodGroups)) {
    const enabled = items.filter(f => selectedFoods.has(f));
    if (enabled.length > 0) activeGroups[grp] = enabled;
  }
  const numActiveGroups = Object.keys(activeGroups).length;

  const demands: { item: string; rate: number }[] = [];
  let foodUnity = 0;
  let nonFoodUnity = 0;

  if (DEBUG) {
    console.log('catMods:', catMods);
    console.log('itemMods:', itemMods);
  }
  if (numActiveGroups > 0) {
    for (const [grp, enabledList] of Object.entries(activeGroups)) {
      const numFoodsInThisGroup = enabledList.length;
      for (const name of enabledList) {
        const svc = data.services[name];
        let demand = svc.demand * factor;
        if (DEBUG) console.log(`[食物] ${name}: 基础需求=${svc.demand}, factor=${factor}, 初步demand=${demand}`);
        if (housing.multipliers[name]) demand *= housing.multipliers[name];
        let mod = catMods['food'] || 1;
        const itemKey = name.toLowerCase();
        if (itemMods[itemKey]) mod *= itemMods[itemKey];
        if (DEBUG) console.log(`  mod=${mod}, 乘后demand=${demand}`);
        demand = demand / (numActiveGroups * numFoodsInThisGroup);
        if (DEBUG) console.log(`  除以组数: numActiveGroups=${numActiveGroups}, numFoods=${numFoodsInThisGroup}, 结果=${demand}`);
        demand *= mod;
        if (DEBUG) console.log(`  最终需求=${demand}`);
        demands.push({ item: itemKey, rate: demand });
        const unityMult = itemUnityMods[itemKey] || 1;
        foodUnity += svc.unity * unityMult;
      }
    }
  }

  if (selectedMedical) {
    const svc = data.services[selectedMedical];
    let demand = svc.demand * factor;
    if (housing.multipliers[selectedMedical]) demand *= housing.multipliers[selectedMedical];
    let mod = catMods['medical'] || 1;
    const itemKey = selectedMedical.toLowerCase();
    if (itemMods[itemKey]) mod *= itemMods[itemKey];
    demand *= mod;
    demand *= medicalMultiplier;   // 应用倍率
    demands.push({ item: itemKey, rate: demand });
    const unityMult = itemUnityMods[itemKey] || 1;
    nonFoodUnity += svc.unity * unityMult;
  }

  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' || svc.category === 'medical') continue;
    if (!selectedOthers.has(name)) continue;
    let demand = svc.demand * factor;
    if (housing.multipliers[name]) demand *= housing.multipliers[name];
    let mod = catMods[svc.category] || 1;

    // 对于水服务，单独应用节水器和定居点用水研究
    if (name === 'Water') {
      // 节水器法令（减少用水）
      const waterSaverEdict = data.edicts.find(e => e.name === '节水器');
      if (waterSaverEdict) {
        const idx = data.edicts.indexOf(waterSaverEdict);
        const lvl = edictLevels[idx] ?? -1;
        if (lvl >= 0) {
          const eff = waterSaverEdict.effectPerLevel[lvl];
          mod *= (1 - eff);  // 节水器效果为正，减少消耗
        }
      }
      // 定居点用水研究（减少用水）
      const waterResearch = data.research.find(r => r.name === '定居点用水');
      if (waterResearch) {
        const idx = data.research.indexOf(waterResearch);
        const lvl = researchLevels[idx] || 0;
        if (lvl > 0) {
          const eff = waterResearch.effectPerLevel[0]; // 通常为 -0.02
          mod *= (1 + eff * lvl); // eff为负，乘数 <1
        }
      }
    } else {
      // 其他服务使用通用的 itemMods
      const itemKey = name.toLowerCase();
      if (itemMods[itemKey]) mod *= itemMods[itemKey];
    }

    demand *= mod;
    demands.push({ item: name.toLowerCase(), rate: demand });
    const unityMult = itemUnityMods[name.toLowerCase()] || 1;
    nonFoodUnity += svc.unity * unityMult;
  }

  // 计算住房凝聚力乘数（只有满足所需服务均被启用时才生效）
  let housingMult = 1;
  for (const cond of housing.unityMultiplierConditions) {
    const satisfied = cond.requires.every(req => {
      // 检查该服务是否被用户启用（食物、医疗、其他）
      if (selectedFoods.has(req)) return true;
      if (selectedMedical === req) return true;
      if (selectedOthers.has(req)) return true;
      return false;
    });
    if (satisfied && cond.multiplier > housingMult) {
      housingMult = cond.multiplier;
    }
  }

  let unityPct = 0;
  data.office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (o.targetCategory === 'unity' && lvl > 0) {
      unityPct += o.effectPerLevel * lvl;
    }
  });
  data.research.forEach((r, i) => {
    const lvl = researchLevels[i] || 0;
    if (lvl > 0) {
      const targets = Array.isArray(r.targetCategory) ? r.targetCategory : [r.targetCategory];
      targets.forEach((t, idx) => {
        if (t === 'unity') {
          const eff = Array.isArray(r.effectPerLevel) ? (r.effectPerLevel[idx] || 0) : r.effectPerLevel;
          unityPct += eff * lvl;
        }
      });
    }
  });

  const stationBonus = stationLevel * 0.05;

  const unityProduction = ((nonFoodUnity + 1) * housingMult + foodUnity) * (1 + unityPct) + stationBonus + edictUnityProduction;

  return { demands, unityProduction, unityConsumption: unityConsumptionFromEdicts, recycleRate };
}

export function calcResidentWaste(
  data: GameData,
  demands: { item: string; rate: number }[],
  recycleRate: number
): { item: string; rate: number }[] {
  // 创建一个服务的小写 key 映射，避免大小写不匹配
  const serviceMap: Record<string, any> = {};
  for (const [key, svc] of Object.entries(data.services)) {
    serviceMap[key.toLowerCase()] = svc;
  }

  const wasteArr = new Array(data.wasteNames.length).fill(0);
  const extraWasteMap: Record<string, number> = {};

  for (const d of demands) {
    // 通过小写 key 获取服务
    const svc = serviceMap[d.item.toLowerCase()];
    if (!svc) continue;  // 找不到服务则跳过（可能是科技物品如 research 等）

    if (svc.waste) {
      svc.waste.forEach((coeff: number, idx: number) => {
        wasteArr[idx] += d.rate * coeff;
      });
    }
    if (svc.extraWaste) {
      for (const [item, coeff] of Object.entries(svc.extraWaste) as [string, number][]) {
        extraWasteMap[item] = (extraWasteMap[item] || 0) + d.rate * coeff;
      }
    }
  }

  // 使用 Map 合并所有废料，避免重复
  const wasteMap = new Map<string, number>();

  // 前两个废料（Recyclables, Biomass）不乘回收率
  for (let i = 0; i < 2; i++) {
    if (wasteArr[i] > 0) {
      const key = data.wasteNames[i].toLowerCase();
      wasteMap.set(key, (wasteMap.get(key) || 0) + wasteArr[i]);
    }
  }
  // 索引 >=2 的可回收废料乘以回收率
  for (let i = 2; i < wasteArr.length; i++) {
    if (wasteArr[i] > 0) {
      const key = data.wasteNames[i].toLowerCase();
      wasteMap.set(key, (wasteMap.get(key) || 0) + wasteArr[i] * recycleRate);
    }
  }
  // 添加 extraWaste（已经累加过系数，不需要再乘回收率）
  for (const [item, rate] of Object.entries(extraWasteMap)) {
    const key = item.toLowerCase();
    wasteMap.set(key, (wasteMap.get(key) || 0) + rate);
  }

  // 转换为数组返回
  return Array.from(wasteMap.entries()).map(([item, rate]) => ({ item, rate }));
}

export function getMaintenanceWasteMap(data: GameData) {
  const map: Record<string, number[]> = {};
  for (const m of data.maintenance) {
    map[m.name.toLowerCase()] = m.waste.slice(2);
  }
  return map;
}

// 新增：判断贸易合同是否用于获取原矿
export function isOreContract(contract: TradeContract): boolean {
  return isRaw(contract.buyItem);
}

// ========== 共享工具函数 ==========

/** MIP 求解器可能返回的"有解"状态 */
export const MIP_SUCCESS = new Set(['Optimal', 'Feasible', 'NodeLimit', 'TimeLimit', 'SolutionLimit']);

/** 判断求解状态是否为成功（有可行解） */
export function isMipSuccess(status: string | undefined): boolean {
  return !!status && MIP_SUCCESS.has(status);
}

/** 从求解结果中安全提取列值（兼容 Columns/columns, Primal/primal） */
export function getColValue(result: SolverResult | null | undefined, varName: string): number {
  if (!result) return 0;
  const cols = result.Columns || result.columns;
  if (!cols) return 0;
  const col = cols[varName];
  if (!col) return 0;
  return (col as any).Primal ?? (col as any).primal ?? 0;
}

/** 合并所有活跃配方数组 */
export function getAllActive(recipeBuild: {
  mainActive: Recipe[];
  powerActive: Recipe[];
  residentActive: Recipe[];
  stationActive: Recipe[];
  specialActive: Recipe[];
  tradeActive: Recipe[];
}): Recipe[] {
  return [
    ...recipeBuild.mainActive,
    ...recipeBuild.powerActive,
    ...recipeBuild.residentActive,
    ...recipeBuild.stationActive,
    ...recipeBuild.specialActive,
    ...recipeBuild.tradeActive,
  ];
}