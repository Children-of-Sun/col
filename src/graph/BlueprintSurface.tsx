import React, { useRef, useCallback, forwardRef } from 'react';

interface Props {
  children: React.ReactNode;
  svgOverlay?: React.ReactNode;
  htmlOverlay?: React.ReactNode;
  style?: React.CSSProperties;
  scale: number;
  translate: { x: number; y: number };
  onWheel: (e: React.WheelEvent) => void;
  onPanStart: (e: React.PointerEvent) => void;
  onPanMove: (e: React.PointerEvent) => void;
  onPanEnd: () => void;
  panning: boolean;
}

const GraphCanvas = forwardRef<HTMLDivElement, Props>(
  ({ children, svgOverlay, htmlOverlay, style, scale, translate, onWheel, onPanStart, onPanMove, onPanEnd, panning }, ref) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const containerRef = (ref as React.RefObject<HTMLDivElement>) || innerRef;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Default to panning. Only skip if target is a known interactive element.
    const isInteractive =
      target.dataset?.itemId ||       // GraphNode (data-item-id)
      target.dataset?.ioId ||          // GraphPort (data-io-id)
      target.closest?.('[data-item-id]') ||
      target.closest?.('[data-io-id]');
    if (!isInteractive) {
      onPanStart(e);
    }
  }, [onPanStart]);

  return (
    <div ref={ref || innerRef} data-canvas="true"
      onPointerDown={handlePointerDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanEnd}
      onWheel={onWheel}
      style={{
        width: '100%', height: 600, position: 'relative', overflow: 'hidden',
        background: '#fafafa', cursor: panning ? 'grabbing' : 'default', touchAction: 'none',
        ...style,
      }}>
      <div data-canvas="true" style={{
        position: 'absolute', top: 0, left: 0,
        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
        transformOrigin: '0 0', width: '100%', height: '100%',
      }}>
        {children}
        {htmlOverlay && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 2 }}>
            {htmlOverlay}
          </div>
        )}
        {svgOverlay && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}>
            {svgOverlay}
          </svg>
        )}
      </div>
    </div>
  );
});

export default GraphCanvas;
