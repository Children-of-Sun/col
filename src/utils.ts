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
  'power generator',   // 新增这一项
  'solar panel'
];

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
export const CREW_SUPPLIES_RATE = 0.2;
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

// ==================== 居民/科技计算函数 ====================
import { GameData, Edict, Office, Research } from './types';

// 计算回收率
export function getRecycleRate(
  base: number,
  edicts: Edict[],
  edictLevels: Record<number, number>,
  office: Office[],
  officeLevels: number[]
) {
  let rate = base;
  // 法令加成
  edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && e.targetCategory === 'recycle') {
      rate += e.effectPerLevel[lvl] || 0;
    }
  });
  // 办公加成
  office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (o.targetCategory === 'recycle' && lvl > 0) {
      rate += o.effectPerLevel * lvl;
    }
  });
  return Math.max(0, rate);
}

// 计算食物需求转移后的最终消耗
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
  recycleRate: number
) {
  const factor = pop / data.populationScale;
  const housing = data.housingTiers[housingIdx] || { multipliers: {}, unityMultiplierConditions: [] };

  // 收集减免
  let catMods: Record<string, number> = {};
  let itemMods: Record<string, number> = {};

  // 法令需求影响
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

  // 办公需求影响
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

  // 研究需求影响
  data.research.forEach((r, i) => {
    const lvl = researchLevels[i] || 0;
    if (lvl > 0) {
      const targets = Array.isArray(r.targetCategory) ? r.targetCategory : [r.targetCategory];
      targets.forEach((t, idx) => {
        if (t === 'recycle' || t === 'unity' || t === 'none') return;
        const eff = Array.isArray(r.effectPerLevel) ? (r.effectPerLevel[idx] || 0) : r.effectPerLevel;
        catMods[t] = (catMods[t] || 1) * (1 - eff * lvl);
      });
    }
  });

  // 食物转移计算
  const foodGroups: Record<string, string[]> = {};
  const foodDemandMap: Record<string, number> = {};
  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' && svc['Food Category']) {
      const grp = svc['Food Category'];
      if (!foodGroups[grp]) foodGroups[grp] = [];
      foodGroups[grp].push(name);
      foodDemandMap[name] = svc.demand;
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
  let foodUnity = 0, otherUnity = 0;

  // 处理食物
  if (numActiveGroups > 0) {
    for (const [grp, enabledList] of Object.entries(activeGroups)) {
      const intraFactor = foodGroups[grp].length / enabledList.length;
      for (const name of enabledList) {
        const svc = data.services[name];
        let demand = svc.demand * factor * crossGroupFactor * intraFactor;
        // 住房乘数
        if (housing.multipliers[name]) demand *= housing.multipliers[name];
        // 减免
        let mod = catMods['food'] || 1;
        if (itemMods[name]) mod *= itemMods[name];
        demand *= mod;
        demands.push({ item: name.toLowerCase(), rate: demand });
        // unity
        foodUnity += svc.unity;
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
    otherUnity += svc.unity;
  }

  // 其他服务
  for (const [name, svc] of Object.entries(data.services)) {
    if (svc.category === 'food' || svc.category === 'medical') continue;
    if (!selectedOthers.has(name)) continue;
    let demand = svc.demand * factor;
    if (housing.multipliers[name]) demand *= housing.multipliers[name];
    let mod = catMods[svc.category] || 1;
    if (itemMods[name]) mod *= itemMods[name];
    demand *= mod;
    demands.push({ item: name.toLowerCase(), rate: demand });
    otherUnity += svc.unity;
  }

  // 凝聚力计算
  const housingMult = housing.unityMultiplierConditions.reduce((best, cond) => {
    const satisfied = cond.requires.every(r => data.services[r] !== undefined);
    return satisfied && cond.multiplier > best ? cond.multiplier : best;
  }, 1);
  let unity = (otherUnity + 1) * housingMult + foodUnity;
  // 办公/研究 unity%
  let officeUnityPct = 0;
  data.office.forEach((o, i) => {
    const lvl = officeLevels[i] || 0;
    if (o.targetCategory === 'unity' && lvl > 0) officeUnityPct += o.effectPerLevel * lvl;
  });
  data.research.forEach((r, i) => {
    const lvl = researchLevels[i] || 0;
    if (lvl > 0) {
      const targets = Array.isArray(r.targetCategory) ? r.targetCategory : [r.targetCategory];
      targets.forEach((t, idx) => {
        if (t === 'unity') {
          const eff = Array.isArray(r.effectPerLevel) ? (r.effectPerLevel[idx] || 0) : r.effectPerLevel;
          officeUnityPct += eff * lvl;
        }
      });
    }
  });
  unity *= (1 + officeUnityPct);
  // 法令 unity 增减
  data.edicts.forEach((e, i) => {
    const lvl = edictLevels[i] ?? -1;
    if (lvl >= 0 && e.unityPerLevel[lvl] !== undefined) {
      unity += e.unityPerLevel[lvl];
    }
  });
  // 空间站等级加成（需要外部传入），此处返回 unity，调用方再处理
  return { demands, unity, recycleRate };
}

// 计算居民废料供给（七种）
export function calcResidentWaste(
  data: GameData,
  demands: { item: string; rate: number }[],
  recycleRate: number
): { item: string; rate: number }[] {
  const wasteArr = new Array(data.wasteNames.length).fill(0);
  for (const d of demands) {
    const svc = data.services[d.item];
    if (!svc || !svc.waste) continue;
    svc.waste.forEach((coeff, idx) => {
      wasteArr[idx] += d.rate * coeff;
    });
  }
  const result: { item: string; rate: number }[] = [];
  // 前两项（可回收物、生物质）直接全量
  for (let i = 0; i < 2; i++) {
    if (wasteArr[i] > 0) result.push({ item: data.wasteNames[i].toLowerCase(), rate: wasteArr[i] });
  }
  // 后五项乘以回收率
  for (let i = 2; i < wasteArr.length; i++) {
    if (wasteArr[i] > 0) result.push({ item: data.wasteNames[i].toLowerCase(), rate: wasteArr[i] * recycleRate });
  }
  return result;
}

// 维护废料系数映射（用于 Recycling 配方的附加产出）
export function getMaintenanceWasteMap(data: GameData) {
  const map: Record<string, number[]> = {};
  for (const m of data.maintenance) {
    map[m.name.toLowerCase()] = m.waste.slice(2); // 只取后五项
  }
  return map;
}

