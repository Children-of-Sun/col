import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { TradeContract, Recipe } from '../types';
import { t } from '../utils';
import { Btn, ModalShell } from './UI';

// 模块尺寸装卸速率 (单位/分钟)
const MODULE_SPEEDS = { S: 125, M: 250, L: 500 };

// 模块容量（每趟每个模块最多能装的货物数量）
const getModuleCapacity = (slots: number): number => {
  return slots <= 4 ? 800 : 1200;
};

// 获取码头建筑的维护数据（简化版）
const getDockMaintenance = (slots: number, moduleCount: number, moduleSize: 'S'|'M'|'L') => {
  let workers = slots * 2;
  const moduleWorkerMap = { S: 2, M: 3, L: 4 };
  workers += moduleCount * moduleWorkerMap[moduleSize];
  let electricity = slots * 100 + moduleCount * 50;
  let maintI = slots * 1 + moduleCount * 1;
  let maintII = slots * 0.5 + moduleCount * 0.5;
  let maintIII = 0;
  return { workers, electricity, maintI, maintII, maintIII };
};

interface TradeResult {
  contract: TradeContract;
  buyAmount: number;
  sellAmount: number;
  loadTime: number;
  travelTime: number;      // 航行时间（分钟）
  totalTime: number;
  buyPerMin: number;
  sellPerMin: number;
  fuelPerTrip: number;     // 燃料消耗量（单位/趟）
  fuelPerMin: number;
  unityPerMin: number;
  unityPerMonthEffective: number;
  m: number;
  n: number;
  workers: number;
  electricity: number;
  maintI: number;
  maintII: number;
  maintIII: number;
}

export const TradePanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const tradeContracts = useStore(s => s.tradeContracts);
  const selectedTradeRecipes = useStore(s => s.selectedTradeRecipes);
  const setSelectedTradeRecipes = useStore(s => s.setSelectedTradeRecipes);
  const translation = useStore(s => s.translation);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<Set<string>>(new Set());

  const [baySlots, setBaySlots] = useState<number>(4);
  const [moduleSize, setModuleSize] = useState<'S' | 'M' | 'L'>('M');
  // 燃料类型存储原始英文名（如 "Heavy Oil"），用于匹配配置
  const [fuelTypeRaw, setFuelTypeRaw] = useState<string>('Diesel');
  const [travelMode, setTravelMode] = useState<'normal' | 'special'>('normal');
  const [profitBonus, setProfitBonus] = useState<number>(0);
  const [unityDiscount, setUnityDiscount] = useState<number>(0);

  // 可用燃料列表（原始英文名）
  const availableFuels = useMemo(() => {
    if (gameData?.ship_fuel_configs) {
      const dockKey = `dock_${baySlots}`;
      const dockCfg = gameData.ship_fuel_configs[dockKey];
      if (dockCfg) return Object.keys(dockCfg);
    }
    return ['Diesel', 'Heavy Oil', 'Hydrogen'];
  }, [gameData, baySlots]);

  // 获取航行时间和燃料消耗（字段含义：fuel_per_trip = 航行时间分钟，travel_time_min = 燃料消耗量）
  const getTravelInfo = (slots: number, fuelRaw: string, mode: string) => {
    if (gameData?.ship_fuel_configs) {
      const dockKey = `dock_${slots}`;
      const dock = gameData.ship_fuel_configs[dockKey];
      if (dock && dock[fuelRaw] && dock[fuelRaw][mode]) {
        return {
          travelTime: dock[fuelRaw][mode].fuel_per_trip,      // 航行时间（分钟）
          fuelPerTrip: dock[fuelRaw][mode].travel_time_min,   // 燃料消耗（单位/趟）
        };
      }
    }
    // 默认值：航行时间 3 分钟，燃料消耗 200 单位
    return { travelTime: 3, fuelPerTrip: 200 };
  };

  // 核心算法：计算最优模块分配与运量（整数取整）
  const computeBestTrade = (
    contract: TradeContract,
    slots: number,
    moduleSpeed: number,
    moduleCapacity: number
  ): { buy: number; sell: number; m: number; n: number; loadTime: number } => {
    const { buyRate, sellRate } = contract;
    let bestBuy = 0;
    let bestSell = 0;
    let bestM = 0;
    let bestN = 0;
    let bestLoadTime = 0;

    for (let m = 1; m < slots; m++) {
      const n = slots - m;
      // 方案1: 买入模块满载
      const buy1 = Math.floor(m * moduleCapacity);
      const sell1 = Math.floor(buy1 * (sellRate / buyRate));
      const loadBuy1 = m > 0 ? buy1 / (m * moduleSpeed) : 0;
      const loadSell1 = n > 0 ? sell1 / (n * moduleSpeed) : 0;
      const load1 = Math.max(loadBuy1, loadSell1);
      if (sell1 <= n * moduleCapacity && buy1 > bestBuy) {
        bestBuy = buy1;
        bestSell = sell1;
        bestM = m;
        bestN = n;
        bestLoadTime = load1;
      }
      // 方案2: 卖出模块满载
      const sell2 = Math.floor(n * moduleCapacity);
      const buy2 = Math.floor(sell2 * (buyRate / sellRate));
      const loadBuy2 = m > 0 ? buy2 / (m * moduleSpeed) : 0;
      const loadSell2 = n > 0 ? sell2 / (n * moduleSpeed) : 0;
      const load2 = Math.max(loadBuy2, loadSell2);
      if (buy2 <= m * moduleCapacity && buy2 > bestBuy) {
        bestBuy = buy2;
        bestSell = sell2;
        bestM = m;
        bestN = n;
        bestLoadTime = load2;
      }
    }
    return { buy: bestBuy, sell: bestSell, m: bestM, n: bestN, loadTime: bestLoadTime };
  };

  // 构建单个贸易配方
  const buildTradeRecipe = (contract: TradeContract, result: Omit<TradeResult, 'contract'>): Recipe | null => {
    const { buyAmount, sellAmount, totalTime, fuelPerTrip, m, n, workers, electricity, maintI, maintII, maintIII } = result;
    const recipe: Recipe = {
      id: `trade_${contract.id}`,
      name: `贸易: ${t(contract.name || contract.id, translation)}`,
      buildingId: 'trade',
      buildingName: t('贸易码头', translation),
      category: '贸易',
      buildingLevel: 0,
      duration: totalTime,
      inputs: {
        [contract.sellItem.toLowerCase()]: sellAmount,
        [fuelTypeRaw.toLowerCase()]: fuelPerTrip,
      },
      outputs: {
        [contract.buyItem.toLowerCase()]: buyAmount,
      },
      upkeep: {
        '人力': workers,
        'electricity': electricity,
        ...(maintI > 0 && { 'maintenance i': maintI }),
        ...(maintII > 0 && { 'maintenance ii': maintII }),
        ...(maintIII > 0 && { 'maintenance iii': maintIII }),
      },
      powerMultiplier: 1,
      workers,
      isSolar: false,
      isHidden: false,
      module: 'trade',
    };
    return recipe;
  };

  // 根据当前设置，为所有合同计算结果，并按买入物品名称排序
  const allContractResults = useMemo(() => {
    if (!tradeContracts.length) return [];
    const moduleSpeed = MODULE_SPEEDS[moduleSize];
    const moduleCapacity = getModuleCapacity(baySlots);
    const { travelTime, fuelPerTrip } = getTravelInfo(baySlots, fuelTypeRaw, travelMode);
    const profitFactor = 1 + profitBonus / 100;
    const unityDiscountFactor = 1 - unityDiscount / 100;

    let results = tradeContracts.map(contract => {
      const adjustedContract = { ...contract, buyRate: contract.buyRate * profitFactor };
      const { buy, sell, m, n, loadTime } = computeBestTrade(
        adjustedContract,
        baySlots,
        moduleSpeed,
        moduleCapacity
      );
      if (buy === 0) return null;

      const totalTime = travelTime + loadTime;
      const buyPerMin = buy / totalTime;
      const sellPerMin = sell / totalTime;
      const fuelPerMin = fuelPerTrip / totalTime;

      const unityPer100 = contract.unity_per_100_bought || 0;
      const perMinUnity = (buyPerMin / 100) * unityPer100;
      const unityPerMonth = contract.unity_per_month || 0;
      const effectiveUnityPerMonth = unityPerMonth * unityDiscountFactor;

      const totalModules = m + n;
      const { workers, electricity, maintI, maintII, maintIII } = getDockMaintenance(baySlots, totalModules, moduleSize);

      return {
        contract,
        buyAmount: buy,
        sellAmount: sell,
        loadTime,
        travelTime,
        totalTime,
        buyPerMin,
        sellPerMin,
        fuelPerTrip,
        fuelPerMin,
        unityPerMin: perMinUnity,
        unityPerMonthEffective: effectiveUnityPerMonth,
        m,
        n,
        workers,
        electricity,
        maintI,
        maintII,
        maintIII,
      };
    }).filter((r): r is TradeResult => r !== null);

    // 按买入物品的中文名称排序
    results.sort((a, b) => {
      const nameA = t(a.contract.buyItem, translation);
      const nameB = t(b.contract.buyItem, translation);
      return nameA.localeCompare(nameB);
    });

    return results;
  }, [tradeContracts, baySlots, moduleSize, fuelTypeRaw, travelMode, profitBonus, unityDiscount, translation]);

  const openModal = () => {
    setTempSelectedIds(new Set(selectedTradeRecipes.map(r => r.id.replace(/^trade_/, ''))));
    setModalOpen(true);
  };

  const saveSelection = () => {
    const newRecipes: Recipe[] = [];
    for (const result of allContractResults) {
      if (tempSelectedIds.has(result.contract.id)) {
        const recipe = buildTradeRecipe(result.contract, result);
        if (recipe) newRecipes.push(recipe);
      }
    }
    setSelectedTradeRecipes(newRecipes);
    setModalOpen(false);
  };

  const cancelModal = () => {
    setModalOpen(false);
  };

  const activeCount = selectedTradeRecipes.length;

  // 燃料下拉选项：显示翻译后的名称，值为原始英文名
  const fuelOptions = useMemo(() => {
    return availableFuels.map(fuel => ({
      value: fuel,
      label: t(fuel, translation),
    }));
  }, [availableFuels, translation]);

  return (
    <div className="section">
      <h3>🚢 贸易模块</h3>
      <div className="flex-row" style={{ flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
        <div>
          <label>码头槽位: </label>
          <select value={baySlots} onChange={e => setBaySlots(Number(e.target.value))}>
            <option value={2}>2 槽</option>
            <option value={4}>4 槽</option>
            <option value={6}>6 槽</option>
            <option value={8}>8 槽</option>
          </select>
        </div>
        <div>
          <label>模块尺寸: </label>
          <select value={moduleSize} onChange={e => setModuleSize(e.target.value as any)}>
            <option value="S">S (125/min)</option>
            <option value="M">M (250/min)</option>
            <option value="L">L (500/min)</option>
          </select>
        </div>
        <div>
          <label>燃料类型: </label>
          <select value={fuelTypeRaw} onChange={e => setFuelTypeRaw(e.target.value)}>
            {fuelOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label>航行模式: </label>
          <select value={travelMode} onChange={e => setTravelMode(e.target.value as any)}>
            <option value="normal">{t('普通', translation)}</option>
            <option value="special">{t('特殊', translation)}</option>
          </select>
        </div>
        <div>
          <label>{t('利润加成', translation)} (%): </label>
          <input type="number" value={profitBonus} min={0} max={100} step={1}
            onChange={e => setProfitBonus(Number(e.target.value))} style={{ width: 70 }} />
        </div>
        <div>
          <label>{t('维护减免', translation)} (%): </label>
          <input type="number" value={unityDiscount} min={0} max={100} step={1}
            onChange={e => setUnityDiscount(Number(e.target.value))} style={{ width: 70 }} />
        </div>
      </div>

      <div className="stat" style={{ marginBottom: 10 }}>
        📋 已激活贸易合同: <b>{activeCount}</b> 个
        <Btn onClick={openModal} style={{ marginLeft: 10 }}>📋 选择贸易合同</Btn>
      </div>

      {/* 弹窗 - 选择贸易合同（多选） */}
      <ModalShell open={modalOpen} onClose={cancelModal} title={t('选择贸易合同', translation)} maxWidth="1200px">
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <th>{t('启用', translation)}</th>
                <th>{t('合同', translation)}</th>
                <th>{t('买入', translation)}</th>
                <th>{t('支付', translation)}</th>
                <th>{t('单次买入', translation)}</th>
                <th>{t('单次支付', translation)}</th>
                <th>{t('航行/装卸/总时间(min)', translation)}</th>
                <th>{t('每分钟买入', translation)}</th>
                <th>{t('燃料/趟', translation)}</th>
                <th>{t('人力/趟', translation)}</th>
                <th>{t('维护/趟', translation)}</th>
                <th>{t('凝聚力/分', translation)}</th>
              </tr>
            </thead>
            <tbody>
              {allContractResults.map(res => {
                const fuelLabel = t(fuelTypeRaw, translation);
                return (
                  <tr key={res.contract.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tempSelectedIds.has(res.contract.id)}
                        onChange={e => {
                          const newSet = new Set(tempSelectedIds);
                          if (e.target.checked) newSet.add(res.contract.id);
                          else newSet.delete(res.contract.id);
                          setTempSelectedIds(newSet);
                        }}
                      />
                    </td>
                    <td>{t(res.contract.name || res.contract.id, translation)}<br/><small>{t('声望要求', translation)} ≥ {res.contract.min_reputation_required || 0}</small></td>
                    <td>{t(res.contract.buyItem, translation)}</td>
                    <td>{t(res.contract.sellItem, translation)}</td>
                    <td>{res.buyAmount}</td>
                    <td>{res.sellAmount}</td>
                    <td>{res.travelTime}/{res.loadTime.toFixed(1)}/{res.totalTime.toFixed(1)}</td>
                    <td>{res.buyPerMin.toFixed(2)}</td>
                    <td>{fuelLabel} × {res.fuelPerTrip}</td>
                    <td>{res.workers}</td>
                    <td>
                      {res.maintI > 0 && `M I:${res.maintI} `}
                      {res.maintII > 0 && `M II:${res.maintII} `}
                      {res.maintIII > 0 && `M III:${res.maintIII}`}
                    </td>
                    <td>{res.unityPerMin.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <Btn onClick={saveSelection}>{t('确定', translation)}</Btn>
          <Btn onClick={cancelModal}>{t('取消', translation)}</Btn>
        </div>
      </ModalShell>

      <div className="hint" style={{ marginTop: 10 }}>
        💡 {t('提示：勾选启用的贸易合同后，求解器会自动计算贸易次数及消耗。', translation)}
      </div>
    </div>
  );
};