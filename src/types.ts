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
  extraWaste?: Record<string, number>;
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
  docks?: DockLevel[];
  fuels?: TradeFuel[];
}

// ==================== 原始数据类型 ====================
export interface BuildingRaw {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  next_tier: string;
  workers: number;
  maintenance_cost_units: string;
  maintenance_cost_quantity: number;
  electricity_consumed: number;
  electricity_generated: number;
  computing_consumed: number;
  computing_generated: number;
  product_type: string;
  storage_capacity: number;
  unity_cost: number;
  research_speed: number;
  icon_path: string;
  build_costs: { product: string; quantity: number }[];
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
  module: 'main' | 'power' | 'resident' | 'station' | 'special' | 'trade';
  isLab?: boolean;
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
  fullData: DataJson | null;
  recipes: Recipe[];
  allItems: string[];
  translation: Record<string, string>;
  mainSeriesList: Series[];
  powerSeriesList: Series[];
  labMeta: LabMeta[];
  dataLoaded: boolean;

  mainEnabled: Record<string, boolean>;
  mainSelectedLevel: Record<string, number>;
  powerEnabled: Record<string, boolean>;
  powerSelectedLevel: Record<string, number>;
  recipeEnabled: Record<string, boolean>;
  mainBuildingEnabledMap: Record<string, boolean>;
  powerBuildingEnabledMap: Record<string, boolean>;

  demands: Demand[];

  stationLevel: number;
  rocketType: number;
  statueCount: number;
  labLevel: string;
  labCount: number;
  steamLowMode: 'internal' | 'shared' | 'mainonly';

  ignoredItems: string[];
  allowExternal: boolean;
  hideStage: boolean;
  diagnosticMode: boolean;
  excludedOutputs: string[];
  excludedInputs: string[];
  excludedItems: string[];
  constraintMode: 'noProd' | 'noProdOrCons';
  showTinyErrors: boolean;

  result: SolverResult | null;
  isSolving: boolean;
  diagnostic: string;
  solverMissing: string[];
  solverFixedDemands: Demand[];
  unityProduced: number;
  unityConsumed: number;
  externalSupplies: { item: string; rate: number }[];

  solverActive: Recipe[];
  solverVarNames: string[];

  gameData: GameData | null;
  population: number;
  housingIndex: number;
  selectedFoods: Set<string>;
  selectedMedical: string | null;
  selectedOthers: Set<string>;
  edictLevels: Record<number, number>;
  officeLevels: number[];
  researchLevels: number[];

  tradeContracts: TradeContract[];
  tradeSetup: TradeSetup;
  tradeParams: TradeParams;
  selectedTradeContractIds: string[];
  selectedTradeRecipes: Recipe[];
  setTradeContracts: (contracts: TradeContract[]) => void;
  setTradeContract: (contractId: string) => void;
  setTradeDockLevel: (level: number) => void;
  setTradeFuel: (fuelName: string) => void;
  setTradeParams: (params: Partial<TradeParams>) => void;
  setSelectedTradeContractIds: (ids: string[]) => void;
  setSelectedTradeRecipes: (recipes: Recipe[]) => void;

  solarEfficiency: number;
  setSolarEfficiency: (value: number) => void;

  setExcludedOutputs: (items: string[]) => void;
  setExcludedInputs: (items: string[]) => void;
  setExcludedItems: (items: string[]) => void;

  // 原有 actions（省略具体声明，已在 stores.ts 实现）
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
  setStatueCount: (v: number) => void;
  setLabLevel: (v: string) => void;
  setLabCount: (v: number) => void;
  setSteamLowMode: (v: 'internal' | 'shared' | 'mainonly') => void;
  toggleIgnored: (item: string) => void;
  setAllowExternal: (v: boolean) => void;
  setHideStage: (v: boolean) => void;
  setDiagnosticMode: (v: boolean) => void;
  setConstraintMode: (v: 'noProd' | 'noProdOrCons') => void;
  setShowTinyErrors: (v: boolean) => void;
  setResult: (r: SolverResult | null) => void;
  setIsSolving: (v: boolean) => void;
  setDiagnostic: (msg: string) => void;
  setSolverActive: (active: Recipe[]) => void;
  setSolverVarNames: (names: string[]) => void;
  setSolverMissing: (missing: string[]) => void;
  setSolverFixedDemands: (demands: Demand[]) => void;
  setUnityProduction: (v: number) => void;
  setUnityConsumption: (v: number) => void;
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

// ==================== 贸易模块类型 ====================
export interface TradeContract {
  id: string;
  name: string;
  buyItem: string;
  sellItem: string;
  buyRate: number;
  sellRate: number;
  unity_per_100_bought?: number;
  unity_per_month?: number;
  min_reputation_required?: number;
}

export interface DockLevel {
  level: number;
  slots: number;
  moduleCapacity: number;
  speedMultiplier: number;
}

export interface TradeFuel {
  name: string;
  speedMultiplier: number;
  consumptionPerTrip: number;
  cohesionCost: number;
}

export interface TradeSetup {
  contractId: string;
  dockLevel: number;
  fuelName: string;
}

export interface TradeParams {
  baySlots: number;
  moduleSize: 'S' | 'M' | 'L';
  fuelTypeRaw: string;
  travelMode: 'normal' | 'special';
  profitBonus: number;
  unityDiscount: number;
}