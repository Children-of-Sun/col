import { CropSetting, Recipe, StoreState } from '../types';
import { t } from '../utils';

/**
 * 生成农业系统动态配方（agri_*）：
 * 按农业模块设置（目标肥力/肥料类型/轮作）计算，并应用农业倍率（产量/水）。
 * 供求解（buildActiveRecipes）与模块候选配方（ModulePanel/Modals）共用。
 */
export function buildAgricultureRecipes(
  state: StoreState,
  farmOutputMultiplier: number,
  totalFarmWaterMultiplier: number,
): Recipe[] {
  if (!state.enableAgriculture) return [];
  const translation = state.translation;
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

  const result: Recipe[] = [];
  for (const farm of state.farms) {
    if (!farm.enabled) continue;
    for (const crop of farm.crops) {
      if (!crop.enabled) continue;
      const originalRecipe = state.recipes.find(r => r.id === crop.baseRecipeId);
      if (!originalRecipe) continue;
      const { waterPerMin, fertilizerPerMin, cropPerMin } = calculateRecipe(crop, FT, P, fertValue);
      const finalWaterPerMin = waterPerMin * totalFarmWaterMultiplier;
      const finalCropPerMin = cropPerMin * farmOutputMultiplier;
      const fertInputKey = state.globalFertilizerType === 'organic'
        ? 'fertilizer organic' : `fertilizer ${state.globalFertilizerType.toLowerCase()}`;
      result.push({
        id: `agri_${farm.buildingId}_${crop.cropName}`,
        name: `${t(crop.cropName, translation)} (${t(farm.buildingName, translation)})`,
        buildingId: farm.buildingId,
        buildingName: farm.buildingName,
        category: '农业',
        buildingLevel: farm.level,
        duration: 60,
        inputs: { 'water': finalWaterPerMin, [fertInputKey]: fertilizerPerMin },
        outputs: { [crop.cropName.toLowerCase()]: finalCropPerMin },
        upkeep: originalRecipe.upkeep ? { ...originalRecipe.upkeep } : {},
        powerMultiplier: originalRecipe.powerMultiplier || 1,
        workers: originalRecipe.workers || 0,
        isSolar: false,
        isHidden: false,
        module: 'main',
      });
    }
  }
  return result;
}
