import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Recipe } from '../types';
import { t } from '../utils';
import { IconWithFallback } from './IconWithFallback';

interface Props {
  recipes: Recipe[];
  buildingIcons: Record<string, string>;
  translation: Record<string, string>;
  showIcons: boolean;
  recipeEnabled: Record<string, boolean>;
  mainBuildingEnabledMap: Record<string, boolean>;
  setRecipeEnabled: (id: string, v: boolean) => void;
  setMainBuildingEnabled: (id: string, v: boolean) => void;
  onClose: () => void;
}

const RecipeSettingsModal: React.FC<Props> = ({
  recipes, buildingIcons, translation, showIcons,
  recipeEnabled, mainBuildingEnabledMap,
  setRecipeEnabled, setMainBuildingEnabled,
  onClose,
}) => {
  // Group recipes by building
  const buildings = useMemo(() => {
    const map = new Map<string, { bId: string; bName: string; recipes: Recipe[] }>();
    for (const r of recipes) {
      if (r.isHidden || r.module === 'power' || r.module === 'trade') continue;
      const e = map.get(r.buildingId);
      if (e) { e.recipes.push(r); } else {
        map.set(r.buildingId, { bId: r.buildingId, bName: r.buildingName, recipes: [r] });
      }
    }
    return [...map.values()].sort((a, b) => a.bName.localeCompare(b.bName));
  }, [recipes]);

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', zIndex: 1001, left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 500, maxHeight: '80vh', background: '#fff', borderRadius: 8,
      boxShadow: '0 8px 30px rgba(0,0,0,.25)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontSize: '0.82rem',
    }}>
      <div style={{
        padding: '10px 14px', fontWeight: 600, borderBottom: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>⚙️ 全局配方设置</span>
        <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '1.2rem' }}>✕</span>
      </div>
      <div style={{
        padding: '4px 10px', fontSize: '0.7rem', color: '#888',
        borderBottom: '1px solid #eee', background: '#fafafa',
      }}>
        关闭建筑或配方后，自动生成节点时不会使用。手动选择配方不受影响。
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {buildings.map(b => {
          const bEnabled = mainBuildingEnabledMap[b.bId] !== false;
          return (
            <div key={b.bId} style={{
              margin: '4px 8px', border: `1px solid ${bEnabled ? '#c8e6c9' : '#ddd'}`,
              borderRadius: 6, overflow: 'hidden',
              background: bEnabled ? '#fff' : '#fafafa',
            }}>
              {/* Building header */}
              <div onClick={() => setMainBuildingEnabled(b.bId, !bEnabled)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  cursor: 'pointer', userSelect: 'none',
                  background: bEnabled ? '#e8f5e9' : '#f5f5f5',
                }}>
                <input type="checkbox" checked={bEnabled} readOnly
                  style={{ cursor: 'pointer' }} />
                {showIcons && buildingIcons[b.bId] && (
                  <IconWithFallback src={buildingIcons[b.bId]} alt="" style={{ width: 20, height: 20 }} />
                )}
                <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>
                  {t(b.bName, translation)}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#888' }}>
                  {b.recipes.length}个配方
                </span>
              </div>
              {/* Recipe list */}
              {bEnabled && (
                <div style={{ padding: '2px 0' }}>
                  {b.recipes.map(r => {
                    const rOn = recipeEnabled[r.id] !== false;
                    return (
                      <div key={r.id} onClick={() => setRecipeEnabled(r.id, !rOn)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 30px',
                          cursor: 'pointer', userSelect: 'none',
                          borderBottom: '1px solid #f5f5f5',
                        }}>
                        <input type="checkbox" checked={rOn} readOnly
                          style={{ cursor: 'pointer' }} />
                        <span style={{
                          fontSize: '0.78rem',
                          color: rOn ? '#333' : '#bbb',
                          textDecoration: rOn ? 'none' : 'line-through',
                        }}>
                          {t(r.name, translation)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid #eee', textAlign: 'right' }}>
        <button onClick={onClose}
          style={{
            padding: '6px 20px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem',
          }}>
          关闭
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default RecipeSettingsModal;
