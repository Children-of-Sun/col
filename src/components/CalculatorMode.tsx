import React from 'react';

/** 简化模式 — AlchemyFactoryCalculator 计算器 (iframe) */
const CalculatorMode: React.FC = () => {
  return (
    <iframe
      src="./alchemy/index.html?tab=calc"
      style={{ width: '100%', height: 'calc(100vh - 80px)', border: 'none' }}
      title="Alchemy Calculator"
    />
  );
};

export default CalculatorMode;
