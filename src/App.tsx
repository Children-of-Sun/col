import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from './stores';
import { MainLevelPanel, PowerPanel, SpaceStationPanel, StatuePanel, LabPanel, DemandPanel, OptionsPanel } from './components/Panels';
import { LevelModal, RecipeModal, PowerRecipeModal, DemandModal, ExcludeModal } from './components/Modals';
import { Results } from './components/Results';
import { Btn, ModalShell } from './components/UI';
import PopTechPanel from './components/PopTechPanel';
import { TradePanel } from './components/TradePanel';
import { buildLp } from './lpBuilder';
import { ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS, getRecycleRate, calcResidentDemands, calcResidentWaste, getMaintenanceWasteMap } from './utils';
import { getMaintenanceReduction, t, isRaw, isPowerItem, getSeriesName, isMaintenanceRecyclingRecipe } from './utils';
import { Demand, Recipe, DockLevel, TradeFuel } from './types';
import { calculateTrade } from './tradeCalculator';
import './App.css';

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
  const setUnityProduced = useStore(s => s.setUnityProduced);
  const setUnityConsumed = useStore(s => s.setUnityConsumed);
  const setTradeContracts = useStore(s => s.setTradeContracts);
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const gameData = useStore(s => s.gameData);

  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [powerRecipeModalOpen, setPowerRecipeModalOpen] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [excludeModalOpen, setExcludeModalOpen] = useState(false);
  const [popTechModalOpen, setPopTechModalOpen] = useState(false);

  useEffect(() => {
    window.__store = useStore;
    
    (async () => {
      try {
        const resp = await fetch('./data.json');
        if (resp.ok) { loadData(await resp.json()); }
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

  const handleSolve = useCallback(async () => {
    const s = useStore.getState();

    // 强制刷新贸易配方（基于最新参数和选中的合同）
    const { tradeParams, selectedTradeContractIds, tradeContracts, gameData, translation } = useStore.getState();
    let tradeActive: Recipe[] = [];
    if (selectedTradeContractIds.length > 0 && tradeContracts.length > 0) {
      const moduleSpeed = { S: 125, M: 250, L: 500 }[tradeParams.moduleSize];
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
      const profitFactor = 1 + tradeParams.profitBonus / 100;
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
          },
          powerMultiplier: 1,
          workers: perMinWorkers,
          isSolar: false,
          isHidden: false,
          module: 'trade',
        };
        newTradeRecipes.push(recipe);
      }
      if (newTradeRecipes.length) {
        useStore.getState().setSelectedTradeRecipes(newTradeRecipes);
        tradeActive = newTradeRecipes;
      } else {
        tradeActive = [];
      }
    } else {
      tradeActive = [];
    }

    const active = s.recipes.filter(r => {
      if (!s.recipeEnabled[r.id]) return false;
      const sn = (r.module === 'power') ?
        s.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name :
        s.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
      if (sn) {
        if (r.module === 'power') {
          if (!s.powerEnabled[sn]) return false;
          return s.powerSelectedLevel[sn] === r.buildingLevel;
        } else {
          if (!s.mainEnabled[sn]) return false;
          return s.mainSelectedLevel[sn] === r.buildingLevel;
        }
      } else {
        return r.module === 'main';
      }
    });

    if (!active.length) {
      setDiagnostic('没有启用的配方。');
      return;
    }

    const ignored = new Set(s.ignoredItems);
    const excludedOutputs = new Set(s.excludedOutputs);
    const excludedInputs = new Set(s.excludedInputs);
    const reductionFactorBase = getMaintenanceReduction(s.statueCount);
    let fixedDemands = getFixedDemands();

    const modifiedActive = active.map(r => ({ ...r, inputs: { ...r.inputs }, outputs: { ...r.outputs }, upkeep: { ...r.upkeep } }));

    // 应用太阳能效率
    modifiedActive.forEach(recipe => {
      if (recipe.isSolar && recipe.outputs['electricity']) {
        recipe.outputs['electricity'] *= solarEfficiency;
      }
    });

    const recycleRate = (() => {
      const gd = useStore.getState().gameData;
      if (!gd) return 0.2;
      return getRecycleRate(
        gd.baseRecycleRate ?? 0.2,
        gd.edicts,
        useStore.getState().edictLevels,
        gd.office,
        useStore.getState().officeLevels
      );
    })();

    const currentGameData = useStore.getState().gameData;
    let specialActive: Recipe[] = [];

    if (currentGameData) {
      const maintWasteMap = getMaintenanceWasteMap(currentGameData);
      const allWasteNames = currentGameData.wasteNames;
      const recyclableIndices = [0, 1, 2, 3, 4];
      const recyclableWasteNames = allWasteNames.slice(2);
      const recyclableWasteNamesLower = recyclableWasteNames.map(w => w.toLowerCase());

      if (DEBUG) {
        console.log('[废料调试] ========== 废料系统启动 ==========');
        console.log('[废料调试] 回收率:', recycleRate);
        console.log('[废料调试] 所有废料名称:', allWasteNames);
        console.log('[废料调试] 可回收废料:', recyclableWasteNames);
        console.log('[废料调试] 维护废物系数表 keys:', Object.keys(maintWasteMap));
      }

      modifiedActive.forEach(r => {
        recyclableWasteNames.forEach(wn => {
          delete r.outputs[wn];
        });
      });

      if (DEBUG) console.log('[废料调试] 开始对 modifiedActive 添加废料，配方数量:', modifiedActive.length);
      modifiedActive.forEach(r => {
        const hasRecyclables = ((r.outputs['recyclables'] || r.outputs['Recyclables']) || 0) > 0;
        if (!hasRecyclables) return;
        if (DEBUG) console.log(`[废料调试] 处理配方: ${r.name}, 输出 recyclables: ${r.outputs['recyclables'] || r.outputs['Recyclables']}`);
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
            if (DEBUG) console.log(`  输入 ${inputItem}: 每周期 ${perCycleInput}, 系数:`, coeffs);
            recyclableIndices.forEach((idx, i) => {
              const coeff = coeffs[idx];
              if (coeff !== 0) {
                const wasteItem = recyclableWasteNamesLower[i];
                const added = perCycleInput * coeff * recycleRate;
                r.outputs[wasteItem] = (r.outputs[wasteItem] || 0) + added;
                if (DEBUG) console.log(`    添加 ${wasteItem} (每周期): ${added.toFixed(4)}`);
              }
            });
          } else if (DEBUG) {
            console.log(`  输入 ${inputItem}: 未找到废物系数`);
          }
        }
      });

      modifiedActive.forEach(r => {
        const researchLvls = [...s.researchLevels];
        if (r.buildingName.toLowerCase().includes('farm') || r.buildingId.toLowerCase().startsWith('farm')) {
          const cropRes = currentGameData.research.find(res => res.name === '作物产量');
          const cropLvl = cropRes ? (researchLvls[currentGameData.research.indexOf(cropRes)] || 0) : 0;
          if (cropLvl > 0 && cropRes) {
            const bonus = (cropRes.effectPerLevel[0] || 0) * cropLvl;
            for (const k in r.outputs) {
              if (k !== 'water') r.outputs[k] *= (1 + bonus);
            }
            if (DEBUG) console.log(`[调试] 农场 ${r.name} 作物产量加成 ${bonus*100}%`);
          }
          const waterRes = currentGameData.research.find(res => res.name === '定居点用水');
          const waterLvl = waterRes ? (researchLvls[currentGameData.research.indexOf(waterRes)] || 0) : 0;
          if (waterLvl > 0 && waterRes) {
            const waterBonus = (waterRes.effectPerLevel[0] || 0) * waterLvl;
            if (r.inputs['water']) {
              r.inputs['water'] *= (1 + waterBonus);
              if (DEBUG) console.log(`[调试] 农场 ${r.name} 定居点用水加成 ${waterBonus*100}%，水输入增加`);
            }
          }
        }
      });

      // 雕像
      if (s.statueCount > 0) {
        const statueRecipe: Recipe = {
          id: 'statue_module',
          name: '雕像 (The Statue of Maintenance)',
          buildingId: 'statue',
          buildingName: 'The Statue of Maintenance',
          category: '雕像',
          buildingLevel: 0,
          duration: 60,
          inputs: { 'fuel gas': s.statueCount * 2 },
          outputs: {},
          upkeep: {},
          powerMultiplier: 1,
          workers: 0,
          isSolar: false,
          isHidden: true,
          module: 'special',
        };
        const statueBuilding = s.fullData?.machines_and_buildings?.find(
          (b: any) => b.name === 'The Statue of Maintenance'
        );
        if (statueBuilding) {
          if (statueBuilding.maintenance_cost_units && statueBuilding.maintenance_cost_quantity) {
            statueRecipe.upkeep[statueBuilding.maintenance_cost_units.toLowerCase()] = statueBuilding.maintenance_cost_quantity * s.statueCount;
          }
          statueRecipe.workers = (statueBuilding.workers || 0) * s.statueCount;
          if (statueBuilding.electricity_consumed) {
            statueRecipe.inputs['electricity'] = (statueRecipe.inputs['electricity'] || 0) + statueBuilding.electricity_consumed * s.statueCount;
          }
          if (statueBuilding.computing_consumed) {
            statueRecipe.inputs['computing'] = (statueRecipe.inputs['computing'] || 0) + statueBuilding.computing_consumed * s.statueCount;
          }
        }
        specialActive.push(statueRecipe);
      }

      // 研究所
      if (s.labCount > 0 && s.labLevel) {
        const meta = s.labMeta.find(l => l.buildingId === s.labLevel);
        if (meta) {
          const labRecipe: Recipe = {
            id: `lab_module_${s.labLevel}`,
            name: `研究所 (${meta.name}) ×${s.labCount}`,
            buildingId: s.labLevel,
            buildingName: meta.name,
            category: '研究所',
            buildingLevel: meta.level,
            duration: 60,
            inputs: {},
            outputs: { 'research': 48 * (1 + s.stationLevel * 0.05) * s.labCount },
            upkeep: {},
            powerMultiplier: 1,
            workers: 0,
            isSolar: false,
            isHidden: true,
            module: 'special',
            isLab: true,
          };
          meta.recipes.forEach((r: any) => {
            if (!s.recipeEnabled[r.id]) return;
            for (const [item, qty] of Object.entries(r.inputs)) {
              const rate = (60 / r.duration) * (qty as number) * s.labCount;
              labRecipe.inputs[item] = (labRecipe.inputs[item] || 0) + rate;
              if (r.outputs && (r.outputs.recyclables || r.outputs.Recyclables)) {
                const recycleRateOut = (60 / r.duration) * ((r.outputs.recyclables || r.outputs.Recyclables) as number) * s.labCount;
                labRecipe.outputs['recyclables'] = (labRecipe.outputs['recyclables'] || 0) + recycleRateOut;
              }
            }
          });
          for (const [item, qty] of Object.entries(meta.upkeep || {})) {
            labRecipe.upkeep[item.toLowerCase()] = (qty as number) * s.labCount;
          }

          const labHasRecyclables = (labRecipe.outputs['recyclables'] || 0) > 0;
          if (labHasRecyclables) {
            if (DEBUG) console.log(`[废料调试] 处理实验室配方: ${labRecipe.name}, 输出 recyclables: ${labRecipe.outputs['recyclables']}`);
            for (const [inputItem, inputQty] of Object.entries(labRecipe.inputs)) {
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
                if (DEBUG) console.log(`  输入 ${inputItem}: 每周期 ${perCycleInput}, 系数:`, coeffs);
                recyclableIndices.forEach((idx, i) => {
                  const coeff = coeffs[idx];
                  if (coeff !== 0) {
                    const wasteItem = recyclableWasteNamesLower[i];
                    const added = perCycleInput * coeff * recycleRate;
                    labRecipe.outputs[wasteItem] = (labRecipe.outputs[wasteItem] || 0) + added;
                    if (DEBUG) console.log(`    添加 ${wasteItem} (每周期): ${added.toFixed(4)}`);
                  }
                });
              } else if (DEBUG) {
                console.log(`  输入 ${inputItem}: 未找到废物系数`);
              }
            }
          }

          specialActive.push(labRecipe);
        }
      }
    }

    let reductionFactor = reductionFactorBase;
    if (currentGameData) {
      const edictReduce = currentGameData.edicts.find(e => e.name === '减少维护');
      if (edictReduce) {
        const lvl = s.edictLevels[currentGameData.edicts.indexOf(edictReduce)] ?? -1;
        if (lvl >= 0) {
          reductionFactor += edictReduce.effectPerLevel[lvl];
        }
      }
      reductionFactor = Math.min(reductionFactor, 1);
    }

    let mainActive = modifiedActive.filter(r => {
      if (!s.recipeEnabled[r.id] || r.module !== 'main') return false;
      const sn = s.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
      if (sn) {
        if (!s.mainEnabled[sn]) return false;
        if (s.mainSelectedLevel[sn] !== r.buildingLevel) return false;
        return s.mainBuildingEnabledMap[r.buildingId] !== false;
      }
      return s.mainBuildingEnabledMap[r.buildingId] !== false;
    });

    let powerActive = modifiedActive.filter(r => {
      if (!s.recipeEnabled[r.id] || r.module !== 'power') return false;
      const sn = s.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
      if (!sn) return false;
      if (!s.powerEnabled[sn]) return false;
      if (s.powerSelectedLevel[sn] !== r.buildingLevel) return false;
      return s.powerBuildingEnabledMap[r.buildingId] !== false;
    });

    // 居民模块
    let allExternalSupplies: { item: string; rate: number }[] = [];

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
      const state = useStore.getState();

      const { demands: residentDemands, unityProduced, unityConsumed } = calcResidentDemands(
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
      useStore.getState().setUnityProduced(unityProduced);
      useStore.getState().setUnityConsumed(unityConsumed);

      const residentWasteSupplies = calcResidentWaste(
        currentGameData,
        residentDemands,
        recycleRate
      ).map(w => ({ item: w.item, rate: w.rate }));

      allExternalSupplies = [...allExternalSupplies, ...residentWasteSupplies];

      residentDemands.forEach(d => {
        residentRecipe.inputs[d.item] = d.rate;
      });

      residentWasteSupplies.forEach(w => {
        residentRecipe.outputs[w.item] = w.rate;
      });

      const popWaste = currentGameData.populationWaste;
      if (popWaste) {
        const wasteAmount = popWaste.ratePerPop * state.population;
        residentRecipe.outputs[popWaste.item.toLowerCase()] = (residentRecipe.outputs[popWaste.item.toLowerCase()] || 0) + wasteAmount;
        if (DEBUG) console.log(`[调试] 人口垃圾 ${popWaste.item}: ${wasteAmount}/分`);
      }

      setExternalSupplies(allExternalSupplies);
      useStore.getState().setSolverFixedDemands(fixedDemands.filter(d => d.rate > 0));
    }

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

    if (s.stationLevel > 0) {
      const rocket = ROCKET_BASE[s.rocketType];
      const rocketCargoResearch = currentGameData?.research.find(r => r.name === '火箭载荷量');
      const rocketCargoLevel = rocketCargoResearch ? (s.researchLevels[currentGameData.research.indexOf(rocketCargoResearch)] || 0) : 0;
      const cargoBonus = 1 + rocketCargoLevel * 0.05;
      const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (cargoBonus - 1);
      const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (cargoBonus - 1);

      const stationPartsRate = s.stationLevel * STATION_PARTS_RATE;
      const crewSuppliesRate = Math.max(0, (s.stationLevel - 1) * 0.2);
      let labCargoRate = 0;
      const meta = s.labMeta.find(l => l.buildingId === s.labLevel);
      if (meta && s.labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * s.labCount;
      const userSpaceCargoRate = s.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((acc, d) => acc + d.rate, 0);

      const totalCargoRate = stationPartsRate + crewSuppliesRate + labCargoRate + userSpaceCargoRate;
      const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;

      const crew = Math.max(0, (s.stationLevel - 1) * 2);
      const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
      const crewRocketRate = rocketsPerLaunch / 20;

      if (stationPartsRate > 0) stationRecipe.inputs['station parts'] = stationPartsRate;
      if (crewSuppliesRate > 0) stationRecipe.inputs['crew supplies'] = crewSuppliesRate;
      if (labCargoRate > 0) stationRecipe.inputs['electronics iv'] = labCargoRate;
      s.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).forEach(d => {
        stationRecipe.inputs[d.item] = (stationRecipe.inputs[d.item] || 0) + d.rate;
      });
      if (crewRocketRate > 0) stationRecipe.inputs[rocket.crewKey] = crewRocketRate;
      if (cargoRocketRate > 0) stationRecipe.inputs[rocket.cargoKey] = cargoRocketRate;
    }

    const stationActive = [stationRecipe];

    // 注意：tradeActive 已经在函数开头定义并赋值，这里不再重复定义

    const allFixedDemands = getFixedDemands();
    const positiveDemands = [...s.demands, ...allFixedDemands.filter(d => !ignored.has(d.item) && !excludedOutputs.has(d.item) && !excludedInputs.has(d.item) && d.rate >= 0)];

    const effectiveAllowExternal = s.allowExternal;

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
    });

    useStore.getState().setSolverActive([...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive]);
    useStore.getState().setSolverVarNames(varNames);
    setSolverMissing(missing);

    if (DEBUG) {
      console.log('[调试] LP 字符串长度:', lpString.length);
      console.log('[调试] 变量数量:', varNames.length);
      console.log('[调试] 缺失物品:', missing);
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

    setIsSolving(true);
    try {
      const worker = new Worker('solver.worker.js');
      const requestId = Date.now();
      const timeoutId = setTimeout(() => {
        worker.terminate();
        setIsSolving(false);
        setDiagnostic('求解超时，请简化配方选择或允许外部供给。');
      }, 30000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        const data = e.data;
        if (DEBUG) console.log('[调试] 求解器返回:', data);
        if (data.error) {
          setDiagnostic(`求解器错误: ${data.error}`);
          setIsSolving(false);
          worker.terminate();
          return;
        }
        const result = data.result;
        if (!result || !result.Status) {
          setDiagnostic('求解器返回了无效结果');
          setIsSolving(false);
          worker.terminate();
          return;
        }
        setResult(result);
        setIsSolving(false);
        if (result.Status === 'Optimal') {
          setDiagnostic('');
        } else if (result.Status === 'Infeasible') {
          const prev = useStore.getState().diagnostic;
          setDiagnostic(prev + '<br>💡 当前设置无法平衡所有中间产物。请勾选"允许外部供给"或调整需求。');
        }
        worker.terminate();
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        setIsSolving(false);
        setDiagnostic(`Worker 错误: ${err.message} | 文件名: ${err.filename} | 行号: ${err.lineno}`);
        worker.terminate();
      };

      worker.postMessage({ lpString, requestId });
    } catch (err: any) {
      setIsSolving(false);
      setDiagnostic(`求解器错误: ${err.message}`);
    }
  }, [getFixedDemands, solarEfficiency]); // 注意依赖项中去掉了 selectedTradeRecipes

  return (
    <>
      <h1>🏭 工厂计算器</h1>
      <div style={{ marginBottom: 10 }}>
        <Btn onClick={() => {
          const data = useStore.getState().exportSettings();
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
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
      </div>
      <div className="section">
        <h3>💾 配置管理</h3>
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
        <span> 下次打开自动加载上次保存的配置</span>
      </div>
      <MainLevelPanel onOpenLevelModal={() => setLevelModalOpen(true)} onOpenRecipeModal={() => setRecipeModalOpen(true)} />
      <PowerPanel onOpenPowerRecipeModal={() => setPowerRecipeModalOpen(true)} />
      <SpaceStationPanel />
      <StatuePanel />
      <LabPanel />
      <DemandPanel onOpenDemandModal={() => setDemandModalOpen(true)} />
      <TradePanel />
      <OptionsPanel onOpenExcludeModal={() => setExcludeModalOpen(true)} />
      <Btn onClick={() => setPopTechModalOpen(true)} disabled={!dataLoaded}>
        🏙️ 居民与科技
      </Btn>
      <Btn onClick={handleSolve} disabled={!dataLoaded}>🔧 开始求解</Btn>
      <LevelModal open={levelModalOpen} onClose={() => setLevelModalOpen(false)} />
      <RecipeModal open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} />
      <PowerRecipeModal open={powerRecipeModalOpen} onClose={() => setPowerRecipeModalOpen(false)} />
      <DemandModal open={demandModalOpen} onClose={() => setDemandModalOpen(false)} />
      <ExcludeModal open={excludeModalOpen} onClose={() => setExcludeModalOpen(false)} />
      <ModalShell
        open={popTechModalOpen}
        onClose={() => setPopTechModalOpen(false)}
        title="🏙️ 居民与科技"
        maxWidth="800px"
      >
        <PopTechPanel />
      </ModalShell>
      <Results />
    </>
  );
}