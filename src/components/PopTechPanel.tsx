import React, { useState } from 'react';
import { useStore } from '../stores';
import { GameData } from '../types';
import { Btn } from './UI';
import { t } from '../utils';

const PopTechPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const population = useStore(s => s.population);
  const housingIndex = useStore(s => s.housingIndex);
  const selectedFoods = useStore(s => s.selectedFoods);
  const selectedMedical = useStore(s => s.selectedMedical);
  const selectedOthers = useStore(s => s.selectedOthers);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const researchLevels = useStore(s => s.researchLevels);
  const translation = useStore(s => s.translation);

  const setPopulation = useStore(s => s.setPopulation);
  const setHousingIndex = useStore(s => s.setHousingIndex);
  const toggleFood = useStore(s => s.toggleFood);
  const setMedical = useStore(s => s.setMedical);
  const toggleOther = useStore(s => s.toggleOther);
  const setEdictLevel = useStore(s => s.setEdictLevel);
  const setOfficeLevel = useStore(s => s.setOfficeLevel);
  const setResearchLevel = useStore(s => s.setResearchLevel);

  if (!gameData) {
    return (
      <div style={{ padding: 20 }}>
        <p>⚠️ 请先加载居民配置文件 (GameData.json)</p>
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const text = await file.text();
              useStore.getState().setGameData(JSON.parse(text));
            }
          }}
        />
      </div>
    );
  }

  const [tab, setTab] = useState<'pop' | 'tech'>('pop');

  // 食物分组
  const foodGroups: Record<string, string[]> = {};
  for (const [name, svc] of Object.entries(gameData.services)) {
    if (svc.category === 'food' && svc['Food Category']) {
      const grp = svc['Food Category'];
      if (!foodGroups[grp]) foodGroups[grp] = [];
      foodGroups[grp].push(name);
    }
  }

  // 医疗列表
  const medicalList = Object.keys(gameData.services).filter(
    name => gameData.services[name].category === 'medical'
  );

  // 其他服务（非食物、非医疗）
  const otherList = Object.keys(gameData.services).filter(
    name => gameData.services[name].category !== 'food' && gameData.services[name].category !== 'medical'
  );

  return (
    <div>
      {/* 选项卡 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
        <Btn onClick={() => setTab('pop')} variant={tab === 'pop' ? 'primary' : 'default'}>
          🏠 居民
        </Btn>
        <Btn onClick={() => setTab('tech')} variant={tab === 'tech' ? 'primary' : 'default'}>
          🔬 科技·法令
        </Btn>
      </div>

      {tab === 'pop' && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <label>👥 人口: </label>
            <input
              type="number"
              value={population}
              min={0}
              step={100}
              style={{ width: 100 }}
              onChange={e => setPopulation(parseInt(e.target.value) || 0)}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>🏠 住房等级: </label>
            <select
              value={housingIndex}
              onChange={e => setHousingIndex(parseInt(e.target.value))}
            >
              {gameData.housingTiers.map((tier, idx) => (
                <option key={idx} value={idx}>
                  {t(tier.name, translation)}
                </option>
              ))}
            </select>
          </div>

          {/* 食物多选 */}
          <h4>🍽️ 食物（多选）</h4>
          {Object.entries(foodGroups).map(([grp, items]) => (
            <div key={grp} style={{ marginBottom: 8 }}>
              <strong>{t(grp, translation)}</strong>
              {items.map(name => (
                <label key={name} style={{ marginLeft: 10 }}>
                  <input
                    type="checkbox"
                    checked={selectedFoods.has(name)}
                    onChange={() => toggleFood(name)}
                  />
                  {t(name, translation)}
                </label>
              ))}
            </div>
          ))}

          {/* 医疗单选 */}
          <h4>🏥 医疗（单选）</h4>
          <label>
            <input
              type="radio"
              name="medical"
              checked={selectedMedical === null}
              onChange={() => setMedical(null)}
            />
            不使用
          </label>
          {medicalList.map(name => (
            <label key={name} style={{ marginLeft: 10 }}>
              <input
                type="radio"
                name="medical"
                checked={selectedMedical === name}
                onChange={() => setMedical(name)}
              />
              {t(name, translation)}
            </label>
          ))}

          {/* 其他服务多选 */}
          <h4>⚙️ 其他服务（多选）</h4>
          {otherList.map(name => (
            <label key={name} style={{ marginRight: 15 }}>
              <input
                type="checkbox"
                checked={selectedOthers.has(name)}
                onChange={() => toggleOther(name)}
              />
              {t(name, translation)}
            </label>
          ))}
        </div>
      )}

      {tab === 'tech' && (
        <div>
          {/* 法令 */}
          <h4>📜 法令</h4>
          {gameData.edicts.map((edict, idx) => {
            const lvl = edictLevels[idx] ?? -1;
            return (
              <div key={idx} style={{ marginBottom: 5 }}>
                <label>{edict.name}: </label>
                <select
                  value={lvl}
                  onChange={e => setEdictLevel(idx, parseInt(e.target.value))}
                >
                  <option value={-1}>关闭</option>
                  {edict.effectPerLevel.map((_, lv) => (
                    <option key={lv} value={lv}>
                      Lv{lv + 1} ({((edict.effectPerLevel[lv] ?? 0) * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          {/* 办公 */}
          <h4>🏢 办公升级</h4>
          {gameData.office.map((off, idx) => (
            <div key={idx} style={{ marginBottom: 5 }}>
              <label>{off.name} (最高 {off.maxLevel}): </label>
              <input
                type="number"
                min={0}
                max={off.maxLevel}
                value={officeLevels[idx] || 0}
                style={{ width: 60 }}
                onChange={e =>
                  setOfficeLevel(
                    idx,
                    Math.max(0, Math.min(off.maxLevel, parseInt(e.target.value) || 0))
                  )
                }
              />
            </div>
          ))}

          {/* 研究 */}
          <h4>🔬 研究</h4>
          {gameData.research.map((res, idx) => (
            <div key={idx} style={{ marginBottom: 5 }}>
              <label>{res.name} (最高 {res.maxLevel}): </label>
              <input
                type="number"
                min={0}
                max={res.maxLevel}
                value={researchLevels[idx] || 0}
                style={{ width: 60 }}
                onChange={e =>
                  setResearchLevel(
                    idx,
                    Math.max(0, Math.min(res.maxLevel, parseInt(e.target.value) || 0))
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PopTechPanel;
