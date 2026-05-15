import React, { useMemo, useState } from 'react';
import { useStore } from '../stores';
import { Btn } from './UI';
import { t, isPowerItem, isRaw, getSeriesName, getMaintenanceReduction, ROCKET_BASE, STATION_PARTS_RATE, CREW_SUPPLIES_RATE, SPACE_CARGO_ITEMS } from '../utils';
import { Recipe } from '../types';

export const Results: React.FC = () => {
  const result = useStore(s => s.result);
  const isSolving = useStore(s => s.isSolving);
  const diagnostic = useStore(s => s.diagnostic);
  const recipes = useStore(s => s.recipes);
  const demands = useStore(s => s.demands);
  const hideStage = useStore(s => s.hideStage);
  const ignoredItems = useStore(s => s.ignoredItems);
  const excludedItems = useStore(s => s.excludedItems);
  const statueCount = useStore(s => s.statueCount);
  const translation = useStore(s => s.translation);
  const mainSeriesList = useStore(s => s.mainSeriesList);
  const powerSeriesList = useStore(s => s.powerSeriesList);
  const enableSeriesForItem = useStore(s => s.enableSeriesForItem);
  const stationLevel = useStore(s => s.stationLevel);
  const rocketType = useStore(s => s.rocketType);
  const techLevel = useStore(s => s.techLevel);
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);
  const fullData = useStore(s => s.fullData);

  // 计算固定需求
  const fixedDemands = useMemo(() => {
    const fd: { item: string; rate: number }[] = [];
    // 空间站
    if (stationLevel > 0) {
      const rocket = ROCKET_BASE[rocketType];
      const crewCap = rocket.crewBase + (rocket.crewMax - rocket.crewBase) * (techLevel / 10);
      const cargoCap = rocket.cargoBase + (rocket.cargoMax - rocket.cargoBase) * (techLevel / 10);
      const crew = Math.max(0, (stationLevel - 1) * 2);
      const rocketsPerLaunch = Math.ceil(crew / crewCap);
      const crewRocketRate = rocketsPerLaunch / 20;
      const stationPartsRate = stationLevel * STATION_PARTS_RATE;
      const crewSuppliesRate = Math.max(0, (stationLevel - 1) * CREW_SUPPLIES_RATE);
      let labCargoRate = 0;
      const meta = labMeta.find(l => l.buildingId === labLevel);
      if (meta && labCount > 0 && meta.isHighestLevel) labCargoRate = 2 * labCount;
      const userSpaceCargoRate = demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).reduce((s, d) => s + d.rate, 0);
      const totalCargoRate = stationPartsRate + crewSuppliesRate + labCargoRate + userSpaceCargoRate;
      const cargoRocketRate = totalCargoRate / cargoCap;
      if (crewRocketRate > 0) fd.push({ item: rocket.crewKey, rate: crewRocketRate });
      if (cargoRocketRate > 0) fd.push({ item: rocket.cargoKey, rate: cargoRocketRate });
    }
    // 雕像
    if (statueCount > 0) fd.push({ item: 'fuel gas', rate: statueCount * 2 });
    // 研究所
    const meta = labMeta.find(l => l.buildingId === labLevel);
    if (meta && labCount > 0) {
      meta.recipes.forEach(r => {
        for (const [item, qty] of Object.entries(r.inputs)) {
          fd.push({ item: item.toLowerCase(), rate: (60 / r.duration) * qty * labCount });
        }
      });
      for (const [item, qty] of Object.entries(meta.upkeep)) {
        fd.push({ item: item.toLowerCase(), rate: qty * labCount });
      }
    }
    return fd;
  }, [stationLevel, rocketType, techLevel, labLevel, labCount, labMeta, demands, statueCount]);

  if (!result && !isSolving && !diagnostic) return null;

return (
  <div className="section" style={{ display: 'block' }}>
    {isSolving && <div>🔄 求解中...</div>}
    {diagnostic && (
      <div style={{ display: 'block', background: '#fff3cd', padding: 8, whiteSpace: 'pre-wrap', fontSize: 13 }}>
        <span dangerouslySetInnerHTML={{ __html: diagnostic }} />
      </div>
    )}
    const resultStatus = result?.Status ?? result?.status;
    {result && result.Status === 'Optimal' && (
      <ResultDisplay result={result} recipes={recipes} demands={demands} fixedDemands={fixedDemands}
        hideStage={hideStage} ignoredItems={ignoredItems} excludedItems={excludedItems}
        statueCount={statueCount} translation={translation}
        mainSeriesList={mainSeriesList} powerSeriesList={powerSeriesList}
        enableSeriesForItem={enableSeriesForItem} />
    )}
    {result && result.Status !== 'Optimal' && (
      <div><div>❌ 状态: {result.Status}</div></div>
    )}
  </div>
 );
};

const ResultDisplay: React.FC<{
  result: any; recipes: Recipe[]; demands: any[]; fixedDemands: any[];
  hideStage: boolean; ignoredItems: string[]; excludedItems: string[];
  statueCount: number; translation: Record<string, string>;
  mainSeriesList: any[]; powerSeriesList: any[];
  enableSeriesForItem: (item: string) => void;
}> = ({ result, recipes, demands, fixedDemands, hideStage, ignoredItems, excludedItems, statueCount, translation, mainSeriesList, powerSeriesList, enableSeriesForItem }) => {

  const [showTinyErrors, setShowTinyErrors] = useState(false);
  const fullData = useStore(s => s.fullData);
  const stationLevel = useStore(s => s.stationLevel);
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);

  // 维护减免
  const reductionFactor = getMaintenanceReduction(statueCount);

  const state = useStore.getState();
  const active = state.solverActive;
  const varNames = state.solverVarNames;
  const cols = result?.Columns || result?.columns || {};
  console.log('varNames:', varNames);
  console.log('columns keys:', Object.keys(cols));
  const vals = useMemo(() => {
    const v: { idx: number; val: number }[] = [];
    active.forEach((_, i) => {
      let val = 0;
      const varName = varNames[i];
      // 尝试1: 直接用变量名（如 x0）
      if (cols[varName]?.Primal !== undefined) {
        val = cols[varName].Primal;
      }
      // 尝试2: 小写 primal（某些求解器返回 primal 而非 Primal）
      else if (cols[varName]?.primal !== undefined) {
        val = cols[varName].primal;
      }
      // 尝试3: 按列索引（如 Column0, Column1）
      else if (cols[`Column${i}`]?.Primal !== undefined) {
        val = cols[`Column${i}`].Primal;
      }
      // 尝试4: 小写 column
      else if (cols[`column${i}`]?.Primal !== undefined) {
        val = cols[`column${i}`].Primal;
      }
      if (val > 0.0001) v.push({ idx: i, val });
    });
    return v;
  }, [active, varNames, cols]);

  let totalMachines = 0, totalEquivalent = 0;
  const allDemands = [...demands, ...fixedDemands];
  const demandSet = new Set(demands.map((d: any) => d.item));
  const ignored = new Set(ignoredItems);
  const exc = new Set(excludedItems);
  const itemBal = new Map<string, { prod: number; cons: number }>();

  vals.forEach(v => {
    const r = active[v.idx];
    totalMachines += v.val;
    totalEquivalent += r.isSolar ? v.val * 100 : v.val;

    for (const [item, qty] of Object.entries(r.outputs)) {
      if (ignored.has(item) || isRaw(item) || exc.has(item)) continue;
      const e = itemBal.get(item) || { prod: 0, cons: 0 };
      e.prod += isPowerItem(item) ? qty * v.val : (60 / r.duration) * qty * v.val;
      itemBal.set(item, e);
    }
    for (const [item, qty] of Object.entries(r.inputs)) {
      if (ignored.has(item) || isRaw(item) || exc.has(item)) continue;
      const e = itemBal.get(item) || { prod: 0, cons: 0 };
      e.cons += isPowerItem(item) ? qty * v.val : (60 / r.duration) * qty * v.val;
      itemBal.set(item, e);
    }
    for (const [item, qty] of Object.entries(r.upkeep)) {
      if (ignored.has(item) || isRaw(item) || exc.has(item)) continue;
      const e = itemBal.get(item) || { prod: 0, cons: 0 };
      e.cons += qty * v.val * (1 - (item.startsWith('maintenance') ? reductionFactor : 0));
      itemBal.set(item, e);
    }
  });

  allDemands.forEach((d: any) => {
    if (ignored.has(d.item) || isRaw(d.item) || exc.has(d.item)) return;
    const e = itemBal.get(d.item) || { prod: 0, cons: 0 };
    e.cons += d.rate;
    itemBal.set(d.item, e);
  });

  const handleFix = (item: string) => {
    enableSeriesForItem(item);
  };

  // 分离各模块配方
  const mainVals = vals.filter(v => active[v.idx]?.module === 'main');
  const powerVals = vals.filter(v => active[v.idx]?.module === 'power');
  const residentVals = vals.filter(v => active[v.idx]?.module === 'resident');
  const stationVals = vals.filter(v => active[v.idx]?.module === 'station');
  const specialVals = vals.filter(v => active[v.idx]?.module === 'special');

  // 雕像信息
  const statueBuilding = fullData?.machines_and_buildings?.find(
    (b: any) => b.name === 'The Statue of Maintenance'
  );
  const statueMaintUnit = statueBuilding?.maintenance_cost_units || '';
  const statueMaintQty = statueBuilding?.maintenance_cost_quantity || 0;
  const statueElectricity = statueBuilding?.electricity_consumed || 0;
  const statueComputing = statueBuilding?.computing_consumed || 0;
  const statueWorkers = statueBuilding?.workers || 0;

  // 研究所信息
  const labMetaInfo = labMeta.find(l => l.buildingId === labLevel);

  // 计算雕像总维护
  const statueTotalMaint = statueMaintQty * statueCount;
  const statueTotalWorkers = statueWorkers * statueCount;
  const statueTotalElectricity = statueElectricity * statueCount;
  const statueTotalComputing = statueComputing * statueCount;

  // 合并维护显示
  const getMergedMaintenance = (r: Recipe, val: number) => {
    const parts: string[] = [];
    for (const [item, qty] of Object.entries(r.upkeep)) {
      if (item.startsWith('maintenance')) {
        const adjQty = qty * (1 - reductionFactor);
        parts.push(`${item.replace('maintenance ', 'M')}:${(adjQty * val).toFixed(2)}`);
      }
    }
    return parts.join(' ') || '-';
  };

  // 计算电力和算力（包括 inputs 和 upkeep）
  const calcWorkers = (r: Recipe, val: number) => r.workers * val;
  const calcElec = (r: Recipe, val: number) => {
    const fromInputs = (r.inputs['electricity'] || 0);
    const fromUpkeep = (r.upkeep['electricity'] || 0);
    const total = (fromInputs + fromUpkeep) * (r.module === 'special' || r.module === 'resident' ? 1 : val);
    return total;
  };
  const calcComp = (r: Recipe, val: number) => {
    const fromInputs = (r.inputs['computing'] || 0);
    const fromUpkeep = (r.upkeep['computing'] || 0);
    const total = (fromInputs + fromUpkeep) * (r.module === 'special' || r.module === 'resident' ? 1 : val);
    return total;
  };

  return (
    <>
      <div>
        ✅ 总机器数: <b>{totalMachines.toFixed(2)}</b> | 等效建筑: <b>{totalEquivalent.toFixed(2)}</b>
        {' '}<span className="hint">参与计算配方: {active.length} 个</span>
      </div>

      {/* 主模块机器分配 */}
      {mainVals.length > 0 && (
        <details open>
          <summary><h4 style={{ display: 'inline-block' }}>🏭 主模块</h4></summary>
          <table>
            <thead><tr><th>配方</th><th>建筑</th><th>机器</th><th>等效</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>🔧维护</th><th>投入/分</th><th>产出/分</th></tr></thead>
            <tbody>
              {mainVals.filter(v => !(hideStage && /stage/i.test(active[v.idx].name))).map(v => {
                const r = active[v.idx];
                const equiv = r.isSolar ? v.val * 100 : v.val;
                const imp = Object.entries(r.inputs).map(([k, q]) => `${t(k, translation)}×${((60 / r.duration) * q * v.val).toFixed(2)}`).join(', ') || '无';
                const oup = Object.entries(r.outputs).map(([k, q]) => `${t(k, translation)}×${((60 / r.duration) * q * v.val).toFixed(2)}`).join(', ') || '无';
                return (
                  <tr key={v.idx}>
                    <td>{r.isSolar ? <span className="solar-badge">☀️</span> : null} {t(r.name, translation)}</td>
                    <td>{t(r.buildingName, translation)}</td>
                    <td>{v.val.toFixed(2)}</td>
                    <td>{equiv.toFixed(2)}</td>
                    <td>{calcWorkers(r, v.val).toFixed(2)}</td>
                    <td>{calcElec(r, v.val).toFixed(2)}</td>
                    <td>{calcComp(r, v.val).toFixed(2)}</td>
                    <td>{getMergedMaintenance(r, v.val)}</td>
                    <td>{imp}</td>
                    <td>{oup}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      {/* 电力模块机器分配 */}
      {powerVals.length > 0 && (
        <details open>
          <summary><h4 style={{ display: 'inline-block' }}>⚡ 电力模块</h4></summary>
          <table>
            <thead><tr><th>配方</th><th>建筑</th><th>机器</th><th>等效</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>🔧维护</th><th>投入/分</th><th>产出/分</th></tr></thead>
            <tbody>
              {powerVals.map(v => {
                const r = active[v.idx];
                const equiv = r.isSolar ? v.val * 100 : v.val;
                const imp = Object.entries(r.inputs).map(([k, q]) => `${t(k, translation)}×${(isPowerItem(k) ? q * v.val : ((60 / r.duration) * q * v.val)).toFixed(2)}`).join(', ') || '无';
                const oup = Object.entries(r.outputs).map(([k, q]) => `${t(k, translation)}×${(isPowerItem(k) ? q * v.val : ((60 / r.duration) * q * v.val)).toFixed(2)}`).join(', ') || '无';
                return (
                  <tr key={v.idx}>
                    <td>{r.isSolar ? <span className="solar-badge">☀️</span> : null} {t(r.name, translation)}</td>
                    <td>{t(r.buildingName, translation)}</td>
                    <td>{v.val.toFixed(2)}</td>
                    <td>{equiv.toFixed(2)}</td>
                    <td>{calcWorkers(r, v.val).toFixed(2)}</td>
                    <td>{calcElec(r, v.val).toFixed(2)}</td>
                    <td>{calcComp(r, v.val).toFixed(2)}</td>
                    <td>{getMergedMaintenance(r, v.val)}</td>
                    <td>{imp}</td>
                    <td>{oup}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      {/* 居民模块 */}
      {residentVals.length > 0 && (
        <>
          <h4>🏠 居民模块</h4>
          <table>
            <thead><tr><th>配方</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>投入/分</th><th>产出/分</th></tr></thead>
            <tbody>
              {residentVals.map(v => {
                const r = active[v.idx];
                const imp = Object.entries(r.inputs).map(([k, q]) => `${t(k, translation)}×${(q * v.val).toFixed(2)}`).join(', ') || '无';
                const oup = Object.entries(r.outputs).map(([k, q]) => `${t(k, translation)}×${(q * v.val).toFixed(2)}`).join(', ') || '无';
                return (
                  <tr key={v.idx}>
                    <td>{t(r.name, translation)}</td>
                    <td>{calcWorkers(r, v.val).toFixed(2)}</td>
                    <td>{calcElec(r, v.val).toFixed(2)}</td>
                    <td>{calcComp(r, v.val).toFixed(2)}</td>
                    <td>{imp}</td>
                    <td>{oup}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* 空间站模块 */}
      {stationVals.length > 0 && (
        <>
          <h4>🚀 空间站模块</h4>
          <table>
            <thead><tr><th>配方</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>投入/分</th><th>产出/分</th></tr></thead>
            <tbody>
              {stationVals.map(v => {
                const r = active[v.idx];
                const imp = Object.entries(r.inputs).map(([k, q]) => `${t(k, translation)}×${(q * v.val).toFixed(2)}`).join(', ') || '无';
                const oup = Object.entries(r.outputs).map(([k, q]) => `${t(k, translation)}×${(q * v.val).toFixed(2)}`).join(', ') || '无';
                return (
                  <tr key={v.idx}>
                    <td>{t(r.name, translation)}</td>
                    <td>{calcWorkers(r, v.val).toFixed(2)}</td>
                    <td>{calcElec(r, v.val).toFixed(2)}</td>
                    <td>{calcComp(r, v.val).toFixed(2)}</td>
                    <td>{imp}</td>
                    <td>{oup}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* 雕像表格 */}
      {statueCount > 0 && (
        <>
          <h4>🗿 雕像 (The Statue of Maintenance)</h4>
          <table>
            <thead><tr><th>数量</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>🔥燃气消耗</th><th>🔧维护</th><th>维护减免</th></tr></thead>
            <tbody>
              <tr>
                <td>{statueCount}</td>
                <td>{statueTotalWorkers.toFixed(2)}</td>
                <td>{statueTotalElectricity.toFixed(2)}</td>
                <td>{statueTotalComputing.toFixed(2)}</td>
                <td>fuel gas ×{(statueCount * 2).toFixed(2)}</td>
                <td>{statueMaintUnit}: {statueTotalMaint.toFixed(2)}</td>
                <td>{(reductionFactor * 100).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* 研究所表格 */}
      {labCount > 0 && labLevel && labMetaInfo && (
        <>
          <h4>🔬 研究所 ({labMetaInfo.name})</h4>
          <table>
            <thead><tr><th>数量</th><th>等级</th><th>研究产出</th><th>👷人力</th><th>⚡电力</th><th>💻算力</th><th>投入/分</th><th>维护</th></tr></thead>
            <tbody>
              <tr>
                <td>{labCount}</td>
                <td>{labMetaInfo.level}</td>
                <td>{(48 * (1 + stationLevel * 0.05) * labCount).toFixed(2)}</td>
                <td>{(labMetaInfo.recipes?.[0] ? (labMetaInfo.recipes[0].inputs ? Object.values(labMetaInfo.recipes[0].inputs).reduce((a: number, b: any) => a + b, 0) * labCount : 0) : 0)}</td>
                <td>-</td>
                <td>-</td>
                <td>
                  {labMetaInfo.recipes?.map((r: any) =>
                    Object.entries(r.inputs).map(([k, q]) => `${t(k, translation)}×${((60 / r.duration) * (q as number) * labCount).toFixed(2)}`).join(', ')
                  ).join('; ') || '无'}
                </td>
                <td>
                  {Object.entries(labMetaInfo.upkeep || {}).map(([k, q]) =>
                    `${t(k, translation)}: ${((q as number) * labCount).toFixed(2)}`
                  ).join(', ') || '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h4>资源总览</h4>
      <div style={{ marginBottom: 8 }}>
        <Btn onClick={() => setShowTinyErrors(!showTinyErrors)} variant={showTinyErrors ? 'primary' : 'default'} style={{ fontSize: 12 }}>
          {showTinyErrors ? '🔍 隐藏微小误差' : '🔍 显示微小误差'}
        </Btn>
      </div>
      <table>
        <thead><tr><th>物品</th><th>产出/分</th><th>消耗/分</th><th>净产出</th><th>操作</th></tr></thead>
        <tbody>
          {[...itemBal.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .filter(([item, { prod, cons }]) => {
              if (hideStage && /stage/i.test(item)) return false;
              if (prod === 0 && cons === 0) return false; // 全零隐藏
              if (showTinyErrors) return true;
              const net = Math.abs(prod - cons);
              const prodVal = Math.max(prod, cons);
              // 净产出绝对值 < 0.01 且 净产出/产出 < 0.001 (1‰)
              if (net < 0.01 && prodVal > 0 && net / prodVal < 0.001) return false;
              return true;
            })
            .map(([item, { prod, cons }]) => {
              const net = prod - cons;
              const displayNet = Math.abs(net) < 1e-6 ? 0 : net;
              const isRed = !demandSet.has(item) && Math.abs(net) > 1e-6;
              return (
                <tr key={item} style={{ color: isRed ? 'red' : undefined }}>
                  <td>{t(item, translation)}</td>
                  <td>{prod.toFixed(2)}</td>
                  <td>{cons.toFixed(2)}</td>
                  <td>{(displayNet >= 0 ? '+' : '') + displayNet.toFixed(4)}</td>
                  <td>{isRed && <span className="fix-btn" onClick={() => handleFix(item)}>🔧 修复</span>}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </>
  );
};