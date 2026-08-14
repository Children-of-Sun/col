import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../stores';
import { Btn } from './UI';
import { t, getMaintenanceReduction, SPACE_CARGO_ITEMS, getColValue, isMipSuccess } from '../utils';
import { Recipe } from '../types';
import { isContinuous, formatPowerSigned, formatPowerValue, formatComputingSigned, formatComputingValue, computeRecipeArea, formatFootprint, smartRound, formatPowerSmart, formatComputingSmart, formatNetValue } from '../utils/format';
import { IconWithFallback } from './IconWithFallback';
import { computeEmbeddedValues } from '../embeddedValues';
import ItemDetailModal from './ItemDetailModal';

function computeRecipePerMin(recipe: Recipe, machineCount: number, reductionFactor: number, ceilUpkeep: boolean = false) {
  // 取整模式下，建筑数量向上取整（用于维护/人力/电力/算力计算）
  // 配方投入产出保持原始（小数）机器数量
  const upkeepCount = ceilUpkeep ? Math.ceil(machineCount) : machineCount;

  // 贸易配方特殊处理（已为每分钟速率）
  if (recipe.module === 'trade') {
    const inputs: Record<string, number> = {};
    const outputs: Record<string, number> = {};
    let cohesion = 0;
    let workers = 0, electricity = 0, computing = 0, maintI = 0, maintII = 0, maintIII = 0;
    for (const [item, qty] of Object.entries(recipe.inputs)) {
      inputs[item] = qty * machineCount;
    }
    for (const [item, qty] of Object.entries(recipe.outputs)) {
      outputs[item] = qty * machineCount;
    }
    for (const [item, qty] of Object.entries(recipe.upkeep)) {
      let reducedQty = qty * upkeepCount;
      if (item.startsWith('maintenance')) {
        reducedQty *= (1 - reductionFactor);
      }
      if (item === '凝聚力') {
        cohesion = qty * machineCount; // 凝聚力是每次配方执行的消耗，不随建筑取整
      } else {
        inputs[item] = (inputs[item] || 0) + reducedQty;
      }
      // 累加人力、电力、算力、维护（使用取整后的建筑数）
      if (item === '人力') workers += reducedQty;
      if (item === 'electricity') electricity += reducedQty;
      if (item === 'computing') computing += reducedQty;
      if (item === 'maintenance i') maintI += reducedQty;
      if (item === 'maintenance ii') maintII += reducedQty;
      if (item === 'maintenance iii') maintIII += reducedQty;
    }
    return { inputs, outputs, workers, electricity, computing, maintI, maintII, maintIII, machineCount: upkeepCount, cohesion };
  }

  // 非贸易配方
  const inputs: Record<string, number> = {};
  const outputs: Record<string, number> = {};
  let workers = 0, electricity = 0, computing = 0, maintI = 0, maintII = 0, maintIII = 0;

  for (const [item, qty] of Object.entries(recipe.inputs)) {
    const isContinuousItem = isContinuous(item);
    let scale = 1;
    if (!isContinuousItem) scale = 60 / recipe.duration;
    inputs[item] = (inputs[item] || 0) + qty * scale * machineCount;
    // 配方投入中的电力/算力（使用原始小数）
    if (item === 'electricity') electricity += qty * scale * machineCount;
    if (item === 'computing') computing += qty * scale * machineCount;
  }
  for (const [item, qty] of Object.entries(recipe.outputs)) {
    const isContinuousItem = isContinuous(item);
    const isMaintenanceOutput = (item === 'maintenance i' || item === 'maintenance ii' || item === 'maintenance iii');
    let scale = 1;
    if (isMaintenanceOutput) scale = 60 / recipe.duration;
    else if (!isContinuousItem) scale = 60 / recipe.duration;
    outputs[item] = (outputs[item] || 0) + qty * scale * machineCount;
  }
  for (const [item, qty] of Object.entries(recipe.upkeep)) {
    // upkeep 使用取整后的建筑数量
    let reducedQty = qty * upkeepCount;
    if (item.startsWith('maintenance')) {
      reducedQty *= (1 - reductionFactor);
    }
    inputs[item] = (inputs[item] || 0) + reducedQty;
    // 人力、电力、算力、维护使用取整后的建筑数
    if (item === 'maintenance i') maintI += reducedQty;
    if (item === 'maintenance ii') maintII += reducedQty;
    if (item === 'maintenance iii') maintIII += reducedQty;
    if (item === 'electricity') electricity += reducedQty;
    if (item === 'computing') computing += reducedQty;
    if (item === '人力') workers += reducedQty;
  }
  return { inputs, outputs, workers, electricity, computing, maintI, maintII, maintIII, machineCount: upkeepCount };
}

function mergeResources(target: Record<string, number>, source: Record<string, number>) {
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] || 0) + v;
  }
}


const SummaryTable: React.FC<{
  data: { prod: Record<string, number>; cons: Record<string, number> };
  showTinyErrors: boolean;
  translation: Record<string, string>;
  splitMode?: boolean;
  netWorkers?: number;
  showLaborRow?: boolean;
  onItemClick?: (item: string) => void;
}> = React.memo(({ data, showTinyErrors, translation, splitMode = false, netWorkers = 0, showLaborRow = false, onItemClick }) => {
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);
  const forcedOrder = ['人力', 'electricity', 'computing', 'maintenance i', 'maintenance ii', 'maintenance iii', 'research'];
  const demands = useStore(s => s.demands);
  const spaceCargoDemandItems = new Set(
    demands.filter(d => SPACE_CARGO_ITEMS.has(d.item)).map(d => d.item)
  );
  const alwaysShow = new Set([...forcedOrder, ...spaceCargoDemandItems]);
  const allItems = new Set([...Object.keys(data.prod), ...Object.keys(data.cons)]);
  const items = Array.from(allItems).sort();
  const filtered = items.filter(item => {
    if (alwaysShow.has(item)) return true;
    if (!showTinyErrors) {
      const prod = data.prod[item] || 0;
      const cons = data.cons[item] || 0;
      const net = Math.abs(prod - cons);
      const maxVal = Math.max(prod, cons);
      if (net < 0.01 || (maxVal > 0 && net / maxVal < 0.01)) return false;
    }
    return true;
  }).map(item => {
    const prod = data.prod[item] || 0;
    const cons = data.cons[item] || 0;
    const net = prod - cons;
    return { item, prod, cons, net };
  });

  let forcedItems: { item: string; prod: number; cons: number; net: number }[] = [];
  let otherItems: { item: string; prod: number; cons: number; net: number }[] = [];
  filtered.forEach(item => {
    if (forcedOrder.includes(item.item)) forcedItems.push(item);
    else otherItems.push(item);
  });
  forcedItems.sort((a, b) => forcedOrder.indexOf(a.item) - forcedOrder.indexOf(b.item));
  otherItems.sort((a, b) => a.item.localeCompare(b.item));
  const finalItems = [...forcedItems, ...otherItems];

  if (!splitMode) {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>{t('物品', translation)}</th><th>{t('产出/分', translation)}</th><th>{t('消耗/分', translation)}</th><th>{t('净产出', translation)}</th></tr></thead>
          <tbody>
            {finalItems.map(({ item, prod, cons, net }) => {
              const icon = showIcons ? productIcons[item.toLowerCase()] : undefined;
              let prodDisplay = prod.toFixed(1);
              let consDisplay = cons.toFixed(1);
              let netDisplay = (net >= 0 ? '+' : '') + net.toFixed(1);
              if (item === 'electricity') {
                prodDisplay = formatPowerValue(prod);
                consDisplay = formatPowerValue(cons);
                netDisplay = formatPowerSigned(net);
              } else if (item === 'computing') {
                prodDisplay = formatComputingValue(prod);
                consDisplay = formatComputingValue(cons);
                netDisplay = formatComputingSigned(net);
              }
              return (
              <React.Fragment key={item}>
                <tr>
                  <td className="summary-name-cell" style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => onItemClick?.(item)}
                    title={`点击搜索 ${t(item, translation)}`}
                  >
                    {showIcons && icon ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <IconWithFallback src={icon} alt="" style={{ width: 24, height: 24 }} />
                        <span>{t(item, translation)}</span>
                      </div>
                    ) : t(item, translation)}
                  </td>
                  <td>{prodDisplay}</td>
                  <td>{consDisplay}</td>
                  <td className={net < 0 ? 'negative-value' : net > 0 ? 'positive-value' : ''}>{netDisplay}</td>
                </tr>
                {showLaborRow && item === '人力' && (
                  <tr style={{ borderTop: '1px solid #ccc', background: '#f9f9f9' }}>
                    <td className="summary-name-cell" style={{ textAlign: 'center' }}><strong>{t('人力（工人）', translation)}</strong></td>
                    <td>-</td>
                    <td>-</td>
                    <td className={netWorkers < 0 ? 'negative-value' : netWorkers > 0 ? 'positive-value' : ''}>
                      {(netWorkers >= 0 ? '+' : '') + netWorkers.toFixed(2)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )})}
          </tbody>
        </table>
      </div>
    );
  }

  const positiveItems = finalItems.filter(f => f.net > 0);
  const negativeItems = finalItems.filter(f => f.net < 0);
  const maxRows = Math.max(positiveItems.length, negativeItems.length);
  return (
    <div className="split-summary">
      <div className="split-column">
        <table className="data-table">
          <thead><tr><th style={{ width: '30%' }}>{t('净产出', translation)}</th><th style={{ width: '70%' }}>{t('数量/分', translation)}</th></tr></thead>
          <tbody>
            {positiveItems.map(({ item, net }) => {
              const icon = showIcons ? productIcons[item.toLowerCase()] : undefined;
              return (
              <tr key={item}>
                <td className="summary-name-cell" style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => onItemClick?.(item)}
                    title={`点击搜索 ${t(item, translation)}`}
                  >
                  {showIcons && icon ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <IconWithFallback src={icon} alt="" style={{ width: 24, height: 24 }} />
                      <span>{t(item, translation)}</span>
                    </div>
                  ) : t(item, translation)}
                </td>
                <td className="positive-value">{item === 'electricity' ? formatPowerSigned(net) : item === 'computing' ? formatComputingSigned(net) : formatNetValue(net)}</td>
              </tr>
            )})}
            {Array.from({ length: maxRows - positiveItems.length }).map((_, i) => <tr key={`empty-pos-${i}`}><td colSpan={2}>&nbsp;</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="split-column">
        <table className="data-table">
          <thead><tr><th style={{ width: '30%' }}>{t('净消耗', translation)}</th><th style={{ width: '70%' }}>{t('数量/分', translation)}</th></tr></thead>
          <tbody>
            {negativeItems.map(({ item, net }) => {
              const icon = showIcons ? productIcons[item.toLowerCase()] : undefined;
              return (
              <tr key={item}>
                <td className="summary-name-cell" style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => onItemClick?.(item)}
                    title={`点击搜索 ${t(item, translation)}`}
                  >
                  {showIcons && icon ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <IconWithFallback src={icon} alt="" style={{ width: 24, height: 24 }} />
                      <span>{t(item, translation)}</span>
                    </div>
                  ) : t(item, translation)}
                </td>
                <td className="negative-value">{item === 'electricity' ? formatPowerSigned(net) : item === 'computing' ? formatComputingSigned(net) : formatNetValue(net)}</td>
              </tr>
            )})}
            {Array.from({ length: maxRows - negativeItems.length }).map((_, i) => <tr key={`empty-neg-${i}`}><td colSpan={2}>&nbsp;</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const RecipeList: React.FC<{
  recipes: { recipe: Recipe; count: number; perMin: any }[];
  translation: Record<string, string>;
  buildingSizes: Record<string, { width: number; height: number }>;
  showFullStats: boolean;
  onItemClick?: (item: string) => void;
}> = React.memo(({ recipes, translation, buildingSizes, showFullStats, onItemClick }) => {
  const isTrade = recipes.length > 0 && recipes[0].recipe.module === 'trade';
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th className="recipe-name-cell">{t('         配方         ', translation)}</th>
            <th className="col-narrow">{t('建筑', translation)}</th>
            <th className="col-narrow">{t('理论机器数', translation)}</th>
            <th className="col-narrow">{t('实际机器数', translation)}</th>
            <th className="col-narrow">{t('占地', translation)}</th>
            <th className="col-narrow">{t('人力', translation)}</th>
            <th className="col-narrow">{t('电力', translation)}</th>
            <th className="col-narrow">{t('算力', translation)}</th>
            <th className="col-narrow">{t('维护', translation)}</th>
            {isTrade && <th className="col-narrow">{t('凝聚力消耗', translation)}</th>}
            <th className="col-wide">{t('投入', translation)}</th>
            <th className="col-wide">{t('产出', translation)}</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((item, idx) => {
            const r = item.recipe;
            const cnt = item.count;
            const pm = item.perMin;
            const skipItems = new Set(['人力', 'electricity', 'computing', 'maintenance i', 'maintenance ii', 'maintenance iii']);
            const filteredInputs = Object.entries(pm.inputs).filter(([k]) => !skipItems.has(k));
            const inputs = filteredInputs.length > 0 ? (
              <span>{filteredInputs.map(([k, v]) => (
                <span key={k} onClick={() => onItemClick?.(k)} style={{ cursor: 'pointer', marginRight: 6 }} title={`点击搜索 ${t(k, translation)}`}>
                  {t(k, translation)}×{(v as number).toFixed(1)}
                </span>
              ))}</span>
            ) : '无';
            const outputs = Object.entries(pm.outputs).length > 0 ? (
              <span>{Object.entries(pm.outputs).map(([k, v]) => (
                <span key={k} onClick={() => onItemClick?.(k)} style={{ cursor: 'pointer', marginRight: 6 }} title={`点击搜索 ${t(k, translation)}`}>
                  {t(k, translation)}×{(v as number).toFixed(1)}
                </span>
              ))}</span>
            ) : '无';
            const maintParts: string[] = [];
            if (pm.maintI > 0) {
              const mi = smartRound(pm.maintI, showFullStats);
              maintParts.push(`M I:${mi.text}`);
            }
            if (pm.maintII > 0) {
              const mii = smartRound(pm.maintII, showFullStats);
              maintParts.push(`M II:${mii.text}`);
            }
            if (pm.maintIII > 0) {
              const miii = smartRound(pm.maintIII, showFullStats);
              maintParts.push(`M III:${miii.text}`);
            }
            const maintStr = maintParts.join(' ') || '-';
            const maintTitle = maintParts.length > 0 ? maintParts.join(' ') : '-';
            let cohesionConsumption = '';
            if (isTrade) {
              cohesionConsumption = (pm.cohesion || 0).toFixed(1);
            }
            const fullName = t(r.name, translation);
            const displayName = fullName.length > 5 ? fullName.slice(0, 5) + '…' : fullName;
            const workersR = smartRound(pm.workers, showFullStats);
            const powerR = formatPowerSmart(pm.electricity, showFullStats);
            const computingR = formatComputingSmart(pm.computing, showFullStats);
            return (
              <tr key={r.id}>
                <td className="recipe-name-cell" title={fullName}>{displayName}</td>
                <td>{t(r.buildingName, translation)}</td>
                <td>{cnt.toFixed(2)}</td>
                <td>{pm.machineCount.toFixed(2)}</td>
                <td title={(() => { const a = computeRecipeArea(item.recipe, item.count, buildingSizes); return a.toFixed(1) + ' 小格'; })()}>{formatFootprint(computeRecipeArea(item.recipe, item.count, buildingSizes))}</td>
                <td title={workersR.title}>{workersR.text}</td>
                <td title={powerR.title}>{powerR.text}</td>
                <td title={computingR.title}>{computingR.text}</td>
                <td title={maintTitle}>{maintStr}</td>
                {isTrade && <td>{cohesionConsumption}</td>}
                <td className="col-wide">{inputs}</td>
                <td className="col-wide">{outputs}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

const ModuleRow: React.FC<{
  name: string;
  machineCount: number;
  actualMachineCount: number;
  workers: number;
  netElectricity: number;
  computing: number;
  totalMaintenance: number;
  footprint: number;
  netProds: { item: string; net: number }[];
  netCons: { item: string; net: number }[];
  onClick: () => void;
  translation: Record<string, string>;
}> = React.memo(({ name, machineCount, actualMachineCount, workers, netElectricity, computing, totalMaintenance, footprint, netProds, netCons, onClick, translation }) => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpand = () => setExpanded(!expanded);
  return (
    <div className="module-row">
      <div className="module-header" onClick={toggleExpand} style={{ cursor: 'pointer' }}>
        <span className="module-name">{t(name, translation)}</span>
        <span className="module-stats">
          🏭 {t('理论机器', translation)}: {machineCount.toFixed(2)} &nbsp;|&nbsp; 🏭 {t('实际机器', translation)}: {actualMachineCount.toFixed(2)} &nbsp;|&nbsp;
          👷 {t('人力', translation)}: {workers.toFixed(2)} &nbsp;|&nbsp;
          ⚡ {t('净电力', translation)}: {formatPowerSigned(netElectricity)} &nbsp;|&nbsp;
          💻 {t('算力', translation)}: {formatComputingSigned(computing)} &nbsp;|&nbsp;
          🔧 {t('维护总量', translation)}: {totalMaintenance.toFixed(2)} &nbsp;|&nbsp;
          📐 {t('占地', translation)}: {formatFootprint(footprint)}
        </span>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="module-details">
          <div className="module-prods">
            <strong>{t('净产出', translation)}</strong>
            {netProds.length === 0 && <span className="hint"> ({t('无', translation)})</span>}
            <div className="net-items">
              {netProds.map(p => (
                <div key={p.item} className="net-prod">{t(p.item, translation)}: <span className="positive-value">+{p.net.toFixed(4)}</span></div>
              ))}
            </div>
          </div>
          <div className="module-cons">
            <strong>{t('净消耗', translation)}</strong>
            {netCons.length === 0 && <span className="hint"> ({t('无', translation)})</span>}
            <div className="net-items">
              {netCons.map(c => (
                <div key={c.item} className="net-cons">{t(c.item, translation)}: <span className="negative-value">{c.net.toFixed(4)}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const Results: React.FC = () => {
  const result = useStore(s => s.result);
  const isSolving = useStore(s => s.isSolving);
  const diagnostic = useStore(s => s.diagnostic);
  const solverActive = useStore(s => s.solverActive);
  const solverVarNames = useStore(s => s.solverVarNames);
  const translation = useStore(s => s.translation);
  const statueCount = useStore(s => s.statueCount);
  const showTinyErrors = useStore(s => s.showTinyErrors);
  const setShowTinyErrors = useStore(s => s.setShowTinyErrors);
  const unityProduction = useStore(s => s.unityProduction);
  const stationLevel = useStore(s => s.stationLevel);
  const stationUnity = stationLevel * 0.05;
  const residentUnity = unityProduction - stationUnity;
  const cohesionTradeDirect = useStore(s => s.cohesionTradeDirect);
  const cohesionTradeMaintenance = useStore(s => s.cohesionTradeMaintenance);
  const cohesionEdict = useStore(s => s.cohesionEdict);
  const integerMode = useStore(s => s.integerMode);
  const buildingSizes = useStore(s => s.buildingSizes);
  const useReferenceSizes = useStore(s => s.useReferenceSizes);
  const setUseReferenceSizes = useStore(s => s.setUseReferenceSizes);
  const [selectedTab, setSelectedTab] = useState<string>('全厂总览');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showCeilMachines, setShowCeilMachines] = useState(false);
  const [showFullStats, setShowFullStats] = useState(false);

  const [itemDetailItem, setItemDetailItem] = useState<string | undefined>(undefined);
  const buildingIcons = useStore(s => s.buildingIcons);
  const handleTabChange = useCallback((name: string) => { setSelectedTab(name); }, []);

  const varValues = useMemo(() => {
    const cols = result?.Columns || result?.columns || {};
    const map: Record<string, number> = {};
    solverVarNames.forEach((name, idx) => {
      let val = getColValue(result, name);
      if (val === 0) {
        // 回落：ColumnN 格式（兼容旧版求解器）
        const col = cols[`Column${idx}`];
        if (col) val = (col as { Primal?: number }).Primal ?? 0;
      }
      map[name] = val;
    });
    return map;
  }, [result, solverVarNames]);

  // 机器汇总（按建筑类型聚合，精准/取整两种模式）
  const machineSummary = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return [];
    const byBuilding: Record<string, { buildingId: string; buildingName: string; iconPath: string; count: number }> = {};
    solverActive.forEach((recipe, idx) => {
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      if (machineCount < 1e-6) return;
      const count = showCeilMachines ? Math.ceil(machineCount) : machineCount;
      const bid = recipe.buildingId;
      if (!byBuilding[bid]) {
        byBuilding[bid] = { buildingId: bid, buildingName: recipe.buildingName, iconPath: buildingIcons[bid] || '', count: 0 };
      }
      byBuilding[bid].count += count;
    });
    return Object.values(byBuilding).sort((a, b) => b.count - a.count);
  }, [solverActive, varValues, solverVarNames, buildingIcons, showCeilMachines]);

  // 电力占地面积（始终计算，不受开关影响）
  const powerFootprint = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return 0;
    let area = 0;
    solverActive.forEach((recipe, idx) => {
      if (recipe.module !== 'power') return;
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      area += computeRecipeArea(recipe, machineCount, buildingSizes);
    });
    return area;
  }, [solverActive, varValues, solverVarNames, buildingSizes]);

  // 贸易占地面积（始终计算，不受开关影响）
  const tradeFootprint = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return 0;
    let area = 0;
    solverActive.forEach((recipe, idx) => {
      if (recipe.module !== 'trade') return;
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      area += computeRecipeArea(recipe, machineCount, buildingSizes);
    });
    return area;
  }, [solverActive, varValues, solverVarNames, buildingSizes]);

  // 农业占地面积（始终计算，不受开关影响）
  const agricultureFootprint = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return 0;
    let area = 0;
    solverActive.forEach((recipe, idx) => {
      if (!(recipe.module === 'main' && recipe.category === '农业')) return;
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      area += computeRecipeArea(recipe, machineCount, buildingSizes);
    });
    return area;
  }, [solverActive, varValues, solverVarNames, buildingSizes]);

  // 总占地面积（始终全部累加，不受开关影响）
  const totalFootprint = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return 0;
    let area = 0;
    solverActive.forEach((recipe, idx) => {
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      area += computeRecipeArea(recipe, machineCount, buildingSizes);
    });
    return area;
  }, [solverActive, varValues, solverVarNames, buildingSizes]);

  const gameData = useStore(s => s.gameData);
  const edictLevels = useStore(s => s.edictLevels);

  // 计算 maintenance reduction（与 buildActiveRecipes 一致）
  const reductionFactor = useMemo(() => {
    let reduction = getMaintenanceReduction(statueCount);
    if (gameData) {
      const edictReduce = gameData.edicts.find(e => e.name === '减少维护');
      if (edictReduce) {
        const lvl = edictLevels[gameData.edicts.indexOf(edictReduce)] ?? -1;
        if (lvl >= 0) {
          reduction += edictReduce.effectPerLevel[lvl];
        }
      }
      reduction = Math.min(reduction, 1);
    }
    return reduction;
  }, [statueCount, gameData, edictLevels]);

  const recipeData = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return [];
    return solverActive.map((recipe, idx) => {
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      if (machineCount < 1e-6) return null;
      const perMin = computeRecipePerMin(recipe, machineCount, reductionFactor, integerMode === 'ceil');
      return { recipe, machineCount, perMin, idx, varName };
    }).filter(Boolean) as { recipe: Recipe; machineCount: number; perMin: any; idx: number; varName: string }[];
  }, [solverActive, varValues, reductionFactor]);

  const recipeSearchResults = useMemo(() => {
    if (!recipeSearch) return { producing: [] as typeof recipeData, consuming: [] as typeof recipeData };
    const s = recipeSearch.toLowerCase();
    const active = recipeData.filter(d => d.machineCount > 0);
    const producing = active.filter(d => {
      if (t(d.recipe.buildingName, translation).toLowerCase().includes(s)) return true;
      if (Object.keys(d.perMin.outputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
      return false;
    });
    const consuming = active.filter(d => {
      if (t(d.recipe.buildingName, translation).toLowerCase().includes(s)) return true;
      if (Object.keys(d.perMin.inputs).some(k => t(k, translation).toLowerCase().includes(s))) return true;
      if (d.perMin.upkeep && Object.keys(d.perMin.upkeep).some(k => t(k, translation).toLowerCase().includes(s))) return true;
      return false;
    });
    return { producing, consuming };
  }, [recipeSearch, recipeData, translation]);

  const labCohesionTotal = useMemo(() => {
    if (!recipeData.length) return 0;
    return recipeData
      .filter(item => item.recipe.isLab)
      .reduce((sum, item) => sum + (item.recipe.researchCohesion || 0) * item.machineCount, 0);
  }, [recipeData]);

  const embeddedValues = useMemo(() => {
    if (!recipeData.length) return null;
    return computeEmbeddedValues(recipeData);
  }, [recipeData]);

  const categoryData = useMemo(() => {
    const mainCategories: Record<string, { recipes: typeof recipeData; prod: Record<string, number>; cons: Record<string, number>; workers: number; electricity: number; computing: number; maintI: number; maintII: number; maintIII: number; machineCount: number; actualMachineCount: number }> = {};
    const powerRecipes: typeof recipeData = [];
    const tradeRecipes: typeof recipeData = [];
    const agricultureRecipes: typeof recipeData = [];
    const specialRecipes: typeof recipeData = [];
    const officeRecipes: typeof recipeData = [];
    let officeWorkers = 0;

    for (const item of recipeData) {
      const r = item.recipe;
      const pm = item.perMin;
      if (r.module === 'main' && r.category === '农业') {
        agricultureRecipes.push(item);
      } else if (r.module === 'main' && r.category === '办公室') {
        officeRecipes.push(item);
        officeWorkers += pm.workers;
      } else if (r.module === 'main') {
        const cat = r.category || '其他';
        if (!mainCategories[cat]) mainCategories[cat] = { recipes: [], prod: {}, cons: {}, workers: 0, electricity: 0, computing: 0, maintI: 0, maintII: 0, maintIII: 0, machineCount: 0, actualMachineCount: 0 };
        const catObj = mainCategories[cat];
        catObj.recipes.push(item);
        mergeResources(catObj.prod, pm.outputs);
        mergeResources(catObj.cons, pm.inputs);
        catObj.workers += pm.workers;
        catObj.electricity += pm.electricity;
        catObj.computing += pm.computing;
        catObj.maintI += pm.maintI;
        catObj.maintII += pm.maintII;
        catObj.maintIII += pm.maintIII;
        catObj.machineCount += item.machineCount;
        catObj.actualMachineCount += pm.machineCount;
      } else if (r.module === 'power') powerRecipes.push(item);
      else if (r.module === 'trade') tradeRecipes.push(item);
      else if (r.module === 'resident' || r.module === 'station' || r.module === 'special') specialRecipes.push(item);
    }

    // 农业模块汇总
    let agriProd: Record<string, number> = {}, agriCons: Record<string, number> = {}, agriWorkers=0, agriElectricity=0, agriComputing=0, agriMaintI=0, agriMaintII=0, agriMaintIII=0, agriMachineCount=0, agriActualMachineCount=0;
    for (const item of agricultureRecipes) {
      const pm = item.perMin;
      mergeResources(agriProd, pm.outputs);
      mergeResources(agriCons, pm.inputs);
      agriWorkers += pm.workers; agriElectricity += pm.electricity; agriComputing += pm.computing;
      agriMaintI += pm.maintI; agriMaintII += pm.maintII; agriMaintIII += pm.maintIII;
      agriMachineCount += item.machineCount;
      agriActualMachineCount += pm.machineCount;
    }

    let powerProd = {}, powerCons = {}, powerWorkers=0, powerElectricity=0, powerComputing=0, powerMaintI=0, powerMaintII=0, powerMaintIII=0, powerMachineCount=0, powerActualMachineCount=0;
    for (const item of powerRecipes) {
      const pm = item.perMin;
      mergeResources(powerProd, pm.outputs);
      mergeResources(powerCons, pm.inputs);
      powerWorkers += pm.workers; powerElectricity += pm.electricity; powerComputing += pm.computing;
      powerMaintI += pm.maintI; powerMaintII += pm.maintII; powerMaintIII += pm.maintIII;
      powerMachineCount += item.machineCount;
      powerActualMachineCount += pm.machineCount;
    }
    let tradeProd = {}, tradeCons = {}, tradeWorkers=0, tradeElectricity=0, tradeComputing=0, tradeMaintI=0, tradeMaintII=0, tradeMaintIII=0, tradeMachineCount=0, tradeActualMachineCount=0;
    for (const item of tradeRecipes) {
      const pm = item.perMin;
      mergeResources(tradeProd, pm.outputs);
      mergeResources(tradeCons, pm.inputs);
      tradeWorkers += pm.workers; tradeElectricity += pm.electricity; tradeComputing += pm.computing;
      tradeMaintI += pm.maintI; tradeMaintII += pm.maintII; tradeMaintIII += pm.maintIII;
      tradeMachineCount += item.machineCount;
      tradeActualMachineCount += pm.machineCount;
    }
    // 合并办公室配方到特殊模块
    const allSpecialRecipes = [...specialRecipes, ...officeRecipes];
    let specialProd = {}, specialCons = {}, specialWorkers=0, specialElectricity=0, specialComputing=0, specialMaintI=0, specialMaintII=0, specialMaintIII=0, specialMachineCount=0, specialActualMachineCount=0;
    for (const item of allSpecialRecipes) {
      const pm = item.perMin;
      mergeResources(specialProd, pm.outputs);
      mergeResources(specialCons, pm.inputs);
      specialWorkers += pm.workers; specialElectricity += pm.electricity; specialComputing += pm.computing;
      specialMaintI += pm.maintI; specialMaintII += pm.maintII; specialMaintIII += pm.maintIII;
      specialMachineCount += item.machineCount;
      specialActualMachineCount += pm.machineCount;
    }

    const allProd = {}, allCons = {};
    let allWorkers=0, allElectricity=0, allComputing=0, allMaintI=0, allMaintII=0, allMaintIII=0, allMachineCount=0, allActualMachineCount=0;
    const allCategories = [...Object.values(mainCategories),
      { prod: agriProd, cons: agriCons, workers: agriWorkers, electricity: agriElectricity, computing: agriComputing, maintI: agriMaintI, maintII: agriMaintII, maintIII: agriMaintIII, machineCount: agriMachineCount, actualMachineCount: agriActualMachineCount },
      { prod: powerProd, cons: powerCons, workers: powerWorkers, electricity: powerElectricity, computing: powerComputing, maintI: powerMaintI, maintII: powerMaintII, maintIII: powerMaintIII, machineCount: powerMachineCount, actualMachineCount: powerActualMachineCount },
      { prod: tradeProd, cons: tradeCons, workers: tradeWorkers, electricity: tradeElectricity, computing: tradeComputing, maintI: tradeMaintI, maintII: tradeMaintII, maintIII: tradeMaintIII, machineCount: tradeMachineCount, actualMachineCount: tradeActualMachineCount },
      { prod: specialProd, cons: specialCons, workers: specialWorkers, electricity: specialElectricity, computing: specialComputing, maintI: specialMaintI, maintII: specialMaintII, maintIII: specialMaintIII, machineCount: specialMachineCount, actualMachineCount: specialActualMachineCount }];
    for (const cat of allCategories) {
      mergeResources(allProd, cat.prod);
      mergeResources(allCons, cat.cons);
      allWorkers += cat.workers; allElectricity += cat.electricity; allComputing += cat.computing;
      allMaintI += cat.maintI; allMaintII += cat.maintII; allMaintIII += cat.maintIII;
      allMachineCount += cat.machineCount;
      allActualMachineCount += cat.actualMachineCount || 0;
    }

    return {
      mainCategories,
      agriculture: { recipes: agricultureRecipes, prod: agriProd, cons: agriCons, workers: agriWorkers, electricity: agriElectricity, computing: agriComputing, maintI: agriMaintI, maintII: agriMaintII, maintIII: agriMaintIII, machineCount: agriMachineCount, actualMachineCount: agriActualMachineCount },
      power: { recipes: powerRecipes, prod: powerProd, cons: powerCons, workers: powerWorkers, electricity: powerElectricity, computing: powerComputing, maintI: powerMaintI, maintII: powerMaintII, maintIII: powerMaintIII, machineCount: powerMachineCount, actualMachineCount: powerActualMachineCount },
      trade: { recipes: tradeRecipes, prod: tradeProd, cons: tradeCons, workers: tradeWorkers, electricity: tradeElectricity, computing: tradeComputing, maintI: tradeMaintI, maintII: tradeMaintII, maintIII: tradeMaintIII, machineCount: tradeMachineCount, actualMachineCount: tradeActualMachineCount },
      special: { recipes: allSpecialRecipes, prod: specialProd, cons: specialCons, workers: specialWorkers, electricity: specialElectricity, computing: specialComputing, maintI: specialMaintI, maintII: specialMaintII, maintIII: specialMaintIII, machineCount: specialMachineCount, actualMachineCount: specialActualMachineCount },
      all: { prod: allProd, cons: allCons, workers: allWorkers, electricity: allElectricity, computing: allComputing, maintI: allMaintI, maintII: allMaintII, maintIII: allMaintIII, machineCount: allMachineCount, actualMachineCount: allActualMachineCount },
      officeWorkers,
    };
  }, [recipeData]);

  // 搜索匹配的物品在全厂的总产出/总消耗
  const searchItemTotals = useMemo(() => {
    if (!recipeSearch || !categoryData.all) return [];
    const s = recipeSearch.toLowerCase();
    const matchedItems = new Set<string>();
    const active = recipeData.filter(d => d.machineCount > 0);
    for (const d of active) {
      for (const k of Object.keys(d.perMin.outputs)) {
        if (t(k, translation).toLowerCase().includes(s)) matchedItems.add(k);
      }
      for (const k of Object.keys(d.perMin.inputs)) {
        if (t(k, translation).toLowerCase().includes(s)) matchedItems.add(k);
      }
      if (d.perMin.upkeep) {
        for (const k of Object.keys(d.perMin.upkeep as Record<string, number>)) {
          if (t(k, translation).toLowerCase().includes(s)) matchedItems.add(k);
        }
      }
    }
    const result: { item: string; prod: number; cons: number }[] = [];
    const allProd = categoryData.all.prod as Record<string, number>;
    const allCons = categoryData.all.cons as Record<string, number>;
    for (const item of matchedItems) {
      const prod = allProd[item] || 0;
      const cons = allCons[item] || 0;
      if (Math.abs(prod) > 1e-9 || Math.abs(cons) > 1e-9) {
        result.push({ item, prod, cons });
      }
    }
    result.sort((a, b) => (b.prod - b.cons) - (a.prod - a.cons));
    return result;
  }, [recipeSearch, recipeData, categoryData.all, translation]);

  const tabNames = useMemo(() => {
    const mainTabs = Object.keys(categoryData.mainCategories).sort();
    return ['全厂总览','🔍 配方搜索', ...mainTabs, '电力模块', '贸易模块', '农业模块', '特殊模块', '💰 潜在价值'];
  }, [categoryData.mainCategories]);

  const currentData = useMemo(() => {
    if (selectedTab === '全厂总览') return { type: 'overview', ...categoryData.all };
    if (selectedTab === '🔍 配方搜索') return { type: 'recipeSearch', ...recipeSearchResults };
    if (selectedTab === '电力模块') return { type: 'power', ...categoryData.power };
    if (selectedTab === '贸易模块') return { type: 'trade', ...categoryData.trade };
    if (selectedTab === '农业模块') return { type: 'agriculture', ...categoryData.agriculture };
    if (selectedTab === '特殊模块') return { type: 'special', ...categoryData.special };
    if (selectedTab === '💰 潜在价值') return { type: 'embeddedValues' };
    const cat = categoryData.mainCategories[selectedTab];
    return cat ? { type: 'category', ...cat } : null;
  }, [selectedTab, categoryData]);

  const moduleRows = useMemo(() => {
    const rows: any[] = [];
    const catArea = (recipes: typeof recipeData) => recipes.reduce((s, r) => s + computeRecipeArea(r.recipe, r.machineCount, buildingSizes), 0);
    for (const [name, cat] of Object.entries(categoryData.mainCategories)) {
      const p = cat.prod as Record<string, number>;
      const c = cat.cons as Record<string, number>;
      const prodElec = p['electricity'] || 0, consElec = c['electricity'] || 0;
      const netElectricity = prodElec - consElec;
      const totalMaintenance = cat.maintI + cat.maintII + cat.maintIII;
      const allItems = new Set([...Object.keys(p), ...Object.keys(c)]);
      const netMap: Record<string, number> = {};
      for (const item of allItems) {
        const prod = p[item] || 0, cons = c[item] || 0, net = prod - cons;
        if (Math.abs(net) > 1e-6) netMap[item] = net;
      }
      const netProds = Object.entries(netMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net }));
      const netCons = Object.entries(netMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net }));
      rows.push({ name, machineCount: cat.machineCount, actualMachineCount: cat.actualMachineCount || 0, workers: cat.workers, netElectricity, computing: cat.computing, totalMaintenance, footprint: catArea(cat.recipes || []), netProds, netCons });
    }
    // 电力模块
    const pp = categoryData.power.prod as Record<string, number>;
    const pc = categoryData.power.cons as Record<string, number>;
    const powerNetElec = (pp['electricity'] || 0) - (pc['electricity'] || 0);
    const powerAllItems = new Set([...Object.keys(pp), ...Object.keys(pc)]);
    const powerNetMap: Record<string, number> = {};
    for (const item of powerAllItems) {
      const prod = pp[item] || 0, cons = pc[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) powerNetMap[item] = net;
    }
    rows.push({
      name: '电力模块', machineCount: categoryData.power.machineCount, actualMachineCount: categoryData.power.actualMachineCount, workers: categoryData.power.workers,
      netElectricity: powerNetElec, computing: categoryData.power.computing,
      totalMaintenance: categoryData.power.maintI + categoryData.power.maintII + categoryData.power.maintIII,
      footprint: catArea(categoryData.power.recipes || []),
      netProds: Object.entries(powerNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(powerNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    // 贸易模块
    const tp = categoryData.trade.prod as Record<string, number>;
    const tc = categoryData.trade.cons as Record<string, number>;
    const tradeNetElec = (tp['electricity'] || 0) - (tc['electricity'] || 0);
    const tradeAllItems = new Set([...Object.keys(tp), ...Object.keys(tc)]);
    const tradeNetMap: Record<string, number> = {};
    for (const item of tradeAllItems) {
      const prod = tp[item] || 0, cons = tc[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) tradeNetMap[item] = net;
    }
    rows.push({
      name: '贸易模块', machineCount: categoryData.trade.machineCount, actualMachineCount: categoryData.trade.actualMachineCount, workers: categoryData.trade.workers,
      netElectricity: tradeNetElec, computing: categoryData.trade.computing,
      totalMaintenance: categoryData.trade.maintI + categoryData.trade.maintII + categoryData.trade.maintIII,
      footprint: catArea(categoryData.trade.recipes || []),
      netProds: Object.entries(tradeNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(tradeNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    // 农业模块
    const ap = categoryData.agriculture.prod as Record<string, number>;
    const ac = categoryData.agriculture.cons as Record<string, number>;
    const agriNetElec = (ap['electricity'] || 0) - (ac['electricity'] || 0);
    const agriAllItems = new Set([...Object.keys(ap), ...Object.keys(ac)]);
    const agriNetMap: Record<string, number> = {};
    for (const item of agriAllItems) {
      const prod = ap[item] || 0, cons = ac[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) agriNetMap[item] = net;
    }
    rows.push({
      name: '农业模块', machineCount: categoryData.agriculture.machineCount, actualMachineCount: categoryData.agriculture.actualMachineCount, workers: categoryData.agriculture.workers,
      netElectricity: agriNetElec, computing: categoryData.agriculture.computing,
      totalMaintenance: categoryData.agriculture.maintI + categoryData.agriculture.maintII + categoryData.agriculture.maintIII,
      footprint: catArea(categoryData.agriculture.recipes || []),
      netProds: Object.entries(agriNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(agriNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    // 特殊模块
    const sp = categoryData.special.prod as Record<string, number>;
    const sc = categoryData.special.cons as Record<string, number>;
    const specialNetElec = (sp['electricity'] || 0) - (sc['electricity'] || 0);
    const specialAllItems = new Set([...Object.keys(sp), ...Object.keys(sc)]);
    const specialNetMap: Record<string, number> = {};
    for (const item of specialAllItems) {
      const prod = sp[item] || 0, cons = sc[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) specialNetMap[item] = net;
    }
    rows.push({
      name: '特殊模块', machineCount: categoryData.special.machineCount, actualMachineCount: categoryData.special.actualMachineCount, workers: categoryData.special.workers,
      netElectricity: specialNetElec, computing: categoryData.special.computing,
      totalMaintenance: categoryData.special.maintI + categoryData.special.maintII + categoryData.special.maintIII,
      footprint: catArea(categoryData.special.recipes || []),
      netProds: Object.entries(specialNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(specialNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    return rows;
  }, [categoryData, buildingSizes]);

  if (!result && !isSolving && !diagnostic) return null;
  const resultStatus = result?.Status ?? result?.status;

  return (
    <div className="results-container">
      <style>{`
        .results-container { font-size: 1.1rem; }
        .table-wrapper { overflow: visible; }
        .split-column .data-table { table-layout: fixed; }
        .data-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
        .data-table thead th { position: sticky; top: 0; z-index: 5; background: #f5f5f5; }
        .data-table th { padding: 4px 6px; text-align: left; border-bottom: 2px solid #ddd; background: #f5f5f5; font-weight: 600; white-space: normal; }
        .data-table td { padding: 4px 6px; text-align: left; border-bottom: 1px solid #eee; }
        .recipe-name-cell { max-width: 8em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-narrow { white-space: normal; }
        .col-wide { white-space: normal; overflow-wrap: break-word; }
        .col-wide-num { white-space: nowrap; }
        .positive-value { color: #2e7d32; font-weight: bold; }
        .negative-value { color: #c62828; font-weight: bold; }
        .split-summary { display: flex; gap: 12px; }
        .split-column { flex: 1; min-width: 0; }
        .module-row { border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 16px; background: #fff; transition: box-shadow 0.2s; }
        .module-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .module-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px; cursor: pointer; font-size: 1rem; }
        .module-name { font-weight: bold; font-size: 1.2rem; }
        .module-stats { font-size: 0.95rem; color: #555; }
        .expand-icon { font-size: 1.2rem; font-weight: bold; background: #f0f0f0; padding: 4px 10px; border-radius: 20px; user-select: none; }
        .module-details { display: flex; gap: 24px; flex-wrap: wrap; padding: 12px; border-top: 1px solid #eee; }
        .module-prods, .module-cons { flex: 1; min-width: 200px; font-size: 0.95rem; }
        .module-prods strong, .module-cons strong { display: block; margin-bottom: 8px; }
        .net-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, auto)); gap: 4px 12px; }
        .net-prod, .net-cons { white-space: nowrap; }
        .tab-bar { display: flex; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #ccc; margin-bottom: 20px; padding-bottom: 8px; }
        .tab-button { padding: 8px 16px; border: none; background: #f5f5f5; border-radius: 20px; cursor: pointer; font-size: 1rem; transition: all 0.2s; }
        .tab-button.active { background: #2563eb; color: white; }
        .results-layout { display: flex; gap: 16px; max-height: 75vh; }
        .summary-panel { width: 320px; flex-shrink: 0; overflow-y: auto; }
        .detail-panel { flex: 1; min-width: 400px; overflow-y: auto; }
        .hint { color: #666; font-size: 0.9rem; }
        .stat { background: #e8f0fe; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 1rem; }
        .btn { padding: 6px 12px; font-size: 1rem; }
        .summary-name-cell { max-width: 90px; }
        .summary-name-cell span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>

      {isSolving && <div>🔄 求解中...</div>}
      {diagnostic && <div style={{ background: '#fff3cd', padding: 8, whiteSpace: 'pre-wrap', fontSize: 13 }} dangerouslySetInnerHTML={{ __html: diagnostic }} />}
      {result && isMipSuccess(resultStatus) && (
        <>
          <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <Btn onClick={() => setShowTinyErrors(!showTinyErrors)} variant={showTinyErrors ? 'primary' : 'default'}>
              {showTinyErrors ? '🔍 隐藏微小误差' : '🔍 显示微小误差'}
            </Btn>
            <Btn onClick={() => setShowFullStats(!showFullStats)} variant={showFullStats ? 'primary' : 'default'}>
              {showFullStats ? '📊 隐藏完整数值' : '📊 显示完整数值'}
            </Btn>
            <Btn onClick={() => setUseReferenceSizes(!useReferenceSizes)} variant={useReferenceSizes ? 'primary' : 'default'}>
              {useReferenceSizes ? '📐 参考尺寸' : '📐 理论尺寸'}
            </Btn>
          </div>
          <div className="stat">
            ✅ 理论总机器数: <b>{categoryData.all.machineCount.toFixed(2)}</b> | 实际总机器数: <b>{categoryData.all.actualMachineCount.toFixed(2)}</b> | 总人力: <b>{categoryData.all.workers.toFixed(2)}</b> | 净电力: <b>{formatPowerSigned(((categoryData.all.prod as Record<string, number>)['electricity'] || 0) - ((categoryData.all.cons as Record<string, number>)['electricity'] || 0))}</b> | 总占地面积: <b title={totalFootprint.toFixed(1) + ' 小格'}>{formatFootprint(totalFootprint)}</b> | 不含电力贸易农业: <b title={(totalFootprint - powerFootprint - tradeFootprint - agricultureFootprint).toFixed(1) + ' 小格'}>{formatFootprint(totalFootprint - powerFootprint - tradeFootprint - agricultureFootprint)}</b> | 电力占地: <b title={powerFootprint.toFixed(1) + ' 小格'}>{formatFootprint(powerFootprint)}</b> | 贸易占地: <b title={tradeFootprint.toFixed(1) + ' 小格'}>{formatFootprint(tradeFootprint)}</b> | 农业占地: <b title={agricultureFootprint.toFixed(1) + ' 小格'}>{formatFootprint(agricultureFootprint)}</b><br/>
            🎯 凝聚力产量: 居民 <b>{residentUnity.toFixed(2)}</b> | 空间站 <b>{stationUnity.toFixed(2)}</b>  | 总计 <b>{unityProduction.toFixed(2)}</b><br/>
            📉 凝聚力消耗: 贸易直接: <b>{cohesionTradeDirect.toFixed(2)}</b> | 贸易维持: <b>{cohesionTradeMaintenance.toFixed(2)}</b> | 法令: <b>{cohesionEdict.toFixed(2)}</b> | 研究: <b>{labCohesionTotal.toFixed(2)}</b> | 总计: <b>{(cohesionTradeDirect + cohesionTradeMaintenance + cohesionEdict + labCohesionTotal).toFixed(2)}</b><br/>
            净凝聚力: <b>{(unityProduction - (cohesionTradeDirect + cohesionTradeMaintenance + cohesionEdict + labCohesionTotal)).toFixed(2)}</b>
          </div>

          <div className="tab-bar">
            {tabNames.map(name => (
              <button key={name} onClick={() => handleTabChange(name)} className={`tab-button ${selectedTab === name ? 'active' : ''}`}>
                {t(name, translation)}
              </button>
            ))}
          </div>

          {selectedTab === '🔍 配方搜索' ? (
            <div className="recipe-search-panel">
              <input
                type="text"
                placeholder="搜索配方名、建筑名、产出物或消耗物..."
                value={recipeSearch}
                onChange={e => setRecipeSearch(e.target.value)}
                style={{ padding: '10px 16px', fontSize: '1rem', borderRadius: 8, border: '1px solid #ccc', width: '100%', marginBottom: 16 }}
              />
              {recipeSearch && searchItemTotals.length > 0 && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0f4ff', borderRadius: 8, border: '1px solid #c8d6e5' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.95rem' }}>
                    📊 匹配物品的全厂总计
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.85rem' }}>
                    {searchItemTotals.map(e => {
                      const net = e.prod - e.cons;
                      return (
                        <span key={e.item} style={{ whiteSpace: 'nowrap' }}>
                          {t(e.item, translation)}:
                          <span style={{ color: '#2e7d32', fontWeight: 600 }}> +{e.prod.toFixed(4)}</span>
                          {' / '}
                          <span style={{ color: '#c62828', fontWeight: 600 }}> {(-e.cons).toFixed(4)}</span>
                          {' → 净额 '}
                          <span style={{ fontWeight: 600, color: net >= 0 ? '#2e7d32' : '#c62828' }}>
                            {net >= 0 ? '+' : ''}{net.toFixed(4)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {!recipeSearch ? (
                <div className="hint">输入关键词搜索当前结果中启用的配方</div>
              ) : recipeSearchResults.producing.length === 0 && recipeSearchResults.consuming.length === 0 ? (
                <div className="hint">未找到相关配方</div>
              ) : (
                <div style={{ display: 'flex', gap: 16, height: '65vh' }}>
                  {/* 左栏：产出匹配 */}
                  <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#2e7d32' }}>📤 产出匹配 ({recipeSearchResults.producing.length})</h4>
                    {recipeSearchResults.producing.length === 0 ? (
                      <div className="hint">无匹配</div>
                    ) : (
                      recipeSearchResults.producing.map(d => {
                        const s = recipeSearch.toLowerCase();
                        const outEntries = Object.entries(d.perMin.outputs) as [string, number][];
                        const inEntries = Object.entries(d.perMin.inputs) as [string, number][];
                        const upEntries = d.perMin.upkeep ? Object.entries(d.perMin.upkeep as Record<string, number>) : [];
                        return (
                          <div key={`prod-${d.idx}`} style={{ padding: '10px 12px', marginBottom: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{t(d.recipe.name, translation)}</div>
                            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 6 }}>
                              🏭 {t(d.recipe.buildingName, translation)} · ⚙ {d.machineCount.toFixed(3)} 台
                              {d.perMin.workers ? <span> · 👷 {d.perMin.workers.toFixed(1)}</span> : null}
                              {d.perMin.electricity ? <span> · ⚡ {formatPowerSigned(d.perMin.electricity)}</span> : null}
                              {d.perMin.computing ? <span> · 💻 {d.perMin.computing}</span> : null}
                            </div>
                            {outEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                                <span style={{ color: '#2e7d32', fontWeight: 600 }}>📤 产出: </span>
                                {outEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#a5d6a7' : '#e8f5e9',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                            {inEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                                <span style={{ color: '#c62828', fontWeight: 600 }}>📥 投入: </span>
                                {inEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#ef9a9a' : '#fce4ec',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                            {upEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem' }}>
                                <span style={{ color: '#e65100', fontWeight: 600 }}>🔧 维护: </span>
                                {upEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#ffcc80' : '#fff3e0',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* 右栏：消耗匹配 */}
                  <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12 }}>
                    <h4 style={{ margin: '0 0 8px 0', color: '#c62828' }}>📥 消耗匹配 ({recipeSearchResults.consuming.length})</h4>
                    {recipeSearchResults.consuming.length === 0 ? (
                      <div className="hint">无匹配</div>
                    ) : (
                      recipeSearchResults.consuming.map(d => {
                        const s = recipeSearch.toLowerCase();
                        const isBuildingMatch = t(d.recipe.buildingName, translation).toLowerCase().includes(s);
                        const outEntries = Object.entries(d.perMin.outputs) as [string, number][];
                        const inEntries = Object.entries(d.perMin.inputs) as [string, number][];
                        const upEntries = d.perMin.upkeep ? Object.entries(d.perMin.upkeep as Record<string, number>) : [];
                        return (
                          <div key={`cons-${d.idx}`} style={{ padding: '10px 12px', marginBottom: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{t(d.recipe.name, translation)}</div>
                            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: 6 }}>
                              🏭 {t(d.recipe.buildingName, translation)} · ⚙ {d.machineCount.toFixed(3)} 台
                              {d.perMin.workers ? <span> · 👷 {d.perMin.workers.toFixed(1)}</span> : null}
                              {d.perMin.electricity ? <span> · ⚡ {formatPowerSigned(d.perMin.electricity)}</span> : null}
                              {d.perMin.computing ? <span> · 💻 {d.perMin.computing}</span> : null}
                            </div>
                            {outEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                                <span style={{ color: '#2e7d32', fontWeight: 600 }}>📤 产出: </span>
                                {outEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#a5d6a7' : '#e8f5e9',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                            {inEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                                <span style={{ color: '#c62828', fontWeight: 600 }}>📥 投入: </span>
                                {inEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#ef9a9a' : '#fce4ec',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                            {upEntries.length > 0 && (
                              <div style={{ fontSize: '0.8rem' }}>
                                <span style={{ color: '#e65100', fontWeight: 600 }}>🔧 维护: </span>
                                {upEntries.map(([k, v]) => {
                                  const hl = t(k, translation).toLowerCase().includes(s);
                                  return <span key={k} style={{
                                    marginRight: 6, padding: '1px 5px', borderRadius: 3, fontSize: '0.78rem',
                                    background: hl ? '#ffcc80' : '#fff3e0',
                                    fontWeight: hl ? 700 : 400,
                                  }}>{t(k, translation)} × {v.toFixed(2)}</span>;
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : selectedTab === '💰 潜在价值' ? (
            <div className="embedded-values-panel">
              <h4>💰 {t('潜在价值', translation)}</h4>
              <p className="hint" style={{ marginBottom: 16 }}>
                {t('人力潜在价值', translation)} = 每生产1单位该物品所需的总人力（人力=1.0为计价单位）<br/>
                {t('凝聚力潜在价值', translation)} = 每生产1单位该物品在贸易中消耗的总凝聚力（负值=消耗，已×1000）
              </p>
              {embeddedValues && embeddedValues.labor.size > 0 ? (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('物品', translation)}</th>
                        <th>{t('人力潜在价值/单位', translation)}</th>
                        <th>{t('凝聚力潜在价值/单位', translation)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Collect and sort: items with non-trivial embedded values
                        const allItems = new Set<string>();
                        for (const k of embeddedValues.labor.keys()) allItems.add(k);
                        for (const k of embeddedValues.cohesion.keys()) allItems.add(k);
                        const entries = Array.from(allItems)
                          .map(item => ({
                            item,
                            labor: embeddedValues.labor.get(item) || 0,
                            cohesion: embeddedValues.cohesion.get(item) || 0,
                          }))
                          .filter(e => Math.abs(e.labor) > 1e-9 || Math.abs(e.cohesion) > 1e-9)
                          .sort((a, b) => b.labor - a.labor);
                        if (entries.length === 0) {
                          return <tr><td colSpan={3} className="hint">{t('无数据（请先求解）', translation)}</td></tr>;
                        }
                        return entries.map(e => (
                          <tr key={e.item}>
                            <td>{t(e.item, translation)}</td>
                            <td>{e.labor.toFixed(4)}</td>
                            <td className={e.cohesion < -1e-9 ? 'negative-value' : (e.cohesion > 1e-9 ? 'positive-value' : '')}>
                              {(e.cohesion * 1000).toFixed(4)}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="hint">{t('无数据（请先求解）', translation)}</div>
              )}
            </div>
          ) : (
          (() => {
            const isOverview = selectedTab === '全厂总览';
            const officeWorkers = categoryData.officeWorkers || 0;
            const netWorkers = -(categoryData.all.workers - officeWorkers);
            return (
          <>
          <div className="results-layout">
            <div className="summary-panel">
              <h4>{t('资源平衡', translation)}</h4>
              {currentData && <SummaryTable data={{ prod: (currentData as any).prod || {}, cons: (currentData as any).cons || {} }} showTinyErrors={showTinyErrors} translation={translation} splitMode={!isOverview} netWorkers={netWorkers} showLaborRow={isOverview} onItemClick={(item) => setItemDetailItem(item)} />}
            </div>
            <div className="detail-panel">
              {selectedTab === '全厂总览' ? (
                <>
                  <h4>{t('全厂模块总览', translation)}</h4>
                  {moduleRows.map(row => <ModuleRow key={row.name} {...row} onClick={() => handleTabChange(row.name)} translation={translation} />)}
                </>
              ) : (
                <>
                  <h4>{t('配方列表', translation)}</h4>
                  {currentData && (currentData as any).recipes && (currentData as any).recipes.length > 0 ? (
                    <RecipeList recipes={(currentData as any).recipes.map((item: any) => ({ recipe: item.recipe, count: item.machineCount, perMin: item.perMin }))} translation={translation} buildingSizes={buildingSizes} showFullStats={showFullStats} onItemClick={(item) => setItemDetailItem(item)} />
                  ) : <div className="hint">{t('无配方数据', translation)}</div>}
                </>
              )}
            </div>
          </div>
          {isOverview && machineSummary.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>{t('机器数量汇总', translation)}</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <span style={{ color: showCeilMachines ? '#888' : '#333', fontWeight: showCeilMachines ? 'normal' : 'bold' }}>精准显示</span>
                  <span style={{
                    display: 'inline-block', width: 40, height: 22, borderRadius: 11,
                    background: showCeilMachines ? '#4a9eff' : '#ccc', position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }} onClick={() => setShowCeilMachines(!showCeilMachines)}>
                    <span style={{
                      position: 'absolute', top: 2, left: showCeilMachines ? 20 : 2,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                    }} />
                  </span>
                  <span style={{ color: showCeilMachines ? '#333' : '#888', fontWeight: showCeilMachines ? 'bold' : 'normal' }}>取整结果</span>
                </label>
                <span className="hint" style={{ flex: 1, textAlign: 'right' }}>
                  总计: <b>{machineSummary.reduce((s, m) => s + m.count, 0).toFixed(showCeilMachines ? 0 : 2)}</b> 台
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {machineSummary.map(m => (
                  <div key={m.buildingId} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    background: '#f8f9fa', borderRadius: 6, border: '1px solid #e8e8e8'
                  }}>
                    {m.iconPath ? <img src={m.iconPath} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> :
                     <span style={{ width: 32, height: 32, display: 'inline-block' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t(m.buildingName, translation)}
                      </div>
                      <div style={{ fontSize: 13, color: '#555' }}>
                        {showCeilMachines ? m.count.toFixed(0) : m.count.toFixed(2)} 台
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        占地: {(() => {
                          const key = m.buildingName?.toLowerCase?.() || '';
                          const size = buildingSizes[key];
                          if (!size) return '—';
                          const area = size.width * size.height * m.count;
                          return <span title={area.toFixed(1) + ' 小格'}>{formatFootprint(area)}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          ); })()
          )}
        </>
      )}
      {result && !isMipSuccess(resultStatus) && <div>❌ 状态: {resultStatus || '未知'}</div>}
      <ItemDetailModal open={!!itemDetailItem} initialItem={itemDetailItem} onClose={() => setItemDetailItem(undefined)} />
    </div>
  );
}