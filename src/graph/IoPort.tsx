import React, { useRef } from 'react';
import { IconWithFallback } from '../components/IconWithFallback';

// daxfb-style IO port: icon + rate text in horizontal row
// Input ports: icon on left (flex-row)
// Output ports: icon on right (flex-row-reverse)

interface Props {
  item: string;
  rate: number;
  direction: 'input' | 'output';
  productIcons: Record<string, string>;
  showIcons: boolean;
  nodeId: string;
  portIndex: number;
  onDragStart?: (e: React.PointerEvent, item: string, dir: 'input' | 'output', portEl: HTMLElement | null) => void;
  highlightBorder?: 'upper' | 'lower' | null;
  flipped?: boolean;
}

const ICON = 32;

const GraphPort: React.FC<Props> = ({ item, rate, direction, productIcons, showIcons, nodeId, portIndex, onDragStart, highlightBorder, flipped }) => {
  const isInput = direction === 'input';
  const iconRef = useRef<HTMLDivElement>(null);
  // daxfb flip: flipped ? !isInput : isInput — reverses row direction when flipped
  const rowDir = (flipped ? !isInput : isInput) ? 'row' : 'row-reverse';
  // Format: nodeId:direction:item:portIndex (matching daxfb data-io-id pattern)
  const ioId = `${nodeId}:${direction}:${item}:${portIndex}`;

  // Highlight border styles (daxfb drop target feedback)
  const hlStyle: React.CSSProperties = {};
  if (highlightBorder === 'upper') {
    hlStyle.borderTop = '8px solid #e64a19';
  } else if (highlightBorder === 'lower') {
    hlStyle.borderBottom = '8px solid #e64a19';
  }

  return (
    <div
      className="io-parent"
      data-io-id={ioId}
      onPointerDown={e => onDragStart?.(e, item, direction, iconRef.current)}
      onMouseEnter={e => {
        const iconRow = (e.currentTarget as HTMLElement).querySelector('.io-icon-row') as HTMLElement;
        if (iconRow) {
          iconRow.style.borderColor = '#616161';
          iconRow.style.boxShadow = '0 3px 5px -1px rgba(0,0,0,.2),0 5px 8px 0 rgba(0,0,0,.14),0 1px 14px 0 rgba(0,0,0,.12)';
        }
      }}
      onMouseLeave={e => {
        const iconRow = (e.currentTarget as HTMLElement).querySelector('.io-icon-row') as HTMLElement;
        if (iconRow) {
          iconRow.style.borderColor = 'transparent';
          iconRow.style.boxShadow = 'none';
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
        flexDirection: rowDir as React.CSSProperties['flexDirection'],
        gap: 4, cursor: 'crosshair', userSelect: 'none',
        ...hlStyle,
      }}
    >
      {/* Icon row: 32x32, rounded, hover elevation (daxfb io-icon-row) */}
      <div
        ref={iconRef}
        className="io-icon-row"
        style={{
          width: ICON, height: ICON, borderRadius: 4,
          padding: 1, border: '2px solid transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {showIcons && productIcons[item] && (
          <IconWithFallback src={productIcons[item]} alt={item}
            style={{ width: ICON - 4, height: ICON - 4 }} />
        )}
        {(!showIcons || !productIcons[item]) && (
          <div style={{ width: ICON - 4, height: ICON - 4, background: '#ddd', borderRadius: 2 }} />
        )}
      </div>

      {/* Description row: rate text (daxfb io-description-row) */}
      <div
        className="io-description-row"
        style={{
          fontSize: '0.65rem', lineHeight: 1.3, padding: '0 3px',
          color: '#666', whiteSpace: 'nowrap',
          textAlign: isInput ? 'left' : 'right',
        }}
      >
        {rate.toFixed(1)}/min
      </div>
    </div>
  );
};

export default GraphPort;
