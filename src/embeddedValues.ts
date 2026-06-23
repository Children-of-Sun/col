import { Recipe } from './types';

export interface EmbeddedValues {
  /** item name → embedded labor per unit */
  labor: Map<string, number>;
  /** item name → embedded cohesion per unit (≤ 0, cohesion consumed along the production chain) */
  cohesion: Map<string, number>;
}

export interface RecipePerMinData {
  recipe: Recipe;
  machineCount: number;
  perMin: {
    inputs: Record<string, number>;
    outputs: Record<string, number>;
    workers: number;
    electricity: number;
    computing: number;
    maintI: number;
    maintII: number;
    maintIII: number;
    machineCount: number;
    cohesion?: number; // trade only
  };
}

/**
 * Compute embedded labor and cohesion per unit for every item in the production graph.
 *
 * Uses iterative relaxation — propagates costs backward through the production chain,
 * with production-weighted averaging when an item is produced by multiple recipes.
 *
 * Labor: 人力 is the primitive unit (anchor = 1.0). All items' embedded labor traces
 *   back to their consumption of 人力 through the upkeep chain.
 *   embedded_labor[output] = (Σ input_qty * labor[input]) / output_qty
 *
 * Cohesion: Only counts cohesion CONSUMPTION (negative values).
 *   - Lab recipes: direct consumption via researchCohesion (negative)
 *   - Trade recipes: direct consumption via perMin.cohesion (negative)
 *   - All other recipes: pass through embedded cohesion from inputs to outputs
 *   - Items with no lab/trade in their upstream chain have cohesion = 0
 */
export function computeEmbeddedValues(
  recipeData: RecipePerMinData[],
): EmbeddedValues {
  const laborMap = new Map<string, number>();
  const cohesionMap = new Map<string, number>();

  // ── Anchor: 人力 is the primitive labor unit ──
  laborMap.set('人力', 1.0);

  // Iterate until convergence
  const MAX_ITER = 100;
  const EPSILON = 1e-9;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Accumulators for production-weighted averaging across recipes
    const laborAcc = new Map<string, number>();
    const cohesionAcc = new Map<string, number>();
    const prodAcc = new Map<string, number>();

    for (const { recipe, machineCount, perMin } of recipeData) {
      if (machineCount < 1e-6) continue;

      const outputs = perMin.outputs;
      const inputs = perMin.inputs;
      const totalOutputQty = sumValues(outputs);
      if (totalOutputQty < 1e-9) continue;

      // ── Labor: total embedded labor from all inputs ──
      let totalInputLabor = 0;
      for (const [item, qty] of Object.entries(inputs)) {
        totalInputLabor += qty * (laborMap.get(item) || 0);
      }
      const perUnitLabor = totalInputLabor / totalOutputQty;

      // ── Cohesion: embedded cohesion from inputs + direct consumption ──
      let totalInputCohesion = 0;
      for (const [item, qty] of Object.entries(inputs)) {
        totalInputCohesion += qty * (cohesionMap.get(item) || 0);
      }

      // Direct cohesion consumption — only trade (negate: perMin.cohesion is positive for consumption)
      let directCohesion = 0;

      if (recipe.module === 'trade') {
        directCohesion = -(perMin.cohesion || 0);
      }

      const perUnitCohesion = (totalInputCohesion + directCohesion) / totalOutputQty;

      // ── Distribute to outputs (production-weighted) ──
      for (const [item, qty] of Object.entries(outputs)) {
        if (qty < 1e-9) continue;
        laborAcc.set(item, (laborAcc.get(item) || 0) + perUnitLabor * qty);
        cohesionAcc.set(item, (cohesionAcc.get(item) || 0) + perUnitCohesion * qty);
        prodAcc.set(item, (prodAcc.get(item) || 0) + qty);
      }
    }

    // ── Finalize: compute weighted averages, track deltas ──
    let maxLaborDelta = 0;
    let maxCohesionDelta = 0;

    for (const [item, totalProd] of prodAcc.entries()) {
      if (totalProd < 1e-9) continue;

      // 人力 labor is anchored at 1.0 — never overwrite
      if (item === '人力') {
        // Still compute cohesion for 人力 (can be non-zero from lab/trade in chain)
        const newCohesion = (cohesionAcc.get(item) || 0) / totalProd;
        const oldCoh = cohesionMap.get(item) || 0;
        cohesionMap.set(item, newCohesion);
        maxCohesionDelta = Math.max(maxCohesionDelta, Math.abs(newCohesion - oldCoh));
        continue;
      }

      const newLabor = (laborAcc.get(item) || 0) / totalProd;
      const newCohesion = (cohesionAcc.get(item) || 0) / totalProd;

      const oldLabor = laborMap.get(item) || 0;
      const oldCoh = cohesionMap.get(item) || 0;
      laborMap.set(item, newLabor);
      cohesionMap.set(item, newCohesion);
      maxLaborDelta = Math.max(maxLaborDelta, Math.abs(newLabor - oldLabor));
      maxCohesionDelta = Math.max(maxCohesionDelta, Math.abs(newCohesion - oldCoh));
    }

    if (maxLaborDelta < EPSILON && maxCohesionDelta < EPSILON) break;
  }

  return { labor: laborMap, cohesion: cohesionMap };
}

function sumValues(record: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(record)) {
    sum += v;
  }
  return sum;
}
