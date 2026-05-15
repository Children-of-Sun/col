// stores.ts 完整修复版

import { create } from 'zustand';
import { StoreState, DataJson, ParsedData, SolverResult, Demand, GameData, Recipe } from './types'; // 导入 Recipe
import { parseData } from './parseData';
import { getSeriesName, isPowerBuilding, HIDDEN_SERIES } from './utils';

function initializeFromParsed(p: ParsedData): Partial<StoreState> {
  const mainEnabled: Record<string, boolean> = {};
  const mainSelectedLevel: Record<string, number> = {};
  p.mainSeriesList.forEach(s => {
    const hi = s.levels[s.levels.length - 1].level;
    mainSelectedLevel[s.name] = hi;
    mainEnabled[s.name] = true;
  });
  const powerEnabled: Record<string, boolean> = {};
  const powerSelectedLevel: Record<string, number> = {};
  p.powerSeriesList.forEach(s => {
    const hi = s.levels[s.levels.length - 1].level;
    powerSelectedLevel[s.name] = hi;
    powerEnabled[s.name] = true;
  });
  const recipeEnabled: Record<string, boolean> = {};
  p.recipes.forEach(r => { recipeEnabled[r.id] = true; });
  return { mainEnabled, mainSelectedLevel, powerEnabled, powerSelectedLevel, recipeEnabled };
}

export const useStore = create<StoreState>((set, get) => ({
  fullData: null,
  recipes: [],
  allItems: [],
  translation: {},
  mainSeriesList: [],
  powerSeriesList: [],
  labMeta: [],
  dataLoaded: false,

  mainEnabled: {},
  mainSelectedLevel: {},
  powerEnabled: {},
  powerSelectedLevel: {},
  recipeEnabled: {},

  mainBuildingEnabledMap: {},
  powerBuildingEnabledMap: {},

  demands: [],

  stationLevel: 0,
  rocketType: 1,
  techLevel: 5,
  statueCount: 0,
  labLevel: '',
  labCount: 0,
  steamLowMode: 'internal',

  ignoredItems: ['人力'],
  allowExternal: false,
  hideStage: true,
  diagnosticMode: false,
  excludedItems: [],
  constraintMode: 'noProd' as const,
  showTinyErrors: false,

  result: null,
  isSolving: false,
  diagnostic: '',

  solverActive: [],
  solverVarNames: [],
  solverMissing: [],
  solverFixedDemands: [],
  unityProduced: 0,
  unityConsumed: 0,
  externalSupplies: [],

  gameData: null,
  population: 1000,
  housingIndex: 0,
  selectedFoods: new Set<string>(),
  selectedMedical: null,
  selectedOthers: new Set<string>(),
  edictLevels: {},
  officeLevels: [],
  researchLevels: [],

  loadData: (json: DataJson) => {
    const p = parseData(json);
    const init = initializeFromParsed(p);
    // 确保 recipeEnabled 存在且正确填充
    const recipeEnabled = init.recipeEnabled ?? {};
    p.recipes.forEach(r => {
      if (!recipeEnabled[r.id]) recipeEnabled[r.id] = true;
    });
    // 初始化所有建筑为 true（主模块和电力模块各自独立）
    const allBuildingIds = json.machines_and_buildings.map(b => b.id);
    const mainBuildingEnabledMap = Object.fromEntries(allBuildingIds.map(id => [id, true]));
    const powerBuildingEnabledMap = Object.fromEntries(allBuildingIds.map(id => [id, true]));
    set({
      fullData: json,
      recipes: p.recipes,
      allItems: p.allItems,
      mainSeriesList: p.mainSeriesList,
      powerSeriesList: p.powerSeriesList,
      labMeta: p.labMeta,
      dataLoaded: true,
      ...init,
      recipeEnabled,   // 覆盖保证完整
      labLevel: p.labMeta.length ? p.labMeta[p.labMeta.length - 1].buildingId : '',
      mainBuildingEnabledMap,
      powerBuildingEnabledMap,
    });
  },

  loadTranslation: (json: Record<string, string>) => {
    const t: Record<string, string> = {};
    for (const k in json) t[k.toLowerCase()] = json[k];
    set({ translation: t });
  },

  setMainEnabled: (name, value) => set(s => ({ mainEnabled: { ...s.mainEnabled, [name]: value } })),
  setMainLevel: (name, level) => set(s => ({ mainSelectedLevel: { ...s.mainSelectedLevel, [name]: level } })),
  setPowerEnabled: (name, value) => set(s => ({ powerEnabled: { ...s.powerEnabled, [name]: value } })),
  setPowerLevel: (name, level) => set(s => ({ powerSelectedLevel: { ...s.powerSelectedLevel, [name]: level } })),
  setRecipeEnabled: (id, value) => set(s => ({ recipeEnabled: { ...s.recipeEnabled, [id]: value } })),
  setMainBuildingEnabled: (id, value) => set(s => ({ mainBuildingEnabledMap: { ...s.mainBuildingEnabledMap, [id]: value } })),
  setPowerBuildingEnabled: (id, value) => set(s => ({ powerBuildingEnabledMap: { ...s.powerBuildingEnabledMap, [id]: value } })),

  addDemand: (item, rate) => set(s => ({ demands: [...s.demands, { item: item.toLowerCase(), rate }] })),
  removeDemand: (index) => set(s => ({ demands: s.demands.filter((_, i) => i !== index) })),
  setStationLevel: (v) => set({ stationLevel: v }),
  setRocketType: (v) => set({ rocketType: v }),
  setTechLevel: (v) => set({ techLevel: v }),
  setStatueCount: (v) => set({ statueCount: v }),
  setLabLevel: (v) => set({ labLevel: v }),
  setLabCount: (v) => set({ labCount: v }),
  setSteamLowMode: (v) => set({ steamLowMode: v }),

  toggleIgnored: (item) => set(s => ({
    ignoredItems: s.ignoredItems.includes(item)
      ? s.ignoredItems.filter(i => i !== item)
      : [...s.ignoredItems, item]
  })),
  setAllowExternal: (v) => set({ allowExternal: v }),
  setHideStage: (v) => set({ hideStage: v }),
  setDiagnosticMode: (v) => set({ diagnosticMode: v }),
  setExcludedItems: (items) => set({ excludedItems: items }),
  setConstraintMode: (v) => set({ constraintMode: v }),
  setShowTinyErrors: (v) => set({ showTinyErrors: v }),
  setResult: (r) => set({ result: r }),
  setIsSolving: (v) => set({ isSolving: v }),
  setDiagnostic: (msg) => set({ diagnostic: msg }),
  setSolverActive: (active: Recipe[]) => set({ solverActive: active }),
  setSolverVarNames: (names: string[]) => set({ solverVarNames: names }),
  setSolverMissing: (missing: string[]) => set({ solverMissing: missing }),
  setSolverFixedDemands: (demands) => set({ solverFixedDemands: demands }),
  setUnityProduced: (v: number) => set({ unityProduced: v }),
  setUnityConsumed: (v: number) => set({ unityConsumed: v }),
  setExternalSupplies: (supplies) => set({ externalSupplies: supplies }),

  setGameData: (data: GameData) => set({ gameData: data }),
  setPopulation: (v: number) => set({ population: v }),
  setHousingIndex: (v: number) => set({ housingIndex: v }),
  toggleFood: (name: string) => set(s => {
    const foods = new Set(s.selectedFoods);
    if (foods.has(name)) foods.delete(name);
    else foods.add(name);
    return { selectedFoods: foods };
  }),
  setMedical: (name: string | null) => set({ selectedMedical: name }),
  toggleOther: (name: string) => set(s => {
    const others = new Set(s.selectedOthers);
    if (others.has(name)) others.delete(name);
    else others.add(name);
    return { selectedOthers: others };
  }),
  setEdictLevel: (idx: number, lvl: number) => set(s => ({
    edictLevels: { ...s.edictLevels, [idx]: lvl }
  })),
  setOfficeLevel: (idx: number, lvl: number) => set(s => {
    const levels = [...s.officeLevels];
    levels[idx] = lvl;
    return { officeLevels: levels };
  }),
  setResearchLevel: (idx: number, lvl: number) => set(s => {
    const levels = [...s.researchLevels];
    levels[idx] = lvl;
    return { researchLevels: levels };
  }),

  importSettings: (s) => {
    const state: Partial<StoreState> = {};
    if (s.mainEnabled) state.mainEnabled = s.mainEnabled;
    if (s.mainLevels) state.mainSelectedLevel = s.mainLevels;
    if (s.powerEnabled) state.powerEnabled = s.powerEnabled;
    if (s.powerLevels) state.powerSelectedLevel = s.powerLevels;
    if (s.recipes) state.recipeEnabled = s.recipes;
    if (s.excluded) state.excludedItems = s.excluded.map((x: string) => x.toLowerCase());
    if (s.stationLevel !== undefined) state.stationLevel = s.stationLevel;
    if (s.rocketType !== undefined) state.rocketType = s.rocketType;
    if (s.techLevel !== undefined) state.techLevel = s.techLevel;
    if (s.statueCount !== undefined) state.statueCount = s.statueCount;
    if (s.labLevel !== undefined) state.labLevel = s.labLevel;
    if (s.labCount !== undefined) state.labCount = s.labCount;
    if (s.steamLowMode !== undefined) state.steamLowMode = s.steamLowMode;
    if (s.constraintMode !== undefined) state.constraintMode = s.constraintMode;
    if (s.showTinyErrors !== undefined) state.showTinyErrors = s.showTinyErrors;
    if (s.mainBuildingEnabledMap) state.mainBuildingEnabledMap = s.mainBuildingEnabledMap;
    if (s.powerBuildingEnabledMap) state.powerBuildingEnabledMap = s.powerBuildingEnabledMap;
    if (s.allowExternal !== undefined) state.allowExternal = s.allowExternal;
    set(state);
  },

  exportSettings: () => {
    const s = get();
    return {
      mainEnabled: s.mainEnabled,
      mainLevels: s.mainSelectedLevel,
      powerEnabled: s.powerEnabled,
      powerLevels: s.powerSelectedLevel,
      recipes: s.recipeEnabled,
      excluded: s.excludedItems,
      stationLevel: s.stationLevel,
      rocketType: s.rocketType,
      techLevel: s.techLevel,
      statueCount: s.statueCount,
      labLevel: s.labLevel,
      labCount: s.labCount,
      steamLowMode: s.steamLowMode,
      constraintMode: s.constraintMode,
      showTinyErrors: s.showTinyErrors,
      mainBuildingEnabledMap: s.mainBuildingEnabledMap,
      powerBuildingEnabledMap: s.powerBuildingEnabledMap,
      allowExternal: s.allowExternal,
    };
  },

  enableSeriesForItem: (item: string) => {
    const s = get();
    s.recipes.filter(r => r.outputs[item] && !r.isHidden).forEach(r => {
      const sn = getSeriesName(r.buildingId, s.mainSeriesList, s.powerSeriesList);
      if (r.module === 'power') {
        s.powerEnabled[sn] = true;
        s.powerSelectedLevel[sn] = r.buildingLevel;
      } else {
        s.mainEnabled[sn] = true;
        s.mainSelectedLevel[sn] = r.buildingLevel;
      }
      s.recipeEnabled[r.id] = true;
    });
    set({
      mainEnabled: { ...s.mainEnabled },
      mainSelectedLevel: { ...s.mainSelectedLevel },
      powerEnabled: { ...s.powerEnabled },
      powerSelectedLevel: { ...s.powerSelectedLevel },
      recipeEnabled: { ...s.recipeEnabled },
    });
  },
}));
