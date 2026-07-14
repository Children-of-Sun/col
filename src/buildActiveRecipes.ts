import { useStore } from './stores';
import { Recipe, Demand, CropSetting, LevelEntry, BuildingRaw, Research as ResearchType } from './types';
import {
  getMaintenanceReduction,
  getRecycleRate,
  calcResidentDemands,
  calcResidentWaste,
  getMaintenanceWasteMap,
  ROCKET_BASE,
  STATION_PARTS_RATE,
  CREW_SUPPLIES_RATE,
  SPACE_CARGO_ITEMS,
  t,
  getSeriesName,
} from './utils';
import { getAgricultureMultipliers } from './utils/agricultureMultipliers';
import { buildTradeRecipe } from './utils/trade';

export interface ActiveRecipesResult {
  mainActive: Recipe[];
  powerActive: Recipe[];
  residentActive: Recipe[];
  stationActive: Recipe[];
  specialActive: Recipe[];
  tradeActive: Recipe[];
  ignored: Set<string>;
  excludedOutputs: Set<string>;
  excludedInputs: Set<string>;
  reductionFactor: number;
  allExternalSupplies: { item: string; rate: number }[];
  fixedUnityProduction: number;
  fixedUnityConsumption: number;
  tradeUnityConsumptionTotal: number;
  tradeUnityDirectTotal: number;
  tradeUnityMaintenanceTotal: number;
  positiveDemands: Demand[];
}

export function buildActiveRecipes(
  state: ReturnType<typeof useStore.getState>,
  solarEfficiency: number,
  getFixedDemands: () => Demand[],
): ActiveRecipesResult | null {
  const {
    tradeParams, selectedTradeContractIds, tradeContracts, gameData, translation,
    edictLevels, officeLevels, researchLevels, enableTradeModule,
  } = state;

  // ========== 贸易模块 ==========
  let tradeActive: Recipe[] = [];
  let tradeUnityDirectTotal = 0;
  let tradeUnityMaintenanceTotal = 0;

  if (enableTradeModule && selectedTradeContractIds.length > 0 && tradeContracts.length > 0) {
    let profitBonusFromOffice = 0;
    let unityDiscountFromOffice = 0;
    if (gameData) {
      const profitOffice = gameData.office.find(o => o.name === '合同利润率');
      if (profitOffice) {
        const idx = gameData.office.indexOf(profitOffice);
        const lvl = officeLevels[idx] || 0;
        profitBonusFromOffice = profitOffice.effectPerLevel * lvl * 100;
      }
      const unityOffice = gameData.office.find(o => o.name === '合同凝聚力消耗');
      if (unityOffice) {
        const idx = gameData.office.indexOf(unityOffice);
        const lvl = officeLevels[idx] || 0;
        unityDiscountFromOffice = -unityOffice.effectPerLevel * lvl * 100;
      }
    }

    const newTradeRecipes: Recipe[] = [];
    for (const contract of tradeContracts) {
      if (!selectedTradeContractIds.includes(contract.id)) continue;
      const { recipe } = buildTradeRecipe({
        contract,
        baySlots: tradeParams.baySlots,
        moduleSize: tradeParams.moduleSize,
        fuelTypeRaw: tradeParams.fuelTypeRaw,
        travelMode: tradeParams.travelMode,
        profitBonusPercent: profitBonusFromOffice,
        unityDiscountPercent: unityDiscountFromOffice,
        tradeVoyageTime: state.tradeVoyageTime,
        gameData,
        fullData: state.fullData,
        translation,
        edictLevels: state.edictLevels,
        researchLevels: state.researchLevels,
      });
      if (recipe) {
        newTradeRecipes.push(recipe);
        tradeUnityDirectTotal += recipe.tradeUnityDirect || 0;
        tradeUnityMaintenanceTotal += recipe.tradeUnityMaintenance || 0;
      }
    }
    if (newTradeRecipes.length) {
      state.setSelectedTradeRecipes(newTradeRecipes);
      tradeActive = newTradeRecipes;
    }
  }

  // ========== 过滤启用的配方 ==========
  const active = state.recipes.filter(r => {
    if (!state.recipeEnabled[r.id]) return false;
    const sn = (r.module === 'power')
      ? state.powerSeriesList.find(ps => ps.levels.some((lv: LevelEntry) => lv.buildingId === r.buildingId))?.name
      : state.mainSeriesList.find(ms => ms.levels.some((lv: LevelEntry) => lv.buildingId === r.buildingId))?.name;
    if (sn) {
      if (r.module === 'power') {
        if (!state.powerEnabled[sn]) return false;
        return state.powerSelectedLevel[sn] === r.buildingLevel;
      } else {
        if (!state.mainEnabled[sn]) return false;
        return state.mainSelectedLevel[sn] === r.buildingLevel;
      }
    } else {
      return r.module === 'main';
    }
  });

  if (!active.length && !state.enableAgriculture) {
    return null;
  }

  const ignored = new Set(state.ignoredItems);
  const excludedOutputs = new Set(state.excludedOutputs);
  const excludedInputs = new Set(state.excludedInputs);
  const reductionFactorBase = getMaintenanceReduction(state.statueCount);
  let fixedDemands = getFixedDemands();

  const modifiedActive = active.map(r => ({
    ...r, inputs: { ...r.inputs }, outputs: { ...r.outputs }, upkeep: { ...r.upkeep }
  }));

  // ========== 太阳能加成 ==========
  let solarBonusMultiplier = 1;
  if (gameData) {
    const cleanPanelEdict = gameData.edicts.find(e => e.name === '清洁面板');
    if (cleanPanelEdict) {
      const lvl = edictLevels[gameData.edicts.indexOf(cleanPanelEdict)] ?? -1;
      if (lvl >= 0) solarBonusMultiplier *= (1 + cleanPanelEdict.effectPerLevel[lvl]);
    }
    const solarResearch = gameData.research.find(r => r.name === '太阳能发电');
    if (solarResearch) {
      const lvl = researchLevels[gameData.research.indexOf(solarResearch)] || 0;
      if (lvl > 0) solarBonusMultiplier *= (1 + solarResearch.effectPerLevel[0] * lvl);
    }
  }
  const finalSolarEfficiency = solarEfficiency * solarBonusMultiplier;

  modifiedActive.forEach(recipe => {
    if (recipe.isSolar && recipe.outputs['electricity']) {
      recipe.outputs['electricity'] *= finalSolarEfficiency;
    }
  });

  // ========== 农业产量加成 ==========
  const multipliers = getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels);
  const farmOutputMultiplier = multipliers.output;
  const totalFarmWaterMultiplier = multipliers.water;

  // ========== 农业系统 ==========
  if (state.enableAgriculture) {
    const calculateRecipe = (crop: CropSetting, ft: number, p: number, fertValue: number) => {
      const waterPerMin = crop.baseWaterPerMin;
      const fc = crop.baseFc;
      let requiredFertility: number;
      if (ft <= 1.0) {
        requiredFertility = fc * p - 3 * (1 - ft);
      } else {
        requiredFertility = fc * p + 2 * (fc * p + 3) * (ft - 1);
      }
      const fertilizerPerMin = Math.max(0, requiredFertility / fertValue);
      const cropPerMin = crop.baseCropPerMin * ft;
      return { waterPerMin, fertilizerPerMin, cropPerMin };
    };

    const fertValue = state.globalFertilizerType === 'organic' ? 1 : (state.globalFertilizerType === 'I' ? 2 : 2.5);
    const P = state.cropRotation ? 1.0 : 1.5;
    const FT = state.targetFertility / 100;

    const farmBuildingIds = state.farms.map(f => f.buildingId);
    for (let i = modifiedActive.length - 1; i >= 0; i--) {
      if (farmBuildingIds.includes(modifiedActive[i].buildingId)) {
        modifiedActive.splice(i, 1);
      }
    }

    for (const farm of state.farms) {
      if (!farm.enabled) continue;
      for (const crop of farm.crops) {
        if (!crop.enabled) continue;
        const originalRecipe = state.recipes.find(r => r.id === crop.baseRecipeId);
        if (!originalRecipe) continue;
        const { waterPerMin, fertilizerPerMin, cropPerMin } = calculateRecipe(crop, FT, P, fertValue);
        const finalWaterPerMin = waterPerMin * totalFarmWaterMultiplier;
        const finalCropPerMin = cropPerMin * farmOutputMultiplier;
        const fertInputKey = state.globalFertilizerType === 'organic'
          ? 'fertilizer organic' : `fertilizer ${state.globalFertilizerType.toLowerCase()}`;
        const newRecipe: Recipe = {
          id: `agri_${farm.buildingId}_${crop.cropName}`,
          name: `${t(crop.cropName, translation)} (${t(farm.buildingName, translation)})`,
          buildingId: farm.buildingId,
          buildingName: farm.buildingName,
          category: '农业',
          buildingLevel: farm.level,
          duration: 60,
          inputs: { 'water': finalWaterPerMin, [fertInputKey]: fertilizerPerMin },
          outputs: { [crop.cropName.toLowerCase()]: finalCropPerMin },
          upkeep: originalRecipe.upkeep ? { ...originalRecipe.upkeep } : {},
          powerMultiplier: originalRecipe.powerMultiplier || 1,
          workers: originalRecipe.workers || 0,
          isSolar: false,
          isHidden: false,
          module: 'main',
        };
        modifiedActive.push(newRecipe);
      }
    }
  }

  // ========== 办公室建筑配方 ==========
  let focusBonusPerWorker = 0;
  if (gameData) {
    const focusResearch = gameData.research.find((r: ResearchType) => r.name === '专注点');
    if (focusResearch) {
      const idx = gameData.research.indexOf(focusResearch);
      const lvl = researchLevels[idx] || 0;
      if (lvl > 0) {
        const bonusPerWorkerPerLevel = focusResearch.effectPerLevel?.[0] || 0;
        focusBonusPerWorker = bonusPerWorkerPerLevel * lvl;
      }
    }
  }
  const buildingsSource = gameData?.machines_and_buildings || state.fullData?.machines_and_buildings;
  const officeBuildings = buildingsSource?.filter((b: any) => b.name?.startsWith('Office')) || [];
  for (const building of officeBuildings) {
    const enabled = state.officeBuildingEnabled[building.id];
    if (enabled === false) continue;
    building.recipes?.forEach((recipe: any) => {
      const recipeEnabled = state.officeRecipeEnabled[recipe.id];
      if (recipeEnabled === false) return;

      const inputs: Record<string, number> = {};
      const outputs: Record<string, number> = {};
      const upkeep: Record<string, number> = {};
      recipe.inputs?.forEach((i: any) => inputs[i.name.toLowerCase()] = i.quantity);
      recipe.outputs?.forEach((o: any) => outputs[o.name.toLowerCase()] = o.quantity);
      if (building.maintenance_cost_units && building.maintenance_cost_quantity) {
        upkeep[building.maintenance_cost_units.toLowerCase()] = building.maintenance_cost_quantity;
      }
      upkeep['人力'] = (upkeep['人力'] || 0) + building.workers;
      upkeep['electricity'] = (upkeep['electricity'] || 0) + (building.electricity_consumed || 0);
      if (building.computing_consumed) upkeep['computing'] = (upkeep['computing'] || 0) + building.computing_consumed;

      const durationMin = recipe.duration / 60;
      const scaledInputs: Record<string, number> = {};
      const scaledOutputs: Record<string, number> = {};
      for (const [k, v] of Object.entries(inputs)) scaledInputs[k] = (v as number) / durationMin;
      for (const [k, v] of Object.entries(outputs)) scaledOutputs[k] = (v as number) / durationMin;

      if (scaledOutputs['focus'] !== undefined && focusBonusPerWorker > 0) {
        scaledOutputs['focus'] += focusBonusPerWorker * building.workers;
      }

      const officeRecipe: Recipe = {
        id: recipe.id,
        name: recipe.name,
        buildingId: building.id,
        buildingName: building.name,
        category: '办公室',
        buildingLevel: 0,
        duration: 60,
        inputs: scaledInputs,
        outputs: scaledOutputs,
        upkeep,
        powerMultiplier: 1,
        workers: building.workers,
        isSolar: false,
        isHidden: false,
        module: 'main',
      };
      modifiedActive.push(officeRecipe);
    });
  }

  // ========== 特殊模块 ==========
  let specialActive: Recipe[] = [];

  if (gameData) {
    // 雕像
    if (state.statueCount > 0) {
      const statueRecipe: Recipe = {
        id: 'statue_module',
        name: '雕像 (The Statue of Maintenance)',
        buildingId: 'statue',
        buildingName: 'The Statue of Maintenance',
        category: '雕像',
        buildingLevel: 0,
        duration: 60,
        inputs: { 'fuel gas': state.statueCount * 2 },
        outputs: {},
        upkeep: {},
        powerMultiplier: 1,
        workers: 0,
        isSolar: false,
        isHidden: true,
        module: 'special',
      };
      const statueBuilding = state.fullData?.machines_and_buildings?.find(
        (b: BuildingRaw) => b.name === 'The Statue of Maintenance'
      );
      if (statueBuilding) {
        if (statueBuilding.maintenance_cost_units && statueBuilding.maintenance_cost_quantity) {
          statueRecipe.upkeep[statueBuilding.maintenance_cost_units.toLowerCase()] =
            statueBuilding.maintenance_cost_quantity * state.statueCount;
        }
        statueRecipe.workers = (statueBuilding.workers || 0) * state.statueCount;
        if (statueBuilding.electricity_consumed) {
          statueRecipe.inputs['electricity'] =
            (statueRecipe.inputs['electricity'] || 0) + statueBuilding.electricity_consumed * state.statueCount;
        }
        if (statueBuilding.computing_consumed) {
          statueRecipe.inputs['computing'] =
            (statueRecipe.inputs['computing'] || 0) + statueBuilding.computing_consumed * state.statueCount;
        }
      }
      specialActive.push(statueRecipe);
    }

    // 研究所
    if (state.labCount > 0 && state.labLevel) {
      const meta = state.labMeta.find(l => l.buildingId === state.labLevel);
      if (meta) {
        const isBasicLab = state.labLevel === 'ResearchLab' || (meta.name?.toLowerCase() === 'research lab');

        let baseOutput = 0;
        if (isBasicLab) {
          baseOutput = 3 * state.labCount;
        } else {
          for (const r of meta.recipes) {
            if (!state.recipeEnabled[r.id]) continue;
            for (const [item, qty] of Object.entries(r.inputs)) {
              if (item.toLowerCase().includes('lab equipment')) {
                const rate = (60 / r.duration) * (qty as number) * state.labCount;
                baseOutput += rate;
              }
            }
          }
        }

        let multiplier = 1;
        multiplier *= (1 + state.population * 0.00005);
        if (gameData) {
          const edict = gameData.edicts.find(e => e.name === '研究效率');
          if (edict) {
            const idx = gameData.edicts.indexOf(edict);
            const lvl = state.edictLevels[idx] ?? -1;
            if (lvl >= 0) multiplier *= (1 + (edict.effectPerLevel[lvl] || 0));
          }
          const office = gameData.office.find(o => o.name === '研究效率');
          if (office) {
            const idx = gameData.office.indexOf(office);
            const lvl = state.officeLevels[idx] || 0;
            if (lvl > 0) multiplier *= (1 + (office.effectPerLevel || 0) * lvl);
          }
        }
        multiplier *= (1 + state.stationLevel * 0.05);

        const finalOutput = baseOutput * multiplier;
        const labBuilding = state.fullData?.machines_and_buildings?.find((b: any) => b.id === state.labLevel);
        const unityCostPerBuilding = labBuilding?.unity_cost || 0;
        const researchCohesionTotal = unityCostPerBuilding * state.labCount;

        const labRecipe: Recipe = {
          id: `lab_module_${state.labLevel}`,
          name: `研究所 (${meta.name}) ×${state.labCount}`,
          buildingId: state.labLevel,
          buildingName: meta.name,
          category: '研究所',
          buildingLevel: meta.level,
          duration: 60,
          inputs: {},
          outputs: { 'research': finalOutput },
          upkeep: {},
          powerMultiplier: 1,
          workers: 0,
          isSolar: false,
          isHidden: true,
          module: 'special',
          isLab: true,
          researchCohesion: researchCohesionTotal,
        };

        meta.recipes.forEach((r: any) => {
          if (!state.recipeEnabled[r.id]) return;
          for (const [item, qty] of Object.entries(r.inputs)) {
            const rate = (60 / r.duration) * (qty as number) * state.labCount;
            labRecipe.inputs[item] = (labRecipe.inputs[item] || 0) + rate;
            if (r.outputs && (r.outputs.recyclables || r.outputs.Recyclables)) {
              const recycleRateOut = (60 / r.duration) *
                ((r.outputs.recyclables || r.outputs.Recyclables) as number) * state.labCount;
              labRecipe.outputs['recyclables'] = (labRecipe.outputs['recyclables'] || 0) + recycleRateOut;
            }
          }
        });
        for (const [item, qty] of Object.entries(meta.upkeep || {})) {
          labRecipe.upkeep[item.toLowerCase()] = (qty as number) * state.labCount;
        }
        specialActive.push(labRecipe);
      }
    }

    // 办公专注点消耗
    if (state.enableFocusConsumption) {
      let totalFocusPerMin = 0;
      if (gameData) {
        for (let i = 0; i < gameData.office.length; i++) {
          const off = gameData.office[i];
          const level = state.officeLevels[i] || 0;
          const base = off.costBase || 0;
          const inc = off.costIncrement || 0;
          let cost = 0;
          for (let l = 1; l <= level; l++) {
            cost += base + (l - 1) * inc;
          }
          totalFocusPerMin += cost;
        }
      }
      if (totalFocusPerMin > 0) {
        const focusRecipe: Recipe = {
          id: 'office_focus_consumption',
          name: t('办公升级专注点消耗', translation),
          buildingId: 'office',
          buildingName: t('办公升级', translation),
          category: '办公',
          buildingLevel: 0,
          duration: 60,
          inputs: { 'focus': totalFocusPerMin },
          outputs: {},
          upkeep: {},
          powerMultiplier: 1,
          workers: 0,
          isSolar: false,
          isHidden: true,
          module: 'special',
        };
        specialActive.push(focusRecipe);
      }
    }
  }

  // ========== 维护废料回收 ==========
  const recycleRate = getRecycleRate(
    gameData?.baseRecycleRate ?? 0.2,
    gameData?.edicts || [],
    state.edictLevels,
    gameData?.office || [],
    state.officeLevels
  );

  if (gameData) {
    const maintWasteMap = getMaintenanceWasteMap(gameData);
    const allWasteNames = gameData.wasteNames;
    const recyclableIndices = [0, 1, 2, 3, 4];
    const recyclableWasteNames = allWasteNames.slice(2);
    const recyclableWasteNamesLower = recyclableWasteNames.map(w => w.toLowerCase());

    const allRecipesForRecycling = [...modifiedActive, ...specialActive];
    allRecipesForRecycling.forEach(r => {
      recyclableWasteNames.forEach(wn => { delete r.outputs[wn]; });
    });

    allRecipesForRecycling.forEach(r => {
      const hasRecyclables = ((r.outputs['recyclables'] || r.outputs['Recyclables']) || 0) > 0;
      if (!hasRecyclables) return;
      for (const [inputItem, inputQty] of Object.entries(r.inputs)) {
        const inputItemLower = inputItem.toLowerCase();
        let coeffs = maintWasteMap[inputItemLower];
        if (!coeffs) {
          const normalized = inputItemLower.replace(/\s/g, '');
          for (const key of Object.keys(maintWasteMap)) {
            if (key.replace(/\s/g, '') === normalized) {
              coeffs = maintWasteMap[key];
              break;
            }
          }
        }
        if (coeffs && coeffs.length >= 5) {
          const perCycleInput = inputQty;
          recyclableIndices.forEach((idx, i) => {
            const coeff = coeffs[idx];
            if (coeff !== 0) {
              const wasteItem = recyclableWasteNamesLower[i];
              const added = perCycleInput * coeff * recycleRate;
              r.outputs[wasteItem] = (r.outputs[wasteItem] || 0) + added;
            }
          });
        }
      }
    });

    // 维护产量加成
    let maintenanceOutputMultiplier = 1;
    const officeMaint = gameData?.office.find(o => o.name === '维修产量');
    if (officeMaint) {
      const lvl = officeLevels[gameData.office.indexOf(officeMaint)] || 0;
      if (lvl > 0) maintenanceOutputMultiplier *= (1 + officeMaint.effectPerLevel * lvl);
    }
    const researchMaint = gameData?.research.find(r => r.name === '维修产量');
    if (researchMaint) {
      const lvl = researchLevels[gameData.research.indexOf(researchMaint)] || 0;
      if (lvl > 0) maintenanceOutputMultiplier *= (1 + researchMaint.effectPerLevel[0] * lvl);
    }

    const allRecipesForMaint = [...modifiedActive, ...specialActive];
    allRecipesForMaint.forEach(r => {
      if (r.outputs['maintenance i']) r.outputs['maintenance i'] *= maintenanceOutputMultiplier;
      if (r.outputs['maintenance ii']) r.outputs['maintenance ii'] *= maintenanceOutputMultiplier;
      if (r.outputs['maintenance iii']) r.outputs['maintenance iii'] *= maintenanceOutputMultiplier;
    });
  }

  // 维护减免叠加
  let reductionFactor = reductionFactorBase;
  if (gameData) {
    const edictReduce = gameData.edicts.find(e => e.name === '减少维护');
    if (edictReduce) {
      const lvl = state.edictLevels[gameData.edicts.indexOf(edictReduce)] ?? -1;
      if (lvl >= 0) {
        reductionFactor += edictReduce.effectPerLevel[lvl];
      }
    }
    reductionFactor = Math.min(reductionFactor, 1);
  }

  // ========== 分类过滤 ==========
  let mainActive = modifiedActive.filter(r => {
    if (r.module !== 'main') return false;
    if (r.buildingId?.startsWith('ResearchLab')) return false;
    if (r.category === '农业' || r.category === '办公室') return true;
    if (!state.recipeEnabled[r.id]) return false;
    const sn = state.mainSeriesList.find(ms =>
      ms.levels.some((lv: LevelEntry) => lv.buildingId === r.buildingId))?.name;
    if (sn) {
      if (!state.mainEnabled[sn]) return false;
      if (state.mainSelectedLevel[sn] !== r.buildingLevel) return false;
      return state.mainBuildingEnabledMap[r.buildingId] !== false;
    }
    return state.mainBuildingEnabledMap[r.buildingId] !== false;
  });

  let powerActive = modifiedActive.filter(r => {
    if (!state.recipeEnabled[r.id] || r.module !== 'power') return false;
    const sn = state.powerSeriesList.find(ps =>
      ps.levels.some((lv: LevelEntry) => lv.buildingId === r.buildingId))?.name;
    if (!sn) return false;
    if (!state.powerEnabled[sn]) return false;
    if (state.powerSelectedLevel[sn] !== r.buildingLevel) return false;
    return state.powerBuildingEnabledMap[r.buildingId] !== false;
  });

  // ========== 居民模块 ==========
  let allExternalSupplies: { item: string; rate: number }[] = [];
  let unityProduction = 0;
  let unityConsumption = 0;

  const residentRecipe: Recipe = {
    id: 'resident_module',
    name: '居民模块',
    buildingId: 'resident',
    buildingName: '居民',
    category: '居民',
    buildingLevel: 0,
    duration: 60,
    inputs: {},
    outputs: {},
    upkeep: {},
    powerMultiplier: 1,
    workers: 0,
    isSolar: false,
    isHidden: true,
    module: 'resident',
  };

  if (gameData) {
    // 配方标准化使用至少1000人口，确保pop=0时也有正确的投入产出
    const recipePop = state.population > 0 ? state.population : 1000;
    const result = calcResidentDemands(
      gameData, recipePop, state.housingIndex,
      state.selectedFoods, state.selectedMedical, state.selectedOthers,
      state.edictLevels, state.officeLevels, state.researchLevels,
      recycleRate, state.stationLevel, state.medicalMultiplier
    );
    const residentDemands = result.demands;
    unityProduction = result.unityProduction;
    unityConsumption = result.unityConsumption;

    residentDemands.forEach(d => { residentRecipe.inputs[d.item] = d.rate; });

    const residentWastes = calcResidentWaste(gameData, residentDemands, recycleRate);
    residentWastes.forEach(w => {
      residentRecipe.outputs[w.item] = (residentRecipe.outputs[w.item] || 0) + w.rate;
    });

    const popWaste = gameData.populationWaste;
    if (popWaste) {
      const wasteAmount = popWaste.ratePerPop * state.population;
      residentRecipe.outputs[popWaste.item.toLowerCase()] =
        (residentRecipe.outputs[popWaste.item.toLowerCase()] || 0) + wasteAmount;
    }

    // 将居民模块标准化为"每1000人"单位，LP 可自由缩放
    const laborScale = recipePop / 1000;
    for (const k of Object.keys(residentRecipe.inputs)) {
      residentRecipe.inputs[k] /= laborScale;
    }
    for (const k of Object.keys(residentRecipe.outputs)) {
      residentRecipe.outputs[k] /= laborScale;
    }
    // 每单位（1000人）提供 1000 人力
    residentRecipe.outputs['人力'] = 1000;
  }

  const residentActive = [residentRecipe];

  // ========== 空间站模块 ==========
  const stationRecipe: Recipe = {
    id: 'station_module',
    name: '空间站模块',
    buildingId: 'station',
    buildingName: '空间站',
    category: '空间站',
    buildingLevel: 0,
    duration: 60,
    inputs: {},
    outputs: {},
    upkeep: {},
    powerMultiplier: 1,
    workers: 0,
    isSolar: false,
    isHidden: true,
    module: 'station',
  };

  // 辅助：获取物品的冗余上限因子（用于火箭运力计算）
  const getCargoFactor = (item: string): number => {
    if (!state.enableRedundancy) return 1.0;
    const res = state.redundancyResources?.[item];
    if (!res || res.enabled === false) return 1.0;
    const upperPct = res.upper === 100 ? state.globalUpper : res.upper;
    return Math.max(1.0, upperPct / 100);
  };

  // 自动计算的太空货物基础速率
  let stationPartsRate = 0;
  let crewSuppliesRate = 0;
  let labCargoRate = 0;
  if (state.stationLevel > 0) {
    stationPartsRate = state.stationLevel * STATION_PARTS_RATE;
    crewSuppliesRate = Math.max(0, (state.stationLevel - 1) * CREW_SUPPLIES_RATE);
    const meta = state.labMeta.find(l => l.buildingId === state.labLevel);
    if (meta && state.labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * state.labCount;
  }

  // 用户额外请求的太空货物（含冗余上限）
  const userSpaceCargoRate = state.demands
    .filter(d => SPACE_CARGO_ITEMS.has(d.item))
    .reduce((acc, d) => acc + d.rate * getCargoFactor(d.item), 0);

  // 总货物速率（含冗余上限），确保火箭运力足够
  const totalCargoRate =
    stationPartsRate * getCargoFactor('station parts') +
    crewSuppliesRate * getCargoFactor('crew supplies') +
    labCargoRate * getCargoFactor('electronics iv') +
    userSpaceCargoRate;

  if (state.stationLevel > 0 || userSpaceCargoRate > 0 || totalCargoRate > 0) {
    const rocket = ROCKET_BASE[state.rocketType];
    const rocketCargoResearch = gameData?.research?.find(r => r.name === '火箭载荷量');
    const rocketCargoLevel = rocketCargoResearch
      ? (state.researchLevels[gameData!.research.indexOf(rocketCargoResearch)] || 0) : 0;
    const cargoBonus = 1 + rocketCargoLevel * 0.05;
    const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (cargoBonus - 1);

    if (state.stationLevel > 0) {
      if (stationPartsRate > 0) stationRecipe.inputs['station parts'] = stationPartsRate;
      if (crewSuppliesRate > 0) stationRecipe.inputs['crew supplies'] = crewSuppliesRate;
      if (labCargoRate > 0) stationRecipe.inputs['electronics iv'] = labCargoRate;
    }

    const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;
    if (cargoRocketRate > 0) stationRecipe.inputs[rocket.cargoKey] = cargoRocketRate;

    if (state.stationLevel > 0) {
      const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (cargoBonus - 1);
      const crew = Math.max(0, (state.stationLevel - 1) * 2);
      const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
      const crewRocketRate = rocketsPerLaunch / 20;
      if (crewRocketRate > 0) stationRecipe.inputs[rocket.crewKey] = crewRocketRate;
    }
  }

  const stationActive = [stationRecipe];

  const totalUnityConsumption = unityConsumption;

  return {
    mainActive,
    powerActive,
    residentActive,
    stationActive,
    specialActive,
    tradeActive,
    ignored,
    excludedOutputs,
    excludedInputs,
    reductionFactor,
    allExternalSupplies,
    fixedUnityProduction: unityProduction,
    fixedUnityConsumption: totalUnityConsumption,
    tradeUnityConsumptionTotal: tradeUnityDirectTotal,
    tradeUnityDirectTotal,
    tradeUnityMaintenanceTotal,
    positiveDemands: [
      ...state.demands,
      ...fixedDemands.filter(d =>
        !ignored.has(d.item) &&
        !excludedOutputs.has(d.item) &&
        !excludedInputs.has(d.item) &&
        d.rate >= 0
      ),
    ],
  };
}
