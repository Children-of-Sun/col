import { buildLp } from './lpBuilder';
import { useStore } from './stores';
import { Recipe, Demand } from './types';
import { buildActiveRecipes } from './buildActiveRecipes';

// 求解器运行函数（复用原有 runLpSolver）
declare function runLpSolver(lpString: string, varNames: string[], integerMode?: string): Promise<any>;

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
  result: any;
  diagnostic: string;
  surplusItems?: { item: string; amount: number; sourceRecipes: Recipe[] }[];
}

export async function solveWithFallback(
  solarEfficiency: number,
  getFixedDemands: () => Demand[],
  setDiagnostic: (msg: string) => void,
  setIsSolving: (v: boolean) => void,
  setResult: (r: any) => void,
  setUnityProduction: (v: number) => void,
  setUnityConsumption: (v: number) => void,
  setCohesionTradeDirect: (v: number) => void,
  setCohesionTradeMaintenance: (v: number) => void,
  setCohesionEdict: (v: number) => void,
  setExternalSupplies: (s: any) => void,
  setSolverMissing: (m: string[]) => void,
): Promise<SolveResult> {
  const state = useStore.getState();
  
  // 辅助函数：构建并求解 LP
  const runWithParams = async (params: {
    allowExternal: boolean;
    demands: Demand[];
    externalSupplies: { item: string; rate: number }[];
    priorityCut?: number; // 如果提供，将优先级高于此值的需求设为0
  }) => {
    // 构建配方
    const recipeBuild = buildActiveRecipes(
      state, solarEfficiency, getFixedDemands,
    );
    if (!recipeBuild) throw new Error('没有启用的配方');

    // 可能调整需求
    let finalDemands = params.demands;
    if (params.priorityCut !== undefined) {
      finalDemands = params.demands.map(d => {
        const priority = DEMAND_PRIORITY[d.item.toLowerCase()] || DEFAULT_PRIORITY;
        if (priority > params.priorityCut!) {
          return { ...d, rate: 0 };
        }
        return d;
      }).filter(d => d.rate > 0);
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
      redundancy: state.redundancyFactor,
      steamLowMode: state.steamLowMode as any,
      excludedOutputs: new Set(state.excludedOutputs),
      excludedInputs: new Set(state.excludedInputs),
      ignored: new Set(state.ignoredItems),
    });

    setSolverMissing(missing);
    const result = await runLpSolver(lpString, varNames, state.integerMode);
    return { result, varNames, recipeBuild, finalDemands };
  };

  // 阶段1：严格模式
  setDiagnostic('🔍 尝试严格平衡...');
  const strict = await runWithParams({
    allowExternal: false,
    demands: state.demands,
    externalSupplies: [],
  });
  if (strict.result?.Status === 'Optimal') {
    // 成功，直接返回
    setResult(strict.result);
    setIsSolving(false);
    return { status: 'optimal', result: strict.result, diagnostic: '' };
  }

  // 阶段2：允许外部供给，但不削减需求
  setDiagnostic('⚠️ 严格平衡不可行，尝试允许外部供给...');
  const relaxed = await runWithParams({
    allowExternal: true,
    demands: state.demands,
    externalSupplies: [],
  });
  if (relaxed.result?.Status === 'Optimal') {
    setResult(relaxed.result);
    setIsSolving(false);
    setDiagnostic('✅ 在允许外部供给下求得可行解。请查看“副产物过剩诊断”了解可改进项。');
    return { status: 'relaxed', result: relaxed.result, diagnostic: '允许外部供给' };
  }

  // 阶段3：逐步削减低优先级需求
  const priorities = [5, 4, 3, 2]; // 先削减优先级4，再3...
  for (const cutLevel of priorities) {
    setDiagnostic(`🔄 削减优先级 >${cutLevel} 的需求...`);
    const cut = await runWithParams({
      allowExternal: true,
      demands: state.demands,
      externalSupplies: [],
      priorityCut: cutLevel,
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