import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from './stores';
import { MainLevelPanel, PowerPanel, SpaceStationPanel, StatuePanel, LabPanel, DemandPanel, OptionsPanel } from './components/Panels';
import { LevelModal, RecipeModal, PowerRecipeModal, DemandModal, ExcludeModal } from './components/Modals';
import { Results } from './components/Results';
import { Btn, ModalShell } from './components/UI';
import PopTechPanel from './components/PopTechPanel';
import { buildLp } from './lpBuilder';
import { ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS, getRecycleRate, calcResidentDemands, calcResidentWaste, getMaintenanceWasteMap } from './utils';
import { getMaintenanceReduction, t, isRaw, isPowerItem, getSeriesName } from './utils';
import { Demand, Recipe } from './types';
import './App.css';

declare global {
  interface Window {
    __hasAutoLoadedSettings?: boolean;
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

  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [powerRecipeModalOpen, setPowerRecipeModalOpen] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [excludeModalOpen, setExcludeModalOpen] = useState(false);
  const [popTechModalOpen, setPopTechModalOpen] = useState(false);
  const gameData = useStore(s => s.gameData);
  const setGameData = useStore(s => s.setGameData);

  // Auto-load on mount
  useEffect(() => {

    (window as any).__store = useStore;
    
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
        if (resp.ok) setGameData(await resp.json());
      } catch (e) { /* ignore */ }
      // 自动加载 localStorage 中的配置
      if (!window.__hasAutoLoadedSettings && localStorage.getItem('factorySettings')) {
        try {
          const s = JSON.parse(localStorage.getItem('factorySettings')!);
          useStore.getState().importSettings(s);
          window.__hasAutoLoadedSettings = true;
        } catch(e) {}
      }
    })();
  }, []);

  const getFixedDemands = useCallback((): Demand[] => {
  const s = useStore.getState();
  const fd: Demand[] = [];
  if (s.stationLevel > 0) {
   const rocket = ROCKET_BASE[s.rocketType];
  // 只保留火箭需求，不要直接物资需求
  // 人员火箭
  const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (s.techLevel / 10);
  const crew = Math.max(0, (s.stationLevel - 1) * 2);
  const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
  const crewRocketRate = rocketsPerLaunch / 20;
  if (crewRocketRate > 0) fd.push({ item: rocket.crewKey, rate: crewRocketRate });

  // 货物火箭（仍需要计算总货物量，但货物明细已在 stationRecipe 中体现）
  let labCargoRate = 0;
  const meta = s.labMeta.find(l => l.buildingId === s.labLevel);
  if (meta && s.labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * s.labCount;
  const userSpaceCargoRate = s.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((acc, d) => acc + d.rate, 0);
  const totalCargoRate = (s.stationLevel * STATION_PARTS_RATE) + (s.stationLevel > 1 ? (s.stationLevel - 1) * 2 : 0) + labCargoRate + userSpaceCargoRate;
  const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (s.techLevel / 10);
  const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;
  if (cargoRocketRate > 0) fd.push({ item: rocket.cargoKey, rate: cargoRocketRate });
}
  if (s.statueCount > 0) fd.push({ item: 'fuel gas', rate: s.statueCount * 2 });
  const meta = s.labMeta.find(l => l.buildingId === s.labLevel);
  if (meta && s.labCount > 0) {
    meta.recipes.forEach(r => {
      for (const [item, qty] of Object.entries(r.inputs)) {
        fd.push({ item: item.toLowerCase(), rate: (60 / r.duration) * qty * s.labCount });
      }
    });
    for (const [item, qty] of Object.entries(meta.upkeep)) {
      fd.push({ item: item.toLowerCase(), rate: qty * s.labCount });
    }
  }
  return fd;
}, []);


  const getActiveRecipes = useCallback(() => {
    const s = useStore.getState();
    return s.recipes.filter(r => {
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
        // 无系列（如电力建筑的主模块副本），直接依赖 recipeEnabled
        return r.module === 'main';
      }
    });
  }, []);
const handleSolve = useCallback(async () => {
  const s = useStore.getState();

  // 配方/建筑独立开关：不再强制同步电力配方启用状态
  // 电力配方是否参与计算由 recipeEnabled 独立控制
  // 系列关闭时只禁用，不启用；系列启用时保持配方原有状态

  // ✅ 通用活跃配方过滤（主模块 + 电力模块）
  const active = s.recipes.filter(r => {
    if (!s.recipeEnabled[r.id]) return false;
    const sn = (r.module === 'power') ?
      s.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name :
      s.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
    if (sn) {
      // 有系列，按系列启用/等级检查
      if (r.module === 'power') {
        if (!s.powerEnabled[sn]) return false;
        return s.powerSelectedLevel[sn] === r.buildingLevel;
      } else {
        if (!s.mainEnabled[sn]) return false;
        return s.mainSelectedLevel[sn] === r.buildingLevel;
      }
    } else {
      // 无系列（如电力建筑的主模块副本），直接依赖 recipeEnabled
      return r.module === 'main'; // 只允许主模块配方，电力配方必须有系列
    }
  });

  if (!active.length) {
    setDiagnostic('没有启用的配方。');
    return;
  }

  const ignored = new Set(s.ignoredItems);
  const excluded = new Set(s.excludedItems);
  const reductionFactor = getMaintenanceReduction(s.statueCount);
  let fixedDemands = getFixedDemands();

  // 深拷贝 active 列表，确保不改变原配方
  const modifiedActive = active.map(r => ({ ...r, inputs: { ...r.inputs }, outputs: { ...r.outputs }, upkeep: { ...r.upkeep } }));

  // 将配方按模块严格分开
  const mainActive = modifiedActive.filter(r => {
    if (!s.recipeEnabled[r.id] || r.module !== 'main') return false;
    const sn = s.mainSeriesList.find(ms => ms.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
    if (sn) {
      if (!s.mainEnabled[sn]) return false;
      if (s.mainSelectedLevel[sn] !== r.buildingLevel) return false;
      // 新增：检查主模块建筑开关
      return s.mainBuildingEnabledMap[r.buildingId] !== false;
    }
    // 无系列建筑直接检查主模块建筑开关
    return s.mainBuildingEnabledMap[r.buildingId] !== false;
  });

  const powerActive = modifiedActive.filter(r => {
    if (!s.recipeEnabled[r.id] || r.module !== 'power') return false;
    const sn = s.powerSeriesList.find(ps => ps.levels.some((lv: any) => lv.buildingId === r.buildingId))?.name;
    if (!sn) return false;  // 电力配方必须有系列
    // 系列关闭时禁用配方，系列启用时保持配方原有状态
    if (!s.powerEnabled[sn]) return false;
    if (s.powerSelectedLevel[sn] !== r.buildingLevel) return false;
    // 检查电力模块建筑开关
    return s.powerBuildingEnabledMap[r.buildingId] !== false;
  });

  // 在居民/科技处理之前，单独计算回收率（基础 0.2）
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

  // 维护废料映射（只要有 GameData 就计算，与居民无关）
  if (currentGameData) {
    const maintWasteMap = getMaintenanceWasteMap(currentGameData);
    modifiedActive.forEach(r => {
      // 维护 Recycling 配方：只产出废料，不再产出原来的 maintenance 物品
if (r.id.includes('Maintenance') && r.id.includes('Recycling')) {
  const maintType = Object.keys(r.outputs).find(k => k.startsWith('maintenance'));
  if (maintType && maintWasteMap[maintType]) {
    // 删除原 maintenance 输出，避免重复生产
    delete r.outputs[maintType];
    const outputRate = (60 / r.duration) * (r.outputs[maintType] ?? 0);
    const wasteNames = currentGameData.wasteNames.slice(2);
    maintWasteMap[maintType].forEach((coeff, idx) => {
      r.outputs[wasteNames[idx]] = (r.outputs[wasteNames[idx]] || 0) + outputRate * coeff * recycleRate;
    });
  }
}

      // 办公用品配方
      if (r.name.toLowerCase().includes('office supplies')) {
        const officeWaste = maintWasteMap['办公用品'] || [0, 0, 0, 0, 0];
        const outputRate = (60 / r.duration) * (r.outputs['office supplies'] ?? 0);
        const wasteNames = currentGameData.wasteNames.slice(2);
        officeWaste.forEach((coeff, idx) => {
          r.outputs[wasteNames[idx]] = (r.outputs[wasteNames[idx]] || 0) + outputRate * coeff * recycleRate;
        });
      }

      // 农场加成（需要研究等级）
      const researchLvls = [...s.researchLevels];
      if (r.buildingName.toLowerCase().includes('farm') || r.buildingId.toLowerCase().startsWith('farm')) {
        const cropRes = currentGameData.research.find(res => res.name === '作物产量');
        const cropLvl = cropRes ? (researchLvls[currentGameData.research.indexOf(cropRes)] || 0) : 0;
        if (cropLvl > 0 && cropRes) {
          const bonus = (cropRes.effectPerLevel[0] || 0) * cropLvl;
          for (const k in r.outputs) {
            if (k !== 'water') r.outputs[k] *= (1 + bonus);
          }
        }

        const waterRes = currentGameData.research.find(res => res.name === '定居点用水');
        const waterLvl = waterRes ? (researchLvls[currentGameData.research.indexOf(waterRes)] || 0) : 0;
        if (waterLvl > 0 && waterRes) {
          const waterBonus = (waterRes.effectPerLevel[0] || 0) * waterLvl;
          if (r.inputs['water']) {
            r.inputs['water'] *= (1 + waterBonus);
          }
        }
      }
    });
  }

  // ===== 居民/科技处理 =====
  // 初始化外部供给列表（默认为空）
  let allExternalSupplies: { item: string; rate: number }[] = [];

  // 创建居民模块配方
  const residentRecipe: Recipe = {
    id: 'resident_module',
    name: '居民模块',
    buildingId: 'resident',
    buildingName: '居民',
    category: '居民',
    buildingLevel: 0,
    duration: 60,           // 不缩放
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

    // 读取当前科技等级
    const edictLvls = { ...state.edictLevels };
    const officeLvls = [...state.officeLevels];
    const researchLvls = [...state.researchLevels];

    // 计算居民需求和废料
    const { demands: residentDemands, unity } = calcResidentDemands(
      currentGameData,
      state.population,
      state.housingIndex,
      state.selectedFoods,
      state.selectedMedical,
      state.selectedOthers,
      edictLvls,
      officeLvls,
      researchLvls,
      recycleRate
    );
    useStore.getState().setUnityProduced(unity);
    useStore.getState().setUnityConsumed(unity);

    // 居民废物（正数）转为外部供给（calcResidentWaste 已包含 populationWaste）
    const residentWasteSupplies = calcResidentWaste(
      currentGameData,
      residentDemands,
      recycleRate
    ).map(w => ({ item: w.item, rate: w.rate }));

    // 合并所有外部供给
    allExternalSupplies = [...allExternalSupplies, ...residentWasteSupplies];

    // 居民消耗 → 输入（正值）
    residentDemands.forEach(d => {
      residentRecipe.inputs[d.item] = d.rate;
    });

    // 居民废物 → 输出（正值）
    residentWasteSupplies.forEach(w => {
      residentRecipe.outputs[w.item] = w.rate;
    });

    // 居民电力和算力消耗（需求7）
    const housing = currentGameData.housingTiers[s.housingIndex];
    const housingMultipliers = housing?.multipliers || {};
    const elecSvc = currentGameData.services['Electricity'];
    const compSvc = currentGameData.services['Computing'];
    if (elecSvc) {
      const elecDemand = elecSvc.demand * (s.population / currentGameData.populationScale)
        * (housingMultipliers['Electricity'] || 1);
      residentRecipe.inputs['electricity'] = (residentRecipe.inputs['electricity'] || 0) + elecDemand;
    }
    if (compSvc) {
      const compDemand = compSvc.demand * (s.population / currentGameData.populationScale)
        * (housingMultipliers['Computing'] || 1);
      residentRecipe.inputs['computing'] = (residentRecipe.inputs['computing'] || 0) + compDemand;
    }

    // 保存外部供给到store
    setExternalSupplies(allExternalSupplies);
    // 保存正需求（居民消耗）用于显示
    useStore.getState().setSolverFixedDemands(fixedDemands.filter(d => d.rate > 0));
  }

  const residentActive = [residentRecipe];

  // ===== 空间站模块配方 =====
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
    const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (s.techLevel / 10);
    const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (s.techLevel / 10);

    const stationPartsRate = s.stationLevel * STATION_PARTS_RATE;
    const crewSuppliesRate = Math.max(0, (s.stationLevel - 1) * 2);
    let labCargoRate = 0;
    const meta = s.labMeta.find(l => l.buildingId === s.labLevel);
    if (meta && s.labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * s.labCount;
    const userSpaceCargoRate = s.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((acc, d) => acc + d.rate, 0);

    const totalCargoRate = stationPartsRate + crewSuppliesRate + labCargoRate + userSpaceCargoRate;
    const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;

    const crew = Math.max(0, (s.stationLevel - 1) * 2);
    const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
    const crewRocketRate = rocketsPerLaunch / 20;

    // 消耗物品（输入）
    if (stationPartsRate > 0) stationRecipe.inputs['station parts'] = stationPartsRate;
    if (crewSuppliesRate > 0) stationRecipe.inputs['crew supplies'] = crewSuppliesRate;
    if (labCargoRate > 0) stationRecipe.inputs['electronics iv'] = labCargoRate;
    // 用户空间物品需求
    s.demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).forEach(d => {
      stationRecipe.inputs[d.item] = (stationRecipe.inputs[d.item] || 0) + d.rate;
    });
    // 火箭消耗
    if (crewRocketRate > 0) stationRecipe.inputs[rocket.crewKey] = crewRocketRate;
    if (cargoRocketRate > 0) stationRecipe.inputs[rocket.cargoKey] = cargoRocketRate;
  }

  const stationActive = [stationRecipe];

  // ===== 特殊模块配方（雕像、研究所） =====
  const specialActive: Recipe[] = [];

  // 雕像配方（机器数=statueCount，固定）
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
    // 从JSON数据读取雕像建筑的维护消耗
    const statueBuilding = s.fullData?.machines_and_buildings?.find(
      (b: any) => b.name === 'The Statue of Maintenance'
    );
    if (statueBuilding) {
      if (statueBuilding.maintenance_cost_units && statueBuilding.maintenance_cost_quantity) {
        statueRecipe.upkeep[statueBuilding.maintenance_cost_units.toLowerCase()] =
          statueBuilding.maintenance_cost_quantity * s.statueCount;
      }
      statueRecipe.workers = (statueBuilding.workers || 0) * s.statueCount;
      // 雕像的电力消耗
      if (statueBuilding.electricity_consumed) {
        statueRecipe.inputs['electricity'] =
          (statueRecipe.inputs['electricity'] || 0) + statueBuilding.electricity_consumed * s.statueCount;
      }
      // 雕像的算力消耗
      if (statueBuilding.computing_consumed) {
        statueRecipe.inputs['computing'] =
          (statueRecipe.inputs['computing'] || 0) + statueBuilding.computing_consumed * s.statueCount;
      }
    }
    specialActive.push(statueRecipe);
  }

  // 研究所配方（机器数=labCount，固定）
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
      };
      // 输入：lab equipment、electronics iv 等
      meta.recipes.forEach((r: any) => {
        for (const [item, qty] of Object.entries(r.inputs)) {
          const rate = (60 / r.duration) * (qty as number) * s.labCount;
          labRecipe.inputs[item] = (labRecipe.inputs[item] || 0) + rate;
        }
      });
      // 维护
      for (const [item, qty] of Object.entries(meta.upkeep || {})) {
        labRecipe.upkeep[item.toLowerCase()] = (qty as number) * s.labCount;
      }
      specialActive.push(labRecipe);
    }
  }

  // 构建 LP（无论是否有 GameData 都会执行）
  // 合并固定需求（只保留真正的需求，如火箭、研究设备等）
  // 居民消耗已移入配方，不再放入 fixedDemands
  const allFixedDemands = getFixedDemands(); // 不含居民
  const positiveDemands = [...s.demands, ...allFixedDemands.filter(d => !ignored.has(d.item) && !excluded.has(d.item) && d.rate >= 0)];

  console.log('allowExternal value:', s.allowExternal);
  // 临时强制设为 true
  const effectiveAllowExternal = true;

  const { lpString, varNames, missing } = buildLp({
    mainActive,
    powerActive,
    residentActive,
    stationActive,
    specialActive,
    ignored,
    demands: positiveDemands,
    externalSupplies: allExternalSupplies,
    reductionFactor,
    steamLowMode: s.steamLowMode as 'internal' | 'shared',
    excludedItems: excluded,
    constraintMode: s.constraintMode,
    allowExternal: effectiveAllowExternal,
  });

  // 保存快照供结果组件使用（顺序：主模块、电力模块、居民模块、空间站模块、特殊模块）
  useStore.getState().setSolverActive([...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive]);
  useStore.getState().setSolverVarNames(varNames);
  setSolverMissing(missing);

  console.log('LP 字符串：', lpString);

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
    // 注意：不再 return，继续求解，让求解器报告 Infeasible
  }

  setIsSolving(true);
  try {
    const worker = new Worker('/solver.worker.js');
    const requestId = Date.now();

    const timeoutId = setTimeout(() => {
      worker.terminate();
      setIsSolving(false);
      setDiagnostic('求解超时，请简化配方选择或允许外部供给。');
    }, 30000);

    worker.onmessage = (e) => {
      clearTimeout(timeoutId);
      const data = e.data;
      console.log('Solver result:', data.result);
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
        setDiagnostic(''); // 清除之前的警告
      } else if (result.Status === 'Infeasible') {
        const prev = useStore.getState().diagnostic;
        setDiagnostic(prev + '<br>💡 当前设置无法平衡所有中间产物。请勾选"允许外部供给"或调整需求。');
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutId);
      setIsSolving(false);
      setDiagnostic(`Worker 错误: ${err.message}`);
      worker.terminate();
    };

    worker.postMessage({ lpString, requestId });
  } catch (err: any) {
    setIsSolving(false);
    setDiagnostic(`求解器错误: ${err.message}`);
  }
}, [getFixedDemands]);
  


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
            // 重新加载原始数据并设置默认值
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