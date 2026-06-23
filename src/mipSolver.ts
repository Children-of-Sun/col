/**
 * JavaScript 分支定界法 (Branch-and-Bound) MIP 求解器
 *
 * 使用 HiGHS 连续 LP 求解线性松弛，在 JS 侧实现分支定界逻辑。
 * 规避 HiGHS WASM MIP 求解器的内存崩溃问题。
 *
 * 算法:
 *   1. 求解根节点 LP 松弛（连续）
 *   2. 若所有整数变量已取整 → 最优解
 *   3. 否则选最远离整数的变量分支（floor / ceil）
 *   4. 每个子节点添加界约束，重新求解 LP
 *   5. 最优界优先搜索，剪枝
 *   6. 达到 gap 容限、节点上限或时间上限时停止
 */

export interface MipSolution {
  /** 匹配 HiGHS 格式 */
  Status: 'Optimal' | 'Feasible' | 'NodeLimit' | 'TimeLimit' | 'Infeasible';
  ObjectiveValue: number;
  Columns: Record<string, { Primal: number }>;
  /** B&B 元数据 */
  nodesExplored: number;
  gap: number; // 0~1，相对对偶间隙
  message: string;
}

interface BnBNode {
  id: number;
  depth: number;
  lowerBound: number;
  constraints: string[]; // 从根到此节点累积的分支约束
}

export interface MipOptions {
  /** 相对 gap 容限，默认 0.05 (5%) */
  gapTolerance?: number;
  /** 最大节点数，默认 500 */
  maxNodes?: number;
  /** 时间限制 (ms)，默认 55000 */
  timeLimitMs?: number;
  /** 进度回调 */
  onProgress?: (msg: string) => void;
}

/** 在 LP 字符串中插入额外约束（在 Bounds 或 END 之前） */
function injectConstraints(lp: string, constraints: string[]): string {
  if (constraints.length === 0) return lp;
  const insertStr = constraints.join('\n') + '\n';
  if (lp.includes('\nBounds\n')) {
    return lp.replace('\nBounds\n', '\n' + insertStr + 'Bounds\n');
  } else if (lp.includes('\nEND\n')) {
    return lp.replace('\nEND\n', '\n' + insertStr + 'END\n');
  } else {
    // 最后一行就是 END
    return lp.replace(/\nEND\s*$/, '\n' + insertStr + 'END\n');
  }
}

/** 整数容限：此范围内视为整数 */
const INT_TOL = 1e-5;

function isIntegral(val: number): boolean {
  return Math.abs(val - Math.round(val)) < INT_TOL;
}

/**
 * 对单个 LP 字符串执行求解，返回 HiGHS 结果或 null
 */
type LpRunner = (lpString: string, varNames: string[]) => Promise<any>;

/**
 * 分支定界 MIP 求解
 *
 * @param baseLpString   不含 Integer 段的连续 LP 字符串
 * @param baseVarNames   变量名列表
 * @param intVarNames    需要取整的变量名列表
 * @param runLp          LP 求解回调（调用 HiGHS 连续求解）
 * @param options        可选参数
 */
export async function solveMip(
  baseLpString: string,
  baseVarNames: string[],
  intVarNames: string[],
  runLp: LpRunner,
  options: MipOptions = {},
): Promise<MipSolution> {
  const gapTol = options.gapTolerance ?? 0.05;
  const maxNodes = options.maxNodes ?? 500;
  const timeLimitMs = options.timeLimitMs ?? 55000;
  const onProgress = options.onProgress ?? (() => {});

  const startTime = Date.now();
  const intVarSet = new Set(intVarNames);

  // ─── 辅助：从求解结果提取整数变量的分数信息 ───
  const getFractionalVars = (
    cols: Record<string, { Primal?: number; primal?: number }>,
  ): { name: string; val: number }[] => {
    const fracs: { name: string; val: number }[] = [];
    for (const v of intVarNames) {
      const col = cols[v];
      const val = col?.Primal ?? col?.primal ?? 0;
      if (val < INT_TOL) continue; // 跳过零值（隐式整数）
      if (!isIntegral(val)) {
        fracs.push({ name: v, val });
      }
    }
    // 最远离整数者在前
    fracs.sort((a, b) => {
      const da = Math.abs(a.val - Math.round(a.val));
      const db = Math.abs(b.val - Math.round(b.val));
      return db - da; // 降序
    });
    return fracs;
  };

  // ─── 辅助：从 cols 构建完整解 ───
  const extractSolution = (
    cols: Record<string, { Primal?: number; primal?: number }>,
  ): Record<string, { Primal: number }> => {
    const out: Record<string, { Primal: number }> = {};
    for (const key of Object.keys(cols)) {
      const v = cols[key]?.Primal ?? cols[key]?.primal ?? 0;
      if (Math.abs(v) > 1e-12) {
        out[key] = { Primal: v };
      }
    }
    return out;
  };

  // ─── 求解根节点 ───
  onProgress('MIP B&B: 求解根节点 LP 松弛...');
  let rootResult: any;
  try {
    rootResult = await runLp(baseLpString, baseVarNames);
  } catch (e: any) {
    return {
      Status: 'Infeasible',
      ObjectiveValue: NaN,
      Columns: {},
      nodesExplored: 0,
      gap: 1,
      message: `根节点 LP 求解失败: ${e.message}`,
    };
  }

  if (!rootResult || !(rootResult.Status === 'Optimal' || rootResult.Status === 'Feasible')) {
    return {
      Status: 'Infeasible',
      ObjectiveValue: NaN,
      Columns: {},
      nodesExplored: 0,
      gap: 1,
      message: '根节点不可行',
    };
  }

  const rootCols = (rootResult?.Columns || rootResult?.columns || {}) as Record<string, { Primal?: number; primal?: number }>;
  const rootObj = (rootResult.ObjectiveValue as number) ?? NaN;

  // 检查根节点是否已整数可行
  const rootFracs = getFractionalVars(rootCols);
  if (rootFracs.length === 0) {
    return {
      Status: 'Optimal',
      ObjectiveValue: rootObj,
      Columns: extractSolution(rootCols),
      nodesExplored: 1,
      gap: 0,
      message: '✅ MIP 最优解（根节点即整数解）',
    };
  }

  onProgress(`MIP B&B: 根节点目标=${rootObj.toFixed(4)}, ${rootFracs.length}个变量需取整`);

  // ─── 优先队列（最小堆，按 lowerBound 升序） ───
  const heap: BnBNode[] = [];
  let nextId = 1;

  const pushNode = (node: BnBNode) => {
    heap.push(node);
    // 维持升序：lowerBound 小的在前
    heap.sort((a, b) => a.lowerBound - b.lowerBound);
  };

  const popNode = (): BnBNode | undefined => heap.shift();

  // 根节点入队
  pushNode({ id: 0, depth: 0, lowerBound: rootObj, constraints: [] });

  // ─── 最优整数解跟踪 ───
  let bestObj = Infinity;
  let bestCols: Record<string, { Primal: number }> | null = null;
  let bestNodeId = -1;
  let nodesExplored = 0;

  // ─── 主循环 ───
  while (heap.length > 0 && nodesExplored < maxNodes) {
    // 时间检查
    if (Date.now() - startTime > timeLimitMs) {
      onProgress(`MIP B&B: 时间限制（已探索 ${nodesExplored} 节点）`);
      break;
    }

    const node = popNode();
    if (!node) break;

    // 剪枝：下界 ≥ 当前最优（允许 gap 容限）
    if (bestObj < Infinity) {
      if (node.lowerBound >= bestObj * (1 - gapTol)) {
        continue; // 剪枝
      }
    }

    // 构造此节点的 LP 并求解
    const nodeLp = injectConstraints(baseLpString, node.constraints);
    let nodeResult: any;
    try {
      nodeResult = await runLp(nodeLp, baseVarNames);
    } catch (_) {
      continue; // 求解异常，丢弃此节点
    }

    nodesExplored++;

    // 检查可行性
    const st = nodeResult?.Status;
    if (!st || !(st === 'Optimal' || st === 'Feasible')) {
      continue; // 不可行，剪枝
    }

    const nodeCols = (nodeResult?.Columns || nodeResult?.columns || {}) as Record<string, { Primal?: number; primal?: number }>;
    const nodeObj = (nodeResult.ObjectiveValue as number) ?? Infinity;

    // 再次剪枝（求解后的真实下界）
    if (bestObj < Infinity && nodeObj >= bestObj * (1 - gapTol)) {
      continue;
    }

    // 检查整数可行性
    const fracs = getFractionalVars(nodeCols);
    if (fracs.length === 0) {
      // ★ 找到更好的整数可行解
      if (nodeObj < bestObj) {
        bestObj = nodeObj;
        bestCols = extractSolution(nodeCols);
        bestNodeId = node.id;

        // 计算相对 gap
        const gap = bestObj > 0 ? (bestObj - rootObj) / Math.abs(bestObj) : 0;
        const clampedGap = Math.max(0, gap);

        if (nodesExplored % 10 === 0 || clampedGap <= gapTol) {
          onProgress(
            `MIP B&B: ${nodesExplored}节点 目标=${bestObj.toFixed(1)} gap=${(clampedGap * 100).toFixed(1)}%`,
          );
        }

        // 达到 gap 容限 → 提前终止
        if (clampedGap <= gapTol) {
          onProgress(`MIP B&B: gap ${(clampedGap * 100).toFixed(1)}% ≤ ${(gapTol * 100).toFixed(1)}%，停止`);
          break;
        }
      }
      continue;
    }

    // ─── 分支：选最远离整数的变量 ───
    const branchVar = fracs[0];
    const floorVal = Math.floor(branchVar.val);
    const ceilVal = Math.ceil(branchVar.val);

    // Floor 分支: x ≤ floorVal
    if (floorVal > 0) {
      pushNode({
        id: nextId++,
        depth: node.depth + 1,
        lowerBound: nodeObj,
        constraints: [...node.constraints, ` c_mip_${nextId}a: ${branchVar.name} <= ${floorVal}`],
      });
    }

    // Ceil 分支: x ≥ ceilVal
    pushNode({
      id: nextId++,
      depth: node.depth + 1,
      lowerBound: nodeObj,
      constraints: [...node.constraints, ` c_mip_${nextId}b: ${branchVar.name} >= ${ceilVal}`],
    });

    // 进度报告
    if (nodesExplored % 30 === 0) {
      onProgress(
        `MIP B&B: ${nodesExplored}节点 队列=${heap.length} ` +
        `最佳=${bestObj === Infinity ? 'N/A' : bestObj.toFixed(1)} ` +
        `下界=${node.lowerBound.toFixed(2)}`,
      );
    }
  }

  // ─── 返回结果 ───
  if (bestCols) {
    const gap = bestObj > 0 ? Math.max(0, (bestObj - rootObj) / Math.abs(bestObj)) : 0;
    const isOptimal = gap <= gapTol || nodesExplored >= maxNodes;

    return {
      Status: gap <= gapTol ? 'Optimal' : 'Feasible',
      ObjectiveValue: bestObj,
      Columns: bestCols,
      nodesExplored,
      gap,
      message: gap <= gapTol
        ? `✅ MIP 最优解 (${nodesExplored}节点, gap ${(gap * 100).toFixed(1)}%)`
        : `⚠️ MIP 可行解 (${nodesExplored}节点, gap ${(gap * 100).toFixed(1)}%)`,
    };
  }

  // 未找到整数解
  return {
    Status: 'NodeLimit',
    ObjectiveValue: NaN,
    Columns: {},
    nodesExplored,
    gap: 1,
    message: `⚠️ MIP 未找到整数解 (探索了 ${nodesExplored} 节点)`,
  };
}
