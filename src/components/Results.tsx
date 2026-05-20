import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { Btn } from './UI';
import { t, getMaintenanceReduction } from '../utils';
import { Recipe } from '../types';

// 判断物品是否为持续类型（不缩放）
const isContinuous = (item: string): boolean => {
  return item === 'electricity' || item === 'computing' || item === '人力' || item === 'mechanical power';
};

function computeRecipePerMin(recipe: Recipe, machineCount: number, reductionFactor: number) {
  // 贸易配方特殊处理（已为每分钟速率）
  if (recipe.module === 'trade') {
    const inputs: Record<string, number> = {};
    const outputs: Record<string, number> = {};
    let cohesion = 0;
    for (const [item, qty] of Object.entries(recipe.inputs)) {
      inputs[item] = qty * machineCount;
    }
    for (const [item, qty] of Object.entries(recipe.outputs)) {
      outputs[item] = qty * machineCount;
    }
    for (const [item, qty] of Object.entries(recipe.upkeep)) {
      if (item === '凝聚力') {
        cohesion = qty * machineCount;
      } else {
        inputs[item] = (inputs[item] || 0) + qty * machineCount;
      }
    }
    return { inputs, outputs, workers: 0, electricity: 0, computing: 0, maintI: 0, maintII: 0, maintIII: 0, machineCount, cohesion };
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
    // upkeep 永远不缩放
    let reducedQty = qty * machineCount;
    if (item.startsWith('maintenance')) {
      reducedQty *= (1 - reductionFactor);
    }
    inputs[item] = (inputs[item] || 0) + reducedQty;
    if (item === 'maintenance i') maintI += reducedQty;
    if (item === 'maintenance ii') maintII += reducedQty;
    if (item === 'maintenance iii') maintIII += reducedQty;
    if (item === 'electricity') electricity += reducedQty;
    if (item === 'computing') computing += reducedQty;
    if (item === '人力') workers += reducedQty;
  }
  return { inputs, outputs, workers, electricity, computing, maintI, maintII, maintIII, machineCount };
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
}> = ({ data, showTinyErrors, translation, splitMode = false }) => {
  const forcedOrder = ['人力', 'electricity', 'computing', 'maintenance i', 'maintenance ii', 'maintenance iii', 'research'];
  const alwaysShow = new Set(forcedOrder);
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
            {finalItems.map(({ item, prod, cons, net }) => (
              <tr key={item}>
                <td>{t(item, translation)}</td>
                <td>{prod.toFixed(2)}</td>
                <td>{cons.toFixed(2)}</td>
                <td className={net < 0 ? 'negative-value' : net > 0 ? 'positive-value' : ''}>{(net >= 0 ? '+' : '') + net.toFixed(4)}</td>
              </tr>
            ))}
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
          <thead><tr><th>{t('净产出 (正)', translation)}</th><th>{t('数量/分', translation)}</th></tr></thead>
          <tbody>
            {positiveItems.map(({ item, net }) => (
              <tr key={item}><td>{t(item, translation)}</td><td className="positive-value">+{net.toFixed(4)}</td></tr>
            ))}
            {Array.from({ length: maxRows - positiveItems.length }).map((_, i) => <tr key={`empty-pos-${i}`}><td colSpan={2}>&nbsp;</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="split-column">
        <table className="data-table">
          <thead><tr><th>{t('净消耗 (负)', translation)}</th><th>{t('数量/分', translation)}</th></tr></thead>
          <tbody>
            {negativeItems.map(({ item, net }) => (
              <tr key={item}><td>{t(item, translation)}</td><td className="negative-value">{net.toFixed(4)}</td></tr>
            ))}
            {Array.from({ length: maxRows - negativeItems.length }).map((_, i) => <tr key={`empty-neg-${i}`}><td colSpan={2}>&nbsp;</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RecipeList: React.FC<{
  recipes: { recipe: Recipe; count: number; perMin: any }[];
  translation: Record<string, string>;
}> = ({ recipes, translation }) => {
  const isTrade = recipes.length > 0 && recipes[0].recipe.module === 'trade';
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('配方', translation)}</th>
            <th>{t('机器数量', translation)}</th>
            <th>{t('人力/分', translation)}</th>
            <th>{t('电力/分', translation)}</th>
            <th>{t('算力/分', translation)}</th>
            <th>{t('维护', translation)}</th>
            {isTrade && <th>{t('凝聚力消耗/分', translation)}</th>}
            <th>{t('投入/分', translation)}</th>
            <th>{t('产出/分', translation)}</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((item, idx) => {
            const r = item.recipe;
            const cnt = item.count;
            const pm = item.perMin;
            const inputs = Object.entries(pm.inputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join(', ') || '无';
            const outputs = Object.entries(pm.outputs).map(([k, v]) => `${t(k, translation)}×${v.toFixed(2)}`).join(', ') || '无';
            const maintParts = [];
            if (pm.maintI > 0) maintParts.push(`M I:${pm.maintI.toFixed(2)}`);
            if (pm.maintII > 0) maintParts.push(`M II:${pm.maintII.toFixed(2)}`);
            if (pm.maintIII > 0) maintParts.push(`M III:${pm.maintIII.toFixed(2)}`);
            const maintStr = maintParts.join(' ') || '-';
            let cohesionConsumption = '';
            if (isTrade) {
              cohesionConsumption = (pm.cohesion || 0).toFixed(4);
            }
            return (
              <tr key={idx}>
                <td>{t(r.name, translation)}</td>
                <td>{cnt.toFixed(4)}</td>
                <td>{pm.workers.toFixed(2)}</td>
                <td>{pm.electricity.toFixed(2)}</td>
                <td>{pm.computing.toFixed(2)}</td>
                <td>{maintStr}</td>
                {isTrade && <td>{cohesionConsumption}</td>}
                <td>{inputs}</td>
                <td>{outputs}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ModuleRow: React.FC<{
  name: string;
  machineCount: number;
  workers: number;
  netElectricity: number;
  computing: number;
  totalMaintenance: number;
  netProds: { item: string; net: number }[];
  netCons: { item: string; net: number }[];
  onClick: () => void;
  translation: Record<string, string>;
}> = ({ name, machineCount, workers, netElectricity, computing, totalMaintenance, netProds, netCons, onClick, translation }) => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpand = () => setExpanded(!expanded);
  return (
    <div className="module-row">
      <div className="module-header" onClick={toggleExpand} style={{ cursor: 'pointer' }}>
        <span className="module-name">{t(name, translation)}</span>
        <span className="module-stats">
          🏭 {t('机器', translation)}: {machineCount.toFixed(2)} &nbsp;|&nbsp;
          👷 {t('人力', translation)}: {workers.toFixed(2)} &nbsp;|&nbsp;
          ⚡ {t('净电力', translation)}: {netElectricity.toFixed(2)} &nbsp;|&nbsp;
          💻 {t('算力', translation)}: {computing.toFixed(2)} &nbsp;|&nbsp;
          🔧 {t('维护总量', translation)}: {totalMaintenance.toFixed(2)}
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
};

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
  const unityConsumption = useStore(s => s.unityConsumption);
  const [selectedTab, setSelectedTab] = useState<string>('全厂总览');

  const varValues = useMemo(() => {
    const cols = result?.Columns || result?.columns || {};
    const map: Record<string, number> = {};
    solverVarNames.forEach((name, idx) => {
      let val = 0;
      if (cols[name]?.Primal !== undefined) val = cols[name].Primal;
      else if (cols[name]?.primal !== undefined) val = cols[name].primal;
      else if (cols[`Column${idx}`]?.Primal !== undefined) val = cols[`Column${idx}`].Primal;
      map[name] = val;
    });
    return map;
  }, [result, solverVarNames]);

  const reductionFactor = getMaintenanceReduction(statueCount);
  const recipeData = useMemo(() => {
    if (!solverActive.length || !Object.keys(varValues).length) return [];
    return solverActive.map((recipe, idx) => {
      const varName = solverVarNames[idx];
      const machineCount = varValues[varName] || 0;
      if (machineCount < 1e-6) return null;
      const perMin = computeRecipePerMin(recipe, machineCount, reductionFactor);
      return { recipe, machineCount, perMin, idx, varName };
    }).filter(Boolean) as { recipe: Recipe; machineCount: number; perMin: any; idx: number; varName: string }[];
  }, [solverActive, varValues, reductionFactor]);

  const categoryData = useMemo(() => {
    const mainCategories: Record<string, { recipes: typeof recipeData; prod: Record<string, number>; cons: Record<string, number>; workers: number; electricity: number; computing: number; maintI: number; maintII: number; maintIII: number; machineCount: number }> = {};
    const powerRecipes: typeof recipeData = [];
    const tradeRecipes: typeof recipeData = [];
    const specialRecipes: typeof recipeData = [];

    for (const item of recipeData) {
      const r = item.recipe;
      const pm = item.perMin;
      if (r.module === 'main') {
        const cat = r.category || '其他';
        if (!mainCategories[cat]) mainCategories[cat] = { recipes: [], prod: {}, cons: {}, workers: 0, electricity: 0, computing: 0, maintI: 0, maintII: 0, maintIII: 0, machineCount: 0 };
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
      } else if (r.module === 'power') powerRecipes.push(item);
      else if (r.module === 'trade') tradeRecipes.push(item);
      else if (r.module === 'resident' || r.module === 'station' || r.module === 'special') specialRecipes.push(item);
    }

    let powerProd = {}, powerCons = {}, powerWorkers=0, powerElectricity=0, powerComputing=0, powerMaintI=0, powerMaintII=0, powerMaintIII=0, powerMachineCount=0;
    for (const item of powerRecipes) {
      const pm = item.perMin;
      mergeResources(powerProd, pm.outputs);
      mergeResources(powerCons, pm.inputs);
      powerWorkers += pm.workers; powerElectricity += pm.electricity; powerComputing += pm.computing;
      powerMaintI += pm.maintI; powerMaintII += pm.maintII; powerMaintIII += pm.maintIII;
      powerMachineCount += item.machineCount;
    }
    let tradeProd = {}, tradeCons = {}, tradeWorkers=0, tradeElectricity=0, tradeComputing=0, tradeMaintI=0, tradeMaintII=0, tradeMaintIII=0, tradeMachineCount=0;
    for (const item of tradeRecipes) {
      const pm = item.perMin;
      mergeResources(tradeProd, pm.outputs);
      mergeResources(tradeCons, pm.inputs);
      tradeWorkers += pm.workers; tradeElectricity += pm.electricity; tradeComputing += pm.computing;
      tradeMaintI += pm.maintI; tradeMaintII += pm.maintII; tradeMaintIII += pm.maintIII;
      tradeMachineCount += item.machineCount;
    }
    let specialProd = {}, specialCons = {}, specialWorkers=0, specialElectricity=0, specialComputing=0, specialMaintI=0, specialMaintII=0, specialMaintIII=0, specialMachineCount=0;
    for (const item of specialRecipes) {
      const pm = item.perMin;
      mergeResources(specialProd, pm.outputs);
      mergeResources(specialCons, pm.inputs);
      specialWorkers += pm.workers; specialElectricity += pm.electricity; specialComputing += pm.computing;
      specialMaintI += pm.maintI; specialMaintII += pm.maintII; specialMaintIII += pm.maintIII;
      specialMachineCount += item.machineCount;
    }

    const allProd = {}, allCons = {};
    let allWorkers=0, allElectricity=0, allComputing=0, allMaintI=0, allMaintII=0, allMaintIII=0, allMachineCount=0;
    const allCategories = [...Object.values(mainCategories), { prod: powerProd, cons: powerCons, workers: powerWorkers, electricity: powerElectricity, computing: powerComputing, maintI: powerMaintI, maintII: powerMaintII, maintIII: powerMaintIII, machineCount: powerMachineCount },
      { prod: tradeProd, cons: tradeCons, workers: tradeWorkers, electricity: tradeElectricity, computing: tradeComputing, maintI: tradeMaintI, maintII: tradeMaintII, maintIII: tradeMaintIII, machineCount: tradeMachineCount },
      { prod: specialProd, cons: specialCons, workers: specialWorkers, electricity: specialElectricity, computing: specialComputing, maintI: specialMaintI, maintII: specialMaintII, maintIII: specialMaintIII, machineCount: specialMachineCount }];
    for (const cat of allCategories) {
      mergeResources(allProd, cat.prod);
      mergeResources(allCons, cat.cons);
      allWorkers += cat.workers; allElectricity += cat.electricity; allComputing += cat.computing;
      allMaintI += cat.maintI; allMaintII += cat.maintII; allMaintIII += cat.maintIII;
      allMachineCount += cat.machineCount;
    }

    return {
      mainCategories,
      power: { recipes: powerRecipes, prod: powerProd, cons: powerCons, workers: powerWorkers, electricity: powerElectricity, computing: powerComputing, maintI: powerMaintI, maintII: powerMaintII, maintIII: powerMaintIII, machineCount: powerMachineCount },
      trade: { recipes: tradeRecipes, prod: tradeProd, cons: tradeCons, workers: tradeWorkers, electricity: tradeElectricity, computing: tradeComputing, maintI: tradeMaintI, maintII: tradeMaintII, maintIII: tradeMaintIII, machineCount: tradeMachineCount },
      special: { recipes: specialRecipes, prod: specialProd, cons: specialCons, workers: specialWorkers, electricity: specialElectricity, computing: specialComputing, maintI: specialMaintI, maintII: specialMaintII, maintIII: specialMaintIII, machineCount: specialMachineCount },
      all: { prod: allProd, cons: allCons, workers: allWorkers, electricity: allElectricity, computing: allComputing, maintI: allMaintI, maintII: allMaintII, maintIII: allMaintIII, machineCount: allMachineCount },
    };
  }, [recipeData]);

  const tabNames = useMemo(() => {
    const mainTabs = Object.keys(categoryData.mainCategories).sort();
    return ['全厂总览', ...mainTabs, '电力模块', '贸易模块', '特殊模块'];
  }, [categoryData.mainCategories]);

  const currentData = useMemo(() => {
    if (selectedTab === '全厂总览') return { type: 'overview', ...categoryData.all };
    if (selectedTab === '电力模块') return { type: 'power', ...categoryData.power };
    if (selectedTab === '贸易模块') return { type: 'trade', ...categoryData.trade };
    if (selectedTab === '特殊模块') return { type: 'special', ...categoryData.special };
    const cat = categoryData.mainCategories[selectedTab];
    return cat ? { type: 'category', ...cat } : null;
  }, [selectedTab, categoryData]);

  const moduleRows = useMemo(() => {
    const rows: any[] = [];
    for (const [name, cat] of Object.entries(categoryData.mainCategories)) {
      const prodElec = cat.prod['electricity'] || 0, consElec = cat.cons['electricity'] || 0;
      const netElectricity = prodElec - consElec;
      const totalMaintenance = cat.maintI + cat.maintII + cat.maintIII;
      const allItems = new Set([...Object.keys(cat.prod), ...Object.keys(cat.cons)]);
      const netMap: Record<string, number> = {};
      for (const item of allItems) {
        const prod = cat.prod[item] || 0, cons = cat.cons[item] || 0, net = prod - cons;
        if (Math.abs(net) > 1e-6) netMap[item] = net;
      }
      const netProds = Object.entries(netMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net }));
      const netCons = Object.entries(netMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net }));
      rows.push({ name, machineCount: cat.machineCount, workers: cat.workers, netElectricity, computing: cat.computing, totalMaintenance, netProds, netCons });
    }
    // 电力模块
    const powerNetElec = (categoryData.power.prod['electricity'] || 0) - (categoryData.power.cons['electricity'] || 0);
    const powerAllItems = new Set([...Object.keys(categoryData.power.prod), ...Object.keys(categoryData.power.cons)]);
    const powerNetMap: Record<string, number> = {};
    for (const item of powerAllItems) {
      const prod = categoryData.power.prod[item] || 0, cons = categoryData.power.cons[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) powerNetMap[item] = net;
    }
    rows.push({
      name: '电力模块', machineCount: categoryData.power.machineCount, workers: categoryData.power.workers,
      netElectricity: powerNetElec, computing: categoryData.power.computing,
      totalMaintenance: categoryData.power.maintI + categoryData.power.maintII + categoryData.power.maintIII,
      netProds: Object.entries(powerNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(powerNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    // 贸易模块
    const tradeNetElec = (categoryData.trade.prod['electricity'] || 0) - (categoryData.trade.cons['electricity'] || 0);
    const tradeAllItems = new Set([...Object.keys(categoryData.trade.prod), ...Object.keys(categoryData.trade.cons)]);
    const tradeNetMap: Record<string, number> = {};
    for (const item of tradeAllItems) {
      const prod = categoryData.trade.prod[item] || 0, cons = categoryData.trade.cons[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) tradeNetMap[item] = net;
    }
    rows.push({
      name: '贸易模块', machineCount: categoryData.trade.machineCount, workers: categoryData.trade.workers,
      netElectricity: tradeNetElec, computing: categoryData.trade.computing,
      totalMaintenance: categoryData.trade.maintI + categoryData.trade.maintII + categoryData.trade.maintIII,
      netProds: Object.entries(tradeNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(tradeNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    // 特殊模块
    const specialNetElec = (categoryData.special.prod['electricity'] || 0) - (categoryData.special.cons['electricity'] || 0);
    const specialAllItems = new Set([...Object.keys(categoryData.special.prod), ...Object.keys(categoryData.special.cons)]);
    const specialNetMap: Record<string, number> = {};
    for (const item of specialAllItems) {
      const prod = categoryData.special.prod[item] || 0, cons = categoryData.special.cons[item] || 0, net = prod - cons;
      if (Math.abs(net) > 1e-6) specialNetMap[item] = net;
    }
    rows.push({
      name: '特殊模块', machineCount: categoryData.special.machineCount, workers: categoryData.special.workers,
      netElectricity: specialNetElec, computing: categoryData.special.computing,
      totalMaintenance: categoryData.special.maintI + categoryData.special.maintII + categoryData.special.maintIII,
      netProds: Object.entries(specialNetMap).filter(([, net]) => net > 0).map(([item, net]) => ({ item, net })),
      netCons: Object.entries(specialNetMap).filter(([, net]) => net < 0).map(([item, net]) => ({ item, net })),
    });
    return rows;
  }, [categoryData]);

  if (!result && !isSolving && !diagnostic) return null;
  const resultStatus = result?.Status ?? result?.status;

  return (
    <div className="results-container">
      <style>{`
        .results-container { font-size: 1.1rem; }
        .table-wrapper { overflow-x: auto; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 1rem; }
        .data-table th, .data-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
        .data-table tbody tr:hover { background: #f9f9f9; }
        .positive-value { color: #2e7d32; font-weight: bold; }
        .negative-value { color: #c62828; font-weight: bold; }
        .split-summary { display: flex; gap: 20px; }
        .split-column { flex: 1; }
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
        .results-layout { display: flex; gap: 24px; flex-wrap: wrap; }
        .summary-panel { flex: 2; min-width: 280px; }
        .detail-panel { flex: 3; min-width: 400px; }
        .hint { color: #666; font-size: 0.9rem; }
        .stat { background: #e8f0fe; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 1rem; }
        .btn { padding: 6px 12px; font-size: 1rem; }
      `}</style>

      {isSolving && <div>🔄 求解中...</div>}
      {diagnostic && <div style={{ background: '#fff3cd', padding: 8, whiteSpace: 'pre-wrap', fontSize: 13 }} dangerouslySetInnerHTML={{ __html: diagnostic }} />}
      {result && resultStatus === 'Optimal' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Btn onClick={() => setShowTinyErrors(!showTinyErrors)} variant={showTinyErrors ? 'primary' : 'default'}>
              {showTinyErrors ? '🔍 隐藏微小误差' : '🔍 显示微小误差'}
            </Btn>
          </div>
          <div className="stat">
            ✅ 总机器数: <b>{categoryData.all.machineCount.toFixed(2)}</b> | 总人力: <b>{categoryData.all.workers.toFixed(2)}</b> | 净电力: <b>{((categoryData.all.prod['electricity'] || 0) - (categoryData.all.cons['electricity'] || 0)).toFixed(2)}</b><br/>
            🎯 凝聚力产量: <b>{unityProduction.toFixed(2)}</b> | 凝聚力消耗: <b>{unityConsumption.toFixed(2)}</b> | 净凝聚力: <b>{(unityProduction - unityConsumption).toFixed(2)}</b>
          </div>

          <div className="tab-bar">
            {tabNames.map(name => (
              <button key={name} onClick={() => setSelectedTab(name)} className={`tab-button ${selectedTab === name ? 'active' : ''}`}>
                {t(name, translation)}
              </button>
            ))}
          </div>

          <div className="results-layout">
            <div className="summary-panel">
              <h4>{t('资源平衡', translation)}</h4>
              {currentData && <SummaryTable data={{ prod: currentData.prod || {}, cons: currentData.cons || {} }} showTinyErrors={showTinyErrors} translation={translation} splitMode={selectedTab !== '全厂总览'} />}
            </div>
            <div className="detail-panel">
              {selectedTab === '全厂总览' ? (
                <>
                  <h4>{t('全厂模块总览', translation)}</h4>
                  {moduleRows.map(row => <ModuleRow key={row.name} {...row} onClick={() => setSelectedTab(row.name)} translation={translation} />)}
                </>
              ) : (
                <>
                  <h4>{t('配方列表', translation)}</h4>
                  {currentData && currentData.recipes && currentData.recipes.length > 0 ? (
                    <RecipeList recipes={currentData.recipes.map((item: any) => ({ recipe: item.recipe, count: item.machineCount, perMin: item.perMin }))} translation={translation} />
                  ) : <div className="hint">{t('无配方数据', translation)}</div>}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {result && resultStatus !== 'Optimal' && <div>❌ 状态: {resultStatus || '未知'}</div>}
    </div>
  );
}