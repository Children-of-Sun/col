import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { Btn, Checkbox, ModalShell } from './UI';

const OfficePanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const fullData = useStore(s => s.fullData);
  const officeLevels = useStore(s => s.officeLevels);
  const setOfficeLevel = useStore(s => s.setOfficeLevel);
  const enableFocusConsumption = useStore(s => s.enableFocusConsumption);
  const setEnableFocusConsumption = useStore(s => s.setEnableFocusConsumption);
  const officeBuildingEnabled = useStore(s => s.officeBuildingEnabled);
  const officeRecipeEnabled = useStore(s => s.officeRecipeEnabled);
  const setOfficeBuildingEnabled = useStore(s => s.setOfficeBuildingEnabled);
  const setOfficeRecipeEnabled = useStore(s => s.setOfficeRecipeEnabled);
  const researchLevels = useStore(s => s.researchLevels);
  const translation = useStore(s => s.translation);

  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [currentBuilding, setCurrentBuilding] = useState<string | null>(null);

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

  const openRecipeModal = (buildingId: string) => {
    setCurrentBuilding(buildingId);
    setRecipeModalOpen(true);
  };

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

  const formatRecipeInputsOutputs = (recipe: any, workers: number) => {
    const durationMin = (recipe.duration || 60) / 60;
    const inputParts = recipe.inputs?.map((i: any) => `${t(i.name, translation)}×${(i.quantity / durationMin).toFixed(2)}`) || ['无'];
    const inputs = inputParts.join(', ') || '无';
    const outputParts = recipe.outputs?.map((o: any) => {
      const baseQty = o.quantity / durationMin;
      let qty = baseQty;
      // 专注点产出附加科技加成
      if (o.name.toLowerCase() === 'focus' && focusBonusPerWorker > 0) {
        qty = baseQty + focusBonusPerWorker * workers;
      }
      return `${t(o.name, translation)}×${qty.toFixed(2)}`;
    }) || ['无'];
    const outputs = outputParts.join(', ') || '无';
    return { inputs, outputs };
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

      <h4>🏢 办公室建筑</h4>
      {officeBuildings.length === 0 && <div className="hint">未检测到办公室建筑，请确保 GameData.json 中包含 Office 建筑数据。</div>}
      {officeBuildings.map((b: any) => (
        <div key={b.id} className="building-block" style={{ marginBottom: 10 }}>
          <div className="building-header">
            <input
              type="checkbox"
              checked={officeBuildingEnabled[b.id] !== false}
              onChange={e => setOfficeBuildingEnabled(b.id, e.target.checked)}
            />
            <span>{t(b.name, translation)}</span>
            <Btn onClick={() => openRecipeModal(b.id)}>🧪 配方选择</Btn>
          </div>
        </div>
      ))}
      <ModalShell open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} title="办公室配方选择" maxWidth="700px">
        {currentBuilding && (
          <div>
            {(() => {
                const building = officeBuildings.find((b: any) => b.id === currentBuilding);
                if (!building) return null;
                return building.recipes.map((r: any) => {
                  const { inputs, outputs } = formatRecipeInputsOutputs(r, building.workers || 0);
                return (
                  <div key={r.id} className="recipe-entry" style={{ marginBottom: 8, borderBottom: '1px solid #eee', padding: 6 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={officeRecipeEnabled[r.id] !== false}
                        onChange={e => setOfficeRecipeEnabled(r.id, e.target.checked)}
                      />
                      {' '}{t(r.name, translation)}
                    </label>
                    <div className="recipe-info" style={{ fontSize: '0.8rem', marginLeft: 20 }}>
                      投入: {inputs} → 产出: {outputs}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
        <Btn onClick={() => setRecipeModalOpen(false)}>关闭</Btn>
      </ModalShell>

      <h4>🏢 办公升级</h4>
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
