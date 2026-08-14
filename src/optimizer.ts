import { buildLp } from './lpBuilder';
import { useStore } from './stores';
import { Recipe, Demand, SolverResult } from './types';
import { buildActiveRecipes } from './buildActiveRecipes';
import { getColValue } from './utils';

// 求解器运行函数（复用原有 runLpSolver）
declare function runLpSolver(lpString: string, varNames: string[], integerMode?: string): Promise<SolverResult>;

// 需求优先级定义（数值越小越重要）
const DEMAND_PRIORITY: Record<string, number> = {
  'water': 1,
  'electricity': 1,
  '人力': 1,
  'computing': 1,
  'maintenance i': 1,
  'maintenance ii': 1,
  'maintenance iii': 1,
  'potato': 2,
  'bread': 2,
  'meat': 2,
  'vegetables': 2,
  'medical supplies': 2,
  'household goods': 3,
  'consumer electronics': 3,
  'luxury goods': 4,
  // 可扩展...
};
const DEFAULT_PRIORITY = 5;

interface SolveResult {
  status: 'optimal' | 'infeasible' | 'relaxed';
  result: SolverResult | null;
  diagnostic: string;
  surplusItems?: { item: string; amount: number; sourceRecipes: Recipe[] }[];
}

/** 从 LP 求解结果计算实际人力消耗 */
function computeTotalLabor(
  result: SolverResult,
  varNames: string[],
  recipeBuild: ReturnType<typeof buildActiveRecipes>,
): number {
  let totalLabor = 0;
  const allRecipes = [
    ...recipeBuild!.mainActive,
    ...recipeBuild!.powerActive,
    ...recipeBuild!.residentActive,
    ...recipeBuild!.stationActive,
    ...recipeBuild!.specialActive,
    ...recipeBuild!.tradeActive,
  ];
  for (let i = 0; i < varNames.length; i++) {
    const val = getColValue(result, varNames[i]);
    if (val > 0) {
      totalLabor += (allRecipes[i]?.upkeep['人力'] || 0) * val;
    }
  }
  return totalLabor;
}

export async function solveWithFallback(
  solarEfficiency: number,
  getFixedDemands: () => Demand[],
  setDiagnostic: (msg: string) => void,
  setIsSolving: (v: boolean) => void,
  setResult: (r: SolverResult | null) => void,
  setUnityProduction: (v: number) => void,
  setUnityConsumption: (v: number) => void,
  setCohesionTradeDirect: (v: number) => void,
  setCohesionTradeMaintenance: (v: number) => void,
  setCohesionEdict: (v: number) => void,
  setExternalSupplies: (s: { item: string; rate: number }[]) => void,
  setSolverMissing: (m: string[]) => void,
): Promise<SolveResult> {
  const state = useStore.getState();

  // 辅助函数：构建并求解 LP
  const runWithParams = async (params: {
    allowExternal: boolean;
    demands: Demand[];
    externalSupplies: { item: string; rate: number }[];
    priorityCut?: number;
    relaxLabor?: boolean;
    fixedMachines?: Record<string, number>;
  }) => {
    const recipeBuild = buildActiveRecipes(
      state, solarEfficiency, getFixedDemands,
    );
    if (!recipeBuild) throw new Error('没有启用的配方');

    let finalDemands = params.demands;
    if (params.priorityCut !== undefined) {
      finalDemands = params.demands.map(d => {
        const priority = DEMAND_PRIORITY[d.item.toLowerCase()] || DEFAULT_PRIORITY;
        if (priority > params.priorityCut!) {
          return { ...d, rate: 0 };
        }
        return d;
      }).filter(d => d.rate !== 0);
    }

    const { lpString, varNames, missing } = buildLp({
      ...recipeBuild,
      demands: finalDemands,
      externalSupplies: params.externalSupplies,
      allowExternal: params.allowExternal,
      constraintMode: state.constraintMode,
      optimizationMode: state.optimizationMode,
      customWeights: state.customWeights,
      fixedUnityProduction: recipeBuild.fixedUnityProduction,
      fixedUnityConsumption: recipeBuild.fixedUnityConsumption,
      integerMode: state.integerMode,
      steamLowMode: state.steamLowMode as 'internal' | 'shared',
      excludedOutputs: new Set(state.excludedOutputs),
      excludedInputs: new Set(state.excludedInputs),
      ignored: new Set(state.ignoredItems),
      relaxLabor: params.relaxLabor ?? false,
      fixedMachines: params.fixedMachines ?? {},
      enableRedundancy: state.enableRedundancy,
      globalLower: state.globalLower,
      globalUpper: state.globalUpper,
      redundancyResources: state.redundancyResources,
    });

    setSolverMissing(missing);
    const result = await runLpSolver(lpString, varNames, state.integerMode);
    return { result, varNames, recipeBuild, finalDemands };
  };

  const pop = state.population;
  const residentFixed = pop > 0 ? pop / 1000 : 0;

  // ========== 第一趟：居民固定为人口/1000，无人力约束 ==========
  setDiagnostic('🔍 第一趟：按设定人口求解...');
  const pass1 = await runWithParams({
    allowExternal: false,
    demands: state.demands,
    externalSupplies: [],
    relaxLabor: true,
    fixedMachines: residentFixed > 0 ? { r0: residentFixed } : {},
  });

  if (pass1.result?.Status === 'Optimal') {
    const actualLabor = computeTotalLabor(pass1.result, pass1.varNames, pass1.recipeBuild);

    if (actualLabor <= pop + 1e-9) {
      // 人力足够，直接返回
      setResult(pass1.result);
      setIsSolving(false);
      setDiagnostic('✅ 求解完成，人力未超人口。');
      return { status: 'optimal', result: pass1.result, diagnostic: '' };
    }

    // ========== 第二趟：人力超人口，加入人力约束 ==========
    setDiagnostic(`⚠️ 实际人力(${Math.ceil(actualLabor)})超人口(${pop})，第二趟：加入人力约束...`);
    const pass2 = await runWithParams({
      allowExternal: false,
      demands: state.demands,
      externalSupplies: [],
      relaxLabor: false, // 强制人力约束
    });

    if (pass2.result?.Status === 'Optimal') {
      setResult(pass2.result);
      setIsSolving(false);
      setDiagnostic(`⚠️ 人力不足（需${Math.ceil(actualLabor)}，人口${pop}），已加入人力约束重新求解。`);
      return { status: 'relaxed', result: pass2.result, diagnostic: '人力约束' };
    }

    // 第二趟人力约束下不可行 → 继续走回退
  } else {
    // 第一趟就不可行
  }

  // ========== 回退阶段：允许外部供给 ==========
  setDiagnostic('⚠️ 不可行，尝试允许外部供给...');
  const relaxed = await runWithParams({
    allowExternal: true,
    demands: state.demands,
    externalSupplies: [],
    relaxLabor: true,
  });
  if (relaxed.result?.Status === 'Optimal') {
    setResult(relaxed.result);
    setIsSolving(false);
    setDiagnostic('✅ 在允许外部供给下求得可行解。请查看"副产物过剩诊断"了解可改进项。');
    return { status: 'relaxed', result: relaxed.result, diagnostic: '允许外部供给' };
  }

  // ========== 回退阶段：逐步削减低优先级需求 ==========
  const priorities = [5, 4, 3, 2];
  for (const cutLevel of priorities) {
    setDiagnostic(`🔄 削减优先级 >${cutLevel} 的需求...`);
    const cut = await runWithParams({
      allowExternal: true,
      demands: state.demands,
      externalSupplies: [],
      priorityCut: cutLevel,
      relaxLabor: true,
    });
    if (cut.result?.Status === 'Optimal') {
      setResult(cut.result);
      setIsSolving(false);
      setDiagnostic(`⚠️ 部分高优先级需求被削减（优先级>${cutLevel}）后求得可行解。`);
      return { status: 'relaxed', result: cut.result, diagnostic: `优先级削减到${cutLevel}` };
    }
  }

  // 最终失败
  setDiagnostic('❌ 即使放宽所有约束也无法找到可行解，请检查数据或手动调整。');
  setIsSolving(false);
  return { status: 'infeasible', result: null, diagnostic: '无可行解' };
}