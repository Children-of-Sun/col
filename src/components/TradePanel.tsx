import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../stores';
import { TradeContract, Recipe } from '../types';
import { t } from '../utils';
import { Btn, ModalShell, SearchInput, Checkbox } from './UI';
import { buildTradeRecipe } from '../utils/trade';

type SortKey = 'name' | 'buyItem' | 'sellItem' | 'buyPerMin' | 'sellPerMin' | 'unityPerMin' | 'enabled' | '';

/** Sortable table header */
const SortTh: React.FC<{ label: string; active: boolean; dir: number; onClick: () => void }> = ({ label, active, dir, onClick }) => (
  <th onClick={onClick} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
    {label} <span style={{ color: active ? '#2196F3' : '#ccc' }}>{active ? (dir === 1 ? '▲' : '▼') : '⇅'}</span>
  </th>
);

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
  const tradeVoyageTime = useStore(s => s.tradeVoyageTime);
  const setTradeVoyageTime = useStore(s => s.setTradeVoyageTime);
  const excludeTradeFootprint = useStore(s => s.excludeTradeFootprint);
  const setExcludeTradeFootprint = useStore(s => s.setExcludeTradeFootprint);

  const [modalOpen, setModalOpen] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<Set<string>>(new Set(selectedTradeContractIds));
  const [filterText, setFilterText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

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
        tradeVoyageTime,
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
  }, [tradeContracts, baySlots, moduleSize, fuelTypeRaw, travelMode, profitBonusFromOffice, unityDiscountFromOffice, tradeVoyageTime, gameData, fullData, translation, edictLevels, researchLevels]);

  // Filtered + sorted contract results
  const filteredResults = useMemo(() => {
    let list = [...allContractResults];
    // Filter by text
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter(r =>
        t(r.contract.buyItem, translation).toLowerCase().includes(q) ||
        t(r.contract.sellItem, translation).toLowerCase().includes(q) ||
        (r.contract.name || r.contract.id).toLowerCase().includes(q)
      );
    }
    // Sort
    if (sortKey) {
      list.sort((a, b) => {
        let va: any, vb: any;
        switch (sortKey) {
          case 'name': va = t(a.contract.name || a.contract.id, translation); vb = t(b.contract.name || b.contract.id, translation); break;
          case 'buyItem': va = t(a.contract.buyItem, translation); vb = t(b.contract.buyItem, translation); break;
          case 'sellItem': va = t(a.contract.sellItem, translation); vb = t(b.contract.sellItem, translation); break;
          case 'buyPerMin': va = a.buyPerMin; vb = b.buyPerMin; break;
          case 'sellPerMin': va = a.sellPerMin; vb = b.sellPerMin; break;
          case 'unityPerMin': va = a.unityPerMin; vb = b.unityPerMin; break;
          case 'enabled': va = tempSelectedIds.has(a.contract.id) ? 1 : 0; vb = tempSelectedIds.has(b.contract.id) ? 1 : 0; break;
          default: return 0;
        }
        if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
        return (va - vb) * sortDir;
      });
    }
    return list;
  }, [allContractResults, filterText, sortKey, sortDir, translation]);

  const handleSortClick = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }, [sortKey]);

  // Select/deselect all FILTERED results
  const selectAllFiltered = () => {
    const newSet = new Set(tempSelectedIds);
    filteredResults.forEach(r => newSet.add(r.contract.id));
    setTempSelectedIds(newSet);
  };
  const deselectAllFiltered = () => {
    const newSet = new Set(tempSelectedIds);
    filteredResults.forEach(r => newSet.delete(r.contract.id));
    setTempSelectedIds(newSet);
  };

  const openModal = () => {
    setTempSelectedIds(new Set(selectedTradeContractIds));
    setFilterText('');
    setSortKey('');
    setSortDir(1);
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
          tradeVoyageTime,
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
          <select value={moduleSize} onChange={e => setModuleSize(e.target.value as 'S' | 'M' | 'L')}>
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
          <select value={travelMode} onChange={e => setTravelMode(e.target.value as 'normal' | 'special')}>
            <option value="normal">{t('普通', translation)}</option>
            <option value="special">{t('特殊', translation)}</option>
          </select>
        </div>
        <div>
          <label>标准普通航行总时间（秒）: </label>
          <input
            type="number"
            value={tradeVoyageTime || ''}
            onChange={e => {
              const val = parseFloat(e.target.value);
              setTradeVoyageTime(isNaN(val) ? 0 : val);
            }}
            placeholder="0=使用旧逻辑"
            step="1"
            min="0"
            style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
          />
          <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>地图+海外(普通模式)</span>
        </div>
        <div style={{ marginTop: 8, borderTop: '1px solid #ddd', paddingTop: 8 }}>
          <label>
            <input type="checkbox" checked={excludeTradeFootprint}
              onChange={e => setExcludeTradeFootprint(e.target.checked)} />
            {' '}不计入占地面积
          </label>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>（勾选后贸易占地不参与最小化计算）</span>
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
        {/* Filter + batch actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="筛选买入/卖出物品或合同名..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
          />
          <Btn onClick={selectAllFiltered} style={{ fontSize: 12 }}>全选筛选</Btn>
          <Btn onClick={deselectAllFiltered} style={{ fontSize: 12 }}>取消筛选</Btn>
          <span style={{ fontSize: 12, color: '#888' }}>
            {filteredResults.filter(r => tempSelectedIds.has(r.contract.id)).length}/{filteredResults.length} 筛选
          </span>
        </div>
        <div>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <SortTh label={t('启用', translation)} active={sortKey === 'enabled'} dir={sortDir} onClick={() => handleSortClick('enabled')} />
                <SortTh label={t('合同', translation)} active={sortKey === 'name'} dir={sortDir} onClick={() => handleSortClick('name')} />
                <SortTh label={t('买入', translation)} active={sortKey === 'buyItem'} dir={sortDir} onClick={() => handleSortClick('buyItem')} />
                <SortTh label={t('支付', translation)} active={sortKey === 'sellItem'} dir={sortDir} onClick={() => handleSortClick('sellItem')} />
                <th>{t('单次', translation)}</th>
                <SortTh label={t('买/分', translation)} active={sortKey === 'buyPerMin'} dir={sortDir} onClick={() => handleSortClick('buyPerMin')} />
                <SortTh label={t('卖/分', translation)} active={sortKey === 'sellPerMin'} dir={sortDir} onClick={() => handleSortClick('sellPerMin')} />
                <th>{t('燃料/人力', translation)}</th>
                <SortTh label={t('凝聚/分', translation)} active={sortKey === 'unityPerMin'} dir={sortDir} onClick={() => handleSortClick('unityPerMin')} />
              </tr>
            </thead>
            <tbody>
              {filteredResults.map(res => {
                const fuelLabel = t(fuelTypeRaw, translation);
                const selected = tempSelectedIds.has(res.contract.id);
                return (
                  <tr key={res.contract.id} style={{ background: selected ? '#f5f5f5' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          const newSet = new Set(tempSelectedIds);
                          selected ? newSet.delete(res.contract.id) : newSet.add(res.contract.id);
                          setTempSelectedIds(newSet);
                        }}
                        style={{
                          padding: '3px 12px', cursor: 'pointer', borderRadius: 4, border: '1px solid',
                          fontSize: 11, fontWeight: 600,
                          background: selected ? '#4caf50' : 'transparent',
                          color: selected ? '#fff' : '#555',
                          borderColor: selected ? '#4caf50' : '#ccc',
                        }}
                      >
                        {selected ? '✓ 启用' : '启用'}
                      </button>
                    </td>
                    <td><b>{t(res.contract.name || res.contract.id, translation)}</b></td>
                    <td>{t(res.contract.buyItem, translation)}</td>
                    <td>{t(res.contract.sellItem, translation)}</td>
                    <td>{res.buyAmount} / {res.sellAmount}</td>
                    <td>{res.buyPerMin.toFixed(1)}</td>
                    <td>{res.sellPerMin.toFixed(1)}</td>
                    <td style={{ fontSize: 10 }}>{fuelLabel}×{res.fuelPerTrip} / {res.workers}人</td>
                    <td style={{ color: res.unityPerMin > 0 ? '#ff9800' : '#4caf50' }}>
                      {res.unityPerMin > 0 ? '+' : ''}{res.unityPerMin.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              {filteredResults.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#888' }}>无匹配合同</td></tr>
              )}
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