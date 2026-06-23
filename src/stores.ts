import { create } from 'zustand';
import { StoreState, DataJson, ParsedData, SolverResult, Demand, GameData, Recipe, TradeContract, TradeSetup, FarmSetting, CropSetting } from './types';
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
  statueCount: 0,
  labLevel: '',
  labCount: 0,
  steamLowMode: 'internal',

  ignoredItems: [],
  allowExternal: false,
  hideStage: true,
  diagnosticMode: false,
  excludedOutputs: [],
  excludedInputs: [],
  constraintMode: 'noProd' as const,
  showTinyErrors: true,

  result: null,
  isSolving: false,
  diagnostic: '',

  solverActive: [],
  solverVarNames: [],
  solverMissing: [],
  solverFixedDemands: [],
  unityProduction: 0,
  unityConsumption: 0,
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

  tradeContracts: [],
  tradeSetup: { contractId: '', dockLevel: 1, fuelName: 'Diesel' },
  selectedTradeRecipes: [],
  tradeParams: {
    baySlots: 4,
    moduleSize: 'M',
    fuelTypeRaw: 'Diesel',
    travelMode: 'normal',
    profitBonus: 0,
    unityDiscount: 0,
  },
  tradeVoyageTime: 0,
  selectedTradeContractIds: [],
  enableTradeModule: true,

  enableAgriculture: false,
  cropRotation: false,
  globalFertilizerType: 'organic',
  targetFertility: 100,
  farms: [],

  enableFocusConsumption: false,

  officeBuildingEnabled: {},
  officeSelectedLevel: {},
  officeRecipeEnabled: {},

  solarEfficiency: 1,
  medicalMultiplier: 1,

  optimizationMode: 'machines',
  customWeights: { machines: 100, labor: 0, cohesion: 0, area: 0, raw: 0 },

  // 整数模式相关
  integerMode: 'continuous' as 'continuous' | 'ceil' | 'rounding' | 'milp',
  milpTimeLimit: 30,
  recipeIntegerEnabled: {},

  // 资源冗余设置
  enableRedundancy: false,
  globalLower: 100,
  globalUpper: 100,
  redundancyResources: {},
  redundancyAutoItems: {},
  redundancyMilpDisabled: {},

  // 凝聚力消耗细分
  cohesionTradeDirect: 0,
  cohesionTradeMaintenance: 0,
  cohesionEdict: 0,

  // 图标显示
  buildingIcons: {},
  productIcons: {},
  productCategories: {},
  showIcons: true,
  officeCollapsed: {},
  farmCollapsed: {},

  loadData: (json: DataJson) => {
    const p = parseData(json);
    const init = initializeFromParsed(p);
    const recipeEnabled = init.recipeEnabled ?? {};
    p.recipes.forEach(r => {
      if (!recipeEnabled[r.id]) recipeEnabled[r.id] = true;
    });
    const allBuildingIds = json.machines_and_buildings.map(b => b.id);
    const mainBuildingEnabledMap = Object.fromEntries(allBuildingIds.map(id => [id, true]));
    const powerBuildingEnabledMap = Object.fromEntries(allBuildingIds.map(id => [id, true]));
    // 初始化办公室建筑启用状态
    const officeBuildings = json.machines_and_buildings.filter(b => b.name.startsWith('Office'));
    const officeBuildingEnabledMap: Record<string, boolean> = {};
    const officeRecipeEnabledMap: Record<string, boolean> = {};
    officeBuildings.forEach(b => {
      officeBuildingEnabledMap[b.id] = true;
      b.recipes?.forEach(r => { officeRecipeEnabledMap[r.id] = true; });
    });
    set({
      fullData: json,
      recipes: p.recipes,
      allItems: p.allItems,
      mainSeriesList: p.mainSeriesList,
      powerSeriesList: p.powerSeriesList,
      labMeta: p.labMeta,
      dataLoaded: true,
      ...init,
      recipeEnabled,
      labLevel: p.labMeta.length ? p.labMeta[p.labMeta.length - 1].buildingId : '',
      mainBuildingEnabledMap,
      powerBuildingEnabledMap,
      officeBuildingEnabled: officeBuildingEnabledMap,
      officeRecipeEnabled: officeRecipeEnabledMap,
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
  setExcludedOutputs: (items) => set({ excludedOutputs: items.map(i => i.toLowerCase()) }),
  setExcludedInputs: (items) => set({ excludedInputs: items.map(i => i.toLowerCase()) }),
  setConstraintMode: (v) => set({ constraintMode: v }),
  setShowTinyErrors: (v) => set({ showTinyErrors: v }),
  setResult: (r) => set({ result: r }),
  setIsSolving: (v) => set({ isSolving: v }),
  setDiagnostic: (msg) => set({ diagnostic: msg }),
  setSolverActive: (active: Recipe[]) => set({ solverActive: active }),
  setSolverVarNames: (names: string[]) => set({ solverVarNames: names }),
  setSolverMissing: (missing: string[]) => set({ solverMissing: missing }),
  setSolverFixedDemands: (demands) => set({ solverFixedDemands: demands }),
  setUnityProduction: (v: number) => set({ unityProduction: v }),
  setUnityConsumption: (v: number) => set({ unityConsumption: v }),
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
  setMedicalMultiplier: (value) => set({ medicalMultiplier: Math.min(2, Math.max(1, value)) }),
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

  setTradeContracts: (contracts) => set({ tradeContracts: contracts }),
  setTradeContract: (contractId) => set(state => ({ tradeSetup: { ...state.tradeSetup, contractId } })),
  setTradeDockLevel: (level) => set(state => ({ tradeSetup: { ...state.tradeSetup, dockLevel: level } })),
  setTradeFuel: (fuelName) => set(state => ({ tradeSetup: { ...state.tradeSetup, fuelName: fuelName } })),
  setSelectedTradeRecipes: (recipes) => set({ selectedTradeRecipes: recipes }),
  setTradeParams: (params) => set(state => ({ tradeParams: { ...state.tradeParams, ...params } })),
  setSelectedTradeContractIds: (ids) => set({ selectedTradeContractIds: ids }),
  setEnableTradeModule: (value) => set({ enableTradeModule: value }),

  setEnableAgriculture: (value: boolean) => set({ enableAgriculture: value }),
  setCropRotation: (value: boolean) => set({ cropRotation: value }),
  setEnableFocusConsumption: (value: boolean) => set({ enableFocusConsumption: value }),
  setOfficeBuildingEnabled: (id, value) => set(s => ({ officeBuildingEnabled: { ...s.officeBuildingEnabled, [id]: value } })),
  setOfficeLevelById: (id, level) => set(s => ({ officeSelectedLevel: { ...s.officeSelectedLevel, [id]: level } })),
  setOfficeRecipeEnabled: (id, value) => set(s => ({ officeRecipeEnabled: { ...s.officeRecipeEnabled, [id]: value } })),
  setGlobalFertilizerType: (v: string) => {
    const newType = v as 'organic' | 'I' | 'II';
    let maxFT = 100;
    if (newType === 'I') maxFT = 120;
    if (newType === 'II') maxFT = 140;
    const currentFT = get().targetFertility;
    set({
      globalFertilizerType: newType,
      targetFertility: Math.min(currentFT, maxFT)
    });
  },
  setTargetFertility: (value: number) => set({ targetFertility: value }),
  toggleFarm: (buildingId: string) => set(state => {
    const farms = state.farms.map(f =>
      f.buildingId === buildingId ? { ...f, enabled: !f.enabled } : f
    );
    return { farms };
  }),
  toggleCrop: (buildingId: string, cropName: string, enabled: boolean) => set(state => {
    const farms = state.farms.map(f => {
      if (f.buildingId !== buildingId) return f;
      const crops = f.crops.map(c =>
        c.cropName === cropName ? { ...c, enabled } : c
      );
      return { ...f, crops };
    });
    return { farms };
  }),
  loadAgricultureBuildings: () => set(state => {
    // 从 Irrigated Farm 配方中提取所有作物的基准数据（仅使用肥料 I 配方）
    const baseRecipes = state.recipes.filter(r => r.buildingId === 'Irrigated Farm' && r.module === 'main');
    const cropBaseMap = new Map<string, any>();
    for (const rec of baseRecipes) {
      const fertIKey = Object.keys(rec.inputs).find(k => k.toLowerCase() === 'fertilizer i');
      if (!fertIKey) continue;
      const cropName = Object.keys(rec.outputs).find(k => k !== 'water' && k !== 'recyclables');
      if (!cropName) continue;
      const durationMin = rec.duration / 60;
      const waterPerMin = (rec.inputs['water'] || 0) / durationMin;
      const fertQty = rec.inputs[fertIKey];
      const fc = (fertQty * 2) / durationMin; // 肥料 I 肥力值=2
      const cropPerMin = (rec.outputs[cropName] || 0) / durationMin;
      if (!cropBaseMap.has(cropName)) {
        cropBaseMap.set(cropName, {
          baseWaterPerMin: waterPerMin,
          baseFertilizerPerMin: fertQty / durationMin,
          baseCropPerMin: cropPerMin,
          baseFc: fc,
          baseRecipeId: rec.id,
        });
      }
    }

    const targetBuildings = [
      { id: 'Irrigated Farm', name: 'Irrigated Farm', waterMul: 1.0, outputMul: 1.0 },
      { id: 'Greenhouse', name: 'Greenhouse', waterMul: 1.12, outputMul: 1.25 },
      { id: 'Greenhouse II', name: 'Greenhouse II', waterMul: 1.25, outputMul: 1.5 },
    ];

    const farms: FarmSetting[] = [];
    for (const b of targetBuildings) {
      const existingFarm = state.farms.find(f => f.buildingId === b.id);
      const crops: CropSetting[] = Array.from(cropBaseMap.entries()).map(([cropName, data]) => {
        const existingCrop = existingFarm?.crops.find(c => c.cropName === cropName);
        return {
          cropName,
          enabled: existingCrop?.enabled ?? false, // 保留已有状态，默认 false
          baseRecipeId: data.baseRecipeId,
          baseWaterPerMin: data.baseWaterPerMin,
          baseFertilizerPerMin: data.baseFertilizerPerMin,
          baseCropPerMin: data.baseCropPerMin,
          baseFc: data.baseFc,
        };
      });
      farms.push({
        buildingId: b.id,
        buildingName: b.name,
        enabled: existingFarm?.enabled ?? true,
        level: existingFarm?.level ?? 1,
        crops,
      });
    }
    return { farms };
  }),

  setSolarEfficiency: (value) => set({ solarEfficiency: Math.min(1, Math.max(0, value)) }),

  setOptimizationMode: (mode) => set({ optimizationMode: mode }),
  setCustomWeights: (weights) => set({ customWeights: { ...get().customWeights, ...weights } }),

  setIntegerMode: (mode) => set({ integerMode: mode }),
  setMilpTimeLimit: (v) => set({ milpTimeLimit: v }),
  setEnableRedundancy: (v) => set({ enableRedundancy: v }),
  setGlobalLower: (v) => set({ globalLower: v }),
  setGlobalUpper: (v) => set({ globalUpper: v }),
  setRedundancyResources: (r) => set({ redundancyResources: r }),
  setRedundancyAutoItems: (items) => set({ redundancyAutoItems: items }),
  setRedundancyMilpDisabled: (items) => set({ redundancyMilpDisabled: items }),
  setRecipeIntegerEnabled: (id, enabled) => set((s: any) => ({ recipeIntegerEnabled: { ...s.recipeIntegerEnabled, [id]: enabled } })),
  setCohesionTradeDirect: (value: number) => set({ cohesionTradeDirect: value }),
  setCohesionTradeMaintenance: (value: number) => set({ cohesionTradeMaintenance: value }),
  setCohesionEdict: (value: number) => set({ cohesionEdict: value }),
  setBuildingIcons: (icons) => set({ buildingIcons: icons }),
  setProductIcons: (icons) => set({ productIcons: icons }),
  setProductCategories: (categories) => set({ productCategories: categories }),
  setShowIcons: (show) => set({ showIcons: show }),
  setOfficeCollapsed: (v) => set({ officeCollapsed: v }),
  setFarmCollapsed: (v) => set({ farmCollapsed: v }),

  importSettings: (s) => {
    const state: Partial<StoreState> = {};
    if (s.mainEnabled) state.mainEnabled = s.mainEnabled;
    if (s.mainLevels) state.mainSelectedLevel = s.mainLevels;
    if (s.powerEnabled) state.powerEnabled = s.powerEnabled;
    if (s.powerLevels) state.powerSelectedLevel = s.powerLevels;
    if (s.recipes) state.recipeEnabled = s.recipes;
    if (s.excludedOutputs) state.excludedOutputs = s.excludedOutputs.map((x: string) => x.toLowerCase());
    if (s.excludedInputs) state.excludedInputs = s.excludedInputs.map((x: string) => x.toLowerCase());
    if (s.stationLevel !== undefined) state.stationLevel = s.stationLevel;
    if (s.rocketType !== undefined) state.rocketType = s.rocketType;
    if (s.statueCount !== undefined) state.statueCount = s.statueCount;
    if (s.labLevel !== undefined) state.labLevel = s.labLevel;
    if (s.labCount !== undefined) state.labCount = s.labCount;
    if (s.steamLowMode !== undefined) state.steamLowMode = s.steamLowMode;
    if (s.constraintMode !== undefined) state.constraintMode = s.constraintMode;
    if (s.showTinyErrors !== undefined) state.showTinyErrors = s.showTinyErrors;
    if (s.mainBuildingEnabledMap) state.mainBuildingEnabledMap = s.mainBuildingEnabledMap;
    if (s.powerBuildingEnabledMap) state.powerBuildingEnabledMap = s.powerBuildingEnabledMap;
    if (s.allowExternal !== undefined) state.allowExternal = s.allowExternal;
    if (s.tradeContract !== undefined) state.tradeSetup = { ...state.tradeSetup, contractId: s.tradeContract };
    if (s.tradeDockLevel !== undefined) state.tradeSetup = { ...state.tradeSetup, dockLevel: s.tradeDockLevel };
    if (s.tradeFuel !== undefined) state.tradeSetup = { ...state.tradeSetup, fuelName: s.tradeFuel };
    if (s.solarEfficiency !== undefined) state.solarEfficiency = s.solarEfficiency;
    if (s.tradeParams) state.tradeParams = { ...state.tradeParams, ...s.tradeParams };
    if (s.selectedTradeContractIds) state.selectedTradeContractIds = s.selectedTradeContractIds;
    if (s.optimizationMode) state.optimizationMode = s.optimizationMode;
    if (s.customWeights) state.customWeights = s.customWeights;
    if (s.population !== undefined) state.population = s.population;
    if (s.housingIndex !== undefined) state.housingIndex = s.housingIndex;
    if (s.selectedFoods) state.selectedFoods = new Set(s.selectedFoods);
    if (s.selectedMedical !== undefined) state.selectedMedical = s.selectedMedical;
    if (s.selectedOthers) state.selectedOthers = new Set(s.selectedOthers);
    if (s.edictLevels) state.edictLevels = s.edictLevels;
    if (s.officeLevels) state.officeLevels = s.officeLevels;
    if (s.researchLevels) state.researchLevels = s.researchLevels;
    if (s.enableTradeModule !== undefined) state.enableTradeModule = s.enableTradeModule;
    if (s.showIcons !== undefined) state.showIcons = s.showIcons;
    if (s.ignoredItems !== undefined) state.ignoredItems = s.ignoredItems;
    if (s.enableAgriculture !== undefined) state.enableAgriculture = s.enableAgriculture;
    if (s.cropRotation !== undefined) state.cropRotation = s.cropRotation;
    if (s.globalFertilizerType !== undefined) state.globalFertilizerType = s.globalFertilizerType;
    if (s.targetFertility !== undefined) state.targetFertility = s.targetFertility;
    if (s.enableFocusConsumption !== undefined) state.enableFocusConsumption = s.enableFocusConsumption;
    if (s.officeBuildingEnabled !== undefined) state.officeBuildingEnabled = s.officeBuildingEnabled;
    if (s.officeSelectedLevel !== undefined) state.officeSelectedLevel = s.officeSelectedLevel;
    if (s.officeRecipeEnabled !== undefined) state.officeRecipeEnabled = s.officeRecipeEnabled;
    if (s.integerMode !== undefined) state.integerMode = s.integerMode;
    if (s.milpTimeLimit !== undefined) state.milpTimeLimit = s.milpTimeLimit;
    if (s.recipeIntegerEnabled !== undefined) state.recipeIntegerEnabled = s.recipeIntegerEnabled;
    if (s.tradeVoyageTime !== undefined) state.tradeVoyageTime = s.tradeVoyageTime;
    if (s.enableRedundancy !== undefined) state.enableRedundancy = s.enableRedundancy;
    if (s.globalLower !== undefined) state.globalLower = s.globalLower;
    if (s.globalUpper !== undefined) state.globalUpper = s.globalUpper;
    if (s.redundancyResources !== undefined) state.redundancyResources = s.redundancyResources;
    if (s.redundancyAutoItems !== undefined) state.redundancyAutoItems = s.redundancyAutoItems;
    if (s.redundancyMilpDisabled !== undefined) state.redundancyMilpDisabled = s.redundancyMilpDisabled;
    if (s.officeCollapsed !== undefined) state.officeCollapsed = s.officeCollapsed;
    if (s.farmCollapsed !== undefined) state.farmCollapsed = s.farmCollapsed;
    // 生产目标 & 外部供给
    if (s.demands !== undefined) state.demands = s.demands;
    if (s.externalSupplies !== undefined) state.externalSupplies = s.externalSupplies;
    if (s.selectedTradeRecipes !== undefined) state.selectedTradeRecipes = s.selectedTradeRecipes;
    // 其他 UI 设置
    if (s.hideStage !== undefined) state.hideStage = s.hideStage;
    if (s.diagnosticMode !== undefined) state.diagnosticMode = s.diagnosticMode;
    if (s.medicalMultiplier !== undefined) state.medicalMultiplier = s.medicalMultiplier;
    if (s.farms !== undefined) {
      // 深度恢复 farms 结构（确保每个 crop 的 enabled 等字段保留）
      state.farms = s.farms.map((farm: any) => ({
        ...farm,
        crops: farm.crops.map((crop: any) => ({ ...crop }))
      }));
    }
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
      excludedOutputs: s.excludedOutputs,
      excludedInputs: s.excludedInputs,
      stationLevel: s.stationLevel,
      rocketType: s.rocketType,
      statueCount: s.statueCount,
      labLevel: s.labLevel,
      labCount: s.labCount,
      steamLowMode: s.steamLowMode,
      constraintMode: s.constraintMode,
      showTinyErrors: s.showTinyErrors,
      mainBuildingEnabledMap: s.mainBuildingEnabledMap,
      powerBuildingEnabledMap: s.powerBuildingEnabledMap,
      allowExternal: s.allowExternal,
      tradeContract: s.tradeSetup.contractId,
      tradeDockLevel: s.tradeSetup.dockLevel,
      tradeFuel: s.tradeSetup.fuelName,
      solarEfficiency: s.solarEfficiency,
      medicalMultiplier: s.medicalMultiplier,
      tradeParams: s.tradeParams,
      selectedTradeContractIds: s.selectedTradeContractIds,
      optimizationMode: s.optimizationMode,
      customWeights: s.customWeights,
      population: s.population,
      housingIndex: s.housingIndex,
      selectedFoods: Array.from(s.selectedFoods),
      selectedMedical: s.selectedMedical,
      selectedOthers: Array.from(s.selectedOthers),
      edictLevels: s.edictLevels,
      officeLevels: s.officeLevels,
      researchLevels: s.researchLevels,
      enableTradeModule: s.enableTradeModule,
      showIcons: s.showIcons,
      ignoredItems: s.ignoredItems,
      enableAgriculture: s.enableAgriculture,
      cropRotation: s.cropRotation,
      globalFertilizerType: s.globalFertilizerType,
      targetFertility: s.targetFertility,
      enableFocusConsumption: s.enableFocusConsumption,
      officeBuildingEnabled: s.officeBuildingEnabled,
      officeSelectedLevel: s.officeSelectedLevel,
      officeRecipeEnabled: s.officeRecipeEnabled,
      farms: s.farms,
      integerMode: s.integerMode,
      milpTimeLimit: s.milpTimeLimit,
      recipeIntegerEnabled: s.recipeIntegerEnabled,
      tradeVoyageTime: s.tradeVoyageTime,
      enableRedundancy: s.enableRedundancy,
      globalLower: s.globalLower,
      globalUpper: s.globalUpper,
      redundancyResources: s.redundancyResources,
      redundancyAutoItems: s.redundancyAutoItems,
      redundancyMilpDisabled: s.redundancyMilpDisabled,
      officeCollapsed: s.officeCollapsed,
      farmCollapsed: s.farmCollapsed,
      // 生产目标 & 外部供给
      demands: s.demands,
      externalSupplies: s.externalSupplies,
      selectedTradeRecipes: s.selectedTradeRecipes,
      // 其他 UI 设置
      hideStage: s.hideStage,
      diagnosticMode: s.diagnosticMode,
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