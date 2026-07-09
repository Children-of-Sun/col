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
  costBase?: number;         // Focus 首级消耗
  costIncrement?: number;    // Focus 每级递增消耗
}

export interface Research {
  name: string;
  effectPerLevel: number[];
  maxLevel: number;
  targetCategory: string | string[];
  costFormula?: string;
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
  ship_fuel_configs?: any;
  populationWaste?: { item: string; ratePerPop: number };
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
  researchCohesion?: number;  // 研究所凝聚力消耗（每分钟），仅用于显示，不参与LP
  tradeUnityPer100?: number;
  tradeUnityDirect?: number;          // 贸易直接消耗（每分钟）
  tradeUnityMaintenance?: number;     // 贸易维持消耗（每分钟）
  _tradeDockName?: string;    // 贸易码头显示名称（用于占地面积查找）
  _tradeModuleName?: string;  // 贸易模块显示名称（用于占地面积查找）
  _tradeBaySlots?: number;    // 贸易码头舱位数（用于计算模块总占地面积）
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
export type IntegerMode = 'continuous' | 'ceil' | 'rounding' | 'milp';

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
  unityProduction: number;
  unityConsumption: number;
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
  tradeVoyageTime: number;
  selectedTradeContractIds: string[];
  selectedTradeRecipes: Recipe[];
  enableTradeModule: boolean;

  enableAgriculture: boolean;
  cropRotation: boolean;
  globalFertilizerType: 'organic' | 'I' | 'II';
  targetFertility: number;
  farms: FarmSetting[];

  enableFocusConsumption: boolean;

  officeBuildingEnabled: Record<string, boolean>;
  officeSelectedLevel: Record<string, number>;
  officeRecipeEnabled: Record<string, boolean>;

  solarEfficiency: number;
  medicalMultiplier: number;

  optimizationMode: 'machines' | 'labor' | 'cohesion' | 'area' | 'raw' | 'custom';
  customWeights: { machines: number; labor: number; cohesion: number; area: number; raw: number };
  buildingSizes: Record<string, { width: number; height: number }>;
  buildingSizesRaw: { theoretical: Record<string, { width: number; height: number }>; reference: Record<string, { width: number; height: number }> };
  useReferenceSizes: boolean;  // 是否使用参考尺寸（配套占地）
  excludePowerFootprint: boolean;  // 电力模块不计入占地面积
  excludeTradeFootprint: boolean;   // 贸易模块不计入占地面积

  // 新增字段
  integerMode: IntegerMode;
  milpTimeLimit: number;
  recipeIntegerEnabled: Record<string, boolean>;

  // 资源冗余设置
  enableRedundancy: boolean;
  globalLower: number;
  globalUpper: number;
  redundancyResources: Record<string, RedundancyResource>;
  redundancyAutoItems: Record<string, boolean>;  // 由取整开关自动设置的冗余项
  redundancyMilpDisabled: Record<string, boolean>;  // 混合模式下用户手动关闭的自动冗余项（跨模式记忆）

  // 凝聚力消耗细分
  cohesionTradeDirect: number;
  cohesionTradeMaintenance: number;
  cohesionEdict: number;

  // 面板折叠状态（持久化）
  officeCollapsed: Record<string, boolean>;
  farmCollapsed: Record<string, boolean>;
  buildingIcons: Record<string, string>;
  productIcons: Record<string, string>;
  productCategories: Record<string, string>;  // 物品名(lowercase) -> type
  showIcons: boolean;

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
  setMedicalMultiplier: (value: number) => void;
  toggleOther: (name: string) => void;
  setEdictLevel: (idx: number, lvl: number) => void;
  setOfficeLevel: (idx: number, lvl: number) => void;
  setResearchLevel: (idx: number, lvl: number) => void;
  setTradeContracts: (contracts: TradeContract[]) => void;
  setTradeContract: (contractId: string) => void;
  setTradeDockLevel: (level: number) => void;
  setTradeFuel: (fuelName: string) => void;
  setTradeParams: (params: Partial<TradeParams>) => void;
  setSelectedTradeContractIds: (ids: string[]) => void;
  setSelectedTradeRecipes: (recipes: Recipe[]) => void;
  setEnableTradeModule: (value: boolean) => void;
  setEnableAgriculture: (value: boolean) => void;
  setCropRotation: (value: boolean) => void;
  setGlobalFertilizerType: (value: string) => void;
  setTargetFertility: (value: number) => void;
  toggleFarm: (buildingId: string) => void;
  toggleCrop: (buildingId: string, cropName: string, enabled: boolean) => void;
  loadAgricultureBuildings: () => void;
  setEnableFocusConsumption: (value: boolean) => void;
  setOfficeBuildingEnabled: (id: string, value: boolean) => void;
  setOfficeLevelById: (id: string, level: number) => void;
  setOfficeRecipeEnabled: (id: string, value: boolean) => void;
  setSolarEfficiency: (value: number) => void;
  setOptimizationMode: (mode: StoreState['optimizationMode']) => void;
  setCustomWeights: (weights: Partial<StoreState['customWeights']>) => void;
  setBuildingSizes: (sizes: Record<string, { width: number; height: number }>) => void;
  setBuildingSizesRaw: (raw: { theoretical: Record<string, { width: number; height: number }>; reference: Record<string, { width: number; height: number }> }) => void;
  setUseReferenceSizes: (v: boolean) => void;
  setExcludePowerFootprint: (v: boolean) => void;
  setExcludeTradeFootprint: (v: boolean) => void;
  setExcludedOutputs: (items: string[]) => void;
  setExcludedInputs: (items: string[]) => void;
  setExcludedItems: (items: string[]) => void;

  // 新增 actions
  setIntegerMode: (mode: IntegerMode) => void;
  setRedundancyFactor: (value: number) => void;
  setMilpTimeLimit: (seconds: number) => void;
  setCohesionTradeDirect: (value: number) => void;
  setCohesionTradeMaintenance: (value: number) => void;
  setCohesionEdict: (value: number) => void;
  setBuildingIcons: (icons: Record<string, string>) => void;
  setProductIcons: (icons: Record<string, string>) => void;
  setProductCategories: (categories: Record<string, string>) => void;
  setShowIcons: (show: boolean) => void;
  setOfficeCollapsed: (v: Record<string, boolean>) => void;
  setFarmCollapsed: (v: Record<string, boolean>) => void;
  setEnableRedundancy: (v: boolean) => void;
  setGlobalLower: (v: number) => void;
  setGlobalUpper: (v: number) => void;
  setRedundancyResources: (r: Record<string, RedundancyResource>) => void;
  setRedundancyAutoItems: (items: Record<string, boolean>) => void;
  setRedundancyMilpDisabled: (items: Record<string, boolean>) => void;
}

export interface SolverResult {
  Status?: string;
  status?: string;
  Columns?: Record<string, { Primal: number }>;
  columns?: Record<string, { primal: number }>;
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

// ==================== 农业模块类型 ====================
export interface CropSetting {
  cropName: string;
  enabled: boolean;
  baseRecipeId: string;
  // 基准数据（来自基准建筑 Irrigated Farm 的有机肥配方）
  baseWaterPerMin: number;
  baseFertilizerPerMin: number;   // 基准肥料单位/分（有机肥）
  baseCropPerMin: number;
  baseFc: number;                  // 基础肥力消耗 %/min
}

export interface FarmSetting {
  buildingId: string;
  buildingName: string;
  enabled: boolean;
  level: number;
  crops: CropSetting[];
}

// ==================== 资源冗余类型 ====================
export interface RedundancyResource {
  enabled: boolean;   // 该资源是否启用冗余
  lower: number;      // 下限百分比 (50-150)
  upper: number;      // 上限百分比 (50-150)
}