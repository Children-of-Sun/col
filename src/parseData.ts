import { DataJson, ParsedData, Recipe, Series, LevelEntry, LabMeta } from './types';
import { HIDDEN_SERIES, isPowerBuilding } from './utils';

export function parseData(d: DataJson): ParsedData {
  const blds = d.machines_and_buildings;
  const map = new Map(blds.map(b => [b.id, b]));
  const lvMap = new Map<string, number>();
  const parentMap = new Map<string, string>();

  // 构建层级关系
  blds.forEach(b => { if (b.next_tier && b.next_tier !== '') parentMap.set(b.next_tier, b.id); });
  const notRoot = new Set(parentMap.keys());

  function assign(id: string, lvl: number) {
    if (!lvMap.has(id)) {
      lvMap.set(id, lvl);
      const nb = map.get(id);
      if (nb && nb.next_tier && nb.next_tier !== '') assign(nb.next_tier, lvl + 1);
    }
  }
  blds.forEach(b => { if (!notRoot.has(b.id)) assign(b.id, 1); });
  blds.forEach(b => { if (!lvMap.has(b.id)) lvMap.set(b.id, 1); });

  // 构建系列
  const visited = new Set<string>();
  const mainSeries: Series[] = [];
  const powerSeries: Series[] = [];

  blds.forEach(b => {
    if (visited.has(b.id)) return;
    let h: string | null = b.id;
    while (parentMap.has(h)) h = parentMap.get(h)!;
    const ids: string[] = [];
    let cur: string | null = h;
    while (cur) { ids.push(cur); visited.add(cur); cur = map.get(cur)?.next_tier || null; }
    ids.sort((a, b) => (lvMap.get(a) || 1) - (lvMap.get(b) || 1));
    const levels: LevelEntry[] = ids.map(id => ({
      buildingId: id,
      level: lvMap.get(id) || 1,
      recipeIds: (map.get(id)?.recipes || []).map(r => r.id),
    }));
    const sname = map.get(ids[0])!.name;
    const hidden = HIDDEN_SERIES.some(k => sname.toLowerCase().includes(k.toLowerCase()));
    if (!hidden) {
      if (isPowerBuilding(sname)) powerSeries.push({ name: sname, levels });
      else mainSeries.push({ name: sname, levels });
    }
  });

  // 构建配方
  const allRecipes: Recipe[] = [];

  const addRecipesForBuilding = (b: typeof blds[0], lv: number, isPower: boolean) => {
    if (!b.recipes || b.recipes.length === 0) {
      if ((b.id === 'SolarPanel' || b.id === 'SolarPanelMono') && b.electricity_generated > 0) {
        const up: Record<string, number> = {};
        // 添加维护消耗
        if (b.maintenance_cost_units && b.maintenance_cost_quantity) {
          up[b.maintenance_cost_units.toLowerCase()] = b.maintenance_cost_quantity;
        }
        up['人力'] = (up['人力'] || 0) + b.workers;
        up['electricity'] = (up['electricity'] || 0) + (b.electricity_consumed || 0);
        if (b.computing_consumed) up['computing'] = (up['computing'] || 0) + b.computing_consumed;

        allRecipes.push({
          id: b.id + '_solar', name: b.name + ' (太阳能)', buildingId: b.id, buildingName: b.name,
          category: b.category, buildingLevel: lv, duration: 60,
          inputs: {}, outputs: { 'electricity': b.electricity_generated }, upkeep: up,
          powerMultiplier: 1, workers: b.workers, isSolar: true, isHidden: false,
          module: isPower ? 'power' : 'main'
        });
      }
      return;
    }
    (b.recipes || []).forEach(r => {
      const inp: Record<string, number> = {};
      const out: Record<string, number> = {};
      const up: Record<string, number> = {};
      (r.inputs || []).forEach(i => inp[i.name.toLowerCase()] = i.quantity);
      (r.outputs || []).forEach(o => out[o.name.toLowerCase()] = o.quantity);
      if (b.maintenance_cost_units && b.maintenance_cost_quantity) {
        const uk = b.maintenance_cost_units.toLowerCase();
        up[uk] = (up[uk] || 0) + b.maintenance_cost_quantity;
      }
      up['人力'] = (up['人力'] || 0) + b.workers;
      up['electricity'] = (up['electricity'] || 0) + (b.electricity_consumed || 0) * (r.power_multiplier || 1);
      if (b.computing_consumed) up['computing'] = (up['computing'] || 0) + b.computing_consumed;
      allRecipes.push({
        id: r.id + (isPower ? '_pwr' : ''), name: r.name, buildingId: b.id, buildingName: b.name,
        category: b.category, buildingLevel: lv, duration: r.duration,
        inputs: inp, outputs: out, upkeep: up,
        powerMultiplier: r.power_multiplier || 1, workers: b.workers,
        isSolar: false,
        isHidden: HIDDEN_SERIES.some(k => b.name.toLowerCase().includes(k.toLowerCase())),
        module: isPower ? 'power' : 'main'
      });
    });
  };

  blds.forEach(b => {
    const lv = lvMap.get(b.id) || 1;
    const isPwr = isPowerBuilding(b.name);
    if (isPwr) {
      addRecipesForBuilding(b, lv, true);   // 电力模块副本
      addRecipesForBuilding(b, lv, false);  // 主模块副本
    } else {
      addRecipesForBuilding(b, lv, false);  // 主模块
    }
  });

  // 收集所有物品
  const allItems = new Set<string>();
  allRecipes.forEach(r => {
    Object.keys(r.inputs).forEach(k => allItems.add(k));
    Object.keys(r.outputs).forEach(k => allItems.add(k));
    Object.keys(r.upkeep).forEach(k => allItems.add(k));
  });

  // 补充 level 的 recipeIds，包含自动生成的配方（如太阳能）
  mainSeries.forEach((series: Series) => {
    series.levels.forEach((lv: LevelEntry) => {
      lv.recipeIds = allRecipes
        .filter(r => r.buildingId === lv.buildingId && r.module === 'main')
        .map(r => r.id);
    });
  });
  powerSeries.forEach((series: Series) => {
    series.levels.forEach((lv: LevelEntry) => {
      lv.recipeIds = allRecipes
        .filter(r => r.buildingId === lv.buildingId && r.module === 'power')
        .map(r => r.id);
    });
  });

  // labMeta 处理
  const labMeta: LabMeta[] = [];
  const labBuildings = blds.filter(b => b.research_speed > 0 && b.id.toLowerCase().startsWith('researchlab'));
  labBuildings.sort((a, b) => (lvMap.get(a.id) || 1) - (lvMap.get(b.id) || 1));
  const maxLabLevel = labBuildings.length ? lvMap.get(labBuildings[labBuildings.length - 1].id) || 0 : 0;
  labBuildings.forEach(b => {
    const rcs = (b.recipes || []).map(r => {
      const inp: Record<string, number> = {};
      const out: Record<string, number> = {};
      (r.inputs || []).forEach(i => inp[i.name.toLowerCase()] = i.quantity);
      (r.outputs || []).forEach(o => out[o.name.toLowerCase()] = o.quantity);
      return { id: r.id, inputs: inp, outputs: out, duration: r.duration };
    });
    const upkeep = allRecipes.find(r => r.buildingId === b.id && r.buildingLevel === (lvMap.get(b.id) || 1))?.upkeep || {};
    labMeta.push({
      buildingId: b.id, level: lvMap.get(b.id) || 1, name: b.name,
      recipes: rcs, upkeep,
      isHighestLevel: (lvMap.get(b.id) || 1) === maxLabLevel
    });
  });

  return { recipes: allRecipes, allItems: [...allItems], mainSeriesList: mainSeries, powerSeriesList: powerSeries, labMeta };
}
