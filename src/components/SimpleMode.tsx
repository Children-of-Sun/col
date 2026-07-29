import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../stores';
import { Btn } from './UI';
import { ProductGrid } from './ProductGrid';
import { IconWithFallback } from './IconWithFallback';
import { t } from '../utils';
import GraphView from '../graph/GraphView';
import BuildEditPopup from './BuildEditPopup';
import RecipeSettingsModal from './RecipeSettingsModal';
import {
  TreeNode, TreeSummary,
  getBaseMaterials, getRecipesForItem, getRecipesConsumingItem, recipeOutputPerMin,
  recalculateAt, summarizeTree,
} from '../recipeTree';
import { Recipe } from '../types';

// ========== 浮动操作栏 ==========

const FloatingBar: React.FC<{
  selected: string | null;
  rate: number;
  setRate: (v: number) => void;
  onAdd: () => void;
  onClear: () => void;
}> = ({ selected, rate, setRate, onAdd, onClear }) => {
  if (!selected) return null;
  return (
    <div style={{
      position: 'sticky', bottom: 0, background: '#fff', borderTop: '2px solid #2563eb',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', zIndex: 10, borderRadius: '0 0 6px 6px',
    }}>
      <span style={{ fontWeight: 600 }}>已选: {t(selected, {}) || selected}</span>
      <label>产量/分:</label>
      <input type="number" value={rate} min={0.1} step={1}
        onChange={e => setRate(parseFloat(e.target.value) || 0)}
        style={{ width: 80, padding: '4px 8px', fontSize: '0.9rem' }} />
      <Btn onClick={onAdd} disabled={rate <= 0}>➕ 添加到需求</Btn>
      <span onClick={onClear} style={{ cursor: 'pointer', color: '#999', fontSize: '0.85rem' }}>取消</span>
    </div>
  );
};

// ========== 树节点行组件 ==========

const TreeNodeRow: React.FC<{
  node: TreeNode;
  allRecipes: Recipe[];
  onUpdate: (updated: TreeNode) => void;
  productIcons: Record<string, string>;
  showIcons: boolean;
  translation: Record<string, string>;
  overrides: Record<string, string>;
  buildingOverrides: Record<string, string>;
  onOverride: (item: string, recipeId: string) => void;
  onBuildingOverride: (item: string, buildingId: string) => void;
}> = ({ node, allRecipes, onUpdate, productIcons, showIcons, translation, overrides, buildingOverrides, onOverride, onBuildingOverride }) => {
  const [expanded, setExpanded] = useState(node.depth < 3);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(Math.round(node.rate * 100) / 100));

  const iconPath = productIcons[node.item];
  const isOre = !node.recipe;

  // 可用的建筑列表（按此物品的配方 buildingId 分组）
  const { buildings, recipesForBuilding } = useMemo(() => {
    const itemRecipes = getRecipesForItem(node.item, allRecipes);
    const bldMap = new Map<string, Recipe[]>();
    for (const r of itemRecipes) {
      const list = bldMap.get(r.buildingId) || [];
      list.push(r);
      bldMap.set(r.buildingId, list);
    }
    return {
      buildings: [...bldMap.keys()],
      recipesForBuilding: bldMap,
    };
  }, [node.item, allRecipes]);

  const currentBuildingId = node.recipe?.buildingId || buildingOverrides[node.item] || buildings[0] || '';
  const currentRecipes = recipesForBuilding.get(currentBuildingId) || [];

  const handleRateSubmit = useCallback(() => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 0) {
      const updated = recalculateAt(node, v, allRecipes);
      onUpdate(updated);
    } else {
      setEditVal(String(Math.round(node.rate * 100) / 100));
    }
    setEditing(false);
  }, [editVal, node, allRecipes, onUpdate]);

  const handleAdjust = (delta: number) => {
    const v = Math.max(0.1, node.rate + delta);
    const updated = recalculateAt(node, v, allRecipes);
    onUpdate(updated);
  };

  return (
    <div style={{ marginLeft: node.depth * 20 }}>
      <div className="tree-node-row">
        {/* 展开/折叠 */}
        {node.children.length > 0 && (
          <span onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', userSelect: 'none', minWidth: 16, fontSize: '0.8rem' }}>
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {node.children.length === 0 && <span style={{ minWidth: 16 }}> </span>}

        {/* 图标 */}
        {showIcons && iconPath && <IconWithFallback src={iconPath} alt="" style={{ width: 22, height: 22, flexShrink: 0 }} />}

        {/* 物品名 */}
        <span style={{ fontWeight: isOre ? 600 : 400, minWidth: 90, fontSize: '0.85rem', color: isOre ? '#b45f06' : '#333' }}>
          {t(node.item, translation)}
          {isOre && ' ⊕'}
        </span>

        {/* 建筑选择（左） */}
        {!isOre && buildings.length > 0 && (
          <select value={currentBuildingId}
            onChange={e => {
              const bId = e.target.value;
              onBuildingOverride(node.item, bId);
            }}
            style={{ fontSize: '0.78rem', padding: '2px 4px', maxWidth: 140 }}>
            {buildings.map(bId => {
              const bldName = recipesForBuilding.get(bId)?.[0]?.buildingName || bId;
              return (
                <option key={bId} value={bId}>{t(bldName, translation)}</option>
              );
            })}
          </select>
        )}

        {/* 配方选择（右） */}
        {!isOre && currentRecipes.length > 0 && (
          <select value={node.recipe?.id || currentRecipes[0]?.id || ''}
            onChange={e => onOverride(node.item, e.target.value)}
            style={{ fontSize: '0.78rem', padding: '2px 4px', maxWidth: 180 }}>
            {currentRecipes.map(r => (
              <option key={r.id} value={r.id}>{t(r.name, translation)}</option>
            ))}
          </select>
        )}

        {/* 速率 + 微调 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span onClick={() => handleAdjust(-1)} style={btnStyle}>−</span>
          {editing ? (
            <input type="text" value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={handleRateSubmit}
              onKeyDown={e => { if (e.key === 'Enter') handleRateSubmit(); if (e.key === 'Escape') { setEditVal(String(Math.round(node.rate * 100) / 100)); setEditing(false); } }}
              style={{ width: 55, padding: '1px 3px', fontSize: '0.8rem', textAlign: 'center' }}
              autoFocus />
          ) : (
            <span onClick={() => { setEditing(true); setEditVal(String(Math.round(node.rate * 100) / 100)); }}
                  style={{ cursor: 'pointer', fontSize: '0.85rem', minWidth: 45, textAlign: 'center' }}>
              {node.rate.toFixed(1)}
            </span>
          )}
          <span onClick={() => handleAdjust(1)} style={btnStyle}>+</span>
          <span style={{ fontSize: '0.75rem', color: '#999' }}>/min</span>
        </div>

        {/* 机器数 */}
        {node.recipe && (
          <span style={{ color: '#2563eb', fontWeight: 500, fontSize: '0.8rem', minWidth: 70, textAlign: 'right' }}>
            {node.machines < 0.01 ? '<0.01' : node.machines.toFixed(2)} 台
          </span>
        )}
        {isOre && <span style={{ minWidth: 70 }} />}
      </div>

      {/* 子节点 */}
      {expanded && node.children.map(child => (
        <TreeNodeRow key={child.item + '_' + child.depth}
          node={child} allRecipes={allRecipes}
          onUpdate={updated => {
            const newChildren = node.children.map(c =>
              c.item === updated.item && c.depth === updated.depth ? updated : c);
            onUpdate({ ...node, children: newChildren });
          }}
          productIcons={productIcons} showIcons={showIcons}
          translation={translation} overrides={overrides} buildingOverrides={buildingOverrides}
          onOverride={onOverride} onBuildingOverride={onBuildingOverride}
        />
      ))}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 18, height: 18, borderRadius: 9, background: '#eee',
  cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none',
};

// ========== 主组件 ==========

const SimpleMode: React.FC = () => {
  const recipes = useStore(s => s.recipes);
  const allItems = useStore(s => s.allItems);
  const translation = useStore(s => s.translation);
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);
  const buildingIcons = useStore(s => s.buildingIcons);
  const storeRecipeEnabled = useStore(s => s.recipeEnabled);
  const storeMainBuildingEnabledMap = useStore(s => s.mainBuildingEnabledMap);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const setMainBuildingEnabled = useStore(s => s.setMainBuildingEnabled);

  // Build enabled recipe/building filter Sets (only when store has them)
  const enabledRecipeIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, enabled] of Object.entries(storeRecipeEnabled)) {
      if (enabled) set.add(id);
    }
    return set;
  }, [storeRecipeEnabled]);
  const enabledBuildingIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, enabled] of Object.entries(storeMainBuildingEnabledMap)) {
      if (enabled !== false) set.add(id);
    }
    return set;
  }, [storeMainBuildingEnabledMap]);

  interface DemandEntry { item: string; rate: number; }
  const [demands, setDemands] = useState<DemandEntry[]>([]);
  const [currentSelectItem, setCurrentSelectItem] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState(10);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [buildingOverrides, setBuildingOverrides] = useState<Record<string, string>>({});
  const [resultRoots, setResultRoots] = useState<TreeNode[] | null>(null);
  const [summary, setSummary] = useState<TreeSummary | null>(null);
  const [viewMode] = useState<'tree' | 'graph'>('graph');
  const [search, setSearch] = useState('');
  const [selectOpen, setSelectOpen] = useState(false);
  const [dropPopup, setDropPopup] = useState<{ x: number; y: number; item: string; dir: 'input' | 'output'; worldX: number; worldY: number; } | null>(null);
  const [recipeSettingsOpen, setRecipeSettingsOpen] = useState(false);
  const [manualNodeSpecs, setManualNodeSpecs] = useState<Array<{ item: string; recipeId: string; x: number; y: number }>>([]);

  const sortedItems = useMemo(() => [...allItems].sort(), [allItems]);

  // 合并同物品根节点（ov/bldOv 参数避免闭包陈旧值）
  const mergeRoots = useCallback((roots: TreeNode[], ov?: Record<string, string>, bldOv?: Record<string, string>): TreeNode[] => {
    const useOv = ov ?? overrides;
    const useBld = bldOv ?? buildingOverrides;
    const map = new Map<string, { node: TreeNode; rate: number }>();
    for (const root of roots) {
      const existing = map.get(root.item);
      if (existing) {
        existing.rate += root.rate;
      } else {
        map.set(root.item, { node: root, rate: root.rate });
      }
    }
    // Recalculate with merged rates
    const merged: TreeNode[] = [];
    for (const [item, { rate }] of map) {
      const newRoots = getBaseMaterials(item, rate, recipes, useOv, useBld, 0, new Set(), enabledRecipeIds, enabledBuildingIds);
      merged.push(...newRoots);
    }
    return merged;
  }, [recipes, overrides, buildingOverrides, enabledRecipeIds, enabledBuildingIds]);

  // 从 demands 数组计算（可选覆盖参数避免闭包陈旧问题）
  const doCalculateAll = useCallback((dems: DemandEntry[], ov?: Record<string, string>, bldOv?: Record<string, string>) => {
    if (dems.length === 0) {
      setResultRoots(null);
      setSummary(null);
      return;
    }
    const useOv = ov ?? overrides;
    const useBld = bldOv ?? buildingOverrides;
    const allRoots: TreeNode[] = [];
    for (const d of dems) {
      const roots = getBaseMaterials(d.item, d.rate, recipes, useOv, useBld, 0, new Set(), enabledRecipeIds, enabledBuildingIds);
      allRoots.push(...roots);
    }
    const merged = mergeRoots(allRoots, useOv, useBld);
    setResultRoots(merged);
    setSummary(summarizeTree(merged));
  }, [recipes, overrides, buildingOverrides, mergeRoots, enabledRecipeIds, enabledBuildingIds]);

  // 添加需求
  const handleAddDemand = useCallback(() => {
    if (currentSelectItem && currentRate > 0) {
      const newDemands = [...demands, { item: currentSelectItem, rate: currentRate }];
      setDemands(newDemands);
      setCurrentSelectItem(null);
      setSelectOpen(false);
      doCalculateAll(newDemands);
    }
  }, [currentSelectItem, currentRate, demands, doCalculateAll]);

  // 删除需求
  const handleRemoveDemand = useCallback((idx: number) => {
    const newDemands = demands.filter((_, i) => i !== idx);
    setDemands(newDemands);
    doCalculateAll(newDemands);
  }, [demands, doCalculateAll]);

  // 节点更新
  const handleNodeUpdate = useCallback((updated: TreeNode) => {
    const newRoots = resultRoots?.map(r =>
      r.item === updated.item && r.depth === updated.depth ? updated : r
    ) || [updated];
    setResultRoots(newRoots);
    setSummary(summarizeTree(newRoots));
  }, [resultRoots]);

  // 配方覆盖
  const handleRecipeOverride = useCallback((item: string, recipeId: string) => {
    const newOverrides = { ...overrides, [item]: recipeId };
    setOverrides(newOverrides);
    doCalculateAll(demands, newOverrides, buildingOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, buildingOverrides, demands, doCalculateAll]);

  // 建筑覆盖
  const handleBuildingOverride = useCallback((item: string, buildingId: string) => {
    const newBldOverrides = { ...buildingOverrides, [item]: buildingId };
    setBuildingOverrides(newBldOverrides);
    const newOverrides = { ...overrides };
    delete newOverrides[item];
    setOverrides(newOverrides);
    doCalculateAll(demands, newOverrides, newBldOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingOverrides, overrides, demands, doCalculateAll]);

  // Drop on empty space → create new manual node
  const handleDropEmpty = useCallback((item: string, dir: 'input' | 'output', worldX: number, worldY: number) => {
    setDropPopup({ x: Math.min(worldX, window.innerWidth - 320), y: Math.min(worldY, window.innerHeight - 400), item, dir, worldX, worldY });
  }, []);

  // Drop on target port → add demand to force connection
  const handleDropTarget = useCallback((sourceNodeId: string, item: string, sourceDir: 'input' | 'output', targetNodeId: string, targetItem: string, targetDir: 'input' | 'output', targetIndex: number) => {
    // Add a demand for the item to trigger tree recalculation
    // The DAG merge will naturally connect matching producers and consumers
    const newDemands = [...demands, { item, rate: 10 }];
    setDemands(newDemands);
    doCalculateAll(newDemands);
  }, [demands, doCalculateAll]);

  return (
    <div style={{ display: 'flex', gap: 24, minHeight: 400 }}>
      {/* ====== 左侧：设置面板 ====== */}
      <div style={{ width: 320, flexShrink: 0 }}>
        <div className="section" style={{ marginBottom: 12, position: 'relative' }}>
          <h4>🎯 目标产物</h4>

          {/* 需求列表 */}
          {demands.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {demands.map((d, i) => (
                <div key={`${d.item}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: '0.85rem', borderBottom: '1px solid #eee' }}>
                  {showIcons && productIcons[d.item] && (
                    <IconWithFallback src={productIcons[d.item]} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1 }}>{t(d.item, translation)}</span>
                  <span style={{ fontWeight: 600, minWidth: 50, textAlign: 'right' }}>{d.rate.toFixed(1)}/min</span>
                  <span onClick={() => handleRemoveDemand(i)} style={{ cursor: 'pointer', color: '#d93025', fontSize: '0.85rem', padding: '0 4px' }}>✕</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <Btn onClick={() => setSelectOpen(!selectOpen)}>➕ 添加产品</Btn>
          </div>

          {/* 产品选择面板 */}
          {selectOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, width: 420, maxHeight: 400,
              background: '#fff', border: '1px solid #ccc', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, overflowY: 'auto',
            }}>
              <div style={{ padding: 8 }}>
                <ProductGrid
                  items={sortedItems}
                  selectedItem={currentSelectItem}
                  onSelect={item => setCurrentSelectItem(item)}
                  search={search}
                  setSearch={setSearch}
                  placeholder="搜索物品..."
                />
              </div>
              <FloatingBar
                selected={currentSelectItem} rate={currentRate} setRate={setCurrentRate}
                onAdd={handleAddDemand}
                onClear={() => { setCurrentSelectItem(null); setSelectOpen(false); }} />
            </div>
          )}

          {demands.length === 0 && !selectOpen && (
            <div style={{ padding: 8, textAlign: 'center', color: '#999', fontSize: '0.85rem' }}>
              请点击"添加产品"选择目标产物
            </div>
          )}
        </div>

        {/* Recipe/building settings */}
        <div className="section" style={{ marginBottom: 12 }}>
          <Btn onClick={() => setRecipeSettingsOpen(true)}>⚙️ 配方设置</Btn>
        </div>

        {/* 汇总 */}
        {summary && (
          <div className="section">
            <h4>📊 汇总</h4>
            {Object.keys(summary.totalOres).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong>矿石消耗 (/min)：</strong>
                {Object.entries(summary.totalOres).map(([ore, rate]) => (
                  <div key={ore} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: '0.85rem' }}>
                    {showIcons && productIcons[ore] && <IconWithFallback src={productIcons[ore]} alt="" style={{ width: 16, height: 16 }} />}
                    <span>{t(ore, translation)}: <strong>{rate.toFixed(1)}</strong></span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.85rem' }}><strong>总人力：</strong>{summary.totalLabor.toFixed(1)}</div>
            <div style={{ fontSize: '0.85rem' }}><strong>总电力：</strong>{summary.totalElectricity.toFixed(1)}</div>
            <div style={{ fontSize: '0.85rem' }}><strong>总算力：</strong>{summary.totalComputing.toFixed(1)}</div>
            {Object.keys(summary.totalMaintenance).length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>维护消耗 (/min)：</strong>
                {Object.entries(summary.totalMaintenance).map(([mk, mv]) => (
                  <div key={mk} style={{ fontSize: '0.85rem' }}>{t(mk, translation) || mk}: <strong>{mv.toFixed(2)}</strong></div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}><strong>深度：</strong>{summary.maxDepth}</div>
          </div>
        )}

      </div>

      {/* ====== 右侧：结果 ====== */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="section" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {!resultRoots && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              请添加目标产物（支持多个）
            </div>
          )}
          {resultRoots && resultRoots.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              未找到生产配方
            </div>
          )}

          {resultRoots && resultRoots.length > 0 && (
            <GraphView
              roots={resultRoots} allRecipes={recipes}
              onUpdate={handleNodeUpdate}
              onRecipeOverride={handleRecipeOverride}
              onBuildingOverride={handleBuildingOverride}
              productIcons={productIcons} buildingIcons={buildingIcons}
              showIcons={showIcons} translation={translation}
              manualNodeSpecs={manualNodeSpecs}
              onDropEmpty={handleDropEmpty}
              onDropTarget={handleDropTarget}
            />
          )}
        </div>
      </div>
      {/* Drop popup for port-drag-to-create */}
      {dropPopup && (
        <BuildEditPopup x={dropPopup.x} y={dropPopup.y} item={dropPopup.item}
          allRecipes={recipes} buildingIcons={buildingIcons}
          translation={translation} showIcons={showIcons}
          onSelect={(bId, rId) => {
            // Register as manual node with drop position
            setManualNodeSpecs(prev => [...prev, { item: dropPopup.item, recipeId: rId, x: dropPopup.worldX, y: dropPopup.worldY }]);
            handleBuildingOverride(dropPopup.item, bId);
            handleRecipeOverride(dropPopup.item, rId);
            setDropPopup(null);
          }}
          onClose={() => setDropPopup(null)} />
      )}
      {/* Recipe settings modal */}
      {recipeSettingsOpen && (
        <RecipeSettingsModal
          recipes={recipes} buildingIcons={buildingIcons} translation={translation} showIcons={showIcons}
          recipeEnabled={storeRecipeEnabled} mainBuildingEnabledMap={storeMainBuildingEnabledMap}
          setRecipeEnabled={setRecipeEnabled} setMainBuildingEnabled={setMainBuildingEnabled}
          onClose={() => setRecipeSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default SimpleMode;
