import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';

const ResidentPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const population = useStore(s => s.population);
  const housingIndex = useStore(s => s.housingIndex);
  const selectedFoods = useStore(s => s.selectedFoods);
  const selectedMedical = useStore(s => s.selectedMedical);
  const selectedOthers = useStore(s => s.selectedOthers);
  const translation = useStore(s => s.translation);
  const setPopulation = useStore(s => s.setPopulation);
  const setHousingIndex = useStore(s => s.setHousingIndex);
  const toggleFood = useStore(s => s.toggleFood);
  const setMedical = useStore(s => s.setMedical);
  const toggleOther = useStore(s => s.toggleOther);

  if (!gameData) return <div>请先加载居民配置文件</div>;

  // 食物分组
  const foodGroups: Record<string, string[]> = {};
  for (const [name, svc] of Object.entries(gameData.services)) {
    if (svc.category === 'food' && svc['Food Category']) {
      const grp = svc['Food Category'];
      if (!foodGroups[grp]) foodGroups[grp] = [];
      foodGroups[grp].push(name);
    }
  }

  const medicalList = Object.keys(gameData.services).filter(
    name => gameData.services[name].category === 'medical'
  );
  const otherList = Object.keys(gameData.services).filter(
    name => gameData.services[name].category !== 'food' && gameData.services[name].category !== 'medical'
  );

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label>👥 人口: </label>
        <input type="number" value={population} min={0} step={100} style={{ width: 100 }} onChange={e => setPopulation(parseInt(e.target.value) || 0)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>🏠 住房等级: </label>
        <select value={housingIndex} onChange={e => setHousingIndex(parseInt(e.target.value))}>
          {gameData.housingTiers.map((tier, idx) => (
            <option key={idx} value={idx}>{t(tier.name, translation)}</option>
          ))}
        </select>
      </div>
      <h4>🍽️ 食物（多选）</h4>
      {Object.entries(foodGroups).map(([grp, items]) => (
        <div key={grp} style={{ marginBottom: 8 }}>
          <strong>{t(grp, translation)}</strong>
          {items.map(name => (
            <label key={name} style={{ marginLeft: 10 }}>
              <input type="checkbox" checked={selectedFoods.has(name)} onChange={() => toggleFood(name)} />
              {t(name, translation)}
            </label>
          ))}
        </div>
      ))}
      <h4>🏥 医疗（单选）</h4>
      <label><input type="radio" name="medical" checked={selectedMedical === null} onChange={() => setMedical(null)} /> 不使用</label>
      {medicalList.map(name => (
        <label key={name} style={{ marginLeft: 10 }}>
          <input type="radio" name="medical" checked={selectedMedical === name} onChange={() => setMedical(name)} />
          {t(name, translation)}
        </label>
      ))}
      <h4>⚙️ 其他服务（多选）</h4>
      {otherList.map(name => (
        <label key={name} style={{ marginRight: 15 }}>
          <input type="checkbox" checked={selectedOthers.has(name)} onChange={() => toggleOther(name)} />
          {t(name, translation)}
        </label>
      ))}
    </div>
  );
};

export default ResidentPanel;