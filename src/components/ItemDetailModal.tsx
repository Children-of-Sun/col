import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../stores';
import { t, getColValue, getMaintenanceReduction } from '../utils';
import { isContinuous, formatPowerSigned } from '../utils/format';
import { IconWithFallback } from './IconWithFallback';
import { ModalShell, SearchInput } from './UI';
import type { Recipe } from '../types';

interface Props {
  open: boolean;
  initialItem?: string;
  onClose: () => void;
}

/** Modal equivalent to the recipe search tab */
const ItemDetailModal: React.FC<Props> = ({ open, initialItem, onClose }) => {
  const recipes = useStore(s => s.recipes);
  const result = useStore(s => s.result);
  const solverActive = useStore(s => s.solverActive);
  const solverVarNames = useStore(s => s.solverVarNames);
  const translation = useStore(s => s.translation);
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);
  const statueCount = useStore(s => s.statueCount);
  const gameData = useStore(s => s.gameData);
  const integerMode = useStore(s => s.integerMode);

  const [search, setSearch] = useState(() => initialItem ? (translation[initialItem] || initialItem) : '');
  const [selectedItem, setSelectedItem] = useState(initialItem || '');

  useEffect(() => {
    if (initialItem) {
      setSearch(translation[initialItem] || initialItem);
      setSelectedItem(initialItem);
    }
  }, [initialItem, translation]);

  // Reduction factor
  const reductionFactor = useMemo(() => {
    let r = getMaintenanceReduction(statueCount);
    if (gameData) {
      const e = gameData.edicts.find(ed => ed.name === '减少维护');
      if (e) r += (e.effectPerLevel[0] || 0);
    }
    return Math.min(r, 1);
  }, [statueCount, gameData]);

  // Compute per-min rates
  const computePerMin = useCallback((recipe: Recipe, machineCount: number) => {
    const inputs: Record<string, number> = {};
    const outputs: Record<string, number> = {};
    let workers = 0, electricity = 0, computing = 0;
    for (const [k, v] of Object.entries(recipe.inputs)) {
      const scale = isContinuous(k) ? 1 : 60 / (recipe.duration || 1);
      inputs[k] = v * scale * machineCount;
    }
    for (const [k, v] of Object.entries(recipe.outputs)) {
      const scale = isContinuous(k) ? 1 : 60 / (recipe.duration || 1);
      outputs[k] = v * scale * machineCount;
    }
    for (const [k, v] of Object.entries(recipe.upkeep)) {
      if (k === '人力') workers += v * machineCount;
      else if (k === 'electricity') electricity += v * machineCount;
      else if (k === 'computing') computing += v * machineCount;
    }
    return { inputs, outputs, workers, electricity, computing };
  }, []);

  // Active recipe data from solver
  const recipeData = useMemo(() => {
    const map: Record<string, number> = {};
    if (result && solverActive && solverVarNames) {
      for (let i = 0; i < Math.min(solverActive.length, solverVarNames.length); i++) {
        map[solverActive[i].id] = getColValue(result, solverVarNames[i]);
      }
    }
    return solverActive
      .map((recipe, idx) => {
        const mc = map[recipe.id] || 0;
        if (mc < 1e-6) return null;
        return { recipe, machineCount: mc, perMin: computePerMin(recipe, mc) };
      })
      .filter(Boolean) as { recipe: Recipe; machineCount: number; perMin: ReturnType<typeof computePerMin> }[];
  }, [result, solverActive, solverVarNames, computePerMin]);

  // Filtered by selected item
  const { producing, consuming } = useMemo(() => {
    if (!selectedItem) return { producing: [] as typeof recipeData, consuming: [] as typeof recipeData };
    return {
      producing: recipeData.filter(d => d.recipe.outputs[selectedItem] && d.machineCount > 0),
      consuming: recipeData.filter(d => d.recipe.inputs[selectedItem] && d.machineCount > 0),
    };
  }, [selectedItem, recipeData]);

  // Only items that are actually produced or consumed in active recipes
  const activeItems = useMemo(() => {
    const items = new Set<string>();
    recipeData.forEach(d => {
      Object.keys(d.perMin.outputs).forEach(k => items.add(k));
      Object.keys(d.perMin.inputs).forEach(k => items.add(k));
    });
    return [...items].sort();
  }, [recipeData]);

  // Search filter — only matches items, not buildings/recipes
  const searchResults = useMemo(() => {
    if (!search.trim()) return activeItems.slice(0, 50);
    const q = search.toLowerCase();
    return activeItems.filter(i => {
      const tn = (translation[i] || i).toLowerCase();
      return i.toLowerCase().includes(q) || tn.includes(q);
    }).slice(0, 50);
  }, [search, activeItems, translation]);

  const handleSelect = useCallback((item: string) => {
    setSelectedItem(item);
    setSearch(translation[item] || item);
  }, [translation]);

  // Recipe card renderer (same as recipe search tab)
  const renderRecipeCard = (d: typeof recipeData[0], highlightItem: string) => {
    const s = (translation[highlightItem] || highlightItem).toLowerCase();
    const outEntries = Object.entries(d.perMin.outputs) as [string, number][];
    const inEntries = Object.entries(d.perMin.inputs) as [string, number][];
    return (
      <div key={d.recipe.id} style={{ padding: '10px 12px', marginBottom: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{t(d.recipe.name, translation)}</div>
        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 6 }}>
          🏭 {t(d.recipe.buildingName, translation)} · ⚙ {d.machineCount.toFixed(3)} 台
          {d.perMin.workers ? <span> · 👷 {d.perMin.workers.toFixed(1)}</span> : null}
          {d.perMin.electricity ? <span> · ⚡ {formatPowerSigned(d.perMin.electricity)}</span> : null}
          {d.perMin.computing ? <span> · 💻 {d.perMin.computing.toFixed(1)}</span> : null}
        </div>
        {outEntries.length > 0 && (
          <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
            <span style={{ color: '#2e7d32', fontWeight: 600 }}>📤 产出: </span>
            {outEntries.map(([k, v]) => {
              const hl = t(k, translation).toLowerCase().includes(s);
              return <span key={k} style={{
                marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                background: hl ? '#a5d6a7' : '#e8f5e9', fontWeight: hl ? 700 : 400,
              }}>{t(k, translation)} × {v.toFixed(2)}</span>;
            })}
          </div>
        )}
        {inEntries.length > 0 && (
          <div style={{ fontSize: '0.8rem' }}>
            <span style={{ color: '#c62828', fontWeight: 600 }}>📥 投入: </span>
            {inEntries.map(([k, v]) => {
              const hl = t(k, translation).toLowerCase().includes(s);
              return <span key={k} style={{
                marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                background: hl ? '#ef9a9a' : '#fce4ec', fontWeight: hl ? 700 : 400,
              }}>{t(k, translation)} × {v.toFixed(2)}</span>;
            })}
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  const icon = showIcons ? productIcons[selectedItem.toLowerCase()] : undefined;

  return (
    <ModalShell open={open} onClose={onClose} title="" maxWidth="900px">
      <h3 style={{ margin: '0 0 12px 0' }}>
        {icon && <IconWithFallback src={icon} alt="" style={{ width: 28, height: 28 }} />}
        {' '}{t(selectedItem, translation) || selectedItem}
        <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: 12 }}>({selectedItem})</span>
      </h3>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="搜索物品（中文或英文）..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '10px 16px', fontSize: '1rem', borderRadius: 8, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
        />
        {search && searchResults.length > 0 && (translation[selectedItem] || selectedItem) !== search && (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4, marginTop: 4 }}>
            {searchResults.map(item => (
              <div
                key={item}
                onClick={() => handleSelect(item)}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                  borderBottom: '1px solid #eee',
                  background: item === selectedItem ? '#e3f2fd' : 'transparent',
                }}
              >
                {t(item, translation) || item} <span style={{ color: '#999', fontSize: 11 }}>({item})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selectedItem ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>搜索并选择一个物品查看详情</div>
      ) : producing.length === 0 && consuming.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>
          {result ? '当前求解结果中未启用相关配方' : '未求解，请先在高级模式中求解'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, height: '55vh' }}>
          {/* Left: Producers */}
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#2e7d32' }}>📤 产出匹配 ({producing.length})</h4>
            {producing.length === 0 ? (
              <div style={{ color: '#888', fontSize: 13 }}>无产出配方（原材料或外部输入）</div>
            ) : (
              producing.map(d => renderRecipeCard(d, selectedItem))
            )}
          </div>
          {/* Right: Consumers */}
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#c62828' }}>📥 消耗匹配 ({consuming.length})</h4>
            {consuming.length === 0 ? (
              <div style={{ color: '#888', fontSize: 13 }}>无消耗配方（最终产品或未被使用）</div>
            ) : (
              consuming.map(d => renderRecipeCard(d, selectedItem))
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button onClick={onClose} style={{
          padding: '6px 20px', background: '#2196F3', color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer',
        }}>关闭</button>
      </div>
    </ModalShell>
  );
};

export default ItemDetailModal;
