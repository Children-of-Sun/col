import React, { useMemo } from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { Checkbox } from './UI';

const OfficePanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const fullData = useStore(s => s.fullData);
  const officeLevels = useStore(s => s.officeLevels);
  const setOfficeLevel = useStore(s => s.setOfficeLevel);
  const enableFocusConsumption = useStore(s => s.enableFocusConsumption);
  const setEnableFocusConsumption = useStore(s => s.setEnableFocusConsumption);
  const officeBuildingEnabled = useStore(s => s.officeBuildingEnabled);
  const setOfficeBuildingEnabled = useStore(s => s.setOfficeBuildingEnabled);
  const officeRecipeEnabled = useStore(s => s.officeRecipeEnabled);
  const setOfficeRecipeEnabled = useStore(s => s.setOfficeRecipeEnabled);
  const integerMode = useStore(s => s.integerMode);
  const recipeIntegerEnabled = useStore(s => s.recipeIntegerEnabled);
  const redundancyResources = useStore(s => s.redundancyResources);
  const setRedundancyResources = useStore(s => s.setRedundancyResources);
  const redundancyAutoItems = useStore(s => s.redundancyAutoItems);
  const setRedundancyAutoItems = useStore(s => s.setRedundancyAutoItems);
  const researchLevels = useStore(s => s.researchLevels);
  const translation = useStore(s => s.translation);

  const officeCollapsed = useStore(s => s.officeCollapsed);
  const setOfficeCollapsed = useStore(s => s.setOfficeCollapsed);

  // 获取办公室建筑列表（优先从 gameData，否则从 fullData）
  const buildingsSource = gameData?.machines_and_buildings || fullData?.machines_and_buildings;
  const officeBuildings = buildingsSource?.filter((b: any) => b.name?.startsWith('Office')) || [];

  // 计算专注点消耗
  const getTotalFocusCost = (office: any, level: number) => {
    if (level === 0) return 0;
    const base = office.costBase || 0;
    const inc = office.costIncrement || 0;
    return level * base + inc * (level - 1) * level / 2;
  };
  const totalFocusPerMin = gameData?.office?.reduce((sum: number, off: any, idx: number) => {
    const level = officeLevels[idx] || 0;
    return sum + getTotalFocusCost(off, level);
  }, 0) || 0;

  // 获取专注点科技加成
  const focusBonusPerWorker = useMemo(() => {
    if (!gameData) return 0;
    const focusResearch = gameData.research.find((r: any) => r.name === '专注点');
    if (focusResearch) {
      const idx = gameData.research.indexOf(focusResearch);
      const lvl = researchLevels[idx] || 0;
      if (lvl > 0) {
        const bonusPerWorkerPerLevel = focusResearch.effectPerLevel?.[0] || 0;
        return bonusPerWorkerPerLevel * lvl;
      }
    }
    return 0;
  }, [gameData, researchLevels]);

  // 格式化配方投入/产出（每分钟）
  const formatRecipeIO = (recipe: any, workers: number) => {
    const durationMin = (recipe.duration || 60) / 60;
    const inputEntries = recipe.inputs?.map((i: any) => ({
      name: t(i.name, translation),
      rate: (i.quantity / durationMin).toFixed(2),
    })) || [];
    const outputEntries = recipe.outputs?.map((o: any) => {
      let rate = o.quantity / durationMin;
      if (o.name.toLowerCase() === 'focus' && focusBonusPerWorker > 0) {
        rate += focusBonusPerWorker * workers;
      }
      return { name: t(o.name, translation), rate: rate.toFixed(2) };
    }) || [];
    return { inputEntries, outputEntries };
  };

  // 格式化维护消耗
  const formatUpkeep = (building: any) => {
    const parts: string[] = [];
    if (building.workers) parts.push(`👷 ${building.workers}`);
    if (building.electricity_consumed) parts.push(`⚡ ${building.electricity_consumed}`);
    if (building.computing_consumed) parts.push(`💻 ${building.computing_consumed}`);
    if (building.maintenance_cost_units && building.maintenance_cost_quantity) {
      parts.push(`🔧 ${t(building.maintenance_cost_units, translation)}×${building.maintenance_cost_quantity}`);
    }
    return parts.join(' | ') || '无';
  };

  // 获取配方的第一个有效产出物名（办公配方 outputs 是数组格式）
  const getFirstOutputName = (recipe: any): string | null => {
    const outputs: any[] = recipe.outputs || [];
    const filtered = outputs.filter((o: any) => {
      const name = (o.name || '').toLowerCase();
      if (name === 'recyclables' || name.includes('waste')) return false;
      return true;
    });
    return filtered[0]?.name?.toLowerCase() || null;
  };

  // 处理取整开关变化（联动冗余自动启用/关闭）
  const handleIntegerToggle = (recipe: any) => {
    const currentVal = recipeIntegerEnabled[recipe.id] === true;
    const newVal = !currentVal;
    const s = useStore.getState();
    s.setRecipeIntegerEnabled(recipe.id, newVal);

    const targetItem = getFirstOutputName(recipe);
    if (!targetItem) return;

    const currentResources = s.redundancyResources;
    const currentAutoItems = s.redundancyAutoItems;
    const currentIntegerMode = s.integerMode; // 用 getState 取最新值，避免闭包过期

    if (newVal) {
      if (currentIntegerMode === 'milp') {
        // 仅在混合整数模式下联动冗余
        if (!currentResources[targetItem]) {
          s.setRedundancyResources({
            ...currentResources,
            [targetItem]: { enabled: true, lower: 100, upper: 100 },
          });
        }
        s.setRedundancyAutoItems({ ...currentAutoItems, [targetItem]: true });
        if (!s.enableRedundancy) {
          s.setEnableRedundancy(true);
        }
      }
    } else {
      // 关闭取整 → 仅自动设置的冗余项才关闭（自动关不记入 milpDisabled）
      if (currentAutoItems[targetItem]) {
        const newResources = { ...currentResources };
        delete newResources[targetItem];
        s.setRedundancyResources(newResources);
        const newAuto = { ...currentAutoItems };
        delete newAuto[targetItem];
        s.setRedundancyAutoItems(newAuto);
      }
    }
  };

  return (
    <div>
      <div className="stat" style={{ marginBottom: 10 }}>
        💡 专注点总消耗（每分钟）: {totalFocusPerMin.toFixed(0)} /min
        {enableFocusConsumption ? ' (已启用，参与求解)' : ' (未启用，不参与求解)'}
      </div>
      <div className="flex-row" style={{ marginBottom: 10 }}>
        <Checkbox
          label={t('启用专注点消耗（将需求加入求解器）', translation)}
          checked={enableFocusConsumption}
          onChange={setEnableFocusConsumption}
        />
      </div>

      <h4>🏢 办公室建筑与配方</h4>
      {officeBuildings.length === 0 && <div className="hint">未检测到办公室建筑，请确保 GameData.json 中包含 Office 建筑数据。</div>}

      {officeBuildings.map((building: any) => {
        const isCollapsed = officeCollapsed[building.id] ?? true; // 默认折叠
        const bEnabled = officeBuildingEnabled[building.id] !== false;
        const recipes = building.recipes || [];

        return (
          <div key={building.id} className="building-block" style={{ marginBottom: 16, opacity: bEnabled ? 1 : 0.5 }}>
            <div
              className="building-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                backgroundColor: bEnabled ? '#f0f4ff' : '#f5f5f5',
                border: bEnabled ? '1px solid #b8c8e8' : '1px solid #ddd',
                borderRadius: '6px 6px 0 0',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={bEnabled}
                  onChange={e => setOfficeBuildingEnabled(building.id, e.target.checked)}
                />
                <span style={{ fontWeight: 'bold' }}>{t(building.name, translation)}</span>
              </label>
              <span style={{ fontSize: 11, color: '#888' }}>
                ({recipes.length} 配方 | {formatUpkeep(building)})
              </span>
              <span
                onClick={() => setOfficeCollapsed({ ...officeCollapsed, [building.id]: !isCollapsed })}
                style={{ marginLeft: 12, fontSize: '0.85rem', userSelect: 'none', cursor: 'pointer' }}
              >
                {isCollapsed ? '▶ 展开' : '▼ 收起'}
              </span>
            </div>

            {!isCollapsed && recipes.length > 0 && (
              <div style={{ border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f0f0f0' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>{t('配方', translation)}</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>{t('投入/min', translation)}</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>{t('产出/min', translation)}</th>
                      <th style={{ padding: 8, textAlign: 'center', width: 60 }}>{t('取整', translation)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe: any) => {
                      const rEnabled = bEnabled && officeRecipeEnabled[recipe.id] !== false;
                      const intOn = recipeIntegerEnabled[recipe.id] === true;
                      const { inputEntries, outputEntries } = formatRecipeIO(recipe, building.workers || 0);

                      return (
                        <tr
                          key={recipe.id}
                          onClick={() => { if (bEnabled) setOfficeRecipeEnabled(recipe.id, !rEnabled); }}
                          style={{
                            cursor: bEnabled ? 'pointer' : 'not-allowed',
                            backgroundColor: rEnabled ? '#d4edda' : 'transparent',
                            borderBottom: '1px solid #eee',
                          }}
                          onMouseEnter={(e) => { if (bEnabled) e.currentTarget.style.backgroundColor = rEnabled ? '#c3e6cb' : '#f8f9fa'; }}
                          onMouseLeave={(e) => { if (bEnabled) e.currentTarget.style.backgroundColor = rEnabled ? '#d4edda' : 'transparent'; }}
                        >
                          <td style={{ padding: 6 }}>
                            {t(recipe.name, translation)}
                          </td>
                          <td style={{ padding: 6, fontSize: '0.8rem' }}>
                            {inputEntries.length ? inputEntries.map(e => `${e.name}×${e.rate}`).join(', ') : '无'}
                          </td>
                          <td style={{ padding: 6, fontSize: '0.8rem' }}>
                            {outputEntries.length ? outputEntries.map(e => `${e.name}×${e.rate}`).join(', ') : '无'}
                          </td>
                          <td style={{ padding: 6, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <span
                              onClick={() => { if (bEnabled) handleIntegerToggle(recipe); }}
                              title={intOn ? '取整：开' : '取整：关'}
                              style={{
                                display: 'inline-block',
                                width: 36, height: 20, borderRadius: 10,
                                background: intOn ? '#4caf50' : '#ccc',
                                position: 'relative',
                                cursor: bEnabled ? 'pointer' : 'not-allowed',
                                opacity: bEnabled ? 1 : 0.5,
                                transition: 'background 0.2s',
                              }}
                            >
                              <span style={{
                                position: 'absolute', top: 2,
                                left: intOn ? 18 : 2,
                                width: 16, height: 16, borderRadius: '50%',
                                background: '#fff',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              }} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!isCollapsed && recipes.length === 0 && (
              <div style={{ padding: 10, border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 6px 6px', color: '#888' }}>
                该建筑无配方数据
              </div>
            )}
          </div>
        );
      })}

      <h4 style={{ marginTop: 20 }}>📈 办公升级</h4>
      {gameData?.office?.map((off: any, idx: number) => {
        const currentLevel = officeLevels[idx] || 0;
        const cost = getTotalFocusCost(off, currentLevel);
        return (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div>
              <label>{t(off.name, translation)} (最高 {off.maxLevel}): </label>
              <input
                type="number"
                min={0}
                max={off.maxLevel}
                value={currentLevel}
                style={{ width: 60 }}
                onChange={e => setOfficeLevel(idx, Math.max(0, Math.min(off.maxLevel, parseInt(e.target.value) || 0)))}
              />
              <span className="hint" style={{ marginLeft: 10 }}>
                (累计消耗 Focus: {cost}/min)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OfficePanel;
