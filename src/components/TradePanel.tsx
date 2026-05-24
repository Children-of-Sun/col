import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../stores';
import { TradeContract, Recipe } from '../types';
import { t, isOreContract } from '../utils';
import { Btn, ModalShell, SearchInput, Checkbox } from './UI';
import { buildTradeRecipe } from '../utils/trade';



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
  const fullData = useStore(s => s.fullData);
  const tradeContracts = useStore(s => s.tradeContracts);
  const selectedTradeRecipes = useStore(s => s.selectedTradeRecipes);
  const setSelectedTradeRecipes = useStore(s => s.setSelectedTradeRecipes);
  const translation = useStore(s => s.translation);
  const tradeParams = useStore(s => s.tradeParams);
  const setTradeParams = useStore(s => s.setTradeParams);
  const selectedTradeContractIds = useStore(s => s.selectedTradeContractIds);
  const setSelectedTradeContractIds = useStore(s => s.setSelectedTradeContractIds);
  const enableTradeModule = useStore(s => s.enableTradeModule);
  const setEnableTradeModule = useStore(s => s.setEnableTradeModule);
  const officeLevels = useStore(s => s.officeLevels);
  const edictLevels = useStore(s => s.edictLevels);
  const researchLevels = useStore(s => s.researchLevels);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<Set<string>>(new Set(selectedTradeContractIds));

  const baySlots = tradeParams.baySlots;
  const moduleSize = tradeParams.moduleSize;
  const fuelTypeRaw = tradeParams.fuelTypeRaw;
  const travelMode = tradeParams.travelMode;

  const setBaySlots = (v: number) => setTradeParams({ baySlots: v });
  const setModuleSize = (v: 'S'|'M'|'L') => setTradeParams({ moduleSize: v });
  const setFuelTypeRaw = (v: string) => setTradeParams({ fuelTypeRaw: v });
  const setTravelMode = (v: 'normal'|'special') => setTradeParams({ travelMode: v });

  // 从办公等级计算利润加成和凝聚力减免
  const profitBonusFromOffice = useMemo(() => {
    if (!gameData) return 0;
    const profitOffice = gameData.office.find(o => o.name === '合同利润率');
    if (profitOffice) {
      const idx = gameData.office.indexOf(profitOffice);
      const lvl = officeLevels[idx] || 0;
      return profitOffice.effectPerLevel * lvl * 100; // effectPerLevel 通常是 0.02 -> 2%
    }
    return 0;
  }, [gameData, officeLevels]);

  const unityDiscountFromOffice = useMemo(() => {
    if (!gameData) return 0;
    const unityOffice = gameData.office.find(o => o.name === '合同凝聚力消耗');
    if (unityOffice) {
      const idx = gameData.office.indexOf(unityOffice);
      const lvl = officeLevels[idx] || 0;
      // effectPerLevel 为 -0.025，乘以 -1 得正百分比
      return -unityOffice.effectPerLevel * lvl * 100;
    }
    return 0;
  }, [gameData, officeLevels]);

  const availableFuels = useMemo(() => {
    if (gameData?.ship_fuel_configs) {
      const dockKey = `dock_${baySlots}`;
      const dockCfg = gameData.ship_fuel_configs[dockKey];
      if (dockCfg) return Object.keys(dockCfg);
    }
    return ['Diesel', 'Heavy Oil', 'Hydrogen'];
  }, [gameData, baySlots]);


  const allContractResults = useMemo(() => {
    if (!tradeContracts.length) return [];
    const results = tradeContracts.map(contract => {
      const { displayData } = buildTradeRecipe({
        contract,
        baySlots,
        moduleSize,
        fuelTypeRaw,
        travelMode,
        profitBonusPercent: profitBonusFromOffice,
        unityDiscountPercent: unityDiscountFromOffice,
        gameData,
        fullData,
        translation,
        edictLevels,
        researchLevels,
      });
      if (!displayData) return null;
      return { contract, ...displayData } as TradeResult;
    }).filter((r): r is TradeResult => r !== null);
    results.sort((a, b) => t(a.contract.buyItem, translation).localeCompare(t(b.contract.buyItem, translation)));
    if (typeof window !== 'undefined' && window.localStorage.getItem('factoryDebug') === 'true') {
      console.log('=== 贸易合同凝聚力消耗（每分钟） ===');
      results.forEach(res => {
        console.log(`${res.contract.name}: ${res.unityPerMin} (买入 ${res.buyPerMin}/分)`);
      });
    }
    return results;
  }, [tradeContracts, baySlots, moduleSize, fuelTypeRaw, travelMode, profitBonusFromOffice, unityDiscountFromOffice, gameData, fullData, translation, edictLevels, researchLevels]);

  const openModal = () => {
    setTempSelectedIds(new Set(selectedTradeContractIds));
    setModalOpen(true);
  };

  const saveSelection = () => {
    const newIds = Array.from(tempSelectedIds);
    setSelectedTradeContractIds(newIds);
    const newRecipes: Recipe[] = [];
    for (const contract of tradeContracts) {
      if (tempSelectedIds.has(contract.id)) {
        const { recipe } = buildTradeRecipe({
          contract,
          baySlots,
          moduleSize,
          fuelTypeRaw,
          travelMode,
          profitBonusPercent: profitBonusFromOffice,
          unityDiscountPercent: unityDiscountFromOffice,
          gameData,
          fullData,
          translation,
          edictLevels,
          researchLevels,
        });
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
      <div className="flex-row" style={{ marginBottom: 10 }}>
        <Checkbox
          label="启用贸易模块（全局）"
          checked={enableTradeModule}
          onChange={setEnableTradeModule}
        />
        <span className="hint">关闭后所有贸易合同暂不参与求解，已选配方不受影响</span>
      </div>
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
            <option value="S">S (125/min)</option><option value="M">M (250/min)</option><option value="L">L (500/min)</option>
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
        <span style={{ display: 'inline-flex', gap: '15px' }}>
          <span>📈 合同利润率: +{profitBonusFromOffice.toFixed(0)}%</span>
          <span>💎 合同凝聚力减免: {unityDiscountFromOffice.toFixed(0)}%</span>
        </span>
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
                      <input type="checkbox" checked={tempSelectedIds.has(res.contract.id)} onChange={e => { const newSet = new Set(tempSelectedIds); e.target.checked ? newSet.add(res.contract.id) : newSet.delete(res.contract.id); setTempSelectedIds(newSet); }} />
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