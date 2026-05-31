import React from 'react';
import { useStore } from '../stores';
import { Btn, Checkbox, Select, ModalShell, SearchInput } from './UI';
import { t, isPowerBuilding, HIDDEN_SERIES, ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS, getMaintenanceReduction, getSeriesName } from '../utils';
import { Recipe, Series } from '../types';
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
      <div className="stat"> 主模块{mainSeriesList.length}系列 | 已启用{mainCount}个 | ⚡电力{powerSeriesList.length}系列 | 已启用{powerCount}个</div>
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
  const translation = useStore(s => s.translation);
  const dataLoaded = useStore(s => s.dataLoaded);
  const steamLowMode = useStore(s => s.steamLowMode);
  const setSteamLowMode = useStore(s => s.setSteamLowMode);
  const solarEfficiency = useStore(s => s.solarEfficiency);
  const setSolarEfficiency = useStore(s => s.setSolarEfficiency);

  return (
    <div className="section">
      <h3>⚡ 电力模块</h3>
      <div className="power-grid">
        {powerSeriesList.length === 0 ? <span className="hint">无电力相关建筑</span> :
          powerSeriesList.map(ps => (
            <div className="power-item" key={ps.name}>
              <input
                type="checkbox"
                checked={powerEnabled[ps.name] !== false}
                onChange={e => {
                  const checked = e.target.checked;
                  setPowerEnabled(ps.name, checked);
                  // 开启时自动设置为最高等级，关闭时不清除配方状态
                  if (checked) {
                    const maxLv = ps.levels[ps.levels.length - 1].level;
                    setPowerLevel(ps.name, maxLv);
                  }
                }}
              />
              <span>{t(ps.name, translation)}: </span>
              <Select
                value={powerSelectedLevel[ps.name] || ps.levels[ps.levels.length - 1].level}
                options={ps.levels.map(lv => ({ value: lv.level, label: `Lv${lv.level}` }))}
                onChange={v => { const lv = parseInt(v); setPowerLevel(ps.name, lv); if (!powerEnabled[ps.name]) setPowerEnabled(ps.name, true); }}
              />
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