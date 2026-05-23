import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from './stores';
import { MainLevelPanel, PowerPanel, SpaceStationPanel, StatuePanel, LabPanel, DemandPanel } from './components/Panels';
import { OptionsPanel } from './components/OptionsPanel';
import { LevelModal, RecipeModal, PowerRecipeModal, DemandModal, ExcludeModal } from './components/Modals';
import { Results } from './components/Results';
import { Btn, Checkbox } from './components/UI';
import ResidentPanel from './components/ResidentPanel';
import TechPanel from './components/TechPanel';
import EdictPanel from './components/EdictPanel';
import OfficePanel from './components/OfficePanel';
import { TradePanel } from './components/TradePanel';
import { AgriculturePanel } from './components/AgriculturePanel';
import { buildLp } from './lpBuilder';
import { ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS, getRecycleRate, calcResidentDemands, calcResidentWaste, getMaintenanceWasteMap } from './utils';
import { getAgricultureMultipliers } from './utils/agricultureMultipliers';
import { getMaintenanceReduction, t, isRaw, isPowerItem, getSeriesName, isMaintenanceRecyclingRecipe, computeImplicitCosts, getAdjustedCohesion } from './utils';
import { Demand, Recipe, DockLevel, TradeFuel, CropSetting } from './types';
import { calculateTrade } from './tradeCalculator';
import './App.css';
console.log('OptionsPanel imported:', OptionsPanel);

// 提取 buildActiveRecipes 函数，复用 buildLp 前的配方构建逻辑
const buildActiveRecipes = (
  state: ReturnType<typeof useStore.getState>,
  solarEfficiency: number,
  getFixedDemands: () => Demand[],
  getMaintenanceReduction: (statueCount: number) => number,
  getRecycleRate: (...args: any[]) => number,
  calcResidentDemands: (...args: any[]) => any,
  calcResidentWaste: (...args: any[]) => any,
  getMaintenanceWasteMap: (...args: any[]) => any,
  ROCKET_BASE: any,
  STATION_PARTS_RATE: number,
  CREW_SUPPLIES_RATE: number,
  SPACE_CARGO_ITEMS: Set<string>,
  t: (s: string, trans: any) => string
) => {
  const { tradeParams, selectedTradeContractIds, tradeContracts, gameData, translation, edictLevels, officeLevels, researchLevels, enableTradeModule } = state;
  let tradeActive: Recipe[] = [];
  let tradeUnityConsumptionTotal = 0;
  let tradeUnityDirectTotal = 0;
  let tradeUnityMaintenanceTotal = 0;

  if (enableTradeModule && selectedTradeContractIds.length > 0 && tradeContracts.length > 0) {
    const moduleSpeed = { S: 125, M: 250, L: 500 }[tradeParams.moduleSize] || 250;
    const moduleCapacity = tradeParams.baySlots <= 4 ? 800 : 1200;
    const getTravelInfo = (slots: number, fuelRaw: string, mode: string) => {
      if (gameData?.ship_fuel_configs) {
        const dockKey = `dock_${slots}`;
        const dock = gameData.ship_fuel_configs[dockKey];
        if (dock && dock[fuelRaw] && dock[fuelRaw][mode]) {
          return {
            travelTime: dock[fuelRaw][mode].fuel_per_trip,
            fuelPerTrip: dock[fuelRaw][mode].travel_time_min,
          };
        }
      }
      return { travelTime: 3, fuelPerTrip: 200 };
    };
    const computeBestTrade = (contract: any, slots: number, moduleSpeed: number, moduleCapacity: number) => {
      const { buyRate, sellRate } = contract;
      let bestBuy = 0, bestSell = 0, bestM = 0, bestN = 0, bestLoadTime = 0;
      for (let m = 1; m < slots; m++) {
        const n = slots - m;
        const buy1 = Math.floor(m * moduleCapacity);
        const sell1 = Math.floor(buy1 * (sellRate / buyRate));
        const loadBuy1 = m > 0 ? buy1 / (m * moduleSpeed) : 0;
        const loadSell1 = n > 0 ? sell1 / (n * moduleSpeed) : 0;
        const load1 = Math.max(loadBuy1, loadSell1);
        if (sell1 <= n * moduleCapacity && buy1 > bestBuy) {
          bestBuy = buy1; bestSell = sell1; bestM = m; bestN = n; bestLoadTime = load1;
        }
        const sell2 = Math.floor(n * moduleCapacity);
        const buy2 = Math.floor(sell2 * (buyRate / sellRate));
        const loadBuy2 = m > 0 ? buy2 / (m * moduleSpeed) : 0;
        const loadSell2 = n > 0 ? sell2 / (n * moduleSpeed) : 0;
        const load2 = Math.max(loadBuy2, loadSell2);
        if (buy2 <= m * moduleCapacity && buy2 > bestBuy) {
          bestBuy = buy2; bestSell = sell2; bestM = m; bestN = n; bestLoadTime = load2;
        }
      }
      return { buy: bestBuy, sell: bestSell, m: bestM, n: bestN, loadTime: bestLoadTime };
    };
    const getDockMaintenance = (slots: number, moduleCount: number, moduleSize: string) => {
      let workers = slots * 2;
      const moduleWorkerMap = { S: 2, M: 3, L: 4 };
      workers += moduleCount * moduleWorkerMap[moduleSize as keyof typeof moduleWorkerMap];
      let electricity = slots * 100 + moduleCount * 50;
      let maintI = slots * 1 + moduleCount * 1;
      let maintII = slots * 0.5 + moduleCount * 0.5;
      let maintIII = 0;
      return { workers, electricity, maintI, maintII, maintIII };
    };

    const { travelTime, fuelPerTrip } = getTravelInfo(tradeParams.baySlots, tradeParams.fuelTypeRaw, tradeParams.travelMode);

    // 从办公等级计算利润加成和凝聚力减免（覆盖 tradeParams 中的手动值）
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
    const finalProfitBonus = profitBonusFromOffice;
    const finalUnityDiscount = unityDiscountFromOffice;
    const profitFactor = 1 + finalProfitBonus / 100;
    const unityDiscountFactor = 1 - finalUnityDiscount / 100;
    const newTradeRecipes: Recipe[] = [];
    for (const contract of tradeContracts) {
      if (!selectedTradeContractIds.includes(contract.id)) continue;
      const adjustedContract = { ...contract, buyRate: contract.buyRate * profitFactor };
      const { buy, sell, m, n, loadTime } = computeBestTrade(adjustedContract, tradeParams.baySlots, moduleSpeed, moduleCapacity);
      if (buy === 0) continue;
      const totalTime = travelTime + loadTime;
      const perMinBuy = buy / totalTime;
      const perMinSell = sell / totalTime;
      const perMinFuel = fuelPerTrip / totalTime;
      const totalModules = m + n;
      const { workers, electricity, maintI, maintII, maintIII } = getDockMaintenance(tradeParams.baySlots, totalModules, tradeParams.moduleSize);
      const perMinWorkers = workers / totalTime;
      const perMinElectricity = electricity / totalTime;
      const perMinMaintI = maintI / totalTime;
      const perMinMaintII = maintII / totalTime;
      const perMinMaintIII = maintIII / totalTime;
      const perMinUnityDirect = (perMinBuy / 100) * (contract.unity_per_100_bought || 0) * unityDiscountFactor;
      const perMinUnityMaintenance = (contract.unity_per_month || 0) * unityDiscountFactor;

      // 累加消耗（直接用于显示，维持不参与求解）
      tradeUnityDirectTotal += perMinUnityDirect;
      tradeUnityMaintenanceTotal += perMinUnityMaintenance;
      tradeUnityConsumptionTotal += perMinUnityDirect; // 注意：只加直接消耗

      const recipe: Recipe = {
        id: `trade_${contract.id}`,
        name: `贸易: ${t(contract.name || contract.id, translation)}`,
        buildingId: 'trade',
        buildingName: t('贸易码头', translation),
        category: '贸易',
        buildingLevel: 0,
        duration: 1,
        inputs: {
          [contract.sellItem.toLowerCase()]: perMinSell,
          [tradeParams.fuelTypeRaw.toLowerCase()]: perMinFuel,
        },
        outputs: {
          [contract.buyItem.toLowerCase()]: perMinBuy,
        },
        upkeep: {
          '人力': perMinWorkers,
          'electricity': perMinElectricity,
          'maintenance i': perMinMaintI,
          'maintenance ii': perMinMaintII,
          'maintenance iii': perMinMaintIII,
          '凝聚力': perMinUnityDirect,   // 只包含直接消耗
        },
        powerMultiplier: 1,
        workers: perMinWorkers,
        isSolar: false,
        isHidden: false,
        module: 'trade',
        tradeUnityDirect: perMinUnityDirect,
        tradeUnityMaintenance: perMinUnityMaintenance,
      };
      newTradeRecipes.push(recipe);
    }
    if (newTradeRecipes.length) {
      state.setSelectedTradeRecipes(newTradeRecipes);
      tradeActive = newTradeRecipes;
    } else {
      tradeActive = [];
    }
  } else {
    tradeActive = [];
  }

      // 仅在凝聚力模式下，根据隐含成本调整贸易配方的凝聚力消耗
    /*if (state.optimizationMode === 'cohesion' && tradeActive.length > 0) {
      console.log('=== 调整贸易凝聚力（隐含成本） ===');
      const costs = computeImplicitCosts(tradeActive);
      console.log('物品隐含成本:', [...costs.entries()].slice(0, 20));
      for (const recipe of tradeActive) {
        const original = recipe.upkeep['凝聚力'] || 0;
        const adjusted = getAdjustedCohesion(recipe, costs);
        console.log(`${recipe.name}: 原始=${original.toFixed(4)}, 调整后=${adjusted.toFixed(4)}`);
        recipe.upkeep['凝聚力'] = adjusted;
      }
    }*/

  const active = state.recipes.filter(r => {
    if (!state.recipeEnabled[r.id]) return false;
    const sn = (r.module === 'power') ?
      state.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name :
      state.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
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

  const modifiedActive = active.map(r => ({ ...r, inputs: { ...r.inputs }, outputs: { ...r.outputs }, upkeep: { ...r.upkeep } }));

  // 计算太阳能额外加成
  let solarBonusMultiplier = 1;
  // 清洁面板法令
  if (gameData) {
    const cleanPanelEdict = gameData.edicts.find(e => e.name === '清洁面板');
    if (cleanPanelEdict) {
      const lvl = edictLevels[gameData.edicts.indexOf(cleanPanelEdict)] ?? -1;
      if (lvl >= 0) solarBonusMultiplier *= (1 + cleanPanelEdict.effectPerLevel[lvl]);
    }
    // 研究太阳能发电
    const solarResearch = gameData.research.find(r => r.name === '太阳能发电');
    if (solarResearch) {
      const lvl = researchLevels[gameData.research.indexOf(solarResearch)] || 0;
      if (lvl > 0) solarBonusMultiplier *= (1 + solarResearch.effectPerLevel[0] * lvl);
    }
  }
  // 最终太阳能效率 = 基础太阳能效率 * 加成
  const finalSolarEfficiency = solarEfficiency * solarBonusMultiplier;

  // 应用太阳能效率
  modifiedActive.forEach(recipe => {
    if (recipe.isSolar && recipe.outputs['electricity']) {
      recipe.outputs['electricity'] *= finalSolarEfficiency;
    }
  });

  // ========== 农业产量加成（提前计算，供农业配方生成使用） ==========
  const multipliers = getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels);
  const farmOutputMultiplier = multipliers.output;
  const totalFarmWaterMultiplier = multipliers.water;
  console.log('[农业加成] 产出倍率:', farmOutputMultiplier, '水消耗倍率:', totalFarmWaterMultiplier);

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

    // 删除所有农场建筑的原始配方（通过 buildingId 列表）
    const farmBuildingIds = state.farms.map(f => f.buildingId);
    for (let i = modifiedActive.length - 1; i >= 0; i--) {
      if (farmBuildingIds.includes(modifiedActive[i].buildingId)) {
        modifiedActive.splice(i, 1);
      }
    }

    // 生成新配方
    for (const farm of state.farms) {
      if (!farm.enabled) continue;
      for (const crop of farm.crops) {
        if (!crop.enabled) continue;
        // 从原始配方复制 upkeep 和 workers
        const originalRecipe = state.recipes.find(r => r.id === crop.baseRecipeId);
        if (!originalRecipe) continue;
        const { waterPerMin, fertilizerPerMin, cropPerMin } = calculateRecipe(crop, FT, P, fertValue);

        // 应用全局加成
        const finalWaterPerMin = waterPerMin * totalFarmWaterMultiplier;
        const finalCropPerMin = cropPerMin * farmOutputMultiplier;

        const fertInputKey = state.globalFertilizerType === 'organic' ? 'fertilizer organic' : `fertilizer ${state.globalFertilizerType.toLowerCase()}`;
        const newRecipe: Recipe = {
          id: `agri_${farm.buildingId}_${crop.cropName}`,
          name: `${t(crop.cropName, translation)} (${t(farm.buildingName, translation)})`,
          buildingId: farm.buildingId,
          buildingName: farm.buildingName,
          category: '农业',
          buildingLevel: farm.level,
          duration: 60,  // 关键修复：设为60，避免 LP 缩放
          inputs: {
            'water': finalWaterPerMin,
            [fertInputKey]: fertilizerPerMin,
          },
          outputs: {
            [crop.cropName.toLowerCase()]: finalCropPerMin,
          },
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




  // ========== 办公室建筑配方（主模块） ==========
  let focusBonusPerWorker = 0;
  if (gameData) {
    const focusResearch = gameData.research.find((r: any) => r.name === '专注点');
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
  console.log('办公室建筑数量:', officeBuildings.length);
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

      // 应用专注点科技加成（每工人额外 Focus 产量）
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
      console.log(`添加办公室配方: ${recipe.name}`);
    });
  }


  // ========== 提前构建 specialActive（雕像、研究所、办公Focus消耗） ==========
  const currentGameData = gameData;
  let specialActive: Recipe[] = [];

  if (currentGameData) {
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
        (b: any) => b.name === 'The Statue of Maintenance'
      );
      if (statueBuilding) {
        if (statueBuilding.maintenance_cost_units && statueBuilding.maintenance_cost_quantity) {
          statueRecipe.upkeep[statueBuilding.maintenance_cost_units.toLowerCase()] = statueBuilding.maintenance_cost_quantity * state.statueCount;
        }
        statueRecipe.workers = (statueBuilding.workers || 0) * state.statueCount;
        if (statueBuilding.electricity_consumed) {
          statueRecipe.inputs['electricity'] = (statueRecipe.inputs['electricity'] || 0) + statueBuilding.electricity_consumed * state.statueCount;
        }
        if (statueBuilding.computing_consumed) {
          statueRecipe.inputs['computing'] = (statueRecipe.inputs['computing'] || 0) + statueBuilding.computing_consumed * state.statueCount;
        }
      }
      specialActive.push(statueRecipe);
    }

    // 研究所
    if (state.labCount > 0 && state.labLevel) {
      const meta = state.labMeta.find(l => l.buildingId === state.labLevel);
      console.log('[研究所] labCount:', state.labCount, 'labLevel:', state.labLevel, 'meta:', meta);
      if (meta) {
        console.log('[研究所] 启用的配方:', meta.recipes.filter(r => state.recipeEnabled[r.id]).map(r => r.id));
        
        // 获取建筑数据中的 unity_cost（每分钟凝聚力消耗）
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
          outputs: { 'research': 48 * (1 + state.stationLevel * 0.05) * state.labCount },
          upkeep: {},
          powerMultiplier: 1,
          workers: 0,
          isSolar: false,
          isHidden: true,
          module: 'special',
          isLab: true,
          researchCohesion: researchCohesionTotal,  // 直接赋值
        };
        
        meta.recipes.forEach((r: any) => {
          if (!state.recipeEnabled[r.id]) return;
          for (const [item, qty] of Object.entries(r.inputs)) {
            const rate = (60 / r.duration) * (qty as number) * state.labCount;
            labRecipe.inputs[item] = (labRecipe.inputs[item] || 0) + rate;
            if (r.outputs && (r.outputs.recyclables || r.outputs.Recyclables)) {
              const recycleRateOut = (60 / r.duration) * ((r.outputs.recyclables || r.outputs.Recyclables) as number) * state.labCount;
              labRecipe.outputs['recyclables'] = (labRecipe.outputs['recyclables'] || 0) + recycleRateOut;
            }
          }
        });
        for (const [item, qty] of Object.entries(meta.upkeep || {})) {
          labRecipe.upkeep[item.toLowerCase()] = (qty as number) * state.labCount;
        }
        // 不再处理 upkeeping['凝聚力']
        
        console.log('[研究所] 凝聚力消耗:', researchCohesionTotal, '/分');
        console.log('[研究所] 输入物品:', labRecipe.inputs);
        console.log('[研究所] 输出物品:', labRecipe.outputs);
        specialActive.push(labRecipe);
        console.log('[实验室废物] 产出:', Object.entries(labRecipe.outputs).slice(0, 10));
      }
    }


    // ========== 办公专注点消耗 ==========
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
          console.log(`${off.name}: level=${level}, cost=${cost}`);
          totalFocusPerMin += cost;
        }
      }
      console.log('专注点总消耗:', totalFocusPerMin);
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

  // ========== 维护废料回收（同时处理 main/power 和 special） ==========
  const recycleRate = getRecycleRate(
    gameData?.baseRecycleRate ?? 0.2,
    gameData?.edicts,
    state.edictLevels,
    gameData?.office,
    state.officeLevels
  );

  console.log('[回收率] recycleRate =', recycleRate);

  if (currentGameData) {
    const maintWasteMap = getMaintenanceWasteMap(currentGameData);
    console.log('[维护系数表]', maintWasteMap);
    const allWasteNames = currentGameData.wasteNames;
    const recyclableIndices = [0, 1, 2, 3, 4];
    const recyclableWasteNames = allWasteNames.slice(2);
    const recyclableWasteNamesLower = recyclableWasteNames.map(w => w.toLowerCase());

    // 清理所有配方（main+power+special）中已有的可回收废料输出
    const allRecipesForRecycling = [...modifiedActive, ...specialActive];
    allRecipesForRecycling.forEach(r => {
      recyclableWasteNames.forEach(wn => {
        delete r.outputs[wn];
      });
    });

    // 为每个有 recyclables 输出的配方生成具体废料
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
      // 删除原始的 recyclables 输出
      delete r.outputs['recyclables'];
      delete r.outputs['Recyclables'];
    });

    console.log('[维护废料] 示例配方:', modifiedActive.find(r => r.outputs['recyclables']));
    console.log('[废料生成示例]', modifiedActive.slice(0, 3).map(r => ({ name: r.name, outputs: r.outputs })));

    // ========== 维护产量加成 ==========
    let maintenanceOutputMultiplier = 1;
    // 办公维修产量
    const officeMaint = gameData?.office.find(o => o.name === '维修产量');
    if (officeMaint) {
      const lvl = officeLevels[gameData.office.indexOf(officeMaint)] || 0;
      if (lvl > 0) maintenanceOutputMultiplier *= (1 + officeMaint.effectPerLevel * lvl);
    }
    // 研究维修产量
    const researchMaint = gameData?.research.find(r => r.name === '维修产量');
    if (researchMaint) {
      const lvl = researchLevels[gameData.research.indexOf(researchMaint)] || 0;
      if (lvl > 0) maintenanceOutputMultiplier *= (1 + researchMaint.effectPerLevel[0] * lvl);
    }

    // 对 modifiedActive 和 specialActive 中所有配方，如果输出了 maintenance i/ii/iii，则乘以乘数
    const allRecipesForMaint = [...modifiedActive, ...specialActive];
    allRecipesForMaint.forEach(r => {
      if (r.outputs['maintenance i']) r.outputs['maintenance i'] *= maintenanceOutputMultiplier;
      if (r.outputs['maintenance ii']) r.outputs['maintenance ii'] *= maintenanceOutputMultiplier;
      if (r.outputs['maintenance iii']) r.outputs['maintenance iii'] *= maintenanceOutputMultiplier;
    });
  }

  let reductionFactor = reductionFactorBase;
  if (currentGameData) {
    const edictReduce = currentGameData.edicts.find(e => e.name === '减少维护');
    if (edictReduce) {
      const lvl = state.edictLevels[currentGameData.edicts.indexOf(edictReduce)] ?? -1;
      if (lvl >= 0) {
        reductionFactor += edictReduce.effectPerLevel[lvl];
      }
    }
    reductionFactor = Math.min(reductionFactor, 1);
  }

  let mainActive = modifiedActive.filter(r => {
    if (r.module !== 'main') return false;
    // 农业配方无条件通过（不检查 recipeEnabled 和等级）
    if (r.category === '农业' || r.category === '办公室') return true;
    if (!state.recipeEnabled[r.id]) return false;
    const sn = state.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
    if (sn) {
      if (!state.mainEnabled[sn]) return false;
      if (state.mainSelectedLevel[sn] !== r.buildingLevel) return false;
      return state.mainBuildingEnabledMap[r.buildingId] !== false;
    }
    return state.mainBuildingEnabledMap[r.buildingId] !== false;
  });

  let powerActive = modifiedActive.filter(r => {
    if (!state.recipeEnabled[r.id] || r.module !== 'power') return false;
    const sn = state.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
    if (!sn) return false;
    if (!state.powerEnabled[sn]) return false;
    if (state.powerSelectedLevel[sn] !== r.buildingLevel) return false;
    return state.powerBuildingEnabledMap[r.buildingId] !== false;
  });

  // 居民模块
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

  if (currentGameData) {
    const result = calcResidentDemands(
      currentGameData,
      state.population,
      state.housingIndex,
      state.selectedFoods,
      state.selectedMedical,
      state.selectedOthers,
      state.edictLevels,
      state.officeLevels,
      state.researchLevels,
      recycleRate,
      state.stationLevel
    );
    const residentDemands = result.demands;
    unityProduction = result.unityProduction;
    unityConsumption = result.unityConsumption;

    // 居民需求添加到 inputs
    residentDemands.forEach(d => {
      residentRecipe.inputs[d.item] = d.rate;
    });

    // 计算居民产生的废料（包括可回收和不可回收）
    const residentWastes = calcResidentWaste(
      currentGameData,
      residentDemands,
      recycleRate
    );
    console.log('[居民废料明细]', residentWastes);
    // 将废料添加到 outputs
    residentWastes.forEach(w => {
      residentRecipe.outputs[w.item] = (residentRecipe.outputs[w.item] || 0) + w.rate;
    });

    // 人口固定废物（例如 waste）
    const popWaste = currentGameData.populationWaste;
    if (popWaste) {
      const wasteAmount = popWaste.ratePerPop * state.population;
      residentRecipe.outputs[popWaste.item.toLowerCase()] = (residentRecipe.outputs[popWaste.item.toLowerCase()] || 0) + wasteAmount;
    }
  }

  console.log('[居民废物] 产出:', Object.entries(residentRecipe.outputs).filter(([k]) => k !== 'research'));
  console.log('[居民废料产出]', residentRecipe.outputs);

  const residentActive = [residentRecipe];

  // 空间站模块
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

  if (state.stationLevel > 0) {
    const rocket = ROCKET_BASE[state.rocketType];
    const rocketCargoResearch = currentGameData?.research.find(r => r.name === '火箭载荷量');
    const rocketCargoLevel = rocketCargoResearch ? (state.researchLevels[currentGameData.research.indexOf(rocketCargoResearch)] || 0) : 0;
    const cargoBonus = 1 + rocketCargoLevel * 0.05;
    const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (cargoBonus - 1);
    const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (cargoBonus - 1);

    const stationPartsRate = state.stationLevel * STATION_PARTS_RATE;
    const crewSuppliesRate = Math.max(0, (state.stationLevel - 1) * CREW_SUPPLIES_RATE);
    let labCargoRate = 0;
    const meta = state.labMeta.find(l => l.buildingId === state.labLevel);
    if (meta && state.labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * state.labCount;
    const userSpaceCargoRate = state.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((acc, d) => acc + d.rate, 0);

    const totalCargoRate = stationPartsRate + crewSuppliesRate + labCargoRate + userSpaceCargoRate;
    const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;

    const crew = Math.max(0, (state.stationLevel - 1) * 2);
    const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
    const crewRocketRate = rocketsPerLaunch / 20;

    if (stationPartsRate > 0) stationRecipe.inputs['station parts'] = stationPartsRate;
    if (crewSuppliesRate > 0) stationRecipe.inputs['crew supplies'] = crewSuppliesRate;
    if (labCargoRate > 0) stationRecipe.inputs['electronics iv'] = labCargoRate;
    state.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).forEach(d => {
      stationRecipe.inputs[d.item] = (stationRecipe.inputs[d.item] || 0) + d.rate;
    });
    if (crewRocketRate > 0) stationRecipe.inputs[rocket.crewKey] = crewRocketRate;
    if (cargoRocketRate > 0) stationRecipe.inputs[rocket.cargoKey] = cargoRocketRate;
  }

  const stationActive = [stationRecipe];

  // 法令消耗已包含在 calcResidentDemands 返回的 unityConsumption 中
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
    tradeUnityConsumptionTotal,
    tradeUnityDirectTotal,
    tradeUnityMaintenanceTotal,
    positiveDemands: [...state.demands, ...fixedDemands.filter(d => !ignored.has(d.item) && !excludedOutputs.has(d.item) && !excludedInputs.has(d.item) && d.rate >= 0)],
  };
};

const DEBUG = (() => {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('factoryDebug') === 'true';
  }
  return false;
})();

declare global {
  interface Window {
    __hasAutoLoadedSettings?: boolean;
    __store: any;
    solveLp?: (lpString: string, varNames: string[]) => Promise<any>;
  }
}

export default function App() {
  const loadData = useStore(s => s.loadData);
  const loadTranslation = useStore(s => s.loadTranslation);
  const setResult = useStore(s => s.setResult);
  const setIsSolving = useStore(s => s.setIsSolving);
  const setDiagnostic = useStore(s => s.setDiagnostic);
  const dataLoaded = useStore(s => s.dataLoaded);
  const importSettings = useStore(s => s.importSettings);
  const setExternalSupplies = useStore(s => s.setExternalSupplies);
  const setSolverMissing = useStore(s => s.setSolverMissing);
  const setUnityProduction = useStore(s => s.setUnityProduction);
  const setUnityConsumption = useStore(s => s.setUnityConsumption);
  const setCohesionTradeDirect = useStore(s => s.setCohesionTradeDirect);
  const setCohesionTradeMaintenance = useStore(s => s.setCohesionTradeMaintenance);
  const setCohesionEdict = useStore(s => s.setCohesionEdict);
  const setTradeContracts = useStore(s => s.setTradeContracts);
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const gameData = useStore(s => s.gameData);
  const showIcons = useStore(s => s.showIcons);
  const setShowIcons = useStore(s => s.setShowIcons);

  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [powerRecipeModalOpen, setPowerRecipeModalOpen] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [excludeModalOpen, setExcludeModalOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'main' | 'power' | 'stationStatueLab' | 'trade' | 'agriculture' | 'resident' | 'edict' | 'office' | 'tech'>('main');

  useEffect(() => {
    window.__store = useStore;
    window.solveLp = solveLp;
    
    (async () => {
      try {
        const resp = await fetch('./data.json');
        if (resp.ok) {
          const json = await resp.json();
          loadData(json);
          // 构建建筑图标映射
          const buildingIcons: Record<string, string> = {};
          for (const b of json.machines_and_buildings) {
            if (b.icon_path) {
              const fileName = b.icon_path.split('/').pop() || '';
              buildingIcons[b.id] = `/icons/buildings/${fileName}`;
            }
          }
          useStore.getState().setBuildingIcons(buildingIcons);
        }
      } catch (e) { /* ignore */ }
      try {
        const resp = await fetch('./zh_en.json');
        if (resp.ok) loadTranslation(await resp.json());
      } catch (e) { /* ignore */ }
      try {
        const resp = await fetch('./factory_settings.json');
        if (resp.ok) importSettings(await resp.json());
      } catch (e) { /* ignore */ }
      try {
        const resp = await fetch('./GameData.json');
        if (resp.ok) useStore.getState().setGameData(await resp.json());
      } catch (e) { /* ignore */ }
      try {
        const resp = await fetch('./contracts.json');
        if (resp.ok) {
          const contractsData = await resp.json();
          const contracts = contractsData.contracts.map((c: any) => ({
            id: c.id,
            name: c.name || c.id,
            buyItem: c.product_to_buy_name.toLowerCase(),
            sellItem: c.product_to_pay_with_name.toLowerCase(),
            buyRate: c.product_to_buy_quantity,
            sellRate: c.product_to_pay_with_quantity,
            unity_per_100_bought: c.unity_per_100_bought,
            unity_per_month: c.unity_per_month,
            min_reputation_required: c.min_reputation_required,
          }));
          setTradeContracts(contracts);
        }
      } catch (e) { /* ignore */ }
      try {
        const resp = await fetch('./products.json');
        if (resp.ok) {
          const productsData = await resp.json();
          const productIcons: Record<string, string> = {};
          const productCategories: Record<string, string> = {};

          for (const p of productsData.products) {
            const nameLower = p.name.toLowerCase();
            // 分类
            productCategories[nameLower] = p.type || 'Other';

            if (p.icon_path) {
              const fileName = p.icon_path.split('/').pop() || '';
              productIcons[nameLower] = `/icons/products/${fileName}`;
            }
          }
          useStore.getState().setProductIcons(productIcons);
          useStore.getState().setProductCategories(productCategories);
          console.log('产品图标映射加载完成，共', Object.keys(productIcons).length, '个');
        }
      } catch (e) { console.error('加载 products.json 失败', e); }
      if (!window.__hasAutoLoadedSettings && localStorage.getItem('factorySettings')) {
        try {
          const s = JSON.parse(localStorage.getItem('factorySettings')!);
          useStore.getState().importSettings(s);
          const state = useStore.getState();
          const labBuildings = state.labMeta.map(meta => meta.buildingId);
          for (const buildingId of labBuildings) {
            const recipesForBuilding = state.recipes.filter(r => r.buildingId === buildingId && r.module === 'special');
            const enabledRecipes = recipesForBuilding.filter(r => state.recipeEnabled[r.id]);
            if (enabledRecipes.length > 1) {
              for (let i = 1; i < enabledRecipes.length; i++) {
                state.setRecipeEnabled(enabledRecipes[i].id, false);
              }
            }
          }
          window.__hasAutoLoadedSettings = true;
        } catch(e) {}
      }
    })();
  }, []);

  const getFixedDemands = useCallback((): Demand[] => {
    return [];
  }, []);

  // 基础 LP 求解函数
  const runLpSolver = (lpString: string, varNames: string[], integerMode?: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker('solver.worker.js');
      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error('求解超时'));
      }, 60000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve(e.data.result);
      };
      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(err.message));
      };
      // 在 milp 模式下传入 MIP 选项
      const options = integerMode === 'milp' ? { presolve: 'on', mip_max_nodes: 10000 } : undefined;
      worker.postMessage({ lpString, requestId: Date.now(), options });
    });
  };

  // solveLp：基础 LP 求解
  const solveLp = async (lpString: string, varNames: string[], integerMode?: string, tradeActive?: Recipe[], fixedUnityConsumption?: number, researchCohesionTotal?: number) => {
    const result = await runLpSolver(lpString, varNames, integerMode);
    console.log('求解结果变量示例:', Object.entries(result.Columns || {}).slice(0, 10));
    setResult(result);
    setIsSolving(false);
    if (result?.Status === 'Optimal') {
      setDiagnostic('');
      // 计算实际贸易消耗
      if (tradeActive && tradeActive.length) {
        let actualDirect = 0;
        let actualMaintenance = 0;
        tradeActive.forEach((recipe, idx) => {
          const varName = `tr${idx}`;
          const count = result.Columns?.[varName]?.Primal || result.columns?.[varName]?.Primal || 0;
          actualDirect += (recipe.tradeUnityDirect || 0) * count;
          actualMaintenance += (recipe.tradeUnityMaintenance || 0) * count;
        });
        setCohesionTradeDirect(actualDirect);
        setCohesionTradeMaintenance(actualMaintenance);
        setUnityConsumption(actualDirect + actualMaintenance + (fixedUnityConsumption || 0) + (researchCohesionTotal || 0));
      }
    } else if (result?.Status === 'Infeasible') {
      const prev = useStore.getState().diagnostic;
      setDiagnostic(prev + '<br>💡 当前设置无法平衡所有中间产物。请勾选"允许外部供给"或调整需求。');
    }
  };

  // solveCeilMode：向上取整模式（通过重新构建 LP 并传入 fixedMachines）
  const solveCeilMode = async (lpString: string, varNames: string[]) => {
    try {
      setDiagnostic('🔄 求解中 (取整模式)...');
      // 第一次 LP 求解
      const lpResult = await runLpSolver(lpString, varNames);
      if (lpResult?.Status !== 'Optimal') {
        setDiagnostic(`连续求解失败: ${lpResult?.Status || '未知'}`);
        setIsSolving(false);
        return;
      }

      // 提取机器变量并向上取整
      const machineVars = varNames.filter(v => !v.startsWith('r') && !v.startsWith('s') && !v.startsWith('t'));
      const fixed: Record<string, number> = {};
      for (const v of machineVars) {
        const val = lpResult.Columns?.[v]?.Primal || lpResult.columns?.[v]?.Primal || 0;
        fixed[v] = Math.ceil(val);
      }

      if (DEBUG) {
        console.log('=== 取整模式 ===');
        console.log('取整后的机器变量:', fixed);
      }

      // 重新构建 LP 并传入 fixedMachines
      const state = useStore.getState();
      const result = buildActiveRecipes(
        state,
        solarEfficiency,
        getFixedDemands,
        getMaintenanceReduction,
        getRecycleRate,
        calcResidentDemands,
        calcResidentWaste,
        getMaintenanceWasteMap,
        ROCKET_BASE,
        STATION_PARTS_RATE,
        CREW_SUPPLIES_RATE,
        SPACE_CARGO_ITEMS,
        t
      );

      if (!result) {
        setDiagnostic('没有启用的配方。');
        setIsSolving(false);
        return;
      }

      const { mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
        ignored, excludedOutputs, excludedInputs, reductionFactor, allExternalSupplies,
        fixedUnityProduction, fixedUnityConsumption, positiveDemands } = result;

      const { lpString: newLp, varNames: newVarNames } = buildLp({
        mainActive,
        powerActive,
        residentActive,
        stationActive,
        specialActive,
        tradeActive,
        ignored,
        demands: positiveDemands,
        externalSupplies: allExternalSupplies,
        reductionFactor,
        steamLowMode: state.steamLowMode as 'internal' | 'shared',
        excludedOutputs,
        excludedInputs,
        constraintMode: state.constraintMode,
        allowExternal: state.allowExternal,
        optimizationMode: state.optimizationMode,
        customWeights: state.customWeights,
        fixedUnityProduction,
        fixedUnityConsumption,
        integerMode: 'continuous', // 取整模式不需要 milp
        redundancy: 0,
        fixedMachines: fixed, // 传入固定值
      });

      const fixedResult = await runLpSolver(newLp, newVarNames);
      setResult(fixedResult);
      setIsSolving(false);
      if (fixedResult?.Status === 'Optimal') {
        setDiagnostic('✅ 取整模式求解完成');
      } else if (fixedResult?.Status === 'Infeasible') {
        setDiagnostic('⚠️ 取整后无解，尝试增加冗余...');
      }
    } catch (err: any) {
      setDiagnostic(`取整模式错误: ${err.message}`);
      setIsSolving(false);
    }
  };

  // solveHeuristicMode：启发式取整模式（通过重新构建 LP 并传入 fixedMachines）
  const solveHeuristicMode = async (lpString: string, varNames: string[]) => {
    try {
      setDiagnostic('🔄 求解中 (启发式模式)...');
      const fixed: Record<string, number> = {};
      const machineVars = varNames.filter(v => !v.startsWith('r') && !v.startsWith('s') && !v.startsWith('t'));

      // 逐步固定变量，每次重新构建 LP
      for (let iter = 0; iter < Math.min(machineVars.length, 20); iter++) {
        const state = useStore.getState();

        // 重新构建 LP
        const result = buildActiveRecipes(
          state,
          solarEfficiency,
          getFixedDemands,
          getMaintenanceReduction,
          getRecycleRate,
          calcResidentDemands,
          calcResidentWaste,
          getMaintenanceWasteMap,
          ROCKET_BASE,
          STATION_PARTS_RATE,
          CREW_SUPPLIES_RATE,
          SPACE_CARGO_ITEMS,
          t
        );

        if (!result) break;

        const { mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
          ignored, excludedOutputs, excludedInputs, reductionFactor, allExternalSupplies,
          fixedUnityProduction, fixedUnityConsumption, positiveDemands } = result;

        const { lpString: newLp, varNames: newVarNames } = buildLp({
          mainActive,
          powerActive,
          residentActive,
          stationActive,
          specialActive,
          tradeActive,
          ignored,
          demands: positiveDemands,
          externalSupplies: allExternalSupplies,
          reductionFactor,
          steamLowMode: state.steamLowMode as 'internal' | 'shared',
          excludedOutputs,
          excludedInputs,
          constraintMode: state.constraintMode,
          allowExternal: state.allowExternal,
          optimizationMode: state.optimizationMode,
          customWeights: state.customWeights,
          fixedUnityProduction,
          fixedUnityConsumption,
          integerMode: 'continuous',
          redundancy: 0,
          fixedMachines: fixed,
        });

        const lpResult = await runLpSolver(newLp, newVarNames);
        if (lpResult?.Status !== 'Optimal') break;

        // 找到最接近整数的变量（小数部分最大）
        let bestVar = '';
        let bestFraction = 0;
        for (const v of machineVars) {
          if (fixed[v] !== undefined) continue;
          const val = lpResult.Columns?.[v]?.Primal || lpResult.columns?.[v]?.Primal || 0;
          const frac = val - Math.floor(val);
          if (frac > bestFraction && frac < 0.999) {
            bestFraction = frac;
            bestVar = v;
          }
        }

        if (bestVar === '') break;

        // 固定该变量为向上取整的值
        const ceiled = Math.ceil(lpResult.Columns?.[bestVar]?.Primal || lpResult.columns?.[bestVar]?.Primal || 0);
        fixed[bestVar] = ceiled;

        if (DEBUG) {
          console.log(`启发式迭代 ${iter + 1}: 固定 ${bestVar} = ${ceiled}`);
        }
      }

      // 最终结果
      const state = useStore.getState();
      const finalResultData = buildActiveRecipes(
        state,
        solarEfficiency,
        getFixedDemands,
        getMaintenanceReduction,
        getRecycleRate,
        calcResidentDemands,
        calcResidentWaste,
        getMaintenanceWasteMap,
        ROCKET_BASE,
        STATION_PARTS_RATE,
        CREW_SUPPLIES_RATE,
        SPACE_CARGO_ITEMS,
        t
      );

      if (finalResultData) {
        const { mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
          ignored, excludedOutputs, excludedInputs, reductionFactor, allExternalSupplies,
          fixedUnityProduction, fixedUnityConsumption, positiveDemands } = finalResultData;

        const { lpString: finalLp, varNames: finalVarNames } = buildLp({
          mainActive,
          powerActive,
          residentActive,
          stationActive,
          specialActive,
          tradeActive,
          ignored,
          demands: positiveDemands,
          externalSupplies: allExternalSupplies,
          reductionFactor,
          steamLowMode: state.steamLowMode as 'internal' | 'shared',
          excludedOutputs,
          excludedInputs,
          constraintMode: state.constraintMode,
          allowExternal: state.allowExternal,
          optimizationMode: state.optimizationMode,
          customWeights: state.customWeights,
          fixedUnityProduction,
          fixedUnityConsumption,
          integerMode: 'continuous',
          redundancy: 0,
          fixedMachines: fixed,
        });

        const finalResult = await runLpSolver(finalLp, finalVarNames);
        setResult(finalResult);
        setIsSolving(false);
        if (finalResult?.Status === 'Optimal') {
          setDiagnostic(`✅ 启发式模式求解完成 (固定 ${Object.keys(fixed).length} 个变量)`);
        } else {
          setDiagnostic(`⚠️ 启发式求解状态: ${finalResult?.Status || '未知'}`);
        }
      } else {
        setIsSolving(false);
      }
    } catch (err: any) {
      setDiagnostic(`启发式模式错误: ${err.message}`);
      setIsSolving(false);
    }
  };

  const handleSolve = useCallback(async () => {
    const s = useStore.getState();

    // 使用 buildActiveRecipes 构建所有配方
    const result = buildActiveRecipes(
      s,
      solarEfficiency,
      getFixedDemands,
      getMaintenanceReduction,
      getRecycleRate,
      calcResidentDemands,
      calcResidentWaste,
      getMaintenanceWasteMap,
      ROCKET_BASE,
      STATION_PARTS_RATE,
      CREW_SUPPLIES_RATE,
      SPACE_CARGO_ITEMS,
      t
    );

    if (!result) {
      setDiagnostic('没有启用的配方。');
      return;
    }

    const { mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
      ignored, excludedOutputs, excludedInputs, reductionFactor, allExternalSupplies,
      fixedUnityProduction, fixedUnityConsumption, tradeUnityConsumptionTotal,
      tradeUnityDirectTotal, tradeUnityMaintenanceTotal, positiveDemands } = result;

    // 计算研究所凝聚力消耗（从 specialActive 中汇总）
    const researchCohesionTotal = specialActive
      .filter(r => (r as any).researchCohesion)
      .reduce((sum, r) => sum + ((r as any).researchCohesion || 0), 0);

    // 法令消耗已包含在 fixedUnityConsumption 中
    // 存储各项消耗到 store
    setCohesionTradeDirect(tradeUnityDirectTotal);
    setCohesionTradeMaintenance(tradeUnityMaintenanceTotal);
    setCohesionEdict(fixedUnityConsumption);
    setUnityProduction(fixedUnityProduction);
    setUnityConsumption(fixedUnityConsumption + tradeUnityDirectTotal + tradeUnityMaintenanceTotal + researchCohesionTotal);
    setExternalSupplies(allExternalSupplies);
    useStore.getState().setSolverFixedDemands(getFixedDemands().filter(d => d.rate > 0));

    const effectiveAllowExternal = s.allowExternal;
    const optimizationMode = s.optimizationMode;
    const customWeights = s.customWeights;
    const integerMode = s.integerMode;

    const { lpString, varNames, missing } = buildLp({
      mainActive,
      powerActive,
      residentActive,
      stationActive,
      specialActive,
      tradeActive,
      ignored,
      demands: positiveDemands,
      externalSupplies: allExternalSupplies,
      reductionFactor,
      steamLowMode: s.steamLowMode as 'internal' | 'shared',
      excludedOutputs,
      excludedInputs,
      constraintMode: s.constraintMode,
      allowExternal: effectiveAllowExternal,
      optimizationMode,
      customWeights,
      fixedUnityProduction,
      fixedUnityConsumption,
      integerMode,
      redundancy: s.redundancyFactor,
    });

    if (integerMode === 'milp') {
      console.log('=== MILP 模式 LP 结尾 ===');
      console.log(lpString.slice(-800));
    }

    useStore.getState().setSolverActive([...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive]);
    useStore.getState().setSolverVarNames(varNames);
    setSolverMissing(missing);

    if (DEBUG) {
      console.log('[调试] LP 字符串长度:', lpString.length);
      console.log('[调试] 变量数量:', varNames.length);
      console.log('[调试] 缺失物品:', missing);
      console.log('[调试] integerMode:', integerMode);
    }

    if (missing.length) {
      const trans = s.translation;
      setDiagnostic(`⚠️ 以下物品无生产配方：<br>${missing.map(m =>
        `${t(m, trans)} (${m}) <span class="missing-producer" data-item="${m}">🔧 启用建筑</span>`
      ).join('<br>')}`);
      setTimeout(() => {
        document.querySelectorAll('.missing-producer').forEach(el => {
          el.addEventListener('click', () => {
            const item = (el as HTMLElement).dataset.item;
            if (item) {
              useStore.getState().enableSeriesForItem(item);
              handleSolve();
            }
          });
        });
      }, 0);
    }

    // 根据整数模式选择求解方式
    setIsSolving(true);
    try {
      if (integerMode === 'continuous' || integerMode === 'milp') {
        // 直接 LP 求解（milp 模式由 HiGHS 自动处理整数）
        await solveLp(lpString, varNames, integerMode, tradeActive, fixedUnityConsumption, researchCohesionTotal);
        if (DEBUG) {
          const result = useStore.getState().result;
          if (result?.Status === 'Optimal') {
            console.log('=== 求解结果 - 贸易变量值 ===');
            tradeActive.forEach((recipe, idx) => {
              const varName = `tr${idx}`;
              const val = result.Columns?.[varName]?.Primal || result.columns?.[varName]?.Primal || 0;
              console.log(`${recipe.name}: ${val}`);
            });
          }
        }
      } else if (integerMode === 'ceil') {
        // 向上取整模式
        await solveCeilMode(lpString, varNames);
      } else if (integerMode === 'heuristic') {
        // 启发式取整模式
        await solveHeuristicMode(lpString, varNames);
      }
    } catch (err: any) {
      setIsSolving(false);
      setDiagnostic(`求解器错误: ${err.message}`);
    }
  }, [getFixedDemands, solarEfficiency, solveLp, solveCeilMode, solveHeuristicMode]);

  return (
    <>
      <h1>🏭 工厂计算器</h1>
      <div className="app-layout">
        <div className="left-column">
          <div className="section">
            <h3>💾 配置管理</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={() => {
                const data = useStore.getState().exportSettings();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'factory_settings.json';
                a.click();
              }}>📤 导出全部设置</Btn>
              <Btn onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e: any) => {
                  if (e.target.files[0]) {
                    const j = JSON.parse(await e.target.files[0].text());
                    useStore.getState().importSettings(j);
                  }
                };
                input.click();
              }}>📥 导入全部设置</Btn>
              <Btn onClick={() => {
                const s = useStore.getState().exportSettings();
                localStorage.setItem('factorySettings', JSON.stringify(s));
                alert('配置已保存到浏览器');
              }}>💾 保存当前配置</Btn>
              <Btn onClick={() => {
                if (confirm('恢复默认会丢弃当前设置，确定吗？')) {
                  fetch('./data.json')
                    .then(res => res.json())
                    .then(d => {
                      loadData(d);
                      localStorage.removeItem('factorySettings');
                    });
                }
              }}>🔄 恢复默认</Btn>
            </div>
            <div style={{ marginTop: 8 }}>
              <Checkbox label="显示图标" checked={showIcons} onChange={setShowIcons} />
            </div>
            <span className="hint">下次打开自动加载上次保存的配置</span>
          </div>
          <OptionsPanel onOpenExcludeModal={() => setExcludeModalOpen(true)} />
          <div className="demand-solve-row">
            <DemandPanel onOpenDemandModal={() => setDemandModalOpen(true)} />
            <Btn onClick={handleSolve} disabled={!dataLoaded} className="btn-solve">🔧 开始求解</Btn>
          </div>
        </div>
        <div className="right-column">
          <div className="tab-bar">
            <button className={`tab-button ${rightTab === 'main' ? 'active' : ''}`} onClick={() => setRightTab('main')}>🏗️ 主模块</button>
            <button className={`tab-button ${rightTab === 'power' ? 'active' : ''}`} onClick={() => setRightTab('power')}>⚡ 电力模块</button>
            <button className={`tab-button ${rightTab === 'stationStatueLab' ? 'active' : ''}`} onClick={() => setRightTab('stationStatueLab')}>🚀 空间站·雕像·研究所</button>
            <button className={`tab-button ${rightTab === 'trade' ? 'active' : ''}`} onClick={() => setRightTab('trade')}>🚢 贸易模块</button>
            <button className={`tab-button ${rightTab === 'agriculture' ? 'active' : ''}`} onClick={() => setRightTab('agriculture')}>🌾 农业</button>
            <button className={`tab-button ${rightTab === 'resident' ? 'active' : ''}`} onClick={() => setRightTab('resident')}>🏠 居民</button>
            <button className={`tab-button ${rightTab === 'edict' ? 'active' : ''}`} onClick={() => setRightTab('edict')}>📜 法令</button>
            <button className={`tab-button ${rightTab === 'office' ? 'active' : ''}`} onClick={() => setRightTab('office')}>🏢 办公</button>
            <button className={`tab-button ${rightTab === 'tech' ? 'active' : ''}`} onClick={() => setRightTab('tech')}>🔬 科技</button>
          </div>
          <div className="tab-content">
            {rightTab === 'main' && <MainLevelPanel onOpenLevelModal={() => setLevelModalOpen(true)} onOpenRecipeModal={() => setRecipeModalOpen(true)} />}
            {rightTab === 'power' && <PowerPanel onOpenPowerRecipeModal={() => setPowerRecipeModalOpen(true)} />}
            {rightTab === 'stationStatueLab' && (
              <div>
                <SpaceStationPanel />
                <StatuePanel />
                <LabPanel />
              </div>
            )}
            {rightTab === 'trade' && <TradePanel />}
            {rightTab === 'agriculture' && <AgriculturePanel />}
            {rightTab === 'resident' && <ResidentPanel />}
            {rightTab === 'edict' && <EdictPanel />}
            {rightTab === 'office' && <OfficePanel />}
            {rightTab === 'tech' && <TechPanel />}
          </div>
        </div>
      </div>

      <LevelModal open={levelModalOpen} onClose={() => setLevelModalOpen(false)} />
      <RecipeModal open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} />
      <PowerRecipeModal open={powerRecipeModalOpen} onClose={() => setPowerRecipeModalOpen(false)} />
      <DemandModal open={demandModalOpen} onClose={() => setDemandModalOpen(false)} />
      <ExcludeModal open={excludeModalOpen} onClose={() => setExcludeModalOpen(false)} />

      <Results />
    </>
  );
}