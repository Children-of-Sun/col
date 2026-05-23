import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../stores';
import { Select } from './UI';
import { t } from '../utils';
import { getAgricultureMultipliers } from '../utils/agricultureMultipliers';

export const AgriculturePanel: React.FC = () => {
  const enableAgriculture = useStore(s => s.enableAgriculture);
  const setEnableAgriculture = useStore(s => s.setEnableAgriculture);
  const cropRotation = useStore(s => s.cropRotation);
  const setCropRotation = useStore(s => s.setCropRotation);
  const globalFertilizerType = useStore(s => s.globalFertilizerType);
  const setGlobalFertilizerType = useStore(s => s.setGlobalFertilizerType);
  const targetFertility = useStore(s => s.targetFertility);
  const setTargetFertility = useStore(s => s.setTargetFertility);
  const farms = useStore(s => s.farms);
  const toggleCrop = useStore(s => s.toggleCrop);
  const loadAgricultureBuildings = useStore(s => s.loadAgricultureBuildings);
  const recipes = useStore(s => s.recipes);
  const translation = useStore(s => s.translation);
  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const researchLevels = useStore(s => s.researchLevels);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // 只在 farms 为空且 recipes 已加载时初始化一次
    if (recipes.length > 0 && farms.length === 0) {
      loadAgricultureBuildings();
    }
  }, [recipes, farms.length, loadAgricultureBuildings]);

  const maxFT = globalFertilizerType === 'organic' ? 100 : (globalFertilizerType === 'I' ? 120 : 140);
  const fertValue = globalFertilizerType === 'organic' ? 1 : (globalFertilizerType === 'I' ? 2 : 2.5);
  const P = cropRotation ? 1.0 : 1.5;
  const FT = targetFertility / 100;

  const computeCrop = (crop: any) => {
    const waterPerMin = crop.baseWaterPerMin;
    const fc = crop.baseFc;
    let requiredFertility: number;
    if (FT <= 1.0) {
      requiredFertility = fc * P - 3 * (1 - FT);
    } else {
      requiredFertility = fc * P + 2 * (fc * P + 3) * (FT - 1);
    }
    requiredFertility = Math.max(0, requiredFertility);
    const fertilizerPerMin = requiredFertility / fertValue;
    let cropPerMin = crop.baseCropPerMin * FT;
    let finalWater = waterPerMin;
    // 应用全局加成倍率
    finalWater *= multipliers.water;
    cropPerMin *= multipliers.output;
    return { waterPerMin: finalWater, fertilizerPerMin, requiredFertility, cropPerMin };
  };

  const fertLabel = globalFertilizerType === 'organic' ? '有机肥' : `肥料 ${globalFertilizerType}`;

  const multipliers = useMemo(
    () => getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels),
    [gameData, edictLevels, officeLevels, researchLevels]
  );

  return (
    <div className="section">
      <h3>🌾 农业模块</h3>
      <div className="flex-row" style={{ marginBottom: 15, flexWrap: 'wrap', gap: 15 }}>
        <label>
          <input type="checkbox" checked={enableAgriculture} onChange={e => setEnableAgriculture(e.target.checked)} />
          {' '}{t('启用农业系统', translation)}
        </label>
        <label>
          <input type="checkbox" checked={cropRotation} onChange={e => setCropRotation(e.target.checked)} />
          {' '}{t('轮作（降低肥力消耗）', translation)}
        </label>
        <label>{t('肥料类型', translation)}: </label>
        <Select
          value={globalFertilizerType}
          options={[
            { value: 'organic', label: t('有机肥', translation) },
            { value: 'I', label: t('肥料 I', translation) },
            { value: 'II', label: t('肥料 II', translation) },
          ]}
          onChange={v => setGlobalFertilizerType(v)}
        />
        <div>
          <label>{t('目标肥力', translation)}: </label>
          <input
            type="number"
            min={0}
            max={maxFT}
            step={1}
            value={targetFertility}
            onChange={e => setTargetFertility(Math.min(maxFT, Math.max(0, parseInt(e.target.value) || 0)))}
            style={{ width: 70, marginLeft: 8 }}
          />
          <span style={{ marginLeft: 4 }}>% (上限 {maxFT}%)</span>
        </div>
      </div>

      {enableAgriculture && gameData && (
        <div className="flex-row" style={{ marginBottom: 10 }}>
          <span>🌾 当前产出倍率: {multipliers.output.toFixed(2)}</span>
          <span style={{ marginLeft: 15 }}>💧 当前水消耗修正: {multipliers.water.toFixed(2)}</span>
        </div>
      )}

      {enableAgriculture && (
        <div style={{ marginTop: 15 }}>
          {farms.map(farm => {
            const isCollapsed = collapsed[farm.buildingId] || false;
            return (
              <div key={farm.buildingId} className="building-block" style={{ marginBottom: 20 }}>
                <div
                  className="building-header"
                  onClick={() => setCollapsed(prev => ({ ...prev, [farm.buildingId]: !isCollapsed }))}
                  style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', padding: '8px 0' }}
                >
                  <span>{t(farm.buildingName, translation)}</span>
                  <span style={{ marginLeft: 10, fontSize: '0.8rem' }}>{isCollapsed ? '▶ 展开' : '▼ 收起'}</span>
                </div>
                {!isCollapsed && (
                  <div style={{ marginTop: 8, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f0f0f0' }}>
                          <th style={{ padding: 8, textAlign: 'left' }}>{t('作物', translation)}</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>{t('产出/min', translation)}</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>{t('水消耗/min', translation)}</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>{t(fertLabel, translation)}/min</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>{t('等效肥力 (%/min)', translation)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {farm.crops.map(crop => {
                          const { waterPerMin, fertilizerPerMin, requiredFertility, cropPerMin } = computeCrop(crop);
                          const isEnabled = crop.enabled;
                          return (
                            <tr
                              key={crop.cropName}
                              onClick={() => toggleCrop(farm.buildingId, crop.cropName, !isEnabled)}
                              style={{
                                cursor: 'pointer',
                                backgroundColor: isEnabled ? '#d4edda' : 'transparent',
                                borderBottom: '1px solid #eee',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isEnabled ? '#c3e6cb' : '#f8f9fa'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isEnabled ? '#d4edda' : 'transparent'}
                            >
                              <td style={{ padding: 6 }}>{t(crop.cropName, translation)}</td>
                              <td style={{ padding: 6, textAlign: 'right' }}>{cropPerMin.toFixed(2)}</td>
                              <td style={{ padding: 6, textAlign: 'right' }}>{waterPerMin.toFixed(2)}</td>
                              <td style={{ padding: 6, textAlign: 'right' }}>{fertilizerPerMin.toFixed(2)}</td>
                              <td style={{ padding: 6, textAlign: 'right' }}>{requiredFertility.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};