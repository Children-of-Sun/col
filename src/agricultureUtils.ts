export interface AgricultureInput {
  baseWaterPerMin: number;
  baseFc: number;
  baseCropPerMin: number;
  waterMul: number;
  outputMul: number;
  targetFertility: number;
  cropRotation: boolean;
  fertilizerType: 'organic' | 'I' | 'II';
}

export function calculateAgricultureRecipe(input: AgricultureInput) {
  const { baseWaterPerMin, baseFc, baseCropPerMin, waterMul, outputMul, targetFertility, cropRotation, fertilizerType } = input;
  const fertValue = fertilizerType === 'organic' ? 1 : (fertilizerType === 'I' ? 2 : 2.5);
  const P = cropRotation ? 1.0 : 1.5;
  const FT = targetFertility / 100;

  const waterPerMin = baseWaterPerMin * waterMul;
  const fc = baseFc * waterMul; // 肥力消耗随水量同比例
  let requiredFertility: number;
  if (FT <= 1.0) {
    requiredFertility = fc * P - 3 * (1 - FT);
  } else {
    requiredFertility = fc * P + 2 * (fc * P + 3) * (FT - 1);
  }
  const fertilizerPerMin = Math.max(0, requiredFertility / fertValue);
  const cropPerMin = baseCropPerMin * FT * outputMul;

  return { waterPerMin, fertilizerPerMin, cropPerMin };
}
