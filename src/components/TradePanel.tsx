import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../stores';
import { TradeContract, Recipe } from '../types';
import { t } from '../utils';
import { Btn, ModalShell, SearchInput } from './UI';

const MODULE_SPEEDS = { S: 125, M: 250, L: 500 };

const getModuleCapacity = (slots: number): number => {
  return slots <= 4 ? 800 : 1200;
};

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
  travelTime: number;
  totalTime: number;
  buyPerMin: number;
  sellPerMin: number;
  fuelPerTrip: number;
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
  const tradeParams = useStore(s => s.tradeParams);
  const setTradeParams = useStore(s => s.setTradeParams);
  const selectedTradeContractIds = useStore(s => s.selectedTradeContractIds);
  const setSelectedTradeContractIds = useStore(s => s.setSelectedTradeContractIds);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<Set<string>>(new Set(selectedTradeContractIds));

  // 使用 store 中的参数
  const baySlots = tradeParams.baySlots;
  const moduleSize = tradeParams.moduleSize;
  const fuelTypeRaw = tradeParams.fuelTypeRaw;
  const travelMode = tradeParams.travelMode;
  const profitBonus = tradeParams.profitBonus;
  const unityDiscount = tradeParams.unityDiscount;

  const setBaySlots = (v: number) => setTradeParams({ baySlots: v });
  const setModuleSize = (v: 'S'|'M'|'L') => setTradeParams({ moduleSize: v });
  const setFuelTypeRaw = (v: string) => setTradeParams({ fuelTypeRaw: v });
  const setTravelMode = (v: 'normal'|'special') => setTradeParams({ travelMode: v });
  const setProfitBonus = (v: number) => setTradeParams({ profitBonus: v });
  const setUnityDiscount = (v: number) => setTradeParams({ unityDiscount: v });

  const availableFuels = useMemo(() => {
    if (gameData?.ship_fuel_configs) {
      const dockKey = `dock_${baySlots}`;
      const dockCfg = gameData.ship_fuel_configs[dockKey];
      if (dockCfg) return Object.keys(dockCfg);
    }
    return ['Diesel', 'Heavy Oil', 'Hydrogen'];
  }, [gameData, baySlots]);

  const getTravelInfo = (slots: number, fuelRaw: string, mode: string) => {
    if (gameData?.ship_fuel_configs) {
      const dockKey = `dock_${slots}`;
      const dock = gameData.ship_fuel_configs[dockKey];
      if (dock && dock[fuelRaw] && dock[fuelRaw][mode]) {
        return {
          travelTime: dock[fuelRaw][mode].fuel_per_trip,
          fuelPerTrip: dock[fuelRaw][mode].travel_time_min,
        };
      }
    }
    return { travelTime: 3, fuelPerTrip: 200 };
  };

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

  // 构建每分钟速率配方（duration=1）
  const buildTradeRecipe = (contract: TradeContract, result: Omit<TradeResult, 'contract'>): Recipe | null => {
    const { buyAmount, sellAmount, totalTime, fuelPerTrip, workers, electricity, maintI, maintII, maintIII } = result;
    const perMinBuy = buyAmount / totalTime;
    const perMinSell = sellAmount / totalTime;
    const perMinFuel = fuelPerTrip / totalTime;
    const perMinWorkers = workers / totalTime;
    const perMinElectricity = electricity / totalTime;
    const perMinMaintI = maintI / totalTime;
    const perMinMaintII = maintII / totalTime;
    const perMinMaintIII = maintIII / totalTime;

    const recipe: Recipe = {
      id: `trade_${contract.id}`,
      name: `贸易: ${t(contract.name || contract.id, translation)}`,
      buildingId: 'trade',
      buildingName: t('贸易码头', translation),
      category: '贸易',
      buildingLevel: 0,
      duration: 1,
      inputs: {
        [contract.sellItem.toLowerCase()]: perMinSell,
        [fuelTypeRaw.toLowerCase()]: perMinFuel,
      },
      outputs: {
        [contract.buyItem.toLowerCase()]: perMinBuy,
      },
      upkeep: {
        '人力': perMinWorkers,
        'electricity': perMinElectricity,
        ...(perMinMaintI > 0 && { 'maintenance i': perMinMaintI }),
        ...(perMinMaintII > 0 && { 'maintenance ii': perMinMaintII }),
        ...(perMinMaintIII > 0 && { 'maintenance iii': perMinMaintIII }),
      },
      powerMultiplier: 1,
      workers: perMinWorkers,
      isSolar: false,
      isHidden: false,
      module: 'trade',
    };
    return recipe;
  };

  // 实时计算所有合同结果（用于弹窗预览）
  const allContractResults = useMemo(() => {
    if (!tradeContracts.length) return [];
    const moduleSpeed = MODULE_SPEEDS[moduleSize];
    const moduleCapacity = getModuleCapacity(baySlots);
    const { travelTime, fuelPerTrip } = getTravelInfo(baySlots, fuelTypeRaw, travelMode);
    const profitFactor = 1 + profitBonus / 100;
    const unityDiscountFactor = 1 - unityDiscount / 100;

    let results = tradeContracts.map(contract => {
      const adjustedContract = { ...contract, buyRate: contract.buyRate * profitFactor };
      const { buy, sell, m, n, loadTime } = computeBestTrade(adjustedContract, baySlots, moduleSpeed, moduleCapacity);
      if (buy === 0) return null;
      const totalTime = travelTime + loadTime;
      const buyPerMin = buy / totalTime;
      const sellPerMin = sell / totalTime;
      const fuelPerMin = fuelPerTrip / totalTime;
      const perMinUnity = (buyPerMin / 100) * (contract.unity_per_100_bought || 0);
      const effectiveUnityPerMonth = (contract.unity_per_month || 0) * unityDiscountFactor;
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
        m, n,
        workers, electricity, maintI, maintII, maintIII,
      };
    }).filter((r): r is TradeResult => r !== null);
    results.sort((a, b) => t(a.contract.buyItem, translation).localeCompare(t(b.contract.buyItem, translation)));
    return results;
  }, [tradeContracts, baySlots, moduleSize, fuelTypeRaw, travelMode, profitBonus, unityDiscount, translation]);

  // 打开弹窗时，刷新临时选中列表（基于 store 中的选中合同 ID）
  const openModal = () => {
    setTempSelectedIds(new Set(selectedTradeContractIds));
    setModalOpen(true);
  };

  // 保存弹窗选择：更新 store 中的选中合同 ID，并立即生成配方（因为用户主动保存）
  const saveSelection = () => {
    const newIds = Array.from(tempSelectedIds);
    setSelectedTradeContractIds(newIds);
    // 根据当前参数和新的选中 ID 生成配方
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

  const cancelModal = () => setModalOpen(false);

  const activeCount = selectedTradeRecipes.length;

  const fuelOptions = useMemo(() => availableFuels.map(fuel => ({ value: fuel, label: t(fuel, translation) })), [availableFuels, translation]);

  return (
    <div className="section">
      <h3>🚢 贸易模块</h3>
      <div className="flex-row" style={{ flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
        <div>
          <label>码头槽位: </label>
          <select value={baySlots} onChange={e => setBaySlots(Number(e.target.value))}>
            <option value={2}>2 槽</option><option value={4}>4 槽</option>
            <option value={6}>6 槽</option><option value={8}>8 槽</option>
          </select>
        </div>
        <div>
          <label>模块尺寸: </label>
          <select value={moduleSize} onChange={e => setModuleSize(e.target.value as any)}>
            <option value="S">S (125/min)</option><option value="M">M (250/min)</option>
            <option value="L">L (500/min)</option>
          </select>
        </div>
        <div>
          <label>燃料类型: </label>
          <select value={fuelTypeRaw} onChange={e => setFuelTypeRaw(e.target.value)}>
            {fuelOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
          <input type="number" value={profitBonus} min={0} max={100} step={1} onChange={e => setProfitBonus(Number(e.target.value))} style={{ width: 70 }} />
        </div>
        <div>
          <label>{t('维护减免', translation)} (%): </label>
          <input type="number" value={unityDiscount} min={0} max={100} step={1} onChange={e => setUnityDiscount(Number(e.target.value))} style={{ width: 70 }} />
        </div>
      </div>

      <div className="stat" style={{ marginBottom: 10 }}>
        📋 已激活贸易合同: <b>{activeCount}</b> 个
        <Btn onClick={openModal} style={{ marginLeft: 10 }}>📋 选择贸易合同</Btn>
      </div>

      <ModalShell open={modalOpen} onClose={cancelModal} title={t('选择贸易合同', translation)} maxWidth="1200px">
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <th>{t('启用', translation)}</th><th>{t('合同', translation)}</th><th>{t('买入', translation)}</th>
                <th>{t('支付', translation)}</th><th>{t('单次买入', translation)}</th><th>{t('单次支付', translation)}</th>
                <th>{t('航行/装卸/总时间(min)', translation)}</th><th>{t('每分钟买入', translation)}</th>
                <th>{t('燃料/趟', translation)}</th><th>{t('人力/趟', translation)}</th>
                <th>{t('维护/趟', translation)}</th><th>{t('凝聚力/分', translation)}</th>
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
                          e.target.checked ? newSet.add(res.contract.id) : newSet.delete(res.contract.id);
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
                    <td>{res.maintI > 0 && `M I:${res.maintI} `}{res.maintII > 0 && `M II:${res.maintII} `}{res.maintIII > 0 && `M III:${res.maintIII}`}</td>
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
      <div className="hint">💡 {t('提示：勾选启用的贸易合同后，求解器会自动计算贸易次数及消耗。', translation)}</div>
    </div>
  );
};