import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../stores';
import { Btn, ModalShell, SearchInput, Select } from './UI';
import { ProductGrid } from './ProductGrid';
import { t, isPowerBuilding, HIDDEN_SERIES, isRaw, isPowerItem, getSeriesName } from '../utils';
import { Recipe, Series } from '../types';

// ==================== 建筑等级弹窗 ====================
export const LevelModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const mainSeriesList = useStore(s => s.mainSeriesList);
  const mainEnabled = useStore(s => s.mainEnabled);
  const mainSelectedLevel = useStore(s => s.mainSelectedLevel);
  const setMainEnabled = useStore(s => s.setMainEnabled);
  const setMainLevel = useStore(s => s.setMainLevel);
  const setMainBuildingEnabled = useStore(s => s.setMainBuildingEnabled);
  const translation = useStore(s => s.translation);

  const multi = mainSeriesList.filter(s => s.levels.length > 1);

  return (
    <ModalShell open={open} onClose={onClose} title="设置建筑等级" maxWidth="500px"
      footer={<Btn onClick={onClose}>确定</Btn>}>
      {!multi.length ? <span className="hint">没有多等级建筑</span> :
        multi.map(s => (
          <div className="level-series" key={s.name} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={mainEnabled[s.name] !== false}
              onChange={e => setMainEnabled(s.name, e.target.checked)} />
            <span>{t(s.name, translation)}: </span>
            <Select
              value={mainSelectedLevel[s.name] || s.levels[s.levels.length - 1].level}
              options={s.levels.map(lv => ({ value: lv.level, label: `Lv${lv.level}` }))}
              onChange={v => {
                const newLevel = parseInt(v);
                setMainLevel(s.name, newLevel);
                // 同步 buildingEnabledMap：当前等级的建筑启用，其他禁用
                const currentLevelBuilding = s.levels.find(lv => lv.level === newLevel)?.buildingId;
                s.levels.forEach(lv => {
                  setMainBuildingEnabled(lv.buildingId, lv.buildingId === currentLevelBuilding);
                });
              }}
            />
          </div>
        ))}
    </ModalShell>
  );
};

// ==================== 配方选择弹窗（主模块） ====================
export const RecipeModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const fullData = useStore(s => s.fullData);
  const mainSeriesList = useStore(s => s.mainSeriesList);
  const mainEnabled = useStore(s => s.mainEnabled);
  const mainSelectedLevel = useStore(s => s.mainSelectedLevel);
  const recipeEnabled = useStore(s => s.recipeEnabled);
  const recipes = useStore(s => s.recipes);
  const setMainEnabled = useStore(s => s.setMainEnabled);
  const setMainLevel = useStore(s => s.setMainLevel);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const mainBuildingEnabledMap = useStore(s => s.mainBuildingEnabledMap);
  const setMainBuildingEnabled = useStore(s => s.setMainBuildingEnabled);
  const translation = useStore(s => s.translation);

  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('');

  // 过滤掉隐藏系列的建筑，并确保每个建筑都有对应的主模块配方
  const entries = useMemo(() => {
    if (!fullData) return [];
    const hiddenKeywords = [
      'Cargo depot','Unit module','Loose module','Fluid module',
      'Unit storage','Loose storage','Fluid storage'
    ];
    return fullData.machines_and_buildings
      .filter(b => !hiddenKeywords.some(k => b.name.toLowerCase().includes(k.toLowerCase())))
      .filter(b => !b.id.toLowerCase().startsWith('researchlab'))
      .map(b => {
        // 查找该建筑在主模块中的配方（module === 'main'）
        const mainRecipes = recipes.filter(r => r.buildingId === b.id && r.module === 'main');
        if (mainRecipes.length === 0) return null; // 没有任何主模块配方，不显示

        const sn = getSeriesName(b.id, mainSeriesList, []) || b.name; // 没有系列就用建筑名
        const series = mainSeriesList.find(s => s.name === sn);
        const lv = series?.levels.find(lv => lv.buildingId === b.id)?.level || 1;
        // 建筑启用状态：独立于系列，默认 true
        const buildingOn = (() => {
          // 无系列建筑：独立控制
          if (!series || series.levels.length === 0) {
            return mainBuildingEnabledMap[b.id] !== false;
          }
          // 有系列建筑：等级必须匹配，且独立开关未禁用
          return mainSelectedLevel[sn] === lv && mainBuildingEnabledMap[b.id] !== false;
        })();
        const onToggleBuilding = (checked: boolean) => {
          if (series && series.levels.length > 0 && mainSelectedLevel[sn] !== lv) {
            // 等级不匹配时不允许开启（可提示）
            alert(`请先在"设置等级"中将 ${sn} 的等级设为 Lv${lv} 后才能启用此建筑。`);
            return;
          }
          setMainBuildingEnabled(b.id, checked);
        };
        return {
          buildingId: b.id,
          buildingName: b.name,
          category: b.category,
          level: lv,
          recipes: mainRecipes,
          buildingEnabled: buildingOn,
          seriesName: sn,
          onToggleBuilding,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [fullData, mainSeriesList, recipes, mainSelectedLevel, mainBuildingEnabledMap, setMainBuildingEnabled]);

  const cats = useMemo(() => {
    const c = [...new Set(entries.map(e => e.category))].sort();
    c.push('🚫 已禁用');
    return c;
  }, [entries]);

  const currentCat = activeCat || cats[0] || '';

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (currentCat === '🚫 已禁用') return !e.buildingEnabled;
      if (e.category !== currentCat) return false;
      if (search && !t(e.buildingName, translation).toLowerCase().includes(search.toLowerCase())
        && !e.recipes.some(r => t(r.name, translation).toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [entries, currentCat, search, translation]);

  return (
    <ModalShell open={open} onClose={onClose} title="🧪 建筑与配方">
      <SearchInput placeholder="搜索建筑或配方..." value={search} onChange={setSearch} />
      <div className="recipe-panel">
        <div className="category-tabs">
          {cats.map(c => (
            <div key={c} className={`category-tab ${c === currentCat ? 'active' : ''}`}
              onClick={() => setActiveCat(c)}>{t(c, translation)}</div>
          ))}
        </div>
        <div className="building-list">
          {!filtered.length ? <span className="hint">无匹配建筑</span> :
            filtered.map(e => (
              <BuildingBlock key={e.buildingId} entry={e} openByDefault={!!search}
                translation={translation} recipeEnabled={recipeEnabled}
                onToggleBuilding={e.onToggleBuilding}
                onToggleRecipe={(rid, checked) => setRecipeEnabled(rid, checked)}
              />
            ))}
        </div>
      </div>
    </ModalShell>
  );
};

interface BuildingBlockEntry {
  buildingId: string;
  buildingName: string;
  level: number;
  recipes: Recipe[];
  buildingEnabled: boolean;
  seriesName: string;
}
const BuildingBlock: React.FC<{
  entry: BuildingBlockEntry;
  openByDefault: boolean;
  translation: Record<string, string>;
  recipeEnabled: Record<string, boolean>;
  onToggleBuilding: (checked: boolean) => void;
  onToggleRecipe: (rid: string, checked: boolean) => void;
}> = ({ entry, openByDefault, translation, recipeEnabled, onToggleBuilding, onToggleRecipe }) => {
  const [expanded, setExpanded] = useState(openByDefault);
  const buildingIcon = useStore(s => s.buildingIcons[entry.buildingId]);
  const showIcons = useStore(s => s.showIcons);
  return (
    <div className="building-block">
      <div className="building-header">
        <input type="checkbox" checked={entry.buildingEnabled}
          onChange={e => onToggleBuilding(e.target.checked)} />
        {showIcons && buildingIcon && <img src={buildingIcon} alt="" style={{ width: 24, height: 24, marginRight: 8 }} loading="lazy" decoding="async" />}
        <span className="building-name" onClick={() => setExpanded(!expanded)}>
          🏭 {t(entry.buildingName, translation)} (Lv.{entry.level})
        </span>
      </div>
      {expanded && (
        <div className="recipe-sublist">
          {entry.recipes.map(r => {
            const rOn = recipeEnabled[r.id] !== false;
            const imp = Object.entries(r.inputs).map(([k, v]) => `${t(k, translation)}×${isPowerItem(k) ? v : ((60 / r.duration) * v).toFixed(2)}`).join(', ') || '无';
            const oup = Object.entries(r.outputs).map(([k, v]) => `${t(k, translation)}×${isPowerItem(k) ? v : ((60 / r.duration) * v).toFixed(2)}`).join(', ') || '无';
            return (
              <div className="recipe-entry" key={r.id}>
                <label>
                  <input type="checkbox" checked={rOn} onChange={e => onToggleRecipe(r.id, e.target.checked)} />
                  {' '}{t(r.name, translation)}
                </label>
                <span className="recipe-info">投入: {imp} → 产出: {oup}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================== 电力配方弹窗 ====================
export const PowerRecipeModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const fullData = useStore(s => s.fullData);
  const powerSeriesList = useStore(s => s.powerSeriesList);
  const powerEnabled = useStore(s => s.powerEnabled);
  const powerSelectedLevel = useStore(s => s.powerSelectedLevel);
  const recipeEnabled = useStore(s => s.recipeEnabled);
  const recipes = useStore(s => s.recipes);
  const setPowerEnabled = useStore(s => s.setPowerEnabled);
  const setPowerLevel = useStore(s => s.setPowerLevel);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const powerBuildingEnabledMap = useStore(s => s.powerBuildingEnabledMap);
  const setPowerBuildingEnabled = useStore(s => s.setPowerBuildingEnabled);
  const translation = useStore(s => s.translation);

  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string>('');

  const entries = useMemo(() => {
    if (!fullData) return [];
    return fullData.machines_and_buildings
      .filter(b => isPowerBuilding(b.name) && !HIDDEN_SERIES.some(k => b.name.toLowerCase().includes(k.toLowerCase())))
      .map(b => {
        const sn = getSeriesName(b.id, [], powerSeriesList);
        if (!sn) return null; // 无电力系列的建筑忽略
        const series = powerSeriesList.find(s => s.name === sn);
        const lv = series?.levels.find(lv => lv.buildingId === b.id)?.level || 1;
        const recs = recipes.filter(r => r.buildingId === b.id && r.module === 'power') as Recipe[];
        const buildingOn = powerEnabled[sn] !== false && powerSelectedLevel[sn] === lv && powerBuildingEnabledMap[b.id] !== false;
        const onToggleBuilding = (checked: boolean) => {
          // 使用 powerBuildingEnabledMap 独立控制电力模块建筑
          setPowerBuildingEnabled(b.id, checked);
          if (!checked) {
            // 建筑关闭时，不自动禁用配方（配方由 recipeEnabled 独立控制）
          } else {
            // 建筑开启时，同时启用系列
            setPowerEnabled(sn, checked);
            if (powerSelectedLevel[sn] !== lv) {
              setPowerLevel(sn, lv);
            }
          }
        };
        return {
          buildingId: b.id,
          buildingName: b.name,
          category: b.category,
          level: lv,
          recipes: recs,
          buildingEnabled: buildingOn,
          seriesName: sn,
          onToggleBuilding,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [fullData, powerSeriesList, powerEnabled, powerSelectedLevel, recipes, powerBuildingEnabledMap, setPowerEnabled, setPowerLevel, setPowerBuildingEnabled]);

  const cats = useMemo(() => [...new Set(entries.map(e => e.category))].sort(), [entries]);
  const currentCat = activeCat || cats[0] || '';

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (e.category !== currentCat) return false;
      if (search && !t(e.buildingName, translation).toLowerCase().includes(search.toLowerCase())
        && !e.recipes.some(r => t(r.name, translation).toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [entries, currentCat, search, translation]);

  return (
    <ModalShell open={open} onClose={onClose} title="⚡ 电力配方选择">
      <SearchInput placeholder="搜索建筑或配方..." value={search} onChange={setSearch} />
      <div className="recipe-panel">
        <div className="category-tabs">
          {cats.map(c => (
            <div key={c} className={`category-tab ${c === currentCat ? 'active' : ''}`}
              onClick={() => setActiveCat(c)}>{t(c, translation)}</div>
          ))}
        </div>
        <div className="building-list">
          {!filtered.length ? <span className="hint">无匹配建筑</span> :
            filtered.map(e => (
              <BuildingBlock key={e.buildingId} entry={e} openByDefault={!!search}
                translation={translation} recipeEnabled={recipeEnabled}
                onToggleBuilding={e.onToggleBuilding}
                onToggleRecipe={(rid, checked) => setRecipeEnabled(rid, checked)}
              />
            ))}
        </div>
      </div>
    </ModalShell>
  );
};

// ==================== 需求添加弹窗 ====================
export const DemandModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const allItems = useStore(s => s.allItems);
  const addDemand = useStore(s => s.addDemand);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [rate, setRate] = useState(100);

  const items = allItems.sort();

  return (
    <ModalShell open={open} onClose={onClose} title="🎯 选择生产目标" maxWidth="700px"
      footer={
        <>
          <label>产量/分: <input type="number" value={rate} min={0.1} step={1} style={{ width: 80 }}
            onChange={e => setRate(parseFloat(e.target.value) || 0)} /></label>
          <Btn onClick={() => {
            if (selected && rate > 0) { addDemand(selected, rate); onClose(); }
          }}>➕ 添加</Btn>
        </>
      }>
      <ProductGrid
        items={items}
        selectedItem={selected}
        onSelect={setSelected}
        search={search}
        setSearch={setSearch}
        placeholder="搜索物品..."
      />
    </ModalShell>
  );
};

// ==================== 排除产物弹窗 ====================
export const ExcludeModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const allItems = useStore(s => s.allItems);
  const excludedItems = useStore(s => s.excludedItems);
  const setExcludedItems = useStore(s => s.setExcludedItems);
  const translation = useStore(s => s.translation);

  const [search, setSearch] = useState('');
  const [localExcluded, setLocalExcluded] = useState<Set<string>>(new Set(excludedItems));

  React.useEffect(() => { setLocalExcluded(new Set(excludedItems)); }, [excludedItems, open]);

  const filtered = allItems
    .filter(i => !isRaw(i) && (i.toLowerCase().includes(search.toLowerCase()) || t(i, translation).includes(search)))
    .sort();

  return (
    <ModalShell open={open} onClose={onClose} title="🚫 排除产物（不参与平衡）" maxWidth="700px"
      footer={<Btn onClick={() => { setExcludedItems([...localExcluded]); onClose(); }}>完成</Btn>}>
      <SearchInput placeholder="搜索中/英文..." value={search} onChange={setSearch} />
      <div className="exclude-list">
        {filtered.map(item => (
          <div className="exclude-item" key={item}>
            <input type="checkbox" checked={localExcluded.has(item.toLowerCase())}
              onChange={e => {
                const next = new Set(localExcluded);
                e.target.checked ? next.add(item.toLowerCase()) : next.delete(item.toLowerCase());
                setLocalExcluded(next);
              }} />
            <span className="exclude-item-name">{t(item, translation)} ({item})</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};