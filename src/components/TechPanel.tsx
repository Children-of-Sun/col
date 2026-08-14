import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';

/** 计算 costFormula 在指定等级 x 的值（下一级消耗） */
const evalCost = (formula: string | undefined, x: number): number | null => {
  if (!formula) return null;
  try {
    // 仅允许数字、运算符、括号、空格和变量 x
    if (!/^[\d\s+\-*/().x^]+$/.test(formula)) return null;
    // 将数学公式中的 ^ (幂运算) 替换为 JS 的 ** 运算符
    const jsFormula = formula.replace(/\^/g, '**');
    const fn = new Function('x', `return ${jsFormula}`);
    return fn(x);
  } catch {
    return null;
  }
};

/** 格式化大数字 */
const fmtCost = (n: number | null): string => {
  if (n === null) return '-';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
};

const TechPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const researchLevels = useStore(s => s.researchLevels);
  const setResearchLevel = useStore(s => s.setResearchLevel);
  const translation = useStore(s => s.translation);

  if (!gameData) return null;

  const { items, grandTotal } = React.useMemo(() => {
    let total = 0;
    const list = gameData.research.map((res, idx) => {
      const lvl = researchLevels[idx] || 0;
      const nextCost = lvl < res.maxLevel ? evalCost(res.costFormula, lvl) : null;
      let totalCost = 0;
      for (let i = 0; i < lvl; i++) {
        const c = evalCost(res.costFormula, i);
        if (c !== null) totalCost += c;
      }
      total += totalCost;
      return { res, idx, lvl, nextCost, totalCost };
    });
    return { items: list, grandTotal: total };
  }, [gameData, researchLevels]);

  return (
    <div>
      <h4>🔬 {t('研究', translation)}</h4>
      {items.map(({ res, idx, lvl, nextCost, totalCost }) => (
        <div key={res.name} style={{ marginBottom: 5 }}>
          <label style={{ display: 'inline-block', minWidth: 150 }}>{res.name}: </label>
          <span style={{ display: 'inline-block', fontSize: '0.78rem', color: '#888', width: 55, textAlign: 'left' }}>max{res.maxLevel}</span>
          <input
            type="number"
            min={0}
            max={res.maxLevel}
            value={lvl}
            style={{ width: 60 }}
            onChange={e => setResearchLevel(idx, Math.max(0, Math.min(res.maxLevel, parseInt(e.target.value) || 0)))}
          />
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
      ))}
      {grandTotal > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #444', fontWeight: 'bold' }}>
          {t('所有科技累计消耗', translation)}: {fmtCost(grandTotal)}
        </div>
      )}
    </div>
  );
};

export default TechPanel;