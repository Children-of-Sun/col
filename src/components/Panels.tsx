import React, { useState } from 'react';
import { useStore } from '../stores';
import { Btn, Checkbox, Select, ModalShell, SearchInput } from './UI';
import { t, isPowerBuilding, HIDDEN_SERIES, ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS, getMaintenanceReduction, getSeriesName } from '../utils';
import { Recipe, Series } from '../types';
import { isRaw } from '../utils';

export const MainLevelPanel: React.FC<{ onOpenLevelModal: () => void; onOpenRecipeModal: () => void }> = ({ onOpenLevelModal, onOpenRecipeModal }) => {
  const mainSeriesList = useStore(s => s.mainSeriesList);
  const mainEnabled = useStore(s => s.mainEnabled);
  const powerSeriesList = useStore(s => s.powerSeriesList);
  const powerEnabled = useStore(s => s.powerEnabled);
  const dataLoaded = useStore(s => s.dataLoaded);
  const mainCount = Object.values(mainEnabled).filter(v => v).length;
  const powerCount = Object.values(powerEnabled).filter(v => v).length;
  return (
    <div className="section">
      <h3>🏗️ 建筑等级（主模块）</h3>
      <div className="stat">🏭 主模块{mainSeriesList.length}系列 | 已启用{mainCount}个 | ⚡电力{powerSeriesList.length}系列 | 已启用{powerCount}个</div>
      <div style={{ marginTop: 4 }}>
        <Btn onClick={onOpenLevelModal} disabled={!dataLoaded}>⚙️ 设置等级</Btn>
        {' '}<Btn onClick={onOpenRecipeModal} disabled={!dataLoaded}>🧪 选择配方</Btn>
      </div>
    </div>
  );
};

export const PowerPanel: React.FC<{ onOpenPowerRecipeModal: () => void }> = ({ onOpenPowerRecipeModal }) => {
  const powerSeriesList = useStore(s => s.powerSeriesList);
  const powerEnabled = useStore(s => s.powerEnabled);
  const powerSelectedLevel = useStore(s => s.powerSelectedLevel);
  const setPowerEnabled = useStore(s => s.setPowerEnabled);
  const setPowerLevel = useStore(s => s.setPowerLevel);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const recipes = useStore(s => s.recipes);
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  const steamLowMode = useStore(s => s.steamLowMode);
  const setSteamLowMode = useStore(s => s.setSteamLowMode);
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const setSolarEfficiency = useStore(s => s.setSolarEfficiency);

  const syncRecipes = (seriesName: string, enabled: boolean, level: number) => {
    const series = powerSeriesList.find(ps => ps.name === seriesName);
    if (!series) return;
    const levelEntry = series.levels.find(lv => lv.level === level);
    if (!levelEntry) return;
    if (!enabled) {
      levelEntry.recipeIds.forEach(rid => {
        const recipe = recipes.find(r => r.id === rid && r.module === 'power');
        if (recipe) setRecipeEnabled(recipe.id, false);
      });
    }
  };

  return (
    <div className="section">
      <h3>⚡ 电力模块</h3>
      <div className="power-grid">
        {powerSeriesList.length === 0 ? <span className="hint">无电力相关建筑</span> :
          powerSeriesList.map(ps => (
            <div className="power-item" key={ps.name}>
              <input type="checkbox" checked={powerEnabled[ps.name] !== false} onChange={e => { const checked = e.target.checked; setPowerEnabled(ps.name, checked); if (checked) { const maxLv = ps.levels[ps.levels.length - 1].level; setPowerLevel(ps.name, maxLv); } else { syncRecipes(ps.name, false, powerSelectedLevel[ps.name] || ps.levels[0].level); } }} />
              <span>{t(ps.name, translation)}: </span>
              <Select value={powerSelectedLevel[ps.name] || ps.levels[ps.levels.length - 1].level} options={ps.levels.map(lv => ({ value: lv.level, label: `Lv${lv.level}` }))} onChange={v => { const lv = parseInt(v); setPowerLevel(ps.name, lv); if (!powerEnabled[ps.name]) setPowerEnabled(ps.name, true); }} />
            </div>
          ))}
      </div>
      <div style={{ marginTop: 8 }}><Btn onClick={onOpenPowerRecipeModal} disabled={!dataLoaded}>🧪 电力配方选择</Btn></div>
      <div className="steam-option">
        <strong>蒸汽处理：</strong>
        {(['internal', 'shared'] as const).map(mode => (
          <label key={mode} style={{ marginLeft: 10 }}><input type="radio" name="steamLowMode" value={mode} checked={steamLowMode === mode} onChange={() => setSteamLowMode(mode)} /> {mode === 'internal' ? '内部处理' : '内部主模块共用'}</label>
        ))}
      </div>
      <div style={{ marginTop: 12, borderTop: '1px solid #ddd', paddingTop: 8 }}>
        <label>☀️ {t('太阳能有效功率', translation)} (%): </label>
          <input
             type="number"
              min={0}
              max={100}
              step={1}
              value={solarEfficiency * 100}
              onChange={e => setSolarEfficiency(parseFloat(e.target.value) / 100)}
              style={{ width: 70 }}
           />
           <span style={{ marginLeft: 8 }}>{Math.round(solarEfficiency * 100)}%</span>
            <span className="hint" style={{ marginLeft: 8 }}>{t('（仅影响太阳能面板输出）', translation)}</span>
      </div>
    </div>
  );
};

export const SpaceStationPanel: React.FC = () => {
  const stationLevel = useStore(s => s.stationLevel);
  const rocketType = useStore(s => s.rocketType);
  const setStationLevel = useStore(s => s.setStationLevel);
  const setRocketType = useStore(s => s.setRocketType);
  const demands = useStore(s => s.demands);
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  const gameData = useStore(s => s.gameData);
  const researchLevels = useStore(s => s.researchLevels);
  const rocketCargoResearch = gameData?.research.find(r => r.name === '火箭载荷量');
  const rocketCargoLevel = rocketCargoResearch ? (researchLevels[gameData.research.indexOf(rocketCargoResearch)] || 0) : 0;
  const cargoBonus = 1 + rocketCargoLevel * 0.05;
  const rocket = ROCKET_BASE[rocketType];
  const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (cargoBonus - 1);
  const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (cargoBonus - 1);
  const crew = stationLevel === 0 ? 0 : Math.max(0, (stationLevel - 1) * 2);
  const rocketsPerLaunch = crewCap > 0 ? Math.ceil(crew / crewCap) : 0;
  const crewRocketRate = rocketsPerLaunch / 20;
  const stationPartsRate = stationLevel * STATION_PARTS_RATE;
  const crewSuppliesRate = Math.max(0, (stationLevel - 1) * CREW_SUPPLIES_RATE);
  let labCargoRate = 0;
  const meta = labMeta.find(l => l.buildingId === labLevel);
  if (meta && labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * labCount;
  const userSpaceCargoRate = demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((s, d) => s + d.rate, 0);
  const totalCargoRate = stationPartsRate + crewSuppliesRate + labCargoRate + userSpaceCargoRate;
  const cargoRocketRate = cargoCap > 0 ? totalCargoRate / cargoCap : 0;
  const cargoDetails: string[] = [];
  if (stationPartsRate > 0) cargoDetails.push(`${t('station parts', translation)} ${stationPartsRate.toFixed(2)}`);
  if (crewSuppliesRate > 0) cargoDetails.push(`${t('crew supplies', translation)} ${crewSuppliesRate.toFixed(2)}`);
  if (labCargoRate > 0) cargoDetails.push(`${t('electronics iv', translation)} ${labCargoRate.toFixed(2)}`);
  demands.filter(d => SPACE_CARGO_ITEMS.has(d.item) && d.rate > 0).forEach(d => { cargoDetails.push(`${t(d.item, translation)} ${d.rate.toFixed(2)}`); });
  return (
    <div className="section">
      <h3>🚀 空间站</h3>
      <div className="space-station-row">
        <label>等级: <input type="number" value={stationLevel} min={0} step={1} style={{ width: 60 }} disabled={!dataLoaded} onChange={e => setStationLevel(parseInt(e.target.value) || 0)} /></label>
        <label>火箭: <select value={rocketType} disabled={!dataLoaded} onChange={e => setRocketType(parseInt(e.target.value))}><option value={0}>Rocket T1</option><option value={1}>Rocket T2</option></select></label>
      </div>
      <div className="space-station-row"><span>火箭载荷科技: <b>Lv{rocketCargoLevel}</b> (加成 {((cargoBonus-1)*100).toFixed(0)}%)</span></div>
      <div className="space-station-row"><span>人口: <b>{crew}</b></span><span>人员火箭: <b>{crewRocketRate.toFixed(4)}</b> /分</span><span>物资火箭: <b>{cargoRocketRate.toFixed(4)}</b> /分</span></div>
      <div className="hint">
        火箭需求：{crewRocketRate > 0 ? `${t(rocket.crewKey, translation)}: ${crewRocketRate.toFixed(4)}/分；` : ''}
        {cargoRocketRate > 0 ? `${t(rocket.cargoKey, translation)}: ${cargoRocketRate.toFixed(4)}/分` : '无'}
        {cargoDetails.length > 0 && <><br /><small>物资明细：{cargoDetails.join('，')}</small></>}
      </div>
    </div>
  );
};

export const StatuePanel: React.FC = () => {
  const statueCount = useStore(s => s.statueCount);
  const setStatueCount = useStore(s => s.setStatueCount);
  const dataLoaded = useStore(s => s.dataLoaded);
  const fullData = useStore(s => s.fullData);
  const statueBuilding = fullData?.machines_and_buildings?.find((b: any) => b.name === 'The Statue of Maintenance');
  const maintUnit = statueBuilding?.maintenance_cost_units || '';
  const maintQty = statueBuilding?.maintenance_cost_quantity || 0;
  const electricity = statueBuilding?.electricity_consumed || 0;
  const computing = statueBuilding?.computing_consumed || 0;
  const workers = statueBuilding?.workers || 0;
  const reduction = getMaintenanceReduction(statueCount);
  return (
    <div className="section">
      <h3>🗿 雕像 (The Statue of Maintenance)</h3>
      <div className="space-station-row">
        <label>数量: <input type="number" value={statueCount} min={0} step={1} style={{ width: 60 }} disabled={!dataLoaded} onChange={e => setStatueCount(parseInt(e.target.value) || 0)} /></label>
        <span>维护减免: <b>{(reduction * 100).toFixed(2)}%</b></span>
      </div>
      {statueCount > 0 && (
        <div className="hint">
          消耗: 🔥fuel gas ×{(statueCount * 2).toFixed(2)}/分 |
          👷{workers * statueCount} |
          ⚡{electricity * statueCount}/分 |
          💻{computing * statueCount}/分 |
          🔧{maintUnit}: {(maintQty * statueCount).toFixed(2)}/分
        </div>
      )}
    </div>
  );
};

export const LabPanel: React.FC = () => {
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);
  const stationLevel = useStore(s => s.stationLevel);
  const setLabLevel = useStore(s => s.setLabLevel);
  const setLabCount = useStore(s => s.setLabCount);
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  const [labRecipeModalOpen, setLabRecipeModalOpen] = useState(false);
  const recipeEnabled = useStore(s => s.recipeEnabled);
  const setRecipeEnabled = useStore(s => s.setRecipeEnabled);
  const meta = labMeta.find(l => l.buildingId === labLevel);
  let researchOutput = 0;
  const labEqMap = new Map<string, number>();
  if (meta && labCount > 0) {
    meta.recipes.forEach(r => {
      if (!recipeEnabled[r.id]) return;
      Object.entries(r.inputs).forEach(([item, qty]) => {
        if (item.startsWith('lab equipment') || item === 'electronics iv') {
          const rate = (60 / r.duration) * qty * labCount;
          labEqMap.set(item, (labEqMap.get(item) || 0) + rate);
        }
      });
    });
    const researchPerLab = 48 * (1 + stationLevel * 0.05);
    researchOutput = researchPerLab * labCount;
  }
  const labEqItems = [...labEqMap.entries()].map(([name, rate]) => ({ name, rate }));
  return (
    <div className="section">
      <h3>🔬 研究所 (Research Lab)</h3>
      <div className="space-station-row">
        <label>等级: <select value={labLevel} disabled={!dataLoaded} onChange={e => setLabLevel(e.target.value)}>{labMeta.map(l => <option key={l.buildingId} value={l.buildingId}>{t(l.name, translation)} (Lv.{l.level})</option>)}</select></label>
        <label>数量: <input type="number" value={labCount} min={0} step={1} style={{ width: 60 }} disabled={!dataLoaded} onChange={e => setLabCount(parseInt(e.target.value) || 0)} /></label>
        <span>研究产出: <b>{researchOutput.toFixed(2)}</b> /分</span>
        {labEqItems.length > 0 ? labEqItems.map((le, i) => <span key={i}>{t(le.name, translation)}: <b>{le.rate.toFixed(2)}</b>/分 </span>) : <span>无设备消耗</span>}
        <Btn onClick={() => setLabRecipeModalOpen(true)} disabled={!dataLoaded} style={{ marginLeft: 10 }}>🧪 配方选择</Btn>
      </div>
      <ModalShell open={labRecipeModalOpen} onClose={() => setLabRecipeModalOpen(false)} title="研究所配方选择" maxWidth="700px">
        {meta && (
          <div>
            <h4>{meta.name}</h4>
            {meta.recipes.map(r => (
              <div key={r.id} style={{ marginBottom: 8, borderBottom: '1px solid #eee', padding: 6 }}>
                <label>
                  <input type="checkbox" checked={recipeEnabled[r.id] !== false} onChange={e => { const checked = e.target.checked; if (checked) { meta.recipes.forEach(other => { if (other.id !== r.id && recipeEnabled[other.id]) setRecipeEnabled(other.id, false); }); } setRecipeEnabled(r.id, checked); }} />
                  {' '}{r.id}
                </label>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10, textAlign: 'right' }}><Btn onClick={() => setLabRecipeModalOpen(false)}>关闭</Btn></div>
      </ModalShell>
    </div>
  );
};

export const DemandPanel: React.FC<{ onOpenDemandModal: () => void }> = ({ onOpenDemandModal }) => {
  const demands = useStore(s => s.demands);
  const removeDemand = useStore(s => s.removeDemand);
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  return (
    <div className="section">
      <h3>🎯 生产目标</h3>
      <Btn onClick={onOpenDemandModal} disabled={!dataLoaded}>🎯 选择产品</Btn>
      <ul>{demands.map((d, i) => <li key={i}>{t(d.item, translation)} ({d.item}): {d.rate}/分 <Btn variant="danger" onClick={() => removeDemand(i)}>🗑️</Btn></li>)}</ul>
    </div>
  );
};

// ==================== 选项面板（已添加整数模式控件） ====================
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

  // 整数模式相关状态（从 store 读取）
  const integerMode = useStore(s => s.integerMode);
  const setIntegerMode = useStore(s => s.setIntegerMode);
  const redundancyFactor = useStore(s => s.redundancyFactor);
  const setRedundancyFactor = useStore(s => s.setRedundancyFactor);
  const milpTimeLimit = useStore(s => s.milpTimeLimit);
  const setMilpTimeLimit = useStore(s => s.setMilpTimeLimit);

  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [tempOutputs, setTempOutputs] = useState<Set<string>>(new Set(excludedOutputs));
  const [tempInputs, setTempInputs] = useState<Set<string>>(new Set(excludedInputs));
  const [searchOutput, setSearchOutput] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const ignoreOptions = ['electricity', 'computing', '人力', 'maintenance i', 'maintenance ii', 'maintenance iii'];

  const openOutputModal = () => { setTempOutputs(new Set(excludedOutputs)); setOutputModalOpen(true); };
  const saveOutputs = () => { setExcludedOutputs([...tempOutputs]); setOutputModalOpen(false); };
  const openInputModal = () => { setTempInputs(new Set(excludedInputs)); setInputModalOpen(true); };
  const saveInputs = () => { setExcludedInputs([...tempInputs]); setInputModalOpen(false); };

  const filteredOutputs = allItems.filter(i => !isRaw(i) && (i.toLowerCase().includes(searchOutput.toLowerCase()) || t(i, translation).toLowerCase().includes(searchOutput.toLowerCase()))).sort();
  const filteredInputs = allItems.filter(i => !isRaw(i) && (i.toLowerCase().includes(searchInput.toLowerCase()) || t(i, translation).toLowerCase().includes(searchInput.toLowerCase()))).sort();

  return (
    <div className="section">
      <h3>⚙️ 选项</h3>

      {/* 整数模式选择区域 */}
      <div style={{ marginBottom: 12, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontWeight: 'bold' }}>🔢 整数模式: </label>
          <select
            value={integerMode}
            onChange={e => setIntegerMode(e.target.value as any)}
            style={{ marginLeft: 8, padding: 4 }}
            disabled={!dataLoaded}
          >
            <option value="continuous">连续解（小数机器）</option>
            <option value="ceil">向上取整 + 后验（快速）</option>
            <option value="heuristic">启发式迭代取整（较优）</option>
            <option value="milp">混合整数规划 MILP（精确）</option>
          </select>
        </div>

        {integerMode !== 'continuous' && (
          <div style={{ marginBottom: 8 }}>
            <label>📈 允许超产冗余: {(redundancyFactor * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={redundancyFactor * 100}
              onChange={e => setRedundancyFactor(parseInt(e.target.value) / 100)}
              style={{ marginLeft: 10, width: 200 }}
              disabled={!dataLoaded}
            />
            <span className="hint" style={{ marginLeft: 10 }}>（允许产量超出需求，避免短缺）</span>
          </div>
        )}

        {integerMode === 'milp' && (
          <div>
            <label>⏱️ MILP 时间限制（秒）: </label>
            <input
              type="number"
              min={1}
              max={300}
              step={5}
              value={milpTimeLimit}
              onChange={e => setMilpTimeLimit(parseInt(e.target.value) || 30)}
              style={{ width: 70, marginLeft: 8 }}
              disabled={!dataLoaded}
            />
            <span className="hint" style={{ marginLeft: 8 }}>（超时后返回当前最好解）</span>
          </div>
        )}
      </div>

      {/* 原有选项 */}
      <div style={{ marginBottom: 8 }}>
        {ignoreOptions.map(item => (
          <Checkbox key={item} label={item} checked={ignoredItems.includes(item)} onChange={() => toggleIgnored(item)} />
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
        <select value={optimizationMode} onChange={e => setOptimizationMode(e.target.value as any)}>
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

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Btn onClick={openOutputModal} disabled={!dataLoaded}>🚮 排除产出（无限排放）</Btn>
        <Btn onClick={openInputModal} disabled={!dataLoaded}>📥 排除输入（无限获取）</Btn>
      </div>

      <ModalShell open={outputModalOpen} onClose={() => setOutputModalOpen(false)} title={t('排除产出（可无限排放）', translation)} maxWidth="700px">
        <SearchInput placeholder={t('搜索物品...', translation)} value={searchOutput} onChange={setSearchOutput} />
        <div className="exclude-list">
          {filteredOutputs.map(item => (
            <div className="exclude-item" key={item}>
              <input type="checkbox" checked={tempOutputs.has(item.toLowerCase())} onChange={e => {
                const next = new Set(tempOutputs);
                e.target.checked ? next.add(item.toLowerCase()) : next.delete(item.toLowerCase());
                setTempOutputs(next);
              }} />
              <span className="exclude-item-name">{t(item, translation)} ({item})</span>
            </div>
          ))}
        </div>
        <div className="modal-footer"><Btn onClick={saveOutputs}>{t('确定', translation)}</Btn><Btn onClick={() => setOutputModalOpen(false)}>{t('取消', translation)}</Btn></div>
      </ModalShell>

      <ModalShell open={inputModalOpen} onClose={() => setInputModalOpen(false)} title={t('排除输入（可无限获取）', translation)} maxWidth="700px">
        <SearchInput placeholder={t('搜索物品...', translation)} value={searchInput} onChange={setSearchInput} />
        <div className="exclude-list">
          {filteredInputs.map(item => (
            <div className="exclude-item" key={item}>
              <input type="checkbox" checked={tempInputs.has(item.toLowerCase())} onChange={e => {
                const next = new Set(tempInputs);
                e.target.checked ? next.add(item.toLowerCase()) : next.delete(item.toLowerCase());
                setTempInputs(next);
              }} />
              <span className="exclude-item-name">{t(item, translation)} ({item})</span>
            </div>
          ))}
        </div>
        <div className="modal-footer"><Btn onClick={saveInputs}>{t('确定', translation)}</Btn><Btn onClick={() => setInputModalOpen(false)}>{t('取消', translation)}</Btn></div>
      </ModalShell>
    </div>
  );
};