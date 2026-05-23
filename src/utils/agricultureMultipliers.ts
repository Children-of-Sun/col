import { GameData } from '../types';

export function getAgricultureMultipliers(
  gameData: GameData | null,
  edictLevels: Record<number, number>,
  officeLevels: number[],
  researchLevels: number[]
): { output: number; water: number } {
  if (!gameData) return { output: 1, water: 1 };
  let output = 1;
  let water = 1;

  // 农业提振法令
  const agriBoost = gameData.edicts.find(e => e.name === '农业提振');
  if (agriBoost) {
    const lvl = edictLevels[gameData.edicts.indexOf(agriBoost)] ?? -1;
    if (lvl >= 0) output *= (1 + agriBoost.effectPerLevel[lvl]);
  }
  // 办公农作物产量
  const officeCrop = gameData.office.find(o => o.name === '农作物产量');
  if (officeCrop) {
    const lvl = officeLevels[gameData.office.indexOf(officeCrop)] || 0;
    if (lvl > 0) output *= (1 + officeCrop.effectPerLevel * lvl);
  }
  // 研究作物产量 - 第一个值（产出），第二个值（水）
  const researchCrop = gameData.research.find(r => r.name === '作物产量');
  if (researchCrop) {
    const lvl = researchLevels[gameData.research.indexOf(researchCrop)] || 0;
    if (lvl > 0) {
      output *= (1 + researchCrop.effectPerLevel[0] * lvl);
      water *= (1 + researchCrop.effectPerLevel[1] * lvl);
    }
  }
  // 节水器法令
  const waterSaver = gameData.edicts.find(e => e.name === '节水器');
  if (waterSaver) {
    const lvl = edictLevels[gameData.edicts.indexOf(waterSaver)] ?? -1;
    if (lvl >= 0) water *= (1 - waterSaver.effectPerLevel[lvl]);
  }
  return { output, water };
}
