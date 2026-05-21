import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';

const OfficePanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const officeLevels = useStore(s => s.officeLevels);
  const setOfficeLevel = useStore(s => s.setOfficeLevel);
  const translation = useStore(s => s.translation);

  if (!gameData) return null;

  return (
    <div>
      <h4>🏢 办公升级</h4>
      {gameData.office.map((off, idx) => (
        <div key={idx} style={{ marginBottom: 5 }}>
          <label>{t(off.name, translation)} (最高 {off.maxLevel}): </label>
          <input
            type="number"
            min={0}
            max={off.maxLevel}
            value={officeLevels[idx] || 0}
            style={{ width: 60 }}
            onChange={e => setOfficeLevel(idx, Math.max(0, Math.min(off.maxLevel, parseInt(e.target.value) || 0)))}
          />
        </div>
      ))}
    </div>
  );
};

export default OfficePanel;