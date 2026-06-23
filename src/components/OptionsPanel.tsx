import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { Btn, Checkbox, ModalShell } from './UI';
import { ExcludeContent } from './ExcludeGrid';
import { RedundancyModal } from './RedundancyModal';
import { t } from '../utils';

export const OptionsPanel: React.FC<{ onOpenExcludeModal: () => void }> = ({ onOpenExcludeModal }) => {
  const ignoredItems = useStore(s => s.ignoredItems);
  const toggleIgnored = useStore(s => s.toggleIgnored);
  const allowExternal = useStore(s => s.allowExternal);
  const setAllowExternal = useStore(s => s.setAllowExternal);
  const hideStage = useStore(s => s.hideStage);
  const setHideStage = useStore(s => s.setHideStage);
  const diagnosticMode = useStore(s => s.diagnosticMode);
  const setDiagnosticMode = useStore(s => s.setDiagnosticMode);
  const dataLoaded = useStore(s => s.dataLoaded);
  const constraintMode = useStore(s => s.constraintMode);
  const setConstraintMode = useStore(s => s.setConstraintMode);
  const allItems = useStore(s => s.allItems);
  const excludedOutputs = useStore(s => s.excludedOutputs);
  const excludedInputs = useStore(s => s.excludedInputs);
  const setExcludedOutputs = useStore(s => s.setExcludedOutputs);
  const setExcludedInputs = useStore(s => s.setExcludedInputs);
  const translation = useStore(s => s.translation);
  const optimizationMode = useStore(s => s.optimizationMode);
  const setOptimizationMode = useStore(s => s.setOptimizationMode);
  const customWeights = useStore(s => s.customWeights);
  const setCustomWeights = useStore(s => s.setCustomWeights);

  const integerMode = useStore(s => s.integerMode);
  const setIntegerMode = useStore(s => s.setIntegerMode);
  const recipes = useStore(s => s.recipes);
  const recipeIntegerEnabled = useStore(s => s.recipeIntegerEnabled);
  const milpTimeLimit = useStore(s => s.milpTimeLimit);
  const setMilpTimeLimit = useStore(s => s.setMilpTimeLimit);

  const isIntegerMode = (mode: string) => mode === 'milp' || mode === 'rounding';

  // 切换整数模式时联动冗余
  const handleModeSwitch = (newMode: string) => {
    const s = useStore.getState();
    const oldMode = s.integerMode;
    if (newMode === oldMode) return;

    if (isIntegerMode(newMode)) {
      // ========== 进入 MILP 或圆整模式 ==========
      // Step 1: 扫描所有取整配方，自动启用对应产物冗余（仅新增，不动已有手动配置）
      const newResources = { ...s.redundancyResources };
      const newAutoItems = { ...s.redundancyAutoItems };
      let changed = false;

      for (const recipe of s.recipes) {
        if (s.recipeIntegerEnabled[recipe.id] !== true) continue;
        const outputItems = Object.keys(recipe.outputs).filter(k => {
          const kl = k.toLowerCase();
          if (kl === 'recyclables' || kl.includes('waste')) return false;
          return true;
        });
        if (outputItems.length === 0) continue;
        const targetItem = outputItems[0];
        if (!newResources[targetItem]) {
          newResources[targetItem] = { enabled: true, lower: 100, upper: 100 };
          newAutoItems[targetItem] = true;
          changed = true;
        }
      }

      // Step 2: 应用之前记下的"混合模式下关闭"的自动项
      const milpDisabled = s.redundancyMilpDisabled || {};
      for (const item of Object.keys(milpDisabled)) {
        if (milpDisabled[item] && newAutoItems[item]) {
          newResources[item] = { ...newResources[item], enabled: false };
          changed = true;
        }
      }

      if (changed) {
        s.setRedundancyResources(newResources);
        s.setRedundancyAutoItems(newAutoItems);
      }
      if (!s.enableRedundancy) {
        s.setEnableRedundancy(true);
      }
    } else if (isIntegerMode(oldMode)) {
      // ========== 退出整数模式：记下关闭项，清空所有自动冗余 ==========
      const newDisabled: Record<string, boolean> = { ...s.redundancyMilpDisabled };
      const newResources = { ...s.redundancyResources };
      const newAutoItems = { ...s.redundancyAutoItems };
      let changed = false;

      for (const item of Object.keys(s.redundancyAutoItems)) {
        if (s.redundancyAutoItems[item]) {
          const res = newResources[item];
          if (res && res.enabled === false) {
            newDisabled[item] = true;
          } else if (res && res.enabled === true) {
            delete newDisabled[item];
          }
          if (item in newResources) {
            delete newResources[item];
            changed = true;
          }
          delete newAutoItems[item];
          changed = true;
        }
      }

      s.setRedundancyMilpDisabled(newDisabled);
      if (changed) {
        s.setRedundancyResources(newResources);
        s.setRedundancyAutoItems(newAutoItems);
      }
    }

    s.setIntegerMode(newMode as any);
  };

  const showIcons = useStore(s => s.showIcons);
  const setShowIcons = useStore(s => s.setShowIcons);
  const productCategories = useStore(s => s.productCategories);

  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [redundancyModalOpen, setRedundancyModalOpen] = useState(false);
  const [tempOutputs, setTempOutputs] = useState<Set<string>>(new Set(excludedOutputs));
  const [tempInputs, setTempInputs] = useState<Set<string>>(new Set(excludedInputs));
  const [searchOutput, setSearchOutput] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const ignoreOptions = ['electricity', 'computing', '人力', 'maintenance i', 'maintenance ii', 'maintenance iii'];

  const openOutputModal = () => { setTempOutputs(new Set(excludedOutputs)); setOutputModalOpen(true); };
  const saveOutputs = () => { setExcludedOutputs([...tempOutputs]); setOutputModalOpen(false); };
  const openInputModal = () => { setTempInputs(new Set(excludedInputs)); setInputModalOpen(true); };
  const saveInputs = () => { setExcludedInputs([...tempInputs]); setInputModalOpen(false); };

  const allItemsList = useMemo(() => allItems.sort(), [allItems]);

  return (
    <div className="section">
      <h3>⚙️ 选项</h3>

      {/* 整数模式选择区域 */}
      <div style={{ marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: 'bold' }}>🔢 整数模式: </label>
          <select
            value={integerMode}
            onChange={e => handleModeSwitch(e.target.value)}
            style={{ marginLeft: 8, padding: 4 }}
            disabled={!dataLoaded}
          >
            <option value="continuous">连续解（小数机器）</option>
            <option value="ceil">向上取整（按整机计算维护）</option>
            <option value="rounding">圆整模式（连续解+迭代取整）</option>
            <option value="milp">混合整数规划 MILP（真MIP）</option>
          </select>
        </div>

        {(integerMode === 'milp' || integerMode === 'rounding') && (
          <div style={{ marginTop: 6 }}>
            <span className="hint" style={{ marginLeft: 0 }}>
              {integerMode === 'rounding'
                ? '💡 圆整模式：连续求解后逐个圆整取整变量，速度快、支持任意数量。'
                : '⚠️ MILP 模式：调用 HiGHS 原生 MIP 求解器（如崩溃自动回退圆整模式）。'}
            </span>
          </div>
        )}
      </div>

      {/* 原有选项 */}
      <div style={{ marginBottom: 8 }}>
        {ignoreOptions.map(item => (
          <Checkbox key={item} label={t(item, translation)} checked={ignoredItems.includes(item)} onChange={() => toggleIgnored(item)} />
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <Checkbox label="允许外部供给" checked={allowExternal} onChange={setAllowExternal} />
        <Checkbox label="隐藏中间产物（含 stage）" checked={hideStage} onChange={setHideStage} />
        <Checkbox label="诊断模式" checked={diagnosticMode} onChange={setDiagnosticMode} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>约束模式: </label>
        <select value={constraintMode} onChange={e => setConstraintMode(e.target.value as 'noProd' | 'noProdOrCons')}>
          <option value="noProd">常规（仅无生产者不约束）</option>
          <option value="noProdOrCons">宽松（无生产者或无消费者都不约束）</option>
        </select>
        <div className="hint">{constraintMode === 'noProd' ? '有生产的物品必须被消耗或设为需求' : '无生产或无消耗的物品都不强制平衡'}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>🎯 优化模式: </label>
        <select value={optimizationMode} onChange={e => setOptimizationMode(e.target.value as any)} className="optimization-select">
          <option value="machines">最小化机器数量</option>
          <option value="labor">最小化人力</option>
          <option value="cohesion">最大化凝聚力</option>
          <option value="area">最小化占地面积</option>
          <option value="raw">最小化原矿消耗</option>
          <option value="custom">自定义权重</option>
        </select>
      </div>

      {optimizationMode === 'custom' && (
        <div style={{ marginBottom: 8, border: '1px solid #ccc', padding: 8, borderRadius: 4 }}>
          <div>自定义权重 (0-100，总和不必为100)</div>
          <div><label>机器数量权重: </label><input type="range" min={0} max={100} step={1} value={customWeights.machines} onChange={e => setCustomWeights({ machines: parseInt(e.target.value) })} /> {customWeights.machines}</div>
          <div><label>人力权重: </label><input type="range" min={0} max={100} step={1} value={customWeights.labor} onChange={e => setCustomWeights({ labor: parseInt(e.target.value) })} /> {customWeights.labor}</div>
          <div><label>凝聚力权重: </label><input type="range" min={0} max={100} step={1} value={customWeights.cohesion} onChange={e => setCustomWeights({ cohesion: parseInt(e.target.value) })} /> {customWeights.cohesion}</div>
          <div><label>占地面积权重: </label><input type="range" min={0} max={100} step={1} value={customWeights.area} onChange={e => setCustomWeights({ area: parseInt(e.target.value) })} /> {customWeights.area}</div>
          <div><label>原矿消耗权重: </label><input type="range" min={0} max={100} step={1} value={customWeights.raw} onChange={e => setCustomWeights({ raw: parseInt(e.target.value) })} /> {customWeights.raw}</div>
        </div>
      )}

      <div className="exclude-buttons">
        <Btn onClick={openOutputModal} disabled={!dataLoaded}>🚮 排除产出</Btn>
        <Btn onClick={openInputModal} disabled={!dataLoaded}>📥 排除输入</Btn>
        <Btn onClick={() => setRedundancyModalOpen(true)} disabled={!dataLoaded}>📊 资源冗余</Btn>
      </div>

      {/* 排除产出模态框 */}
      <ModalShell open={outputModalOpen} onClose={() => setOutputModalOpen(false)} title={t('排除产出（可无限排放）', translation)} maxWidth="700px">
        <ExcludeContent
          items={allItemsList}
          selectedSet={tempOutputs}
          onToggle={(item, checked) => {
            const next = new Set(tempOutputs);
            if (checked) next.add(item);
            else next.delete(item);
            setTempOutputs(next);
          }}
          search={searchOutput}
          setSearch={setSearchOutput}
          placeholder={t('搜索物品...', translation)}
        />
        <div className="modal-footer">
          <Btn onClick={saveOutputs}>{t('确定', translation)}</Btn>
          <Btn onClick={() => setOutputModalOpen(false)}>{t('取消', translation)}</Btn>
        </div>
      </ModalShell>

      {/* 排除输入模态框 */}
      <ModalShell open={inputModalOpen} onClose={() => setInputModalOpen(false)} title={t('排除输入（可无限获取）', translation)} maxWidth="700px">
        <ExcludeContent
          items={allItemsList}
          selectedSet={tempInputs}
          onToggle={(item, checked) => {
            const next = new Set(tempInputs);
            if (checked) next.add(item);
            else next.delete(item);
            setTempInputs(next);
          }}
          search={searchInput}
          setSearch={setSearchInput}
          placeholder={t('搜索物品...', translation)}
        />
        <div className="modal-footer">
          <Btn onClick={saveInputs}>{t('确定', translation)}</Btn>
          <Btn onClick={() => setInputModalOpen(false)}>{t('取消', translation)}</Btn>
        </div>
      </ModalShell>

      {/* 资源冗余模态框 */}
      <RedundancyModal open={redundancyModalOpen} onClose={() => setRedundancyModalOpen(false)} />
    </div>
  );
};