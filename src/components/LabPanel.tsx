import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { Btn, ModalShell } from './UI';

export const LabPanel: React.FC = () => {
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);
  const stationLevel = useStore(s => s.stationLevel);
  const setLabLevel = useStore(s => s.setLabLevel);
  const setLabCount = useStore(s => s.setLabCount);
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  const [labRecipeModalOpen, setLabRecipeModalOpen] = React.useState(false);
  const recipeEnabled = useStore(s => s.recipeEnabled);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const gameData = useStore(s => s.gameData);
  const population = useStore(s => s.population);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);

  const meta = labMeta.find(l => l.buildingId === labLevel);
  if (!meta) return null;

  // 判断是否为不消耗设备的基础研究所
  const isBasicLab = labLevel === 'ResearchLab' || meta.name?.toLowerCase() === 'research lab';

  // 获取当前启用的配方（只应有一个）
  const enabledRecipe = meta.recipes.find(r => recipeEnabled[r.id]);

  // 计算基础产出和设备消耗
  let baseOutput = 0;
  let equipmentConsumption = 0;
  let equipmentDetails: { name: string; rate: number }[] = [];

  if (isBasicLab) {
    baseOutput = 3 * labCount;
  } else if (enabledRecipe) {
    // 计算设备消耗总量及明细
    for (const [item, qty] of Object.entries(enabledRecipe.inputs)) {
      if (item.toLowerCase().includes('lab equipment')) {
        const rate = (60 / enabledRecipe.duration) * (qty as number) * labCount;
        equipmentConsumption += rate;
        equipmentDetails.push({ name: item, rate });
      }
    }
    baseOutput = equipmentConsumption; // 每消耗1设备产出1研究
  }

  // 计算总加成倍率（memoized）
  const { totalMultiplier, popBonusPercent, edictBonusPercent, officeBonusPercent, stationBonusPercent } = React.useMemo(() => {
    let mult = 1;

    // 人口加成
    mult *= (1 + population * 0.00005);

    // 法令”研究效率”
    let edictPct = 0;
    if (gameData) {
      const edict = gameData.edicts.find(e => e.name === '研究效率');
      if (edict) {
        const idx = gameData.edicts.indexOf(edict);
        const lvl = edictLevels[idx] ?? -1;
        if (lvl >= 0) {
          mult *= (1 + (edict.effectPerLevel[lvl] || 0));
          edictPct = (edict.effectPerLevel[lvl] || 0) * 100;
        }
      }
    }

    // 办公”研究效率”
    let officePct = 0;
    if (gameData) {
      const office = gameData.office.find(o => o.name === '研究效率');
      if (office) {
        const idx = gameData.office.indexOf(office);
        const lvl = officeLevels[idx] || 0;
        if (lvl > 0) {
          mult *= (1 + (office.effectPerLevel || 0) * lvl);
          officePct = ((office.effectPerLevel || 0) * lvl) * 100;
        }
      }
    }

    // 空间站等级
    mult *= (1 + stationLevel * 0.05);

    return {
      totalMultiplier: mult,
      popBonusPercent: population * 0.005,
      edictBonusPercent: edictPct,
      officeBonusPercent: officePct,
      stationBonusPercent: stationLevel * 5,
    };
  }, [population, gameData, edictLevels, officeLevels, stationLevel]);

  const finalOutput = baseOutput * totalMultiplier;

  return (
    <div className="section">
      <h3>🔬 研究所</h3>
      <div className="space-station-row">
        <label>等级: 
          <select value={labLevel} disabled={!dataLoaded} onChange={e => setLabLevel(e.target.value)}>
            {labMeta.map(l => (
              <option key={l.buildingId} value={l.buildingId}>{t(l.name, translation)} (Lv.{l.level})</option>
            ))}
          </select>
        </label>
        <label>数量: 
          <input type="number" value={labCount} min={0} step={1} style={{ width: 60 }} disabled={!dataLoaded} onChange={e => setLabCount(parseInt(e.target.value) || 0)} />
        </label>
        <Btn onClick={() => setLabRecipeModalOpen(true)} disabled={!dataLoaded}>🧪 配方选择</Btn>
      </div>

      {/* 显示当前启用的配方及消耗材料 */}
      {!isBasicLab && (
        <div className="stat" style={{ marginTop: 8 }}>
          {enabledRecipe ? (
            <>
              <div>🔧 消耗材料明细:</div>
              {equipmentDetails.length > 0 ? (
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                  {equipmentDetails.map(d => (
                    <li key={d.name}>{t(d.name, translation)}: {d.rate.toFixed(2)} /分</li>
                  ))}
                </ul>
              ) : <div className="hint">无设备消耗</div>}
            </>
          ) : (
            <div className="hint">⚠️ 未选择任何配方，请点击“配方选择”启用一个配方</div>
          )}
        </div>
      )}

      <div className="stat" style={{ marginTop: 8 }}>
        <div>📊 基础研究产出: {baseOutput.toFixed(2)} /分</div>
        {!isBasicLab && equipmentConsumption > 0 && (
          <div className="hint">（设备消耗总量: {equipmentConsumption.toFixed(2)}/分，每设备产1研究）</div>
        )}
        {isBasicLab && <div className="hint">（基础研究所，不消耗设备，固定3点/台）</div>}
      </div>

      <div style={{ marginTop: 8, borderTop: '1px solid #ddd', paddingTop: 8 }}>
        <strong>🌟 研究产出加成（乘算）</strong>
        <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
          <li>人口 ({population.toLocaleString()}人): +{popBonusPercent.toFixed(2)}% → {(1 + popBonusPercent/100).toFixed(3)}x</li>
          {edictBonusPercent > 0 && <li>法令 "研究效率": +{edictBonusPercent.toFixed(0)}% → {(1 + edictBonusPercent/100).toFixed(3)}x</li>}
          {officeBonusPercent > 0 && <li>办公 "研究效率": +{officeBonusPercent.toFixed(0)}% → {(1 + officeBonusPercent/100).toFixed(3)}x</li>}
          <li>空间站等级 Lv{stationLevel}: +{stationBonusPercent}% → {(1 + stationBonusPercent/100).toFixed(3)}x</li>
        </ul>
        <div style={{ marginTop: 4, fontWeight: 'bold' }}>合计倍率: {totalMultiplier.toFixed(3)}x</div>
        <div style={{ marginTop: 4, fontSize: '1.1em', color: '#2563eb' }}>🎓 最终研究产出: {finalOutput.toFixed(2)} /分</div>
      </div>

      <ModalShell open={labRecipeModalOpen} onClose={() => setLabRecipeModalOpen(false)} title="研究所配方选择" maxWidth="700px">
        {meta && (
          <div>
            <h4>{meta.name}</h4>
            {meta.recipes.map(r => (
              <div key={r.id} style={{ marginBottom: 8, borderBottom: '1px solid #eee', padding: 6 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={recipeEnabled[r.id] !== false}
                    onChange={e => {
                      const checked = e.target.checked;
                      if (checked) {
                        meta.recipes.forEach(other => {
                          if (other.id !== r.id && recipeEnabled[other.id]) setRecipeEnabled(other.id, false);
                        });
                      }
                      setRecipeEnabled(r.id, checked);
                    }}
                  />
                  {' '}{r.id}
                </label>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, textAlign: 'right' }}><Btn onClick={() => setLabRecipeModalOpen(false)}>关闭</Btn></div>
      </ModalShell>
    </div>
  );
};