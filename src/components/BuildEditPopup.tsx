import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Recipe } from '../types';
import { getRecipesForItem } from '../recipeTree';
import { t } from '../utils';
import { IconWithFallback } from './IconWithFallback';

interface Props {
  x: number; y: number; item: string; allRecipes: Recipe[];
  buildingIcons: Record<string, string>; translation: Record<string, string>; showIcons: boolean;
  onSelect: (bId: string, rId: string) => void;
  onClose: () => void;
}

const BuildEditPopup: React.FC<Props> = ({ x, y, item, allRecipes, buildingIcons, translation, showIcons, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 100);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const buildings = useMemo(() => {
    const recipes = getRecipesForItem(item, allRecipes);
    const m = new Map<string, { bId: string; bName: string; recipes: Recipe[] }>();
    for (const r of recipes) {
      const e = m.get(r.buildingId);
      if (e) e.recipes.push(r); else m.set(r.buildingId, { bId: r.buildingId, bName: r.buildingName, recipes: [r] });
    }
    return [...m.values()];
  }, [item, allRecipes]);

  const [selBld, setSelBld] = useState(buildings[0]?.bId || '');
  const cur = buildings.find(b => b.bId === selBld);

  return ReactDOM.createPortal(
    <div ref={ref} style={{
      position: 'fixed', zIndex: 1000, left: Math.min(x, window.innerWidth - 320), top: Math.min(y, window.innerHeight - 420),
      width: 300, maxHeight: 400, background: '#fff', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,.25)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', fontSize: '0.82rem',
    }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #eee' }}>
        选择建筑 · {t(item, translation) || item}
      </div>
      <div style={{ maxHeight: 130, overflowY: 'auto', borderBottom: '1px solid #eee' }}>
        {buildings.map(b => (
          <div key={b.bId} onClick={() => setSelBld(b.bId)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', cursor: 'pointer',
              background: selBld === b.bId ? '#e3f2fd' : 'transparent' }}>
            {showIcons && buildingIcons[b.bId] && <IconWithFallback src={buildingIcons[b.bId]} alt="" style={{ width: 24, height: 24 }} />}
            <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>{t(b.bName, translation)}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cur?.recipes.map(r => (
          <div key={r.id} onClick={() => onSelect(selBld, r.id)}
            style={{ padding: '6px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <div style={{ fontWeight: 500 }}>{t(r.name, translation)}</div>
            <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 1 }}>
              {Object.keys(r.inputs).map(it => t(it, translation).slice(0, 6)).join(', ')} → {Object.keys(r.outputs).map(it => t(it, translation).slice(0, 6)).join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};

export default BuildEditPopup;
