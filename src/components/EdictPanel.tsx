import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';

const EdictPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);
  const setEdictLevel = useStore(s => s.setEdictLevel);
  const translation = useStore(s => s.translation);

  if (!gameData) return null;

  return (
    <div>
      <h4>📜 法令</h4>
      {gameData.edicts.map((edict, idx) => {
        const lvl = edictLevels[idx] ?? -1;
        return (
          <div key={idx} style={{ marginBottom: 5 }}>
            <label>{t(edict.name, translation)}: </label>
            <select value={lvl} onChange={e => setEdictLevel(idx, parseInt(e.target.value))}>
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
    </div>
  );
};

export default EdictPanel;