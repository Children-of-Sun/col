// ==================== 居民/科技类型 ====================
export interface HousingTier {
  name: string;
  multipliers: Record<string, number>;
  unityMultiplierConditions: { requires: string[]; multiplier: number }[];
}

export interface Service {
  demand: number;
  unity: number;
  category: string;
  'Food Category'?: string;
  waste: number[];
}

export interface Edict {
  name: string;
  targetCategory: string;
  effectPerLevel: number[];
  unityPerLevel: number[];
  itemEffect?: string[];
}

export interface Office {
  name: string;
  effectPerLevel: number;
  maxLevel: number;
  targetCategory: string | string[];
}

export interface Research {
  name: string;
  effectPerLevel: number[];
  maxLevel: number;
  targetCategory: string | string[];
}

export interface MaintenanceWaste {
  name: string;
  waste: number[];
}

export interface GameData {
  populationScale: number;
  wasteNames: string[];
  recyclableIndices: number[];
  services: Record<string, Service>;
  maintenance: MaintenanceWaste[];
  housingTiers: HousingTier[];
  edicts: Edict[];
  office: Office[];
  research: Research[];
  baseRecycleRate?: number;
}

// ==================== 原始数据类型 ====================
export interface BuildingRaw {
  id: string;
  name: string;
  category: string;
  next_tier: string;
  workers: number;
  electricity_consumed: number;
  computing_consumed: number;
  electricity_generated: number;
  research_speed: number;
  maintenance_cost_units: string;
  maintenance_cost_quantity: number;
  recipes: RecipeRaw[];
}

export interface RecipeRaw {
  id: string;
  name: string;
  duration: number;
  power_multiplier: number;
  inputs: { name: string; quantity: number }[];
  outputs: { name: string; quantity: number }[];
}

export interface DataJson {
  machines_and_buildings: BuildingRaw[];
}

// ==================== 解析后数据类型 ====================
export interface LevelEntry {
  buildingId: string;
  level: number;
  recipeIds: string[];
}

export interface Series {
  name: string;
  levels: LevelEntry[];
}

export interface Recipe {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  category: string;
  buildingLevel: number;
  duration: number;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  upkeep: Record<string, number>;
  powerMultiplier: number;
  workers: number;
  isSolar: boolean;
  isHidden: boolean;
  module: 'main' | 'power' | 'resident' | 'station' | 'special';
}

export interface LabMeta {
  buildingId: string;
  level: number;
  name: string;
  recipes: { id: string; inputs: Record<string, number>; outputs: Record<string, number>; duration: number }[];
  upkeep: Record<string, number>;
  isHighestLevel: boolean;
}

export interface Demand {
  item: string;
  rate: number;
}

export interface RocketData {
  name: string;
  crewBase: number;
  cargoBase: number;
  crewMax: number;
  cargoMax: number;
  crewKey: string;
  cargoKey: string;
}

export interface ParsedData {
  recipes: Recipe[];
  allItems: string[];
  mainSeriesList: Series[];
  powerSeriesList: Series[];
  labMeta: LabMeta[];
}

// ==================== Store 状态类型 ====================
export interface StoreState {
  // 原始数据
  fullData: DataJson | null;
  recipes: Recipe[];
  allItems: string[];
  translation: Record<string, string>;
  mainSeriesList: Series[];
  powerSeriesList: Series[];
  labMeta: LabMeta[];
  dataLoaded: boolean;

  // 主模块状态
  mainEnabled: Record<string, boolean>;
  mainSelectedLevel: Record<string, number>;

  // 电力模块状态
  powerEnabled: Record<string, boolean>;
  powerSelectedLevel: Record<string, number>;

  // 配方启用
  recipeEnabled: Record<string, boolean>;
  mainBuildingEnabledMap: Record<string, boolean>;  // 主模块建筑启用状态（独立于系列）
  powerBuildingEnabledMap: Record<string, boolean>; // 电力模块建筑启用状态（独立于系列）

  // 需求
  demands: Demand[];

  // 固定实体
  stationLevel: number;
  rocketType: number;
  techLevel: number;
  statueCount: number;
  labLevel: string;
  labCount: number;
  steamLowMode: 'internal' | 'shared' | 'mainonly';

  // 选项
  ignoredItems: string[];
  allowExternal: boolean;
  hideStage: boolean;
  diagnosticMode: boolean;
  excludedItems: string[];
  constraintMode: 'noProd' | 'noProdOrCons';  // 约束模式
  showTinyErrors: boolean;                      // 显示微小误差

  // 求解结果
  result: SolverResult | null;
  isSolving: boolean;
  diagnostic: string;
  solverMissing: string[];
  solverFixedDemands: Demand[];
  unityProduced: number;
  unityConsumed: number;
  externalSupplies: { item: string; rate: number }[];

  // 求解时的配方快照
  solverActive: Recipe[];
  solverVarNames: string[];

  // 居民/科技
  gameData: GameData | null;
  population: number;
  housingIndex: number;
  selectedFoods: Set<string>;
  selectedMedical: string | null;
  selectedOthers: Set<string>;
  edictLevels: Record<number, number>;
  officeLevels: number[];
  researchLevels: number[];

  // Actions
  loadData: (json: DataJson) => void;
  loadTranslation: (json: Record<string, string>) => void;
  setMainEnabled: (name: string, value: boolean) => void;
  setMainLevel: (name: string, level: number) => void;
  setPowerEnabled: (name: string, value: boolean) => void;
  setPowerLevel: (name: string, level: number) => void;
  setRecipeEnabled: (id: string, value: boolean) => void;
  setMainBuildingEnabled: (id: string, value: boolean) => void;
  setPowerBuildingEnabled: (id: string, value: boolean) => void;
  addDemand: (item: string, rate: number) => void;
  removeDemand: (index: number) => void;
  setStationLevel: (v: number) => void;
  setRocketType: (v: number) => void;
  setTechLevel: (v: number) => void;
  setStatueCount: (v: number) => void;
  setLabLevel: (v: string) => void;
  setLabCount: (v: number) => void;
  setSteamLowMode: (v: 'internal' | 'shared' | 'mainonly') => void;
  toggleIgnored: (item: string) => void;
  setAllowExternal: (v: boolean) => void;
  setHideStage: (v: boolean) => void;
  setDiagnosticMode: (v: boolean) => void;
  setExcludedItems: (items: string[]) => void;
  setConstraintMode: (v: 'noProd' | 'noProdOrCons') => void;
  setShowTinyErrors: (v: boolean) => void;
  setResult: (r: SolverResult | null) => void;
  setIsSolving: (v: boolean) => void;
  setDiagnostic: (msg: string) => void;
  setSolverActive: (active: Recipe[]) => void;
  setSolverVarNames: (names: string[]) => void;
  setSolverMissing: (missing: string[]) => void;
  setSolverFixedDemands: (demands: Demand[]) => void;
  setUnityProduced: (v: number) => void;
  setUnityConsumed: (v: number) => void;
  setExternalSupplies: (supplies: { item: string; rate: number }[]) => void;
  importSettings: (s: any) => void;
  exportSettings: () => any;
  enableSeriesForItem: (item: string) => void;
  setGameData: (data: GameData) => void;
  setPopulation: (v: number) => void;
  setHousingIndex: (v: number) => void;
  toggleFood: (name: string) => void;
  setMedical: (name: string | null) => void;
  toggleOther: (name: string) => void;
  setEdictLevel: (idx: number, lvl: number) => void;
  setOfficeLevel: (idx: number, lvl: number) => void;
  setResearchLevel: (idx: number, lvl: number) => void;
}

export interface SolverResult {
  status: string;
  columns: Record<string, { Primal: number }>;
}
