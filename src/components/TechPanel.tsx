import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';

const TechPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const researchLevels = useStore(s => s.researchLevels);
  const setResearchLevel = useStore(s => s.setResearchLevel);
  const translation = useStore(s => s.translation);

  if (!gameData) return null;

  return (
    <div>
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
            onChange={e => setResearchLevel(idx, Math.max(0, Math.min(res.maxLevel, parseInt(e.target.value) || 0)))}
          />
        </div>
      ))}
    </div>
  );
};

export default TechPanel;