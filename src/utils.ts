// src/utils.ts
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
  'solar panel'
];

export const NON_SCALABLE_ITEMS = new Set([
  'electricity',
  'computing',
  'mechanical power',
  '人力',
  'maintenance i',
  'maintenance ii',
  'maintenance iii'
]);

export function t(key: string | undefined, translation: Record<string, string>): string {
  if (!key) return '';
  return translation[key.toLowerCase()] || key;
}

export function isRaw(item: string): boolean {
  return RAW_ITEMS.has(item?.toLowerCase());
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

export const POWER_OUTPUT_ITEMS = new Set([
  'exhaust',
  'air pollution',
  'carbon dioxide',
  'steam (depleted)',
  'spent fuel',
  'spent mox',
  'core fuel (spent)',
  'blanket fuel (enriched)'
]);

import { GameData, Edict, Office, Research, Recipe } from './types';

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
  stationLevel: number = 0
) {
  const factor = pop / data.populationScale;
  const housing = data.housingTiers[housingIdx] || { multipliers: {}, unityMultiplierConditions: [] };

  // 需求乘数（仅用于物品需求，不影响凝聚力）
  let catMods: Record<string, number> = {};
  let itemMods: Record<string, number> = {};

  data.edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && lvl < e.effectPerLevel.length) {
      const eff = e.effectPerLevel[lvl];
      if (e.targetCategory && e.targetCategory !== 'none' && !e.itemEffect) {
        catMods[e.targetCategory] = (catMods[e.targetCategory] || 1) * (1 - eff);
      }
      if (e.itemEffect) {
        e.itemEffect.forEach(item => {
          itemMods[item] = (itemMods[item] || 1) * (1 - eff);
        });
      }
    }
  });

  data.office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (lvl > 0 && o.targetCategory && o.targetCategory !== 'none') {
      const cats = Array.isArray(o.targetCategory) ? o.targetCategory : [o.targetCategory];
      cats.forEach(cat => {
        if (cat === 'recycle' || cat === 'unity' || cat === 'none') return;
        catMods[cat] = (catMods[cat] || 1) * (1 - o.effectPerLevel * lvl);
      });
    }
  });

  data.research.forEach((r, i) => {
    const lvl = researchLevels[i] || 0;
    if (lvl > 0) {
      const targets = Array.isArray(r.targetCategory) ? r.targetCategory : [r.targetCategory];
      targets.forEach((t, idx) => {
        if (t === 'recycle' || t === 'unity' || t === 'none') return;
        const eff = Array.isArray(r.effectPerLevel) ? (r.effectPerLevel[idx] || 0) : r.effectPerLevel;
        if (r.name === '作物产量' && t === 'Water') {
          itemMods['Water'] = (itemMods['Water'] || 1) * (1 - eff * lvl);
        } else {
          catMods[t] = (catMods[t] || 1) * (1 - eff * lvl);
        }
      });
    }
  });

  // 食物分组（仅用于需求计算，不影响凝聚力）
  const foodGroups: Record<string, string[]> = {};
  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' && svc['Food Category']) {
      const grp = svc['Food Category'];
      if (!foodGroups[grp]) foodGroups[grp] = [];
      foodGroups[grp].push(name);
    }
  }
  const totalCategories = Object.keys(foodGroups).length;
  const activeGroups: Record<string, string[]> = {};
  for (const [grp, items] of Object.entries(foodGroups)) {
    const enabled = items.filter(f => selectedFoods.has(f));
    if (enabled.length > 0) activeGroups[grp] = enabled;
  }
  const numActiveGroups = Object.keys(activeGroups).length;
  const crossGroupFactor = numActiveGroups > 0 ? totalCategories / numActiveGroups : 0;

  const demands: { item: string; rate: number }[] = [];
  let foodUnity = 0;
  let nonFoodUnity = 0;

  // 食物需求与凝聚力
  if (numActiveGroups > 0) {
    for (const [grp, enabledList] of Object.entries(activeGroups)) {
      const intraFactor = foodGroups[grp].length / enabledList.length;
      for (const name of enabledList) {
        const svc = data.services[name];
        let demand = svc.demand * factor * crossGroupFactor * intraFactor;
        if (housing.multipliers[name]) demand *= housing.multipliers[name];
        let mod = catMods['food'] || 1;
        if (itemMods[name]) mod *= itemMods[name];
        demand *= mod;
        demands.push({ item: name.toLowerCase(), rate: demand });
        foodUnity += svc.unity;      // 食物Unity直接累加
      }
    }
  }

  // 医疗
  if (selectedMedical) {
    const svc = data.services[selectedMedical];
    let demand = svc.demand * factor;
    if (housing.multipliers[selectedMedical]) demand *= housing.multipliers[selectedMedical];
    let mod = catMods['medical'] || 1;
    if (itemMods[selectedMedical]) mod *= itemMods[selectedMedical];
    demand *= mod;
    demands.push({ item: selectedMedical.toLowerCase(), rate: demand });
    nonFoodUnity += svc.unity;
  }

  // 其他服务（非食物、非医疗）
  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' || svc.category === 'medical') continue;
    if (!selectedOthers.has(name)) continue;
    let demand = svc.demand * factor;
    if (housing.multipliers[name]) demand *= housing.multipliers[name];
    let mod = catMods[svc.category] || 1;
    if (itemMods[name]) mod *= itemMods[name];
    demand *= mod;
    demands.push({ item: name.toLowerCase(), rate: demand });
    nonFoodUnity += svc.unity;
  }

  // 住房最高乘数
  let housingMult = 1;
  for (const cond of housing.unityMultiplierConditions) {
    const satisfied = cond.requires.every(r => data.services[r] !== undefined);
    if (satisfied && cond.multiplier > housingMult) {
      housingMult = cond.multiplier;
    }
  }

  // 办公/研究凝聚力百分比加成
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

  // 法令固定值
  let edictUnity = 0;
  data.edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && e.unityPerLevel[lvl] !== undefined) {
      edictUnity += e.unityPerLevel[lvl];
    }
  });

  // 空间站加成
  const stationBonus = stationLevel * 0.05;

  // 凝聚力公式
  const cohesion = ((nonFoodUnity + 1) * housingMult + foodUnity) * (1 + unityPct) + stationBonus + edictUnity;

  return { demands, unityProduction: cohesion, unityConsumption: 0, recycleRate };
}

export function calcResidentWaste(
  data: GameData,
  demands: { item: string; rate: number }[],
  recycleRate: number
): { item: string; rate: number }[] {
  const wasteArr = new Array(data.wasteNames.length).fill(0);
  const extraWasteMap: Record<string, number> = {};
  for (const d of demands) {
    const svc = data.services[d.item];
    if (!svc) continue;
    if (svc.waste) {
      svc.waste.forEach((coeff, idx) => {
        wasteArr[idx] += d.rate * coeff;
      });
    }
    if (svc.extraWaste) {
      for (const [item, coeff] of Object.entries(svc.extraWaste)) {
        extraWasteMap[item] = (extraWasteMap[item] || 0) + d.rate * coeff;
      }
    }
  }
  const result: { item: string; rate: number }[] = [];
  for (let i = 0; i < 2; i++) {
    if (wasteArr[i] > 0) result.push({ item: data.wasteNames[i].toLowerCase(), rate: wasteArr[i] });
  }
  for (let i = 2; i < wasteArr.length; i++) {
    if (wasteArr[i] > 0) result.push({ item: data.wasteNames[i].toLowerCase(), rate: wasteArr[i] * recycleRate });
  }
  for (const [item, rate] of Object.entries(extraWasteMap)) {
    result.push({ item: item.toLowerCase(), rate });
  }
  return result;
}

export function getMaintenanceWasteMap(data: GameData) {
  const map: Record<string, number[]> = {};
  for (const m of data.maintenance) {
    map[m.name.toLowerCase()] = m.waste.slice(2);
  }
  return map;
}

export function isMaintenanceRecyclingRecipe(recipe: Recipe): boolean {
  return recipe.id.includes('Maintenance') && recipe.id.includes('Recycling');
}

export function isConsumptionWasteItem(item: string): boolean {
  const items = [
    'office supplies',
    'retired waste',
    'lab equipment',
    'lab equipment ii',
    'lab equipment iii',
    'lab equipment iv'
  ];
  return items.includes(item.toLowerCase());
}