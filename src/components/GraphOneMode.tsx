import React from 'react';

/** 图表一 — daxfb-calculator iframe */
const GraphOneMode: React.FC = () => {
  return (
    <iframe
      src="./daxfb/index.html?gameId=coi"
      style={{
        width: '100%', height: 'calc(100vh - 80px)', border: 'none',
        minHeight: 0,
      }}
      title="daxfb-calculator"
    />
  );
};

export default GraphOneMode;
