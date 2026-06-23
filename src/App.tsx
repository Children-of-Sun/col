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
import { isContinuous } from './utils/format';
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
        // Worker 可能返回 {error: "..."}（求解器崩溃）而非 {result: {...}}
        if (e.data.error) {
          console.warn('[runLpSolver] Worker 返回错误:', e.data.error);
          reject(new Error(e.data.error));
          return;
        }
        const result = e.data.result;
        if (result) {
          console.log('[runLpSolver] 求解器返回状态:', result.Status, '| 变量数:', Object.keys(result.Columns || result.columns || {}).length);
        } else {
          console.log('[runLpSolver] 求解器返回空结果, e.data:', JSON.stringify(e.data).slice(0, 500));
        }
        resolve(result);
      };
      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(new Error(err.message));
      };
      // 在 milp 模式下传入原生 HiGHS MIP 选项
      const options = integerMode === 'milp' ? { time_limit: 60, presolve: 'on' } : undefined;
      worker.postMessage({ lpString, requestId: Date.now(), options });
    });
  };

  // solveLp：基础 LP 求解
  const solveLp = async (lpString: string, varNames: string[], integerMode?: string, tradeActive?: Recipe[], fixedUnityConsumption?: number, researchCohesionTotal?: number) => {
    const result = await runLpSolver(lpString, varNames, integerMode);
    console.log('求解结果变量示例:', Object.entries(result.Columns || {}).slice(0, 10));
    setResult(result);
    setIsSolving(false);
    const st = result?.Status;
    if (st === 'Optimal' || st === 'Feasible' || st === 'NodeLimit' || st === 'TimeLimit' || st === 'SolutionLimit') {
      setDiagnostic(st === 'Optimal' ? '' : `⚠️ 求解完成 (状态: ${st}，已得可行解但未证最优)`);
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
    } else if (st === 'Infeasible') {
      const prev = useStore.getState().diagnostic;
      setDiagnostic(prev + '<br>💡 当前设置无法平衡所有中间产物。请勾选"允许外部供给"或调整需求。');
    }
  };

  // solveCeilMode：向上取整模式（迭代填补 ceil 差额直到误差 < 0.1%）
  const solveCeilMode = async (lpString: string, varNames: string[], mainActive: Recipe[]) => {
    try {
      setDiagnostic('🔄 求解中 (取整模式)...');

      // 预构建配方数据（整个迭代过程复用）
      const state = useStore.getState();
      const result = buildActiveRecipes(state, solarEfficiency, getFixedDemands);
      if (!result) {
        setDiagnostic('没有启用的配方。');
        setIsSolving(false);
        return;
      }

      const { mainActive: ma, powerActive, residentActive, stationActive, specialActive, tradeActive,
        ignored, excludedOutputs, excludedInputs, reductionFactor, allExternalSupplies,
        fixedUnityProduction, fixedUnityConsumption, positiveDemands } = result;

      const allRecipes = [...ma, ...powerActive, ...residentActive, ...stationActive, ...specialActive, ...tradeActive];
      // 排除固定变量：居民(r*)、空间站(s*)、特殊(t* = t+数字)，保留贸易(tr*)参与取整
      // 使用可变变量以便迭代中更新（LP 重建后 varNames 可能变化）
      let currentVarNames = varNames;
      let currentMachineVarNames = currentVarNames.filter(v =>
        !v.startsWith('r') && !v.startsWith('s') && !/^t\d/.test(v)
      );
      // 人口>0时强制居民模块最低值（即使排除人力也要满足人口需求）
      const pop = state.population;
      const residentValue = pop > 0 ? pop / 1000 : 0;

      // 辅助：从 LP 结果计算各资源的总产出和总消耗
      const computeResourceTotals = (lpResult: any): Record<string, { prod: number; cons: number }> => {
        const totals: Record<string, { prod: number; cons: number }> = {};
        for (let i = 0; i < currentVarNames.length; i++) {
          const val = lpResult.Columns?.[currentVarNames[i]]?.Primal || lpResult.columns?.[currentVarNames[i]]?.Primal || 0;
          if (val <= 0) continue;
          const recipe = allRecipes[i];
          // 产出
          for (const [item, qty] of Object.entries(recipe.outputs)) {
            let scale = 1;
            if (recipe.module !== 'trade' && !isContinuous(item)) scale = 60 / recipe.duration;
            if (!totals[item]) totals[item] = { prod: 0, cons: 0 };
            totals[item].prod += qty * scale * val;
          }
          // 投入
          for (const [item, qty] of Object.entries(recipe.inputs)) {
            let scale = 1;
            if (recipe.module !== 'trade' && !isContinuous(item)) scale = 60 / recipe.duration;
            if (!totals[item]) totals[item] = { prod: 0, cons: 0 };
            totals[item].cons += qty * scale * val;
          }
          // 维护
          for (const [item, qty] of Object.entries(recipe.upkeep)) {
            if (item === '凝聚力') continue;
            const reduction = item.startsWith('maintenance') ? reductionFactor : 0;
            const reducedQty = qty * (1 - reduction);
            if (!totals[item]) totals[item] = { prod: 0, cons: 0 };
            totals[item].cons += reducedQty * val;
          }
        }
        return totals;
      };

      // 辅助：根据 LP 结果计算取整差额
      const computeDeficits = (lpResult: any): Record<string, number> => {
        const deficits: Record<string, number> = {};
        for (const varName of currentMachineVarNames) {
          const idx = currentVarNames.indexOf(varName);
          if (idx < 0 || idx >= allRecipes.length) continue;
          const recipe = allRecipes[idx];
          const val = lpResult.Columns?.[varName]?.Primal || lpResult.columns?.[varName]?.Primal || 0;
          if (val <= 0) continue;
          const ceiled = Math.ceil(val);
          const extra = ceiled - val;
          if (extra < 1e-9) continue;

          for (const [resource, qty] of Object.entries(recipe.upkeep)) {
            if (resource === '凝聚力') continue;
            const reduction = resource.startsWith('maintenance') ? reductionFactor : 0;
            const extraQty = extra * qty * (1 - reduction);
            if (extraQty > 1e-9) {
              deficits[resource] = (deficits[resource] || 0) + extraQty;
            }
          }
        }
        return deficits;
      };

      // 迭代：逐步填补差额直到误差 < 0.01%
      const MAX_ITER = 10;
      let currentResult = await runLpSolver(lpString, varNames);
      if (currentResult?.Status !== 'Optimal') {
        setDiagnostic(`连续求解失败: ${currentResult?.Status || '未知'}`);
        setIsSolving(false);
        return;
      }

      // ceil 差额本质是"额外需求"，统一走需求路径，避免与用户外部供给冲突
      const extraDemandMap: Record<string, number> = {};
      let prevDeficits: Record<string, number> = {};
      let totalIterations = 0;

      for (let iter = 0; iter < MAX_ITER; iter++) {
        const deficits = computeDeficits(currentResult);
        const extraEntries = Object.entries(deficits)
          .filter(([_, rate]) => rate > 1e-9);

        if (extraEntries.length === 0) break; // 完全收敛

        // 六种资源本轮与上一轮差额的绝对值 < 0.0001 即收敛（第一轮跳过，无上一轮数据）
        const MONITORED_RESOURCES = new Set(['人力', 'electricity', 'computing', 'maintenance i', 'maintenance ii', 'maintenance iii']);
        if (iter > 0) {
          let allConverged = true;
          for (const resource of MONITORED_RESOURCES) {
            const curr = deficits[resource] || 0;
            const prev = prevDeficits[resource] || 0;
            if (Math.abs(curr - prev) > 0.0001) {
              allConverged = false;
              break;
            }
          }
          if (allConverged) break;
        }
        prevDeficits = { ...deficits };

        // 未收敛：所有差额统一作为额外需求（不区分原需求/中间产物）
        for (const [item, rate] of extraEntries) {
          extraDemandMap[item] = rate;
        }
        totalIterations = iter + 1;

        if (DEBUG) {
          console.log(`=== 取整模式 第${iter + 1}轮差额 ===`);
          for (const [item, rate] of extraEntries) {
            console.log(`  [需求] ${item}: +${rate.toFixed(4)}`);
          }
        }

        // 用累加 map 构建单一条目列表（每个 item 只有一条）
        const augmentedDemands = [
          ...positiveDemands,
          ...Object.entries(extraDemandMap).map(([item, rate]) => ({ item, rate }))
        ];
        const augmentedSupplies = [...allExternalSupplies];
        const { lpString: newLp, varNames: newVarNames } = buildLp({
          mainActive: ma, powerActive, residentActive, stationActive, specialActive, tradeActive,
          ignored, demands: augmentedDemands, externalSupplies: augmentedSupplies,
          reductionFactor, steamLowMode: state.steamLowMode as 'internal' | 'shared',
          excludedOutputs, excludedInputs, constraintMode: state.constraintMode,
          allowExternal: state.allowExternal, optimizationMode: state.optimizationMode,
          customWeights: state.customWeights,
          fixedUnityProduction, fixedUnityConsumption,
          integerMode: 'continuous',
          relaxLabor: true,
          minResidentValue: residentValue > 0 ? residentValue : undefined,
          enableRedundancy: state.enableRedundancy,
          globalLower: state.globalLower, globalUpper: state.globalUpper,
          redundancyResources: state.redundancyResources,
          recipeIntegerEnabled: state.recipeIntegerEnabled,
        });

        // 更新当前变量名和机器变量名（LP 重建后可能变化）
        currentVarNames = newVarNames;
        currentMachineVarNames = currentVarNames.filter(v =>
          !v.startsWith('r') && !v.startsWith('s') && !/^t\d/.test(v)
        );

        const newResult = await runLpSolver(newLp, newVarNames);
        if (newResult?.Status !== 'Optimal') {
          // 本轮无解，回退到上一轮结果
          if (DEBUG) console.log(`第${iter + 1}轮无解，回退到上一轮`);
          break;
        }
        currentResult = newResult;
      }

      // 输出最终结果
      if (currentResult?.Status === 'Optimal') {
        setResult(currentResult);
        setIsSolving(false);
        const totalExtraDemands = Object.values(extraDemandMap).reduce((a, b) => a + b, 0);
        if (totalIterations > 0) {
          setDiagnostic(`✅ 取整模式求解完成 (迭代${totalIterations}轮，额外需求${totalExtraDemands.toFixed(1)})`);
        } else {
          setDiagnostic('✅ 取整模式求解完成（无需额外补充）');
        }
      } else {
        // 完全不可行则回退连续解
        setDiagnostic('⚠️ 取整迭代后仍无解，回退为连续解...');
        const { lpString: fallbackLp, varNames: fallbackVarNames } = buildLp({
          mainActive: ma, powerActive, residentActive, stationActive, specialActive, tradeActive,
          ignored, demands: positiveDemands, externalSupplies: allExternalSupplies,
          reductionFactor, steamLowMode: state.steamLowMode as 'internal' | 'shared',
          excludedOutputs, excludedInputs, constraintMode: state.constraintMode,
          allowExternal: state.allowExternal, optimizationMode: state.optimizationMode,
          customWeights: state.customWeights,
          fixedUnityProduction, fixedUnityConsumption,
          integerMode: 'continuous',
          minResidentValue: residentValue > 0 ? residentValue : undefined,
          enableRedundancy: state.enableRedundancy,
          globalLower: state.globalLower, globalUpper: state.globalUpper,
          redundancyResources: state.redundancyResources,
          recipeIntegerEnabled: state.recipeIntegerEnabled,
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

    // 混合整数模式：自动开启冗余系统，并为取整配方的产出物自动加入冗余
    let effectiveEnableRedundancy = s.enableRedundancy;
    let effectiveRedundancyResources = { ...s.redundancyResources };

    if (integerMode === 'milp') {
      // 混合整数模式强制开启冗余（自动冗余项已在模式切换时加入）
      effectiveEnableRedundancy = true;
    } else {
      // 非 MILP 模式：过滤掉自动冗余项，仅保留用户手动配置的
      for (const key of Object.keys(s.redundancyAutoItems)) {
        delete effectiveRedundancyResources[key];
      }
    }

    // 将结果后处理抽取为公共函数
    const finalizeResult = (lpResult: any, usedVarNames: string[], diagnosticExtra: string) => {
      setResult(lpResult);
      setIsSolving(false);
      // MIP 求解器可能返回 NodeLimit/TimeLimit/Feasible 等"有解但未证最优"状态
      const st = lpResult?.Status;
      if (st === 'Optimal' || st === 'Feasible' || st === 'NodeLimit' || st === 'TimeLimit' || st === 'SolutionLimit') {
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
      } else if (st === 'Infeasible') {
        setDiagnostic((diagnosticExtra || '') + '<br>💡 当前设置无法平衡所有中间产物。');
      }
    };

    // 构建 LP 基础参数
    const pop = s.population;
    const residentFixed = pop > 0 ? pop / 1000 : 0;

    const lpBaseParams = {
      mainActive, powerActive, residentActive, stationActive, specialActive, tradeActive,
      ignored, demands: positiveDemands, externalSupplies: allExternalSupplies,
      reductionFactor, steamLowMode: s.steamLowMode as 'internal' | 'shared',
      excludedOutputs, excludedInputs, constraintMode: s.constraintMode,
      allowExternal: effectiveAllowExternal, optimizationMode, customWeights,
      fixedUnityProduction, fixedUnityConsumption, integerMode,
      // 资源冗余设置
      enableRedundancy: effectiveEnableRedundancy,
      globalLower: s.globalLower,
      globalUpper: s.globalUpper,
      redundancyResources: effectiveRedundancyResources,
      recipeIntegerEnabled: s.recipeIntegerEnabled,
      // 人口 > 0 时强制居民模块最低值，防止被归零
      minResidentValue: residentFixed > 0 ? residentFixed : undefined,
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

    // ========== 第一趟：居民自由但 >= 人口/1000，人力平衡约束 ==========
    const pass1Lp = buildLp({
      ...lpBaseParams,
      relaxLabor: false,
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
    // MIP 求解器可能返回多种"有解"状态（NodeLimit=达到节点上限，TimeLimit=超时，Feasible=可行未证最优）
    const MIP_SUCCESS = new Set(['Optimal', 'Feasible', 'NodeLimit', 'TimeLimit', 'SolutionLimit']);
    const isMipSuccess = (st: string | undefined): boolean => !!st && MIP_SUCCESS.has(st);

    // MILP 模式下：收集需要取整的配方→变量映射，用于后处理圆整
    const getIntegerVarMap = (): Map<string, { recipe: Recipe; varName: string }> => {
      const map = new Map<string, { recipe: Recipe; varName: string }>();
      for (let i = 0; i < mainActive.length; i++) {
        const r = mainActive[i];
        if (s.recipeIntegerEnabled[r.id] === true) {
          map.set(`x${i}`, { recipe: r, varName: `x${i}` });
        }
      }
      for (let i = 0; i < powerActive.length; i++) {
        const r = powerActive[i];
        if (s.recipeIntegerEnabled[r.id] === true) {
          map.set(`p${i}`, { recipe: r, varName: `p${i}` });
        }
      }
      return map;
    };

    // 将 LP 结果中整数变量的值圆整，生成 fixedMachines
    const roundIntegerVars = (lpResult: any, varNames: string[], intVarMap: Map<string, any>, method: 'nearest' | 'ceil' = 'nearest'): Record<string, number> => {
      const fixed: Record<string, number> = {};
      const cols = lpResult?.Columns || lpResult?.columns || {};
      for (const [varName] of intVarMap) {
        const col = cols[varName];
        const val = col?.Primal ?? col?.primal ?? 0;
        if (val <= 1e-9) continue;
        const rounded = method === 'ceil' ? Math.ceil(val) : Math.round(val);
        if (rounded > 0) fixed[varName] = rounded;
      }
      return fixed;
    };

    try {
      if (integerMode === 'continuous') {
        // 连续模式：直接求解
        let diagHeader = '🔍 第一趟：按设定人口求解...';
        if (rdEnabled) {
          diagHeader += `<br>📊 <b>冗余已启用</b>: 全局 ${s.globalLower}%~${s.globalUpper}%, 显式配置=${rdExplicitlyConfigured.length}个, 禁用=${rdExplicitlyDisabled.length}个，其余自动启用`;
        }
        setDiagnostic(diagHeader);
        const pass1Result = await runLpSolver(pass1Lp.lpString, pass1Lp.varNames, 'continuous');

        if (isMipSuccess(pass1Result?.Status)) {
          const actualLabor = computeTotalLabor(pass1Result, pass1Lp.varNames);
          const laborIgnored = s.ignoredItems.includes('人力');
          if (actualLabor <= pop + 1e-9 || laborIgnored) {
            const msg = laborIgnored ? '✅ 求解完成（人力已忽略，跳过第二趟）。' : '✅ 求解完成，人力未超人口。';
            finalizeResult(pass1Result, pass1Lp.varNames, msg);
            return;
          }
          // 人力超 → 第二趟
          setDiagnostic(`⚠️ 实际人力(${Math.ceil(actualLabor)})超人口(${pop})，第二趟：加入人力约束...`);
          const pass2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
          useStore.getState().setSolverVarNames(pass2Lp.varNames);
          setSolverMissing(pass2Lp.missing);
          const pass2Result = await runLpSolver(pass2Lp.lpString, pass2Lp.varNames, 'continuous');
          if (isMipSuccess(pass2Result?.Status)) {
            finalizeResult(pass2Result, pass2Lp.varNames, `⚠️ 人力不足（需${Math.ceil(actualLabor)}，人口${pop}），已加入人力约束。`);
          } else {
            finalizeResult(pass2Result, pass2Lp.varNames, `⚠️ 人力约束下不可行。`);
          }
        } else {
          setDiagnostic('⚠️ 第一趟不可行，尝试加入人力约束...');
          const pass2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
          useStore.getState().setSolverVarNames(pass2Lp.varNames);
          setSolverMissing(pass2Lp.missing);
          const pass2Result = await runLpSolver(pass2Lp.lpString, pass2Lp.varNames, 'continuous');
          finalizeResult(pass2Result, pass2Lp.varNames, isMipSuccess(pass2Result?.Status) ? '⚠️ 人力约束下求得可行解。' : '');
        }
      } else if (integerMode === 'rounding' || integerMode === 'milp') {
        // 去除 LP 中的 Bounds+Integer 段（HiGHS WASM 解析会崩溃）
        const stripIntegerSection = (lp: string) => lp.replace(/\nBounds\n[\s\S]*?\nEND/, '\nEND');

        // 圆整/MILP 模式共用的"连续解+迭代圆整"核心逻辑
        const runRoundingSolver = async (diagPrefix: string, fallbackMsg: string) => {
          const intVarMap = getIntegerVarMap();
          const strippedLp = buildLp({ ...lpBaseParams }); // MILP 约束语义（如 integerMode='milp' 影响 lowerFactor）
          const safeLpString = stripIntegerSection(strippedLp.lpString);

          let diagHeader = `🔍 ${diagPrefix}...`;
          if (rdEnabled) {
            diagHeader += `<br>📊 <b>冗余已启用</b>: 全局 ${s.globalLower}%~${s.globalUpper}%, 显式配置=${rdExplicitlyConfigured.length}个, 禁用=${rdExplicitlyDisabled.length}个，其余自动启用`;
          }
          setDiagnostic(diagHeader);
          const result1 = await runLpSolver(safeLpString, strippedLp.varNames, 'continuous');

          if (!isMipSuccess(result1?.Status)) {
            setDiagnostic('⚠️ 第一趟不可行，尝试加入人力约束...');
            const pass2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
            const safe2 = stripIntegerSection(pass2Lp.lpString);
            useStore.getState().setSolverVarNames(pass2Lp.varNames);
            setSolverMissing(pass2Lp.missing);
            const pass2Result = await runLpSolver(safe2, pass2Lp.varNames, 'continuous');
            finalizeResult(pass2Result, pass2Lp.varNames, isMipSuccess(pass2Result?.Status) ? '⚠️ 人力约束下求得可行解。' : '');
            return;
          }

          // 连续解成功 → 逐个迭代圆整
          const cols = result1?.Columns || result1?.columns || {};
          const intEntries: { varName: string; continuousVal: number; nearest: number; ceil: number; distance: number }[] = [];
          for (const [varName] of intVarMap) {
            const val = cols[varName]?.Primal ?? cols[varName]?.primal ?? 0;
            if (val <= 1e-9) continue;
            const nearest = Math.round(val);
            const ceil = Math.ceil(val);
            intEntries.push({ varName, continuousVal: val, nearest, ceil, distance: Math.abs(val - nearest) });
          }
          if (intEntries.length === 0) {
            finalizeResult(result1, strippedLp.varNames, `${diagPrefix} 完成（无整数变量需圆整）。`);
            return;
          }
          intEntries.sort((a, b) => a.distance - b.distance);

          const baseVarNames = strippedLp.varNames;
          const fixedSoFar: Record<string, number> = {};
          let fixedCount = 0;
          let skippedCount = 0;

          for (const entry of intEntries) {
            for (const roundVal of [entry.nearest, entry.ceil]) {
              if (roundVal <= 0) continue;
              if (entry.nearest === entry.ceil && roundVal === entry.ceil) continue;
              const testFixed = { ...fixedSoFar, [entry.varName]: roundVal };
              const testLp = buildLp({ ...lpBaseParams, fixedMachines: testFixed });
              const safeTestLp = stripIntegerSection(testLp.lpString);
              try {
                const testResult = await runLpSolver(safeTestLp, testLp.varNames, 'continuous');
                if (isMipSuccess(testResult?.Status)) {
                  fixedSoFar[entry.varName] = roundVal;
                  fixedCount++;
                  if (DEBUG) console.log(`[${diagPrefix}] 固定 ${entry.varName} = ${roundVal} (连续=${entry.continuousVal.toFixed(3)}) 成功, 已固定=${fixedCount}`);
                  break;
                }
              } catch (_) { /* skip */ }
            }
            if (!fixedSoFar[entry.varName]) skippedCount++;
            if ((fixedCount + skippedCount) % 5 === 0 || fixedCount + skippedCount === intEntries.length) {
              setDiagnostic(`🔍 ${diagPrefix}: ${fixedCount} 已取整, ${skippedCount} 跳过, ${intEntries.length - fixedCount - skippedCount} 待处理...`);
            }
          }

          if (fixedCount > 0) {
            const finalLp = buildLp({ ...lpBaseParams, fixedMachines: fixedSoFar });
            const safeFinal = stripIntegerSection(finalLp.lpString);
            useStore.getState().setSolverVarNames(finalLp.varNames);
            setSolverMissing(finalLp.missing);
            const finalResult = await runLpSolver(safeFinal, finalLp.varNames, 'continuous');
            if (isMipSuccess(finalResult?.Status)) {
              const msg = skippedCount > 0
                ? `${diagPrefix} 完成：${fixedCount} 个配方取整，${skippedCount} 个无法圆整保留连续值。`
                : `${diagPrefix} 完成：${fixedCount} 个配方全部取整成功。`;
              finalizeResult(finalResult, finalLp.varNames, msg);
              return;
            }
          }
          setDiagnostic(`⚠️ ${fallbackMsg}`);
          finalizeResult(result1, baseVarNames, `⚠️ ${fallbackMsg}，展示连续解（配方<b>未取整</b>）。`);
        };

        if (integerMode === 'milp') {
          // ====== MILP: Native HiGHS MIP ======
          const milpLp = buildLp({ ...lpBaseParams });
          const intVarMap = getIntegerVarMap();
          if (intVarMap.size === 0) {
            setDiagnostic('MILP: no integer vars enabled');
            setIsSolving(false);
            return;
          }
          setDiagnostic(`MILP (${intVarMap.size} vars): solving with HiGHS MIP...`);
          try {
            const mipResult = await runLpSolver(milpLp.lpString, milpLp.varNames, 'milp');
            if (isMipSuccess(mipResult?.Status)) {
              const actualLabor = computeTotalLabor(mipResult, milpLp.varNames);
              const laborIgnored = s.ignoredItems.includes('人力');
              if (actualLabor <= pop + 1e-9 || laborIgnored) {
                finalizeResult(mipResult, milpLp.varNames, `MILP done (${intVarMap.size} int vars)`);
                return;
              }
              setDiagnostic('Labor exceeds pop, re-solving...');
              const p2Lp = buildLp({ ...lpBaseParams, relaxLabor: false });
              const p2Result = await runLpSolver(p2Lp.lpString, p2Lp.varNames, 'milp');
              if (isMipSuccess(p2Result?.Status)) {
                finalizeResult(p2Result, p2Lp.varNames, 'MILP + labor constraint done.');
              } else {
                finalizeResult(p2Result, p2Lp.varNames, 'MILP: infeasible under labor constraint.');
              }
              return;
            }
            setDiagnostic('MILP returned no feasible solution.');
            setIsSolving(false);
          } catch (err: any) {
            console.warn('[handleSolve] MILP error:', err.message);
            setDiagnostic('MILP solver error: ' + err.message);
            setIsSolving(false);
          }
        } else {
          // ====== 圆整模式：直接使用连续解+迭代圆整 ======
          await runRoundingSolver('圆整模式', '圆整失败');
        }
      } else if (integerMode === 'ceil') {
        await solveCeilMode(pass1Lp.lpString, pass1Lp.varNames, mainActive);
      }
    } catch (err: any) {
      // 整数模式下的最终回退
      if (integerMode === 'milp' || integerMode === 'rounding') {
        console.warn(`[handleSolve] ${integerMode} 崩溃，回退连续模式:`, err.message);
        try {
          const fallbackLp = buildLp({ ...lpBaseParams, integerMode: 'continuous' });
          useStore.getState().setSolverVarNames(fallbackLp.varNames);
          setSolverMissing(fallbackLp.missing);
          const fbResult = await runLpSolver(fallbackLp.lpString, fallbackLp.varNames, 'continuous');
          const fbSt = fbResult?.Status;
          if (fbSt === 'Optimal' || fbSt === 'Feasible' || fbSt === 'NodeLimit' || fbSt === 'TimeLimit' || fbSt === 'SolutionLimit') {
            finalizeResult(fbResult, fallbackLp.varNames, '⚠️ 求解器不可用，已回退为连续解。');
          } else {
            finalizeResult(fbResult, fallbackLp.varNames, '⚠️ 连续回退也失败。');
          }
        } catch (err2: any) {
          setIsSolving(false);
          setDiagnostic(`求解器错误: ${err2.message}`);
        }
      } else {
        setIsSolving(false);
        setDiagnostic(`求解器错误: ${err.message}`);
      }
    }
  }, [getFixedDemands, solarEfficiency, solveCeilMode]);

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