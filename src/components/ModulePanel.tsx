import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { Btn, ModalShell, SearchInput } from './UI';
import { t, isNonScalable, computeSolarEfficiency } from '../utils';
import { Module, ModulePart } from '../types';
import { buildModuleRecipe, getModuleNetIO } from '../utils/module';
import { getAgricultureMultipliers } from '../utils/agricultureMultipliers';
import { buildAgricultureRecipes } from '../utils/agricultureRecipes';

/** 模块配置模式：新建/修改模块；是否使用在高级模式「选择配方」中管理 */
const ModulePanel: React.FC = () => {
  const modules = useStore(s => s.modules);
  const recipes = useStore(s => s.recipes);
  const translation = useStore(s => s.translation);
  const addModule = useStore(s => s.addModule);
  const updateModule = useStore(s => s.updateModule);
  const deleteModule = useStore(s => s.deleteModule);

  const [editing, setEditing] = useState<Module | null>(null);
  const [creating, setCreating] = useState(false);

  // 农业加成（模块内农业配方预览同样应用，与求解一致）
  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const researchLevels = useStore(s => s.researchLevels);
  const enableAgriculture = useStore(s => s.enableAgriculture);
  const farms = useStore(s => s.farms);
  const globalFertilizerType = useStore(s => s.globalFertilizerType);
  const targetFertility = useStore(s => s.targetFertility);
  const cropRotation = useStore(s => s.cropRotation);
  const agriMultipliers = useMemo(
    () => getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels),
    [gameData, edictLevels, officeLevels, researchLevels]
  );
  // 农业系统生成的动态配方（agri_*），可直接选入模块
  const agriRecipes = useMemo(() => {
    if (!enableAgriculture) return [];
    return buildAgricultureRecipes(useStore.getState(), agriMultipliers.output, agriMultipliers.water);
  }, [enableAgriculture, farms, globalFertilizerType, targetFertility, cropRotation, agriMultipliers]);
  // 模块可选配方 = 主模块配方 + 农业动态配方（同 id 优先 main 副本，避免命中未加成/重复的 power 副本）
  const allRecipes = useMemo(() => {
    const list = [...recipes, ...agriRecipes];
    const map = new Map<string, (typeof list)[number]>();
    for (const r of list) {
      const ex = map.get(r.id);
      if (!ex || (r.module === 'main' && ex.module !== 'main')) map.set(r.id, r);
    }
    return [...map.values()];
  }, [recipes, agriRecipes]);
  // 太阳能加成（预览与求解一致：用户设置 × 清洁面板法令 × 太阳能研究）
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const finalSolarEfficiency = useMemo(
    () => computeSolarEfficiency(solarEfficiency, gameData, edictLevels, researchLevels),
    [solarEfficiency, gameData, edictLevels, researchLevels]
  );
  const previewRecipes = useMemo(
    () => finalSolarEfficiency !== 1
      ? allRecipes.map(r => r.isSolar && r.outputs['electricity']
        ? { ...r, outputs: { ...r.outputs, electricity: r.outputs['electricity'] * finalSolarEfficiency } }
        : r)
      : allRecipes,
    [allRecipes, finalSolarEfficiency]
  );

  // 主模块分类集合（模块分类与主模块一致，含农业动态配方分类）
  const mainCategories = useMemo(
    () => [...new Set(allRecipes.filter(r => r.module === 'main').map(r => r.category).filter(Boolean))].sort(),
    [allRecipes]
  );

  const calcMachineTotal = (bp: Module): number =>
    (bp.parts || []).reduce((sum, p) => sum + (p.count > 0 ? p.count : 0), 0)
    / (bp.divisor && bp.divisor > 0 ? bp.divisor : 1);

  const recipeById = (id: string) => allRecipes.find(r => r.id === id);

  // 导出单个模块为 JSON 文件
  const exportModule = (bp: Module) => {
    const blob = new Blob(
      [JSON.stringify({ type: 'module', version: 1, module: bp }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `模块-${bp.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // 从 JSON 文件导入单个模块
  const importModule = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const j = JSON.parse(await file.text());
        // 兼容旧版导出的蓝图文件（type: 'blueprint'）
        const bp = j && (j.type === 'module' || j.type === 'blueprint') ? (j.module || j.blueprint) : j;
        if (!bp || typeof bp.name !== 'string' || !Array.isArray(bp.parts)) {
          alert('不是有效的模块文件（缺少名称或配方列表）');
          return;
        }
        const cleanParts = bp.parts
          .filter((p: any) => p && typeof p.recipeId === 'string' && p.count > 0)
          .map((p: any) => ({ recipeId: p.recipeId, count: Math.max(0.1, Math.round(p.count * 10) / 10) }));
        if (cleanParts.length === 0) {
          alert('模块中没有有效配方');
          return;
        }
        addModule({
          id: `md_${Date.now().toString(36)}`,
          name: bp.name,
          category: typeof bp.category === 'string' && bp.category ? bp.category : '模块',
          divisor: bp.divisor && bp.divisor > 0 ? bp.divisor : 1,
          parts: cleanParts,
        });
        alert(`✅ 已导入模块「${bp.name}」（${cleanParts.length} 个配方）`);
      } catch {
        alert('导入失败：文件不是有效 JSON');
      }
    };
    input.click();
  };

  return (
    <div className="section">
      <h3>📐 模块配置</h3>
      <div style={{ background: '#e3f2fd', color: '#0d47a1', padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: '0.95rem', lineHeight: 1.8 }}>
        <b>操作步骤：</b>
        ① 在本页「➕ 新建模块」→ 设置名称/分类，右侧按分类、建筑点选配方并设数量 → 保存（自动存入浏览器缓存，刷新不丢失）<br/>
        ② 切到「⚙️ 高级」→ 点「🧪 选择配方」→ 分类栏第一个「📐 模块」→ 勾选要使用的模块<br/>
        ③ 点「🔧 开始求解」，结果中模块按所选分类显示，输入输出为内部抵消后的净额
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={() => setCreating(true)}>➕ 新建模块</Btn>
        <Btn variant="default" onClick={importModule}>📥 导入模块</Btn>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>
        每个模块可单独「导出」为 JSON 文件备份或分享；「导入」后自动生成新 id，可与现有模块并存
      </div>
      {modules.length === 0 && (
        <div className="hint" style={{ marginTop: 10 }}>暂无模块，点击上方按钮创建</div>
      )}
      {modules.map(bp => {
        const bpRecipe = buildModuleRecipe(bp, previewRecipes, agriMultipliers);
        const netIO = bpRecipe ? getModuleNetIO(bpRecipe) : null;
        const bpDiv = bp.divisor && bp.divisor > 0 ? bp.divisor : 1;
        return (
          <div key={bp.id} className="building-block"
            style={{ marginTop: 10, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                fontWeight: 600, fontSize: '1.05rem',
                background: '#e3f2fd', color: '#0d47a1', padding: '2px 10px', borderRadius: 12,
              }}>📐 模块</span>
              {bpRecipe?._moduleIsAgriculture && (
                <span style={{
                  background: '#e8f5e9', color: '#2e7d32', padding: '2px 10px', borderRadius: 12,
                  fontSize: '0.8rem', fontWeight: 600,
                }}>🌾 农业</span>
              )}
              <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{bp.name}</span>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>
                分类: {t(bp.category || '模块', translation)} | 配方 {bp.parts.length} 个 | N: ÷{bpDiv} | 内部机器 {calcMachineTotal(bp).toFixed(1)} 台
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Btn variant="default" onClick={() => exportModule(bp)}>📤 导出</Btn>
                <Btn variant="default" onClick={() => setEditing(bp)}>✏️ 编辑</Btn>
                <Btn variant="danger" onClick={() => { if (confirm(`删除模块「${bp.name}」？`)) deleteModule(bp.id); }}>🗑️</Btn>
              </span>
            </div>
            {netIO && (
              <div style={{ marginTop: 6, fontSize: '0.9rem', color: '#333', lineHeight: 1.7 }}>
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
              </div>
            )}
            {bp.parts.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {bp.parts.map(p => {
                  const r = recipeById(p.recipeId);
                  return r ? (
                    <span key={p.recipeId} style={{
                      background: '#f0f4ff', border: '1px solid #b8c8e8', color: '#333',
                      borderRadius: 10, padding: '1px 8px', fontSize: '0.85rem',
                    }}>
                      {t(r.name, translation)} ×{(p.count / bpDiv).toFixed(1)}
                    </span>
                  ) : (
                    <span key={p.recipeId} style={{
                      background: '#fdecea', border: '1px solid #e8b8b8', color: '#c62828',
                      borderRadius: 10, padding: '1px 8px', fontSize: '0.85rem',
                    }}>
                      ⚠ {p.recipeId} ×{(p.count / bpDiv).toFixed(1)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {(creating || editing) && (
        <ModuleEditor
          initial={editing}
          mainCategories={mainCategories}
          onSave={(bp) => {
            if (editing) updateModule(editing.id, bp);
            else addModule({ ...bp, id: `md_${Date.now().toString(36)}` });
            setEditing(null);
            setCreating(false);
          }}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
};
/** 单个配方的每分钟输入输出（不含维护类）；count = 数量，显示该配方在模块中的贡献值 */
function getRecipeIOParts(r: ReturnType<typeof useStore.getState>['recipes'][number], translation: Record<string, string>, count = 1): { ins: string; outs: string } {
  const skip = new Set(['人力', 'maintenance i', 'maintenance ii', 'maintenance iii']);
  const baseScale = r.duration > 0 ? 60 / r.duration : 1;
  const itemScale = (item: string) => (isNonScalable(item) ? 1 : baseScale) * count;
  const ins = Object.entries(r.inputs)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${t(k, translation)}×${(v * itemScale(k)).toFixed(1)}`).join(', ');
  const outs = Object.entries(r.outputs)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${t(k, translation)}×${(v * itemScale(k)).toFixed(1)}`).join(', ');
  return { ins: ins || '无', outs: outs || '无' };
}

/** 单行 IO 摘要（右侧浏览列表用） */
function formatRecipeIO(r: ReturnType<typeof useStore.getState>['recipes'][number], translation: Record<string, string>, count = 1): string {
  const { ins, outs } = getRecipeIOParts(r, translation, count);
  return `输入: ${ins} → 输出: ${outs}`;
}

/** 模块编辑弹窗：左栏内部配方+整合IO（净额抵消），右栏按分类+建筑浏览（含搜索） */
const ModuleEditor: React.FC<{
  initial: Module | null;
  mainCategories: string[];
  onSave: (bp: { name: string; category: string; divisor: number; parts: ModulePart[] }) => void;
  onClose: () => void;
}> = ({ initial, mainCategories, onSave, onClose }) => {
  const recipes = useStore(s => s.recipes);
  const translation = useStore(s => s.translation);
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || mainCategories[0] || '');
  const [divisor, setDivisor] = useState(initial?.divisor && initial.divisor > 0 ? initial.divisor : 1);
  const [parts, setParts] = useState<ModulePart[]>(initial?.parts?.map(p => ({ ...p })) || []);
  const [activeCat, setActiveCat] = useState<string>(mainCategories[0] || '');
  const [search, setSearch] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => new Set());

  // 农业系统动态配方（agri_*）也可选入模块
  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const researchLevels = useStore(s => s.researchLevels);
  const enableAgriculture = useStore(s => s.enableAgriculture);
  const farms = useStore(s => s.farms);
  const globalFertilizerType = useStore(s => s.globalFertilizerType);
  const targetFertility = useStore(s => s.targetFertility);
  const cropRotation = useStore(s => s.cropRotation);
  const agriMultipliers = useMemo(
    () => getAgricultureMultipliers(gameData, edictLevels, officeLevels, researchLevels),
    [gameData, edictLevels, officeLevels, researchLevels]
  );
  const agriRecipes = useMemo(() => {
    if (!enableAgriculture) return [];
    return buildAgricultureRecipes(useStore.getState(), agriMultipliers.output, agriMultipliers.water);
  }, [enableAgriculture, farms, globalFertilizerType, targetFertility, cropRotation, agriMultipliers]);
  // 模块可选配方 = 主模块配方 + 农业动态配方（同 id 优先 main 副本，避免命中未加成/重复的 power 副本）
  const allRecipes = useMemo(() => {
    const list = [...recipes, ...agriRecipes];
    const map = new Map<string, (typeof list)[number]>();
    for (const r of list) {
      const ex = map.get(r.id);
      if (!ex || (r.module === 'main' && ex.module !== 'main')) map.set(r.id, r);
    }
    return [...map.values()];
  }, [recipes, agriRecipes]);
  // 太阳能加成（预览与求解一致）
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const finalSolarEfficiency = useMemo(
    () => computeSolarEfficiency(solarEfficiency, gameData, edictLevels, researchLevels),
    [solarEfficiency, gameData, edictLevels, researchLevels]
  );
  const previewRecipes = useMemo(
    () => finalSolarEfficiency !== 1
      ? allRecipes.map(r => r.isSolar && r.outputs['electricity']
        ? { ...r, outputs: { ...r.outputs, electricity: r.outputs['electricity'] * finalSolarEfficiency } }
        : r)
      : allRecipes,
    [allRecipes, finalSolarEfficiency]
  );

  const setPartCount = (recipeId: string, count: number) => {
    setParts(parts.map(p => p.recipeId === recipeId
      ? { ...p, count: Math.max(0.1, Math.round((isFinite(count) ? count : 1) * 10) / 10) }
      : p));
  };
  const removePart = (recipeId: string) => setParts(parts.filter(p => p.recipeId !== recipeId));
  const togglePart = (recipeId: string) => {
    if (parts.some(p => p.recipeId === recipeId)) removePart(recipeId);
    else setParts([...parts, { recipeId, count: 1 }]);
  };
  // 调整配方位置（上移/下移）
  const movePart = (index: number, delta: number) => {
    setParts(prev => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };
  // 更换配方：点 🔄 进入替换模式（再点一次或点提示条 ✕ 取消），再点右侧配方完成替换
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const startReplace = (recipeId: string) => {
    setReplaceTarget(prev => (prev === recipeId ? null : recipeId));
  };
  const handleRightClick = (r: ReturnType<typeof useStore.getState>['recipes'][number]) => {
    if (replaceTarget) {
      setParts(parts.map(p => p.recipeId === replaceTarget ? { ...p, recipeId: r.id } : p));
      setReplaceTarget(null);
    } else {
      togglePart(r.id);
    }
  };

  const recipeById = (id: string) => previewRecipes.find(r => r.id === id);

  // 当前分类下的配方（含农业动态配方，非隐藏；太阳能显示加成后值）
  const catRecipes = useMemo(
    () => previewRecipes.filter(r => r.module === 'main' && !r.isHidden && r.category === activeCat),
    [previewRecipes, activeCat]
  );

  // 按建筑分组
  const buildingGroups = useMemo(() => {
    const map = new Map<string, { buildingId: string; buildingName: string; recipes: typeof catRecipes }>();
    for (const r of catRecipes) {
      const e = map.get(r.buildingId);
      if (e) e.recipes.push(r);
      else map.set(r.buildingId, { buildingId: r.buildingId, buildingName: r.buildingName, recipes: [r] });
    }
    return [...map.values()].sort((a, b) => t(a.buildingName, translation).localeCompare(t(b.buildingName, translation)));
  }, [catRecipes, translation]);

  // 搜索过滤（配方名/建筑名/输入输出物）
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return buildingGroups;
    const q = search.toLowerCase();
    return buildingGroups
      .map(g => {
        const matchedRecipes = g.recipes.filter(r =>
          t(r.name, translation).toLowerCase().includes(q) ||
          t(r.buildingName, translation).toLowerCase().includes(q) ||
          Object.keys(r.inputs).some(k => t(k, translation).toLowerCase().includes(q)) ||
          Object.keys(r.outputs).some(k => t(k, translation).toLowerCase().includes(q))
        );
        return { ...g, recipes: matchedRecipes };
      })
      .filter(g => g.recipes.length > 0);
  }, [buildingGroups, search, translation]);

  const toggleBuilding = (buildingId: string) => {
    setExpandedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
  };
  // 搜索时全部展开，便于直接点选
  const isExpanded = (buildingId: string) => !!search || expandedBuildings.has(buildingId);

  // 整合后的总输入输出（与求解共用同一计算），显示时相互抵消
  const combined = useMemo(() => {
    const draft: Module = { id: initial?.id || 'draft', name, category, divisor, parts };
    return buildModuleRecipe(draft, previewRecipes, agriMultipliers);
  }, [initial, name, category, divisor, parts, allRecipes, agriMultipliers]);
  const combinedNet = useMemo(() => (combined ? getModuleNetIO(combined) : null), [combined]);

  const saveModule = () => {
    if (!name.trim()) { alert('请填写模块名称'); return; }
    if (parts.length === 0) { alert('请至少添加一个配方'); return; }
    onSave({ name: name.trim(), category, divisor, parts });
  };

  return (
    <ModalShell open onClose={onClose} title={initial ? `编辑模块「${initial.name}」` : '新建模块'} maxWidth="1080px">
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label>名称: </label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="如：基础炼钢线" style={{ padding: 4, width: 180 }} />
        <label style={{ marginLeft: 12 }}>分类（与主模块一致）: </label>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: 4, maxWidth: 200 }}>
          {mainCategories.map(c => <option key={c} value={c}>{t(c, translation)}</option>)}
        </select>
        <label style={{ marginLeft: 12 }}>N（每个配方数量 ÷ N，整体小数化）: </label>
        <input type="number" min={0.1} step={0.1} value={divisor}
          onChange={e => setDivisor(Math.max(0.1, parseFloat(e.target.value) || 1))}
          style={{ padding: 4, width: 70 }} />
        <span style={{ fontSize: '0.75rem', color: '#666' }}>
          （当前合计内部机器: {combined?._moduleMachineTotal?.toFixed(1) ?? '0'} 台）
        </span>
      </div>

      {/* 整合输入输出（净额：内部互相抵消），置顶显示 */}
      <div style={{ marginBottom: 12, padding: 8, border: '1px solid #b8c8e8', borderRadius: 6, background: '#f0f4ff' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          📊 整合输入 / 输出（每分钟，1 个模块单元，内部相互抵消）
          <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#888', marginLeft: 8 }}>
            （基准值；求解时自动应用太阳能/维护产量/回收率等加成）
          </span>
        </div>
        {combinedNet ? (
          <>
            <div style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>
              <span style={{ color: '#c62828', fontWeight: 600 }}>净输入: </span>
              {Object.keys(combinedNet.inputs).length
                ? Object.entries(combinedNet.inputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join('、')
                : '无'}
            </div>
            <div style={{ fontSize: '0.95rem' }}>
              <span style={{ color: '#2e7d32', fontWeight: 600 }}>净输出: </span>
              {Object.keys(combinedNet.outputs).length
                ? Object.entries(combinedNet.outputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join('、')
                : '无'}
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 2, color: '#555' }}>
              维护: {combined && Object.entries(combined.upkeep).length
                ? Object.entries(combined.upkeep).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join('、')
                : '无'}
              {' '}｜ 内部机器: {combined?._moduleMachineTotal ?? 0} 台
            </div>
          </>
        ) : (
          <div className="hint">（添加配方后显示）</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        {/* 左栏：内部配方 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            内部配方（↑↓ 调整顺序，🔄 更换配方，数量可小数）
          </div>
          {replaceTarget && (
            <div style={{ background: '#fff3cd', padding: '4px 10px', borderRadius: 4, marginBottom: 6, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>
                🔄 正在替换：<b>{t(recipeById(replaceTarget)?.name || '', translation)}</b> —— 点击右侧列表中的配方完成替换
              </span>
              <button onClick={() => setReplaceTarget(null)}
                style={{ cursor: 'pointer', border: '1px solid #d97706', background: '#fff', color: '#b45309', borderRadius: 4, padding: '1px 8px', fontSize: '0.75rem' }}>
                ✕ 取消
              </button>
            </div>
          )}
          {parts.length === 0 && <div className="hint" style={{ marginBottom: 8 }}>从右侧分类中点选配方添加</div>}
          {parts.map((p, idx) => {
            const r = recipeById(p.recipeId);
            if (!r) return null;
            const { ins, outs } = getRecipeIOParts(r, translation, p.count / divisor);
            return (
              <div key={p.recipeId} style={{ marginBottom: 4, padding: '5px 8px', background: '#f5f5f5', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Btn variant="default" onClick={() => movePart(idx, -1)} disabled={idx === 0}
                    style={{ padding: '0 6px', fontSize: '0.7rem' }} title="上移">↑</Btn>
                  <Btn variant="default" onClick={() => movePart(idx, 1)} disabled={idx === parts.length - 1}
                    style={{ padding: '0 6px', fontSize: '0.7rem' }} title="下移">↓</Btn>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
                    {t(r.name, translation)} <span style={{ color: '#999', fontWeight: 400 }}>（{t(r.buildingName, translation)}）</span>
                  </span>
                  <label style={{ fontSize: '0.8rem' }}>数量: </label>
                  <input type="number" min={0.1} step={0.5} value={p.count}
                    onChange={e => setPartCount(p.recipeId, parseFloat(e.target.value) || 1)}
                    style={{ width: 60, padding: 2 }} />
                  {divisor !== 1 && (
                    <span style={{ fontSize: '0.72rem', color: '#888' }}>
                      （÷{divisor} = {(p.count / divisor).toFixed(1)}）
                    </span>
                  )}
                  <Btn variant="default" onClick={() => startReplace(p.recipeId)}
                    style={{ padding: '0 6px', fontSize: '0.7rem' }} title="更换配方">🔄</Btn>
                  <Btn variant="danger" onClick={() => removePart(p.recipeId)} style={{ padding: '2px 8px' }}>✕</Btn>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#777', marginTop: 2 }}>
                  <div><span style={{ color: '#c62828' }}>输入: </span>{ins}</div>
                  <div><span style={{ color: '#2e7d32' }}>输出: </span>{outs}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 右栏：按分类 + 建筑浏览配方 */}
        <div style={{ flex: 1.2, minWidth: 0, borderLeft: '1px solid #eee', paddingLeft: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            添加配方（按分类/建筑浏览，点击添加/移除）
            {replaceTarget && <span style={{ color: '#b45309', marginLeft: 6 }}>（替换模式）</span>}
          </div>
          <SearchInput placeholder="搜索配方/建筑/物品（可直接搜中间产物，如：钢、铁矿石）..." value={search} onChange={setSearch} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
            {mainCategories.map(c => (
              <button key={c} onClick={() => setActiveCat(c)}
                style={{
                  padding: '4px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 12,
                  border: 'none', background: activeCat === c ? '#2563eb' : '#f0f0f0',
                  color: activeCat === c ? '#fff' : '#333',
                }}>
                {t(c, translation)}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
            {filteredGroups.length === 0 && <div className="hint" style={{ padding: 8 }}>无匹配配方</div>}
            {filteredGroups.map(g => (
              <div key={g.buildingId} style={{ borderBottom: '1px solid #eee' }}>
                <div onClick={() => toggleBuilding(g.buildingId)}
                  style={{ padding: '5px 10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: '#fafafa' }}>
                  {isExpanded(g.buildingId) ? '▼' : '▶'} {t(g.buildingName, translation)}
                  <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{g.recipes.length} 个配方</span>
                </div>
                {isExpanded(g.buildingId) && g.recipes.map(r => {
                  const added = parts.some(p => p.recipeId === r.id);
                  const isTarget = replaceTarget === r.id;
                  return (
                    <div key={r.id} onClick={() => handleRightClick(r)}
                      style={{
                        padding: '4px 10px 4px 26px', cursor: 'pointer', fontSize: '0.78rem',
                        background: isTarget ? '#fff3cd' : (added ? '#e8f5e9' : 'transparent'),
                        borderTop: '1px solid #f5f5f5',
                        outline: isTarget ? '1px solid #f59e0b' : 'none',
                      }}>
                      <div>
                        {replaceTarget ? '⬅ 替换为' : (added ? '☑' : '☐')} {t(r.name, translation)}
                        <span style={{ color: added ? '#2e7d32' : '#999', marginLeft: 6, fontSize: '0.72rem' }}>
                          {added && !replaceTarget ? '已添加 ✓' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>{formatRecipeIO(r, translation)}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }} />
        <Btn onClick={onClose}>取消</Btn>
        <Btn onClick={saveModule}>
          保存
        </Btn>
      </div>
    </ModalShell>
  );
};

export default ModulePanel;
