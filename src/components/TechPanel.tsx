import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { evalResearchCost, formatPoints, researchCostBetween } from '../utils/research';
import { Btn, ToggleSwitch } from './UI';
import ResearchTimePanel from './ResearchTimePanel';

const fmtCost = formatPoints;

const TechPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const researchLevels = useStore(s => s.researchLevels);
  const setResearchLevel = useStore(s => s.setResearchLevel);
  const researchTargets = useStore(s => s.researchTargets);
  const setResearchTargetEnabled = useStore(s => s.setResearchTargetEnabled);
  const setResearchTargetLevel = useStore(s => s.setResearchTargetLevel);
  const translation = useStore(s => s.translation);

  const { items, grandTotal } = React.useMemo(() => {
    if (!gameData) return { items: [] as { res: any; idx: number; lvl: number; nextCost: number | null; totalCost: number }[], grandTotal: 0 };
    let total = 0;
    const list = gameData.research.map((res, idx) => {
      const lvl = researchLevels[idx] || 0;
      const nextCost = lvl < res.maxLevel ? evalResearchCost(res.costFormula, lvl) : null;
      let totalCost = 0;
      for (let i = 0; i < lvl; i++) {
        const c = evalResearchCost(res.costFormula, i);
        if (c !== null) totalCost += c;
      }
      total += totalCost;
      return { res, idx, lvl, nextCost, totalCost };
    });
    return { items: list, grandTotal: total };
  }, [gameData, researchLevels]);

  if (!gameData) return null;

  // 批量开启 / 关闭规划
  const setAllPlans = (enabled: boolean) => {
    gameData.research.forEach((res, idx) => {
      setResearchTargetEnabled(idx, enabled);
      if (enabled) setResearchTargetLevel(idx, res.maxLevel);
    });
  };

  return (
    <div>
      <ResearchTimePanel />

      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>🔬 {t('研究', translation)}</span>
        <Btn variant="default" style={{ fontSize: '0.8rem', padding: '2px 8px' }} onClick={() => setAllPlans(true)}>
          全部规划到满级
        </Btn>
        <Btn variant="default" style={{ fontSize: '0.8rem', padding: '2px 8px' }} onClick={() => setAllPlans(false)}>
          清空规划
        </Btn>
        <span className="hint">「当前」＝你现有等级；打开开关后可填「目标」，多科技会一起汇总到上方时间计算</span>
      </h4>

      {items.map(({ res, idx, lvl, nextCost, totalCost }) => {
        const plan = researchTargets[idx];
        const planOn = plan?.enabled === true;
        const target = Math.min(Math.max(plan?.target ?? res.maxLevel, lvl), res.maxLevel);
        const need = planOn ? researchCostBetween(res.costFormula, lvl, target) : null;
        return (
          <div key={res.name} style={{ marginBottom: 5 }}>
            <label style={{ display: 'inline-block', minWidth: 150 }}>{res.name}: </label>
            <span style={{ display: 'inline-block', fontSize: '0.78rem', color: '#888', width: 55, textAlign: 'left' }}>max{res.maxLevel}</span>

            <span style={{ fontSize: '0.78rem', color: '#666' }}>当前 </span>
            <input
              type="number"
              min={0}
              max={res.maxLevel}
              value={lvl}
              style={{ width: 60 }}
              onChange={e => setResearchLevel(idx, Math.max(0, Math.min(res.maxLevel, parseInt(e.target.value) || 0)))}
            />

            <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ToggleSwitch checked={planOn} onChange={() => setResearchTargetEnabled(idx, !planOn)} />
              <span style={{ fontSize: '0.78rem', color: planOn ? '#2563eb' : '#666' }}>目标</span>
            </span>
            {planOn && (
              <>
                <input
                  type="number"
                  min={lvl}
                  max={res.maxLevel}
                  value={target}
                  style={{ width: 60 }}
                  onChange={e => setResearchTargetLevel(idx, Math.max(0, Math.min(res.maxLevel, parseInt(e.target.value) || 0)))}
                />
                <span style={{ marginLeft: 6, fontSize: '0.8em', color: need && need.total > 0 ? '#2563eb' : '#888' }}>
                  {need && need.total > 0 ? `还需 ${fmtCost(need.total)} 点（${need.levels} 级）` : '已达目标'}
                </span>
              </>
            )}

            {lvl < res.maxLevel ? (
              <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#888' }}>
                {t('下一级', translation)}: {fmtCost(nextCost)}
              </span>
            ) : (
              <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#4a4' }}>
                {t('已满', translation)}
              </span>
            )}
            {lvl > 0 && (
              <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#888' }}>
                {t('累计', translation)}: {fmtCost(totalCost)}
              </span>
            )}
          </div>
        );
      })}
      {grandTotal > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #444', fontWeight: 'bold' }}>
          {t('所有科技累计消耗', translation)}: {fmtCost(grandTotal)}
        </div>
      )}
    </div>
  );
};

export default TechPanel;
