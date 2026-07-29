import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { TreeNode, recalculateAt } from '../recipeTree';
import { Recipe } from '../types';
import { treeToGraph, GNode } from './graphEngine';
import { computeLayout } from './graphLayout';
import { buildEdgePath } from './edgePath';
import { GEdge, RawNode, NodePlacement, PORT_ROW_H, NODE_W, HEADER_H, FOOTER_H, ICON, PICON, LINK_COLORS } from './types';
import { IconWithFallback } from '../components/IconWithFallback';
import GraphNode, { GraphNodeData } from './FactoryNode';
import GraphCanvas from './BlueprintSurface';
import BuildEditPopup from '../components/BuildEditPopup';

/** Screen coords → world coords. Accounts for canvas border via clientLeft/Top. */
function screenToWorld(sx: number, sy: number, canvasEl: HTMLElement, tx: number, ty: number, scale: number) {
  const canvasRect = canvasEl.getBoundingClientRect();
  return {
    x: (sx - canvasRect.left - (canvasEl.clientLeft || 0) - tx) / scale,
    y: (sy - canvasRect.top - (canvasEl.clientTop || 0) - ty) / scale,
  };
}

// ========== Props ==========
interface Props {
  roots: TreeNode[]; allRecipes: Recipe[];
  onUpdate: (updated: TreeNode) => void;
  onRecipeOverride: (item: string, recipeId: string) => void;
  onBuildingOverride: (item: string, buildingId: string) => void;
  productIcons: Record<string, string>; buildingIcons: Record<string, string>;
  showIcons: boolean; translation: Record<string, string>;
  /** Manual node specs (user-placed) — matched by item+recipeId */
  manualNodeSpecs?: Array<{ item: string; recipeId: string; x: number; y: number }>;
  onDropEmpty?: (item: string, dir: 'input' | 'output', worldX: number, worldY: number) => void;
  onDropTarget?: (sourceNodeId: string, item: string, sourceDir: 'input' | 'output', targetNodeId: string, targetItem: string, targetDir: 'input' | 'output', targetIndex: number) => void;
}

// ========== Component ==========
const GraphView: React.FC<Props> = ({ roots, allRecipes, onUpdate, onRecipeOverride, onBuildingOverride,
  productIcons, buildingIcons, showIcons, translation, manualNodeSpecs, onDropEmpty, onDropTarget }) => {

  const { nodes: rawNodes, edges } = useMemo(() => treeToGraph(roots), [roots]);
  const [gnodes, setGnodes] = useState<GNode[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [portDrag, setPortDrag] = useState<{
    sx: number; sy: number; wx: number; wy: number;  // all world coords
    item: string; dir: 'input' | 'output'; nodeId: string;
    flipped: boolean;
  } | null>(null);
  const [buildEdit, setBuildEdit] = useState<{ x: number; y: number; item: string } | null>(null);
  const [nodeSizes, setNodeSizes] = useState<Map<string, { w: number; h: number }>>(new Map());
  const [highlightPorts, setHighlightPorts] = useState<Record<string, 'upper' | 'lower'>>({});
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
  const [pillDragVer, setPillDragVer] = useState(0); // bump to re-render SVG on pill drag

  // Zoom/pan state
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panningRef = useRef(false);
  const panRef = useRef({ sx: 0, sy: 0, tx: 0, ty: 0 });
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const txRef = useRef(tx); txRef.current = tx;
  const canvasRef = useRef<HTMLDivElement>(null);

  // Flip state (daxfb: per-node isFlipped)
  const flippedRef = useRef<Set<string>>(new Set());
  const [flipVer, setFlipVer] = useState(0); // bump to trigger re-render

  // Node drag + port drag refs
  const dragRef = useRef<{ id: string; sx: number; sy: number; nx: number; ny: number } | null>(null);
  const offRef = useRef<Record<string, { dx: number; dy: number }>>({});
  const portDragRef = useRef<typeof portDrag>(null);

  // Pill offset ref (edgeOffsets for pill drag)
  const edgeOffsetsRef = useRef<Map<number, { dx: number; dy: number }>>(new Map());

  // Compute ore node IDs for rank constraint
  const oreNodeIds = useMemo(() => new Set(rawNodes.filter(n => n.isOre).map(n => n.id)), [rawNodes]);

  // Dagre layout
  useEffect(() => {
    if (!rawNodes.length) { setGnodes([]); return; }
    offRef.current = {}; // Clear stale offsets on recipe change
    const lo = rawNodes.map(n => ({
      id: n.id, width: nodeSizes.get(n.id)?.w ?? n.width, height: nodeSizes.get(n.id)?.h ?? n.height,
    }));
    const le = edges.map(e => ({ from: e.from, to: e.to }));
    const pos = computeLayout(lo, le, { oreNodeIds });
    setGnodes(rawNodes.map(n => { const p = pos.get(n.id); return p ? { ...n, x: p.x, y: p.y } : { ...n, x: 0, y: 0 }; }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, nodeSizes]);

  // Apply manual node positions after layout (match by item+recipeId)
  useEffect(() => {
    if (!manualNodeSpecs || !manualNodeSpecs.length) return;
    setGnodes(prev => prev.map(n => {
      const rId = n.recipe?.id || '__ore__';
      const m = manualNodeSpecs.find(ms => ms.item === n.item && ms.recipeId === rId);
      return m ? { ...n, x: m.x, y: m.y, placement: 'manual' as NodePlacement } : n;
    }));
  }, [manualNodeSpecs]);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const s = scaleRef.current;
    const f = e.deltaY < 0 ? 1.1 : 0.9;
    const ns = Math.min(5, Math.max(0.1, s * f));
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTx(p => ({ x: mx - (mx - p.x) * (ns / s), y: my - (my - p.y) * (ns / s) }));
    setScale(ns);
  }, []);

  // Pan — fixed: use panningRef to avoid stale closure
  const onPanStart = useCallback((e: React.PointerEvent) => {
    panningRef.current = true; setPanning(true);
    panRef.current = { sx: e.clientX, sy: e.clientY, tx: txRef.current.x, ty: txRef.current.y };
  }, []);
  const onPanMove = useCallback((e: React.PointerEvent) => {
    if (!panningRef.current) return;
    setTx({ x: panRef.current.tx + e.clientX - panRef.current.sx, y: panRef.current.ty + e.clientY - panRef.current.sy });
  }, []);
  const onPanEnd = useCallback(() => { panningRef.current = false; setPanning(false); }, []);

  // Node drag
  const onNDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    const n = gnodes.find(g => g.id === id); if (!n) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y };
  }, [gnodes]);
  const onNMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const s = scaleRef.current;
    setGnodes(p => p.map(n => n.id === d.id ? { ...n, x: d.nx + (e.clientX - d.sx) / s, y: d.ny + (e.clientY - d.sy) / s } : n));
  }, []);
  const onNUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setGnodes(p => {
      const cur = p.find(g => g.id === d.id);
      if (cur) {
        const old = offRef.current[d.id] || { dx: 0, dy: 0 };
        offRef.current[d.id] = { dx: old.dx + (cur.x - d.nx), dy: old.dy + (cur.y - d.ny) };
      }
      return p;
    });
    dragRef.current = null;
  }, []);

  // Toggle flip
  const toggleFlip = useCallback((id: string) => {
    const s = flippedRef.current;
    s.has(id) ? s.delete(id) : s.add(id);
    setFlipVer(v => v + 1);
  }, []);

  // ===== Port drag system (unified world coords, edge-aligned start) =====
  const onPDown = useCallback((e: React.PointerEvent, _item: string, _dir: 'input' | 'output', _nodeId: string, portEl: HTMLElement | null) => {
    e.preventDefault(); e.stopPropagation();
    if (!canvasRef.current) return;
    const n = gnodes.find(g => g.id === _nodeId);
    if (!n) return;
    const fFlipped = flippedRef.current.has(_nodeId);
    const nw = nodeSizes.get(n.id)?.w ?? n.width;
    // Use same formula as svgEdges: node edge X + port row Y
    const sx = fFlipped ? n.x : n.x + nw;
    // Find port index from portEl data-io-id, fallback to estimate
    let portIdx = 0;
    if (portEl) {
      const ioId = portEl.getAttribute('data-io-id') || '';
      const parts = ioId.split(':');
      portIdx = parseInt(parts[3]) || 0;
    }
    const sy = n.y + HEADER_H + portIdx * PORT_ROW_H + PICON / 2;
    const pd = { sx, sy, wx: sx, wy: sy, item: _item, dir: _dir, nodeId: _nodeId, flipped: fFlipped };
    portDragRef.current = pd;
    setPortDrag(pd);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [gnodes, nodeSizes]);

  const onPMove = useCallback((e: React.PointerEvent) => {
    if (!portDragRef.current || !canvasRef.current) return;
    e.preventDefault();
    const wp = screenToWorld(e.clientX, e.clientY, canvasRef.current!, txRef.current.x, txRef.current.y, scaleRef.current);
    portDragRef.current = { ...portDragRef.current, wx: wp.x, wy: wp.y };
    setPortDrag(p => p ? { ...p, wx: wp.x, wy: wp.y } : null);

    // Drop target detection
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const newHighlights: Record<string, 'upper' | 'lower'> = {};
    const pd = portDragRef.current;

    for (const el of els) {
      const itemId = (el as HTMLElement).getAttribute?.('data-item-id');
      if (itemId && itemId !== pd.nodeId) {
        const targetNode = gnodes.find(g => g.id === itemId);
        if (!targetNode) continue;
        const targetDir = pd.dir === 'output' ? 'input' : 'output';
        const targetPorts = targetDir === 'input' ? targetNode.inputPorts : targetNode.outputPorts;
        if (targetPorts.length === 0) continue;
        const localY = pd.wy - targetNode.y - HEADER_H;
        for (let i = 0; i < targetPorts.length; i++) {
          const portCenterY = i * PORT_ROW_H + ICON / 2;
          if (localY < portCenterY) {
            const p = targetPorts[i];
            if (p.item === pd.item) {
              newHighlights[`${itemId}:${targetDir}:${p.item}:${p.index}`] = 'upper';
              if (i > 0) {
                const up = targetPorts[i - 1];
                if (up.item === pd.item)
                  newHighlights[`${itemId}:${targetDir}:${up.item}:${up.index}`] = 'lower';
              }
            }
            break;
          }
        }
        if (Object.keys(newHighlights).length === 0 && targetPorts.length > 0) {
          const lp = targetPorts[targetPorts.length - 1];
          if (lp.item === pd.item)
            newHighlights[`${itemId}:${targetDir}:${lp.item}:${lp.index}`] = 'lower';
        }
        break;
      }
    }
    setHighlightPorts(newHighlights);
  }, [gnodes]);

  const onPUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const pd = portDragRef.current;
    if (pd && canvasRef.current) {
      const hlKeys = Object.keys(highlightPorts);
      if (hlKeys.length === 0) {
        // Dropped on empty space → create new node
        if (onDropEmpty) {
          onDropEmpty(pd.item, pd.dir, pd.wx, pd.wy);
        }
      } else {
        // Dropped on target port → check item match and connect
        const firstKey = hlKeys[0];
        const parts = firstKey.split(':');
        const targetItem = parts[2];
        if (pd.item === targetItem && onDropTarget) {
          onDropTarget(pd.nodeId, pd.item, pd.dir, parts[0], targetItem,
            parts[1] as 'input' | 'output', parseInt(parts[3]));
        }
      }
    }
    portDragRef.current = null;
    setPortDrag(null);
    setHighlightPorts({});
  }, [highlightPorts, onDropEmpty, onDropTarget]);

  // ===== Pill drag system =====
  const pillDragRef = useRef<{ edgeIdx: number; sx: number; sy: number; startDx: number; startDy: number } | null>(null);

  const onPillDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.target as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const off = edgeOffsetsRef.current.get(idx) || { dx: 0, dy: 0 };
    pillDragRef.current = { edgeIdx: idx, sx: e.clientX, sy: e.clientY, startDx: off.dx, startDy: off.dy };
  }, []);

  const onPillMove = useCallback((e: React.PointerEvent) => {
    const d = pillDragRef.current;
    if (!d) return;
    const s = scaleRef.current;
    const dx = d.startDx + (e.clientX - d.sx) / s;
    const dy = d.startDy + (e.clientY - d.sy) / s;
    edgeOffsetsRef.current.set(d.edgeIdx, { dx, dy });
    setPillDragVer(v => v + 1); // trigger SVG re-render
  }, []);

  const onPillUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    pillDragRef.current = null;
  }, []);

  // Rate edit
  const submitRate = useCallback(() => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v > 0 && editId) {
      const gn = gnodes.find(g => g.id === editId);
      if (gn) {
        const walk = (list: TreeNode[]): boolean => {
          for (const n of list) {
            if (n.item === gn.item && n.depth === gn.depth && Math.abs(n.rate - gn.rate) < 0.01) {
              onUpdate(recalculateAt(n, v, allRecipes)); return true;
            }
            if (walk(n.children)) return true;
          }
          return false;
        };
        walk(roots);
      }
    }
    setEditId(null);
  }, [editVal, editId, gnodes, roots, allRecipes, onUpdate]);

  const handleMeasure = useCallback((id: string, w: number, h: number) => {
    setNodeSizes(prev => {
      const existing = prev.get(id);
      if (existing && Math.abs(existing.w - w) < 1 && Math.abs(existing.h - h) < 1) return prev;
      const next = new Map(prev);
      next.set(id, { w, h });
      return next;
    });
  }, []);

  const handleBuildingClick = useCallback((nodeEl: HTMLElement | null, item: string) => {
    if (nodeEl) {
      const r = nodeEl.getBoundingClientRect();
      setBuildEdit({ x: r.left, y: r.bottom + 4, item });
    } else {
      setBuildEdit({ x: window.innerWidth / 2 - 150, y: 200, item });
    }
  }, []);

  // ===== Edge computation (formula-based, no DOM measurement) =====
  const svgEdges = useMemo(() => {
    return edges.map((e, i) => {
      const fg = gnodes.find(n => n.id === e.from);
      const tg = gnodes.find(n => n.id === e.to);
      const fr = rawNodes.find(n => n.id === e.from);
      const tr = rawNodes.find(n => n.id === e.to);
      if (!fg || !tg || !fr || !tr) return null;
      const op = fr.outputPorts.find(p => p.item === e.item);
      const ip = tr.inputPorts.find(p => p.item === e.item);
      const fw = nodeSizes.get(fg.id)?.w ?? NODE_W;
      const tw = nodeSizes.get(tg.id)?.w ?? NODE_W;
      const fFlipped = flippedRef.current.has(fg.id);
      const tFlipped = flippedRef.current.has(tg.id);

      const fy = op
        ? fg.y + HEADER_H + op.index * PORT_ROW_H + PICON / 2
        : fg.y + fg.height / 2;
      const fx = fFlipped ? fg.x : fg.x + fw;

      const tty = ip
        ? tg.y + HEADER_H + ip.index * PORT_ROW_H + PICON / 2
        : tg.y + tg.height / 2;
      const ttx = tFlipped ? tg.x + tw : tg.x;

      // Apply pill offset to midpoint for visual path adjustment
      const { d, mx, my } = buildEdgePath(fx, fy, ttx, tty, fFlipped, tFlipped);
      const off = edgeOffsetsRef.current.get(i);
      const color = LINK_COLORS[i % LINK_COLORS.length];
      return { d, mx: mx + (off?.dx ?? 0), my: my + (off?.dy ?? 0), item: e.item, rate: e.rate, isCycle: e.isCycle, color };
    }).filter(Boolean) as Array<{ d: string; mx: number; my: number; item: string; rate: number; isCycle: boolean; color: string }>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, rawNodes, gnodes, nodeSizes, flipVer, pillDragVer]);

  // Compute highlighted node IDs from hovered edge
  const highlightedNodeIds = useMemo(() => {
    if (hoveredEdgeIdx === null) return new Set<string>();
    const e = edges[hoveredEdgeIdx];
    if (!e) return new Set<string>();
    return new Set([e.from, e.to]);
  }, [hoveredEdgeIdx, edges]);

  // Connector pills + interactive edge overlay (scale-corrected, with drag)
  const connectorPills = useMemo(() => {
    const s = scaleRef.current;
    const halfPill = 15 / s;
    const pills = svgEdges.map((se, i) => {
      const off = edgeOffsetsRef.current.get(i);
      return (
        <div key={`cp_${i}`}
          style={{
            position: 'absolute', left: se.mx - halfPill, top: se.my - halfPill,
            width: 30, height: 30, borderRadius: '50%',
            background: '#f5f5f5', border: hoveredEdgeIdx === i ? `2px solid ${se.color}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', userSelect: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,.12)',
            zIndex: 2, padding: 1,
            transform: off ? `translate(${off.dx * s}px, ${off.dy * s}px)` : undefined,
          }}
          onMouseEnter={() => setHoveredEdgeIdx(i)}
          onMouseLeave={() => setHoveredEdgeIdx(null)}
          onPointerDown={e => onPillDown(e, i)}
        >
          {showIcons && productIcons[se.item] && (
            <IconWithFallback src={productIcons[se.item]} alt="" style={{ width: 22, height: 22 }} />
          )}
        </div>
      );
    });
    return pills;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgEdges, showIcons, productIcons, hoveredEdgeIdx]);

  // Drag preview line (uses buildEdgePath for curve matching real edges)
  const dragPreviewLine = portDrag && canvasRef.current ? (() => {
    const { d } = buildEdgePath(portDrag.sx, portDrag.sy, portDrag.wx, portDrag.wy, portDrag.flipped, false);
    return (
      <g>
        <path d={d} stroke="#000" strokeWidth={32} fill="none" opacity={0.25} strokeLinecap="round" />
        <path d={d} stroke="#000" strokeWidth={4} fill="none" opacity={0.85} strokeLinecap="round" />
      </g>
    );
  })() : null;

  // Drag ghost (screen coords computed from world)
  const dragGhost = portDrag && canvasRef.current ? (() => {
    const cr = canvasRef.current!.getBoundingClientRect();
    const sx = portDrag.wx * scaleRef.current + txRef.current.x + cr.left + (canvasRef.current!.clientLeft || 0);
    const sy = portDrag.wy * scaleRef.current + txRef.current.y + cr.top + (canvasRef.current!.clientTop || 0);
    return (
      <div style={{
        position: 'fixed', zIndex: 5000, left: sx - 19, top: sy - 19,
        width: 38, height: 38, borderRadius: 4, padding: 3,
        background: '#e0e0e0', touchAction: 'none', pointerEvents: 'none',
        boxShadow: '0 6px 6px -3px rgba(0,0,0,.2),0 10px 14px 1px rgba(0,0,0,.14),0 4px 18px 3px rgba(0,0,0,.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showIcons && productIcons[portDrag.item] && (
          <IconWithFallback src={productIcons[portDrag.item]} alt="" style={{ width: 32, height: 32 }} />
        )}
      </div>
    );
  })() : null;

  const svgOverlay = (
    <g>
      {svgEdges.map((se, i) => {
        const color = se.isCycle ? '#e67e22' : se.color;
        const hl = hoveredEdgeIdx === i;
        return (
          <g key={`e_${i}`}>
            {/* Cycle marker arrow at start */}
            {se.isCycle && (
              <circle cx={se.mx} cy={se.my} r={6} fill="#e67e22" opacity={0.8}>
                <title>↻ 循环</title>
              </circle>
            )}
            <path d={se.d} stroke={color} strokeWidth={32} fill="none"
              strokeDasharray={se.isCycle ? '8,4' : 'none'} strokeLinecap="round"
              opacity={hl ? 0.45 : 0.25}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredEdgeIdx(i)}
              onMouseLeave={() => setHoveredEdgeIdx(null)} />
            <path d={se.d} stroke={color} strokeWidth={4} fill="none"
              strokeDasharray={se.isCycle ? '8,4' : 'none'} strokeLinecap="round"
              opacity={hl ? 1 : 0.85} />
          </g>
        );
      })}
      {dragPreviewLine}
    </g>
  );

  // Global pointer move/up for pill drag
  const handleGlobalPMove = useCallback((e: React.PointerEvent) => {
    onNMove(e);
    onPMove(e);
    if (pillDragRef.current) onPillMove(e);
  }, [onNMove, onPMove, onPillMove]);

  const handleGlobalPUp = useCallback((e: React.PointerEvent) => {
    onNUp(e);
    onPUp(e);
    if (pillDragRef.current) onPillUp(e);
  }, [onNUp, onPUp, onPillUp]);

  if (!gnodes.length) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>请先计算配方树</div>;

  return (
    <div onPointerDown={onPanStart}
      onPointerMove={handleGlobalPMove}
      onPointerUp={handleGlobalPUp}
      style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
      {dragGhost}
      <GraphCanvas ref={canvasRef} scale={scale} translate={tx} panning={panning}
        onWheel={onWheel} onPanStart={onPanStart} onPanMove={onPanMove} onPanEnd={onPanEnd}
        svgOverlay={svgOverlay} htmlOverlay={connectorPills}>
        {gnodes.map(gn => {
          const flipped = flippedRef.current.has(gn.id);
          return (
            <GraphNode key={gn.id} data={gn} x={gn.x} y={gn.y}
              flipped={flipped}
              editing={editId === gn.id} editVal={editVal}
              onEditChange={setEditVal} onEditSubmit={submitRate}
              onEditCancel={() => setEditId(null)}
              onStartEdit={() => { setEditId(gn.id); setEditVal(String(Math.round(gn.rate * 100) / 100)); }}
              onBuildingClick={(nodeEl) => handleBuildingClick(nodeEl, gn.item)}
              onPortDragStart={(e, item, dir, portEl) => onPDown(e, item, dir, gn.id, portEl)}
              onPointerDown={(e, id) => onNDown(e, id)}
              onFlipToggle={() => toggleFlip(gn.id)}
              onMeasure={handleMeasure}
              highlightPorts={highlightPorts}
              highlighted={highlightedNodeIds.has(gn.id)}
              placement={gn.placement || 'auto'}
              productIcons={productIcons} buildingIcons={buildingIcons}
              translation={translation} showIcons={showIcons} />
          );
        })}
      </GraphCanvas>
      {buildEdit && (
        <BuildEditPopup x={buildEdit.x} y={buildEdit.y} item={buildEdit.item} allRecipes={allRecipes}
          buildingIcons={buildingIcons} translation={translation} showIcons={showIcons}
          onSelect={(bId, rId) => { onBuildingOverride(buildEdit.item, bId); onRecipeOverride(buildEdit.item, rId); setBuildEdit(null); }}
          onClose={() => setBuildEdit(null)} />
      )}
    </div>
  );
};

export default GraphView;
