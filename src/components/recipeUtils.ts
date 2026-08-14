import type { Recipe } from '../types';

/** Find all recipes that output a given item */
export function getRecipesForItem(recipes: Recipe[], item: string): Recipe[] {
  return recipes.filter(r => r.outputs[item] !== undefined && r.outputs[item] > 0);
}
