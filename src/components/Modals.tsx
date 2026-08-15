import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { Btn, ModalShell, SearchInput, Select, ToggleSwitch } from './UI';
import { ProductGrid } from './ProductGrid';
import { t, isPowerBuilding, HIDDEN_SERIES, isPowerItem, getSeriesName, computeSolarEfficiency } from '../utils';
import { Recipe, Series } from '../types';
import { buildModuleRecipe, getModuleNetIO } from '../utils/module';
import { getAgricultureMultipliers } from '../utils/agricultureMultipliers';
import { buildAgricultureRecipes } from '../utils/agricultureRecipes';

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
  const modules = useStore(s => s.modules);
  const moduleEnabled = useStore(s => s.moduleEnabled);
  const setModuleEnabled = useStore(s => s.setModuleEnabled);
  // 农业加成（模块内农业配方预览同样应用）
  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const researchLevels = useStore(s => s.researchLevels);
  const enableAgriculture = useStore(s => s.enableAgriculture);
  const farms = useStore(s => s.farms);
  const globalFertilizerType = useStore(s => s.globalFertilizerType);
  const targetFertility = useStore(s => s.targetFertility);
  const cropRotation = useStore(s => s.cropRotation);
  const agriMultipliers = React.useMemo(
    () => getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels),
    [gameData, edictLevels, officeLevels, researchLevels]
  );
  // 农业系统动态配方（agri_*）纳入模块预览
  const agriRecipes = React.useMemo(() => {
    if (!enableAgriculture) return [];
    return buildAgricultureRecipes(useStore.getState(), agriMultipliers.output, agriMultipliers.water);
  }, [enableAgriculture, farms, globalFertilizerType, targetFertility, cropRotation, agriMultipliers]);
  // 同 id 优先 main 副本（避免命中未加成/重复的 power 副本）
  const allRecipes = React.useMemo(() => {
    const list = [...recipes, ...agriRecipes];
    const map = new Map<string, (typeof list)[number]>();
    for (const r of list) {
      const ex = map.get(r.id);
      if (!ex || (r.module === 'main' && ex.module !== 'main')) map.set(r.id, r);
    }
    return [...map.values()];
  }, [recipes, agriRecipes]);
  // 太阳能加成（模块预览与求解一致）
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const finalSolarEfficiency = React.useMemo(
    () => computeSolarEfficiency(solarEfficiency, gameData, edictLevels, researchLevels),
    [solarEfficiency, gameData, edictLevels, researchLevels]
  );
  const previewRecipes = React.useMemo(
    () => finalSolarEfficiency !== 1
      ? allRecipes.map(r => r.isSolar && r.outputs['electricity']
        ? { ...r, outputs: { ...r.outputs, electricity: r.outputs['electricity'] * finalSolarEfficiency } }
        : r)
      : allRecipes,
    [allRecipes, finalSolarEfficiency]
  );

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
          // 单个配方的建筑：开启建筑时自动启用唯一配方
          if (checked && mainRecipes.length === 1) {
            setRecipeEnabled(mainRecipes[0].id, true);
          }
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
    c.unshift('📐 模块');
    c.push('🚫 已禁用');
    return c;
  }, [entries]);

  const currentCat = activeCat || cats[0] || '';

  const filtered = useMemo(() => {
    if (currentCat === '📐 模块') return [];
    const result: any[] = [];
    for (const e of entries) {
      let matchedRecipes: any[] | undefined;
      if (currentCat === '🚫 已禁用') {
        if (!e.buildingEnabled) result.push({ ...e, matchedRecipes: undefined });
        continue;
      }
      if (e.category !== currentCat) continue;
      if (search) {
        const s = search.toLowerCase();
        const buildingNameMatch = t(e.buildingName, translation).toLowerCase().includes(s);
        const matchingRecipes = e.recipes.filter((r: any) => {
          if (t(r.name, translation).toLowerCase().includes(s)) return true;
          if (Object.keys(r.inputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
          if (Object.keys(r.outputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
          return false;
        });
        if (!buildingNameMatch && matchingRecipes.length === 0) continue;
        if (!buildingNameMatch) matchedRecipes = matchingRecipes;
      }
      result.push({ ...e, matchedRecipes });
    }
    return result;
  }, [entries, currentCat, search, translation]);

  return (
    <ModalShell open={open} onClose={onClose} title="🧪 建筑与配方">
      <div style={{ background: '#e3f2fd', color: '#0d47a1', padding: '6px 10px', borderRadius: 4, marginBottom: 8, fontSize: '1rem' }}>
        关闭某个建筑后，其附属配方不会参与求解（即使配方开关仍开启）；模块在「📐 模块」分类中管理是否使用
      </div>
      <SearchInput placeholder="搜索建筑或配方..." value={search} onChange={setSearch} />
      <div className="recipe-panel">
        <div className="category-tabs">
          {cats.map(c => (
            <div key={c} className={`category-tab ${c === currentCat ? 'active' : ''}`}
              onClick={() => setActiveCat(c)}>{t(c, translation)}</div>
          ))}
        </div>
        <div className="building-list">
          {currentCat === '📐 模块' ? (
            modules.length === 0 ? (
              <span className="hint">暂无模块，请到「📐 模块」模式创建</span>
            ) : modules.map(bp => {
              const enabled = moduleEnabled[bp.id] !== false;
              const bpDiv = bp.divisor && bp.divisor > 0 ? bp.divisor : 1;
              const machineTotal = (bp.parts || []).reduce((s, p) => s + (p.count > 0 ? p.count : 0), 0) / bpDiv;
              const bpRecipe = buildModuleRecipe(bp, previewRecipes, agriMultipliers);
              const netIO = bpRecipe ? getModuleNetIO(bpRecipe) : null;
              return (
                <div key={bp.id} className="building-block"
                  style={{ backgroundColor: enabled ? '#e8f5e9' : '#fafafa', border: enabled ? '1px solid #4caf50' : '1px solid #ddd', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setModuleEnabled(bp.id, !enabled)}>
                    <input type="checkbox" checked={enabled} readOnly style={{ cursor: 'pointer' }} />
                    <span style={{ fontWeight: 'bold' }}>{bp.name}</span>
                    <span style={{ fontSize: 13, color: '#888' }}>
                      分类: {t(bp.category || '模块', translation)} | {bp.parts.length} 个配方 | 内部机器 {machineTotal} 台
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: enabled ? '#2e7d32' : '#999' }}>
                      {enabled ? '✓ 使用中' : '未使用'}
                    </span>
                  </div>
                  {netIO && (
                    <div style={{ padding: '6px 10px 8px 30px', fontSize: '0.95rem', color: '#333', lineHeight: 1.7 }}>
                      <div>
                        <span style={{ color: '#c62828', fontWeight: 600 }}>净输入: </span>
                        {Object.keys(netIO.inputs).length
                          ? Object.entries(netIO.inputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join('、')
                          : '无'}
                      </div>
                      <div>
                        <span style={{ color: '#2e7d32', fontWeight: 600 }}>净输出: </span>
                        {Object.keys(netIO.outputs).length
                          ? Object.entries(netIO.outputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join('、')
                          : '无'}
                      </div>
                      {bp.parts.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {bp.parts.map(p => {
                            const r = recipes.find(x => x.id === p.recipeId);
                            return r ? (
                              <span key={p.recipeId} style={{
                                background: '#f0f4ff', border: '1px solid #b8c8e8', color: '#333',
                                borderRadius: 10, padding: '1px 8px', fontSize: '0.85rem',
                              }}>
                                {t(r.name, translation)} ×{p.count}
                              </span>
                            ) : (
                              <span key={p.recipeId} style={{
                                background: '#fdecea', border: '1px solid #e8b8b8', color: '#c62828',
                                borderRadius: 10, padding: '1px 8px', fontSize: '0.85rem',
                              }}>
                                ⚠ {p.recipeId} ×{p.count}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : !filtered.length ? <span className="hint">无匹配建筑</span> : (
            filtered.map(e => (
              <BuildingBlock key={e.buildingId} entry={e} openByDefault={!!search}
                translation={translation} recipeEnabled={recipeEnabled}
                onToggleBuilding={e.onToggleBuilding}
                onToggleRecipe={(rid, checked) => setRecipeEnabled(rid, checked)}
              />
            ))
          )}
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
  matchedRecipes?: Recipe[];  // 搜索匹配的配方子集（仅当建筑名未匹配时设置）
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
  const buildingEnabled = entry.buildingEnabled;
  const integerMode = useStore(s => s.integerMode);
  const recipeIntegerEnabled = useStore(s => s.recipeIntegerEnabled);
  const setRecipeIntegerEnabled = useStore(s => s.setRecipeIntegerEnabled);
  const redundancyResources = useStore(s => s.redundancyResources);
  const setRedundancyResources = useStore(s => s.setRedundancyResources);
  const redundancyAutoItems = useStore(s => s.redundancyAutoItems);
  const setRedundancyAutoItems = useStore(s => s.setRedundancyAutoItems);

  // 取整开关联动冗余：获取配方的第一个有效产出物
  const getFirstOutputItem = (r: any): string | null => {
    const outputs = Object.keys(r.outputs).filter(k => {
      const kl = k.toLowerCase();
      if (kl === 'recyclables' || kl.includes('waste')) return false;
      return true;
    });
    return outputs[0] || null;
  };

  // 处理取整开关变化（联动冗余自动启用/关闭）
  const handleIntegerToggle = (recipe: any) => {
    const store = useStore.getState();
    const newVal = !(store.recipeIntegerEnabled[recipe.id] === true);
    store.setRecipeIntegerEnabled(recipe.id, newVal);

    const targetItem = getFirstOutputItem(recipe);
    if (!targetItem) return;

    const currentResources = store.redundancyResources;
    const currentAutoItems = store.redundancyAutoItems;
    const currentIntegerMode = store.integerMode; // 用 getState 取最新值，避免闭包过期

    if (newVal) {
      if (currentIntegerMode === 'milp') {
        // 仅在混合整数模式下联动冗余
        const alreadyExisted = !!currentResources[targetItem];
        if (!alreadyExisted) {
          store.setRedundancyResources({
            ...currentResources,
            [targetItem]: { enabled: true, lower: 100, upper: 100 },
          });
        }
        // 仅当物品是自动新增的才标记 auto；手动配置的物品保留其手动状态
        if (!alreadyExisted) {
          store.setRedundancyAutoItems({ ...currentAutoItems, [targetItem]: true });
        }
        if (!store.enableRedundancy) {
          store.setEnableRedundancy(true);
        }
      }
    } else {
      // 关闭取整 → 仅自动设置的冗余项才关闭（自动关不记入 milpDisabled）
      if (currentAutoItems[targetItem]) {
        const newResources = { ...currentResources };
        delete newResources[targetItem];
        store.setRedundancyResources(newResources);
        const newAuto = { ...currentAutoItems };
        delete newAuto[targetItem];
        store.setRedundancyAutoItems(newAuto);
      }
    }
  };

  return (
    <div
      className="building-block"
      style={{
        backgroundColor: buildingEnabled ? '#e8f5e9' : '#fafafa',
        border: buildingEnabled ? '1px solid #4caf50' : '1px solid #ddd',
        borderRadius: '6px',
        marginBottom: '8px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }}
          onClick={() => onToggleBuilding(!buildingEnabled)}
        >
          {showIcons && buildingIcon && <img src={buildingIcon} alt="" style={{ width: 24, height: 24 }} />}
          <span style={{ fontWeight: 'bold' }}>
             {t(entry.buildingName, translation)} (Lv.{entry.level})
          </span>
        </div>
        <div
          style={{ cursor: 'pointer', padding: '4px 8px', userSelect: 'none' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '▼' : '▶'}
        </div>
      </div>
      {expanded && (
        <div className="recipe-sublist" style={{ marginLeft: '20px', paddingBottom: '8px' }}>
          {entry.matchedRecipes && entry.matchedRecipes.length < entry.recipes.length && (
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
              🔍 匹配 {entry.matchedRecipes.length}/{entry.recipes.length} 个配方
            </div>
          )}
          {(entry.matchedRecipes || entry.recipes).map(r => {
            const rOn = recipeEnabled[r.id] !== false;
            const imp = Object.entries(r.inputs).map(([k, v]) => `${t(k, translation)}×${isPowerItem(k) ? v : ((60 / r.duration) * v).toFixed(2)}`).join(', ') || '无';
            const oup = Object.entries(r.outputs).map(([k, v]) => `${t(k, translation)}×${isPowerItem(k) ? v : ((60 / r.duration) * v).toFixed(2)}`).join(', ') || '无';
            const showToggle = r.module === 'power' || (r.module === 'main' && r.category !== '农业');
            const intOn = recipeIntegerEnabled[r.id] === true;
            return (
              <div
                key={r.id}
                className="recipe-entry"
                onClick={() => onToggleRecipe(r.id, !rOn)}
                style={{
                  cursor: 'pointer',
                  backgroundColor: rOn ? '#81c784' : 'transparent',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span>{t(r.name, translation)}</span>
                  <span className="recipe-info" style={{ marginLeft: '10px' }}>
                    投入: {imp} → 产出: {oup}
                  </span>
                </span>
                {showToggle && (
                  <span style={{ flexShrink: 0, marginLeft: 8 }} onClick={e => e.stopPropagation()}>
                    <ToggleSwitch checked={intOn} onChange={() => handleIntegerToggle(r)} />
                  </span>
                )}
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
          // 单个配方的建筑：开启建筑时自动启用唯一配方
          if (checked && recs.length === 1) {
            setRecipeEnabled(recs[0].id, true);
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
    const result: any[] = [];
    for (const e of entries) {
      let matchedRecipes: any[] | undefined;
      if (e.category !== currentCat) continue;
      if (search) {
        const s = search.toLowerCase();
        const buildingNameMatch = t(e.buildingName, translation).toLowerCase().includes(s);
        const matchingRecipes = e.recipes.filter((r: any) => {
          if (t(r.name, translation).toLowerCase().includes(s)) return true;
          if (Object.keys(r.inputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
          if (Object.keys(r.outputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
          return false;
        });
        if (!buildingNameMatch && matchingRecipes.length === 0) continue;
        if (!buildingNameMatch) matchedRecipes = matchingRecipes;
      }
      result.push({ ...e, matchedRecipes });
    }
    return result;
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

  const items = [...allItems].sort();

  return (
    <ModalShell open={open} onClose={onClose} title="🎯 选择生产目标" maxWidth="700px"
      footer={
        <>
          <label>产量/分: <input type="number" value={rate} step={1} style={{ width: 80 }}
            onChange={e => setRate(parseFloat(e.target.value) || 0)} /></label>
          <span className="hint">负数为必须消耗</span>
          <Btn onClick={() => {
            if (selected && rate !== 0) { addDemand(selected, rate); onClose(); }
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