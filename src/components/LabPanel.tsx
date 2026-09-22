import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { computeLabResearchOutput } from '../utils/research';
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

  // 研究所产出计算（与科研时间计算共用同一份逻辑）
  const labOut = computeLabResearchOutput({
    labLevel, labCount, labMeta, recipeEnabled,
    gameData, population, edictLevels, officeLevels, stationLevel,
  });

  const {
    isBasicLab, hasRecipe: hasEnabledRecipe,
    baseOutput, equipmentConsumption, equipmentDetails,
    multipliers: multiplierEntries, totalMultiplier, finalOutput,
  } = labOut;

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
          {hasEnabledRecipe ? (
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
          {multiplierEntries
            .filter(m => m.kind === 'population' || m.kind === 'station' || m.percent > 0)
            .map(m => (
              <li key={m.label}>
                {m.label}: {m.percent >= 0 ? '+' : ''}{m.percent.toFixed(m.kind === 'population' ? 2 : 0)}% → {m.factor.toFixed(3)}x
              </li>
            ))}
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