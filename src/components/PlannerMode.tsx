import React from 'react';

/** 图表二 — AlchemyFactoryCalculator 规划器 (iframe) */
const PlannerMode: React.FC = () => {
  return (
    <iframe
      src="./alchemy/index.html?tab=planner"
      style={{ width: '100%', height: 'calc(100vh - 80px)', border: 'none' }}
      title="Alchemy Planner"
    />
  );
};

export default PlannerMode;
