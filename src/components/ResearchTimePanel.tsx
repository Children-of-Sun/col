import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import {
  computeLabResearchOutput,
  formatDuration,
  formatDurationDetail,
  formatPoints,
  researchCostBetween,
  ResearchCostResult,
} from '../utils/research';
import { Checkbox } from './UI';

/** 逐级明细最多展示的行数，避免超长科技（如作物产量 250 级）撑爆界面 */
const MAX_STEP_ROWS = 120;

interface PlanRow {
  idx: number;
  name: string;
  maxLevel: number;
  current: number;
  target: number;
  cost: ResearchCostResult;
}

/**
 * 科研时间计算（多科技汇总）
 * 直接复用「研究」列表里的当前等级，对每个打开了规划开关的科技累加科研点，
 * 再按科研点产量即时换算时间。全部为纯算术，不调用 LP/MILP 求解器。
 */
const ResearchTimePanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const researchLevels = useStore(s => s.researchLevels);
  const researchTargets = useStore(s => s.researchTargets);
  const translation = useStore(s => s.translation);

  // 研究所配置（用于自动计算科研点产量）
  const labLevel = useStore(s => s.labLevel);
  const labCount = useStore(s => s.labCount);
  const labMeta = useStore(s => s.labMeta);
  const recipeEnabled = useStore(s => s.recipeEnabled);
  const population = useStore(s => s.population);
  const edictLevels = useStore(s => s.edictLevels);
  const officeLevels = useStore(s => s.officeLevels);
  const stationLevel = useStore(s => s.stationLevel);

  const [manualOutput, setManualOutput] = React.useState(false); // 手动指定科研点产量
  const [manualRate, setManualRate] = React.useState(0);         // 手动产量 /分
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const research = React.useMemo(() => gameData?.research ?? [], [gameData]);

  // —— 单项快速计算：直接选择科技并输入当前/目标等级 ——
  const [quickIdx, setQuickIdx] = React.useState(0);
  const [quickFrom, setQuickFrom] = React.useState(0);
  const [quickTo, setQuickTo] = React.useState(0);
  const quickTech = research[quickIdx];
  // 切换科技时，用该科技的当前等级与满级初始化
  React.useEffect(() => {
    const r = research[quickIdx];
    if (!r) return;
    const cur = Math.min(Math.max(researchLevels[quickIdx] || 0, 0), r.maxLevel);
    setQuickFrom(cur);
    setQuickTo(r.maxLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickIdx, gameData]);

  // —— 自动科研点产量（来自研究所设置）——
  const labOut = React.useMemo(() => computeLabResearchOutput({
    labLevel, labCount, labMeta, recipeEnabled,
    gameData, population, edictLevels, officeLevels, stationLevel,
  }), [labLevel, labCount, labMeta, recipeEnabled, gameData, population, edictLevels, officeLevels, stationLevel]);

  const autoRate = labOut.finalOutput;

  // —— 汇总所有已开启规划的科技（多科技同时计算）——
  const { plan, idleCount, missing } = React.useMemo(() => {
    const rows: PlanRow[] = [];
    let idle = 0;
    let miss = false;
    for (let i = 0; i < research.length; i++) {
      const p = researchTargets[i];
      if (!p?.enabled) continue;
      const r = research[i];
      const current = Math.min(Math.max(researchLevels[i] || 0, 0), r.maxLevel);
      const target = Math.min(Math.max(p.target ?? r.maxLevel, current), r.maxLevel);
      if (target <= current) { idle++; continue; }
      const cost = researchCostBetween(r.costFormula, current, target);
      if (cost.missing) miss = true;
      rows.push({ idx: i, name: r.name, maxLevel: r.maxLevel, current, target, cost });
    }
    rows.sort((a, b) => b.cost.total - a.cost.total);
    return { plan: rows, idleCount: idle, missing: miss };
  }, [research, researchLevels, researchTargets]);

  const totalPoints = plan.reduce((s, r) => s + r.cost.total, 0);
  const totalLevels = plan.reduce((s, r) => s + r.cost.levels, 0);

  // 科研点产量：手动输入优先，否则用研究所自动计算值
  const rate = manualOutput ? Math.max(0, manualRate) : autoRate;
  const minutes = rate > 0 ? totalPoints / rate : 0;
  const hasResult = totalPoints > 0 && rate > 0;

  // —— 单项快速计算结果（纯算术，即时） ——
  const quickCost = React.useMemo(() => {
    if (!quickTech) return null;
    const from = Math.min(Math.max(Math.floor(quickFrom) || 0, 0), quickTech.maxLevel);
    const to = Math.min(Math.max(Math.floor(quickTo) || 0, from), quickTech.maxLevel);
    return researchCostBetween(quickTech.costFormula, from, to);
  }, [quickTech, quickFrom, quickTo]);
  const quickMinutes = quickCost && rate > 0 ? quickCost.total / rate : 0;

  return (
    <div className="section">
      <h3>⏱️ 科研时间计算</h3>
      <div className="hint">
        直接复用下方「研究」列表的当前等级；打开某项科技的「目标」开关后，其科研点需求会一起汇总到这里，即时算出总时间（纯算术计算，不调用求解器）。
      </div>

      <div className="flex-row" style={{ marginTop: 8 }}>
        <Checkbox
          label="手动输入科研点产量"
          checked={manualOutput}
          onChange={v => {
            setManualOutput(v);
            if (v && manualRate <= 0) setManualRate(Number(autoRate.toFixed(2)));
          }}
        />
        <label>科研点产量:{' '}
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={!manualOutput}
            value={manualOutput ? manualRate : Number(autoRate.toFixed(2))}
            style={{ width: 100 }}
            onChange={e => setManualRate(Math.max(0, parseFloat(e.target.value) || 0))}
          />{' '}/分
        </label>
        {!manualOutput && (
          <span className="hint">
            （自动：基础 {labOut.baseOutput.toFixed(2)} × 倍率 {labOut.totalMultiplier.toFixed(3)} = {autoRate.toFixed(2)} /分
            {labOut.hasLab ? `，${labCount} 台研究所` : '，未配置研究所'}）
          </span>
        )}
      </div>

      {/* —— 单项快速计算：选科技 + 输入当前/目标等级 —— */}
      {research.length > 0 && (
        <div style={{ marginTop: 10, padding: 8, border: '1px solid #b8c8e8', borderRadius: 6, background: '#f0f4ff' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>🔎 单项计算（选择科技 → 输入当前/目标等级 → 即时出时间）</div>
          <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <label>科技:{' '}
              <select value={quickIdx} onChange={e => setQuickIdx(parseInt(e.target.value) || 0)}
                style={{ padding: 2, maxWidth: 220 }}>
                {research.map((r, i) => (
                  <option key={r.name} value={i}>{t(r.name, translation)}（max{r.maxLevel}）</option>
                ))}
              </select>
            </label>
            <label>当前等级:{' '}
              <input type="number" min={0} max={quickTech?.maxLevel ?? 0} value={quickFrom}
                onChange={e => setQuickFrom(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 70 }} />
            </label>
            <label>目标等级:{' '}
              <input type="number" min={0} max={quickTech?.maxLevel ?? 0} value={quickTo}
                onChange={e => setQuickTo(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 70 }} />
            </label>
          </div>
          <div style={{ marginTop: 4, fontSize: '0.95rem' }}>
            {quickCost && quickCost.levels > 0 ? (
              rate > 0 ? (
                <>
                  需要 <b>{formatPoints(quickCost.total)}</b> 科研点（{quickCost.levels} 级），
                  预计 <b style={{ color: '#2563eb' }}>{formatDuration(quickMinutes)}</b>
                  <span className="hint">（按 {rate.toFixed(2)} 点/分）</span>
                  {quickCost.missing && <span className="hint" style={{ color: '#c62828' }}>（部分等级公式无法解析，已跳过）</span>}
                </>
              ) : (
                <span style={{ color: '#c62828' }}>科研点产量为 0，请先配置研究所或勾选"手动输入科研点产量"</span>
              )
            ) : (
              <span className="hint">目标等级需大于当前等级</span>
            )}
          </div>
        </div>
      )}

      <div className="stat" style={{ marginTop: 8 }}>
        {plan.length === 0 ? (
          <div style={{ color: '#888' }}>
            还没有规划任何科技：请在下方「🔬 研究」列表中打开某项科技的「目标」开关（或点「全部规划到满级」）。
          </div>
        ) : (
          <>
            <div>
              🎯 已规划 <b>{plan.length}</b> 项科技，共 <b>{totalLevels}</b> 级：
              📦 合计科研点 <b>{formatPoints(totalPoints)}</b>
              {missing && <span className="hint" style={{ color: '#c62828' }}>（部分等级公式无法解析，已跳过）</span>}
            </div>
            <div style={{ marginTop: 4, fontSize: '1.05em' }}>
              {hasResult ? (
                <>
                  ⏳ 全部完成预计时间：<b style={{ color: '#2563eb' }}>{formatDuration(minutes)}</b>
                  <span className="hint">（游戏内时间，按 {rate.toFixed(2)} 点/分）</span>
                </>
              ) : (
                <span style={{ color: '#c62828' }}>
                  科研点产量为 0：请先在「🚀 空间站·雕像·研究所」标签配置研究所，或勾选“手动输入科研点产量”。
                </span>
              )}
            </div>
            {hasResult && <div className="hint">{formatDurationDetail(minutes)}</div>}
          </>
        )}
      </div>

      {idleCount > 0 && (
        <div className="hint">（另有 {idleCount} 项已开启规划但当前等级已达目标，不产生科研点需求）</div>
      )}

      {plan.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 320, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f0f0f0', position: 'sticky', top: 0 }}>
                <th style={{ padding: 6, textAlign: 'left' }}>科技</th>
                <th style={{ padding: 6, textAlign: 'center' }}>当前 → 目标</th>
                <th style={{ padding: 6, textAlign: 'right' }}>级数</th>
                <th style={{ padding: 6, textAlign: 'right' }}>科研点</th>
                <th style={{ padding: 6, textAlign: 'right' }}>预计时间</th>
              </tr>
            </thead>
            <tbody>
              {plan.map(r => (
                <React.Fragment key={r.idx}>
                  <tr
                    onClick={() => setExpanded(expanded === r.idx ? null : r.idx)}
                    style={{ borderBottom: '1px solid #eee', cursor: 'pointer', background: expanded === r.idx ? '#f5f8ff' : undefined }}
                    title="点击展开逐级明细"
                  >
                    <td style={{ padding: 4 }}>
                      {expanded === r.idx ? '▼ ' : '▶ '}{t(r.name, translation)}
                    </td>
                    <td style={{ padding: 4, textAlign: 'center' }}>Lv{r.current} → Lv{r.target}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>{r.cost.levels}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>{formatPoints(r.cost.total)}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>
                      {rate > 0 ? formatDuration(r.cost.total / rate) : '-'}
                    </td>
                  </tr>
                  {expanded === r.idx && (
                    <tr>
                      <td colSpan={5} style={{ padding: '6px 6px 10px 18px', background: '#fafafa' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ color: '#666' }}>
                              <th style={{ padding: 3, textAlign: 'left' }}>等级</th>
                              <th style={{ padding: 3, textAlign: 'right' }}>该级科研点</th>
                              <th style={{ padding: 3, textAlign: 'right' }}>累计科研点</th>
                              <th style={{ padding: 3, textAlign: 'right' }}>累计时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.cost.steps.length > MAX_STEP_ROWS ? r.cost.steps.slice(0, MAX_STEP_ROWS) : r.cost.steps).map(s => (
                              <tr key={s.level}>
                                <td style={{ padding: 2 }}>Lv{s.level} → Lv{s.level + 1}</td>
                                <td style={{ padding: 2, textAlign: 'right' }}>{formatPoints(s.cost)}</td>
                                <td style={{ padding: 2, textAlign: 'right' }}>{formatPoints(s.cumulative)}</td>
                                <td style={{ padding: 2, textAlign: 'right' }}>{rate > 0 ? formatDuration(s.cumulative / rate) : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.cost.steps.length > MAX_STEP_ROWS && (
                          <div className="hint">仅显示前 {MAX_STEP_ROWS} 级（共 {r.cost.steps.length} 级）</div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              <tr style={{ fontWeight: 'bold', background: '#f7f7f7' }}>
                <td style={{ padding: 6 }}>合计</td>
                <td style={{ padding: 6, textAlign: 'center' }}>{plan.length} 项</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{totalLevels}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{formatPoints(totalPoints)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{rate > 0 ? formatDuration(minutes) : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResearchTimePanel;
