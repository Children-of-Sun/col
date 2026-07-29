import React, { useState } from 'react';
import { Btn } from './UI';
import { RecipeModal } from './Modals';

/**
 * Simplified mode — embeds daxfb-calculator for graph visualization.
 * daxfb provides: factory graph, port drag, auto-layout, recipe selection, zoom/pan.
 * Recipe settings reuse the same RecipeModal as the advanced mode's main module.
 */
const SimpleMode: React.FC = () => {
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
        borderBottom: '1px solid #ddd', background: '#fafafa', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>📐 蓝图规划</span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>
          拖拽端口连线 | 滚轮缩放 | 点击工厂图标选配方
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Btn onClick={() => setRecipeModalOpen(true)}>⚙️ 配方设置</Btn>
        </div>
      </div>

      {/* daxfb iframe */}
      <iframe
        src="./daxfb/index.html?gameId=coi"
        style={{
          flex: 1, width: '100%', border: 'none',
          minHeight: 0,
        }}
        title="daxfb-calculator"
      />

      {/* Recipe modal — same component as advanced mode main module */}
      <RecipeModal open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} />
    </div>
  );
};

export default SimpleMode;
