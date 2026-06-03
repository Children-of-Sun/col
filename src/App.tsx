import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from './stores';
import { MainLevelPanel, PowerPanel, SpaceStationPanel, StatuePanel, DemandPanel } from './components/Panels';
import { LabPanel } from './components/LabPanel';
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
import { t } from './utils';
import { buildActiveRecipes } from './buildActiveRecipes';
import { Demand, Recipe } from './types';
import './App.css';
console.log('OptionsPanel imported:', OptionsPanel);

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
              let fileName = b.icon_path.split('/').pop() || '';
              fileName = fileName.replace(/\.svg$/i, '.png');
              buildingIcons[b.id] = `icons/buildings/${fileName}`;
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
              let fileName = p.icon_path.split('/').pop() || '';
              fileName = fileName.replace(/\.svg$/i, '.png');
              productIcons[nameLower] = `icons/products/${fileName}`;
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
  const solveCeilMode = async (lpString: string, varNames: string[], mainActive: Recipe[]) => {
    try {
      setDiagnostic('🔄 求解中 (取整模式)...');
      // 第一次 LP 求解
      const lpResult = await runLpSolver(lpString, varNames);
      if (lpResult?.Status !== 'Optimal') {
        setDiagnostic(`连续求解失败: ${lpResult?.Status || '未知'}`);
        setIsSolving(false);
        return;
      }

      // 提取机器变量并向上取整（仅主模块和电力模块的建筑，排除贸易/农业/特殊/居民/空间站）
      const agriVarsCeil = new Set(
        mainActive.filter(r => r.category === '农业').map((_, i) => `x${i}`)
      );
      const machineVars = varNames.filter(v => !v.startsWith('r') && !v.startsWith('s') && !v.startsWith('t') && !v.startsWith('tr') && !agriVarsCeil.has(v));
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
        fixedMachines: fixed, // 传入固定值
        enableRedundancy: state.enableRedundancy,
        globalLower: state.globalLower,
        globalUpper: state.globalUpper,
        redundancyResources: state.redundancyResources,
      });

      const fixedResult = await runLpSolver(newLp, newVarNames);
      if (fixedResult?.Status === 'Optimal') {
        setResult(fixedResult);
        setIsSolving(false);
        setDiagnostic('✅ 取整模式求解完成');
      } else {
        // 回退：取整后无解，使用连续解兜底
        setDiagnostic('⚠️ 取整后无解，回退为连续解...');
        const { lpString: fallbackLp, varNames: fallbackVarNames } = buildLp({
          mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
          ignored, demands: positiveDemands, externalSupplies: allExternalSupplies,
          reductionFactor, steamLowMode: state.steamLowMode as 'internal' | 'shared',
          excludedOutputs, excludedInputs, constraintMode: state.constraintMode,
          allowExternal: state.allowExternal, optimizationMode: state.optimizationMode,
          customWeights: state.customWeights,
          fixedUnityProduction, fixedUnityConsumption,
          integerMode: 'continuous',
          enableRedundancy: state.enableRedundancy,
          globalLower: state.globalLower, globalUpper: state.globalUpper,
          redundancyResources: state.redundancyResources,
        });
        const fallbackResult = await runLpSolver(fallbackLp, fallbackVarNames);
        setResult(fallbackResult);
        setIsSolving(false);
        if (fallbackResult?.Status === 'Optimal') {
          setDiagnostic('⚠️ 取整后无解，已回退为连续解。');
        } else {
          setDiagnostic(`⚠️ 连续解也失败: ${fallbackResult?.Status || '未知'}`);
        }
      }
    } catch (err: any) {
      setDiagnostic(`取整模式错误: ${err.message}`);
      setIsSolving(false);
    }
  };

  // solveHeuristicMode：启发式取整模式（通过重新构建 LP 并传入 fixedMachines）
  const solveHeuristicMode = async (lpString: string, varNames: string[], mainActive: Recipe[]) => {
    try {
      setDiagnostic('🔄 求解中 (启发式模式)...');
      const fixed: Record<string, number> = {};
      const agriVarsHeur = new Set(
        mainActive.filter(r => r.category === '农业').map((_, i) => `x${i}`)
      );
      const machineVars = varNames.filter(v => !v.startsWith('r') && !v.startsWith('s') && !v.startsWith('t') && !v.startsWith('tr') && !agriVarsHeur.has(v));

      // 逐步固定变量，每次重新构建 LP
      for (let iter = 0; iter < Math.min(machineVars.length, 20); iter++) {
        const state = useStore.getState();

        // 重新构建 LP
        const result = buildActiveRecipes(
          state,
          solarEfficiency,
          getFixedDemands,
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
          fixedMachines: fixed,
          enableRedundancy: state.enableRedundancy,
          globalLower: state.globalLower,
          globalUpper: state.globalUpper,
          redundancyResources: state.redundancyResources,
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
          fixedMachines: fixed,
          enableRedundancy: state.enableRedundancy,
          globalLower: state.globalLower,
          globalUpper: state.globalUpper,
          redundancyResources: state.redundancyResources,
        });

        const finalResult = await runLpSolver(finalLp, finalVarNames);
        if (finalResult?.Status === 'Optimal') {
          setResult(finalResult);
          setIsSolving(false);
          setDiagnostic(`✅ 启发式模式求解完成 (固定 ${Object.keys(fixed).length} 个变量)`);
        } else {
          // 回退：取整后无解，使用连续解兜底
          setDiagnostic(`⚠️ 启发式取整后无解，回退为连续解...`);
          const { lpString: fallbackLp, varNames: fallbackVarNames } = buildLp({
            mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
            ignored, demands: positiveDemands, externalSupplies: allExternalSupplies,
            reductionFactor, steamLowMode: state.steamLowMode as 'internal' | 'shared',
            excludedOutputs, excludedInputs, constraintMode: state.constraintMode,
            allowExternal: state.allowExternal, optimizationMode: state.optimizationMode,
            customWeights: state.customWeights,
            fixedUnityProduction, fixedUnityConsumption,
            integerMode: 'continuous',
            enableRedundancy: state.enableRedundancy,
            globalLower: state.globalLower, globalUpper: state.globalUpper,
            redundancyResources: state.redundancyResources,
          });
          const fallbackResult = await runLpSolver(fallbackLp, fallbackVarNames);
          setResult(fallbackResult);
          setIsSolving(false);
          if (fallbackResult?.Status === 'Optimal') {
            setDiagnostic('⚠️ 启发式取整后无解，已回退为连续解。');
          } else {
            setDiagnostic(`⚠️ 连续解也失败: ${fallbackResult?.Status || '未知'}`);
          }
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

    // [DIAGNOSTIC] 冗余设置日志
    const rdEnabled = s.enableRedundancy;
    const rdExplicitlyConfigured = Object.keys(s.redundancyResources || {}).filter(k => s.redundancyResources[k]?.enabled === true);
    const rdExplicitlyDisabled = Object.keys(s.redundancyResources || {}).filter(k => s.redundancyResources[k]?.enabled === false);
    console.warn('[冗余] handleSolve 读取状态:', {
      enableRedundancy: rdEnabled,
      globalLower: s.globalLower,
      globalUpper: s.globalUpper,
      explicitlyConfigured: rdExplicitlyConfigured.length,
      explicitlyDisabled: rdExplicitlyDisabled.length,
      configuredItems: rdExplicitlyConfigured,
      disabledItems: rdExplicitlyDisabled,
    });

    // 使用 buildActiveRecipes 构建所有配方
    const result = buildActiveRecipes(
      s,
      solarEfficiency,
      getFixedDemands,
    );

    if (!result) {
      setDiagnostic('没有启用的配方。');
      return;
    }

    // [DIAGNOSTIC] 冗余状态摘要（显示在诊断输出中）
    if (rdEnabled) {
      console.warn(`[冗余] 状态: 已启用 (全局 L=${s.globalLower}% U=${s.globalUpper}%), 显式配置=${rdExplicitlyConfigured.length}个, 显式禁用=${rdExplicitlyDisabled.length}个, 其余物品自动使用全局值`);
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

    // 将结果后处理抽取为公共函数
    const finalizeResult = (lpResult: any, usedVarNames: string[], diagnosticExtra: string) => {
      setResult(lpResult);
      setIsSolving(false);
      if (lpResult?.Status === 'Optimal') {
        setDiagnostic(diagnosticExtra || '');
        if (tradeActive && tradeActive.length) {
          let actualDirect = 0;
          let actualMaintenance = 0;
          tradeActive.forEach((recipe, idx) => {
            const cols = lpResult?.Columns || lpResult?.columns || {};
            const val = cols[`tr${idx}`]?.Primal ?? cols[`tr${idx}`]?.primal ?? 0;
            actualDirect += (recipe.tradeUnityDirect || 0) * val;
            actualMaintenance += (recipe.tradeUnityMaintenance || 0) * val;
          });
          setCohesionTradeDirect(actualDirect);
          setCohesionTradeMaintenance(actualMaintenance);
          setUnityConsumption(actualDirect + actualMaintenance + fixedUnityConsumption + researchCohesionTotal);
        }
      } else if (lpResult?.Status === 'Infeasible') {
        setDiagnostic((diagnosticExtra || '') + '<br>💡 当前设置无法平衡所有中间产物。');
      }
    };

    // 构建 LP 基础参数
    const lpBaseParams = {
      mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
      ignored, demands: positiveDemands, externalSupplies: allExternalSupplies,
      reductionFactor, steamLowMode: s.steamLowMode as 'internal' | 'shared',
      excludedOutputs, excludedInputs, constraintMode: s.constraintMode,
      allowExternal: effectiveAllowExternal, optimizationMode, customWeights,
      fixedUnityProduction, fixedUnityConsumption, integerMode,
      // 资源冗余设置
      enableRedundancy: s.enableRedundancy,
      globalLower: s.globalLower,
      globalUpper: s.globalUpper,
      redundancyResources: s.redundancyResources,
    };

    // 计算总人力消耗（从 LP 结果）
    const computeTotalLabor = (lpResult: any, lpVarNames: string[]) => {
      const cols = lpResult?.Columns || lpResult?.columns;
      if (!cols) return 0;
      let total = 0;
      const allRecipes = [...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive];
      for (let i = 0; i < lpVarNames.length; i++) {
        const col = cols[lpVarNames[i]] || cols[`Column${i}`];
        const val = col?.Primal ?? col?.primal ?? 0;
        if (val > 0) total += (allRecipes[i]?.upkeep['人力'] || 0) * val;
      }
      return total;
    };

    const pop = s.population;
    const residentFixed = pop > 0 ? pop / 1000 : 0;

    // ========== 第一趟：居民自由但 >= 人口/1000，人力平衡约束 ==========
    const pass1Lp = buildLp({
      ...lpBaseParams,
      relaxLabor: false,
      minResidentValue: residentFixed > 0 ? residentFixed : undefined,
    });

    if (integerMode === 'milp') {
      console.log('=== MILP 模式 LP 结尾 ===');
      console.log(pass1Lp.lpString.slice(-800));
    }

    useStore.getState().setSolverActive([...mainActive, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive]);
    useStore.getState().setSolverVarNames(pass1Lp.varNames);
    setSolverMissing(pass1Lp.missing);

    if (DEBUG) {
      console.log('[调试] LP 字符串长度:', pass1Lp.lpString.length);
      console.log('[调试] 变量数量:', pass1Lp.varNames.length);
      console.log('[调试] 缺失物品:', pass1Lp.missing);
      console.log('[调试] integerMode:', integerMode);
    }

    if (pass1Lp.missing.length) {
      const trans = s.translation;
      setDiagnostic(`⚠️ 以下物品无生产配方：<br>${pass1Lp.missing.map(m =>
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
        // 第一趟求解
        let diagHeader = '🔍 第一趟：按设定人口求解...';
        if (rdEnabled) {
          diagHeader += `<br>📊 <b>冗余已启用</b>: 全局 ${s.globalLower}%~${s.globalUpper}%, 显式配置=${rdExplicitlyConfigured.length}个, 禁用=${rdExplicitlyDisabled.length}个，其余自动启用`;
        }
        setDiagnostic(diagHeader);
        const pass1Result = await runLpSolver(pass1Lp.lpString, pass1Lp.varNames, integerMode);

        if (pass1Result?.Status === 'Optimal') {
          const actualLabor = computeTotalLabor(pass1Result, pass1Lp.varNames);
          const laborIgnored = s.ignoredItems.includes('人力');
          if (actualLabor <= pop + 1e-9 || laborIgnored) {
            const msg = laborIgnored ? '✅ 求解完成（人力已忽略，跳过第二趟）。' : '✅ 求解完成，人力未超人口。';
            finalizeResult(pass1Result, pass1Lp.varNames, msg);
            return;
          }
          // 人力超人口 → 第二趟
          setDiagnostic(`⚠️ 实际人力(${Math.ceil(actualLabor)})超人口(${pop})，第二趟：加入人力约束...`);
          const pass2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
          useStore.getState().setSolverVarNames(pass2Lp.varNames);
          setSolverMissing(pass2Lp.missing);
          const pass2Result = await runLpSolver(pass2Lp.lpString, pass2Lp.varNames, integerMode);
          if (pass2Result?.Status === 'Optimal') {
            finalizeResult(pass2Result, pass2Lp.varNames, `⚠️ 人力不足（需${Math.ceil(actualLabor)}，人口${pop}），已加入人力约束。`);
          } else {
            finalizeResult(pass2Result, pass2Lp.varNames, `⚠️ 人力约束下不可行。`);
          }
          if (DEBUG) {
            console.log('=== 求解结果 - 贸易变量值 ===');
            const result = useStore.getState().result;
            if (result?.Status === 'Optimal') {
              tradeActive.forEach((recipe, idx) => {
                const val = (result.Columns || result.columns || {})[`tr${idx}`]?.Primal ?? (result.Columns || result.columns || {})[`tr${idx}`]?.primal ?? 0;
                console.log(`${recipe.name}: ${val}`);
              });
            }
          }
        } else {
          // 第一趟不可行 → 尝试人力约束版
          setDiagnostic('⚠️ 第一趟不可行，尝试加入人力约束...');
          const pass2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
          useStore.getState().setSolverVarNames(pass2Lp.varNames);
          setSolverMissing(pass2Lp.missing);
          const pass2Result = await runLpSolver(pass2Lp.lpString, pass2Lp.varNames, integerMode);
          finalizeResult(pass2Result, pass2Lp.varNames, pass2Result?.Status === 'Optimal' ? '⚠️ 人力约束下求得可行解。' : '');
        }
      } else if (integerMode === 'ceil') {
        await solveCeilMode(pass1Lp.lpString, pass1Lp.varNames, mainActive);
      } else if (integerMode === 'heuristic') {
        await solveHeuristicMode(pass1Lp.lpString, pass1Lp.varNames, mainActive);
      }
    } catch (err: any) {
      setIsSolving(false);
      setDiagnostic(`求解器错误: ${err.message}`);
    }
  }, [getFixedDemands, solarEfficiency, solveCeilMode, solveHeuristicMode]);

  return (
    <>
      <h1> 工业巨头量化计算器</h1>
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