import React, { useRef, useEffect, useState } from 'react';
import { Recipe } from '../types';
import { t } from '../utils';
import GraphPort from './IoPort';
import { IconWithFallback } from '../components/IconWithFallback';

// daxfb-style node card: 3 sections
// ┌─ Title bar (1.7rem = 27px): bg-primary ─┐
// │ Inputs │ Factory Icon │ Outputs          │
// └─ Status bar (1.2rem = 19px): bg-statusbar ┘

interface GraphNodePort { item: string; rate: number; direction: 'input' | 'output'; index: number; }

export interface GraphNodeData {
  id: string; item: string; rate: number; machines: number;
  recipe: Recipe | null; isOre: boolean; buildingId: string | null;
  inputPorts: GraphNodePort[]; outputPorts: GraphNodePort[];
  depth: number;
}

interface Props {
  data: GraphNodeData;
  x: number; y: number;
  editing: boolean; editVal: string;
  onEditChange: (v: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
  onStartEdit: () => void;
  onBuildingClick: (nodeEl: HTMLElement | null) => void;
  onPortDragStart: (e: React.PointerEvent, item: string, dir: 'input' | 'output', portEl: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  productIcons: Record<string, string>;
  buildingIcons: Record<string, string>;
  translation: Record<string, string>;
  showIcons: boolean;
  onMeasure?: (id: string, w: number, h: number) => void;
  highlightPorts?: Record<string, 'upper' | 'lower'>;
  flipped?: boolean;
  onFlipToggle?: () => void;
  highlighted?: boolean;
  placement?: 'manual' | 'auto';
}

const ICON = 32;
const HEADER_H = 27;
const FOOTER_H = 19;

const GraphNode: React.FC<Props> = ({
  data, x, y, editing, editVal, onEditChange, onEditSubmit, onEditCancel, onStartEdit,
  onBuildingClick, onPortDragStart, onPointerDown,
  productIcons, buildingIcons, translation, showIcons, onMeasure, highlightPorts, flipped, onFlipToggle, highlighted,
  placement,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const gn = data;
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (ref.current && onMeasure) {
      const { width, height } = ref.current.getBoundingClientRect();
      onMeasure(gn.id, width, height);
    }
  }, [gn.id, gn.inputPorts.length, gn.outputPorts.length, onMeasure]);

  const isManual = placement === 'manual';
  const titleBg = gn.isOre ? '#b45f06' : isManual ? '#2563eb' : '#757575';
  const borderStyle = isManual ? '2px solid #2563eb' : gn.isOre ? '2px solid transparent' : '2px dashed #bdbdbd';
  const hasInputs = gn.inputPorts.length > 0;
  const hasOutputs = gn.outputPorts.length > 0;

  // Build ioId for highlight lookup (matching GraphPort's data-io-id format)
  const getIoId = (item: string, dir: string, idx: number) => `${gn.id}:${dir}:${item}:${idx}`;

  return (
    <div
      ref={ref}
      data-item-id={gn.id}
      onPointerDown={e => onPointerDown(e, gn.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute', left: x, top: y, zIndex: 3,
        borderRadius: 4, background: gn.isOre ? '#fff3e0' : '#f5f5f5',
        border: `${(hovered || highlighted) ? '2px solid #2563eb' : borderStyle}`,
        boxShadow: (hovered || highlighted)
          ? '0 3px 5px -1px rgba(0,0,0,.2),0 5px 8px 0 rgba(0,0,0,.14),0 1px 14px 0 rgba(0,0,0,.12)'
          : '0 2px 4px -1px rgba(0,0,0,.12),0 3px 5px 0 rgba(0,0,0,.08)',
        cursor: 'grab', userSelect: 'none', fontSize: '0.75rem',
        overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s',
        outline: highlighted ? '2px solid #2563eb' : 'none',
      }}
    >
      {/* ====== Title bar: 1.7rem = 27px (daxfb bg-primary title-row) ====== */}
      <div style={{
        height: HEADER_H, background: titleBg, color: '#fff',
        display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4,
        fontSize: '0.7rem', fontWeight: 500, overflow: 'hidden',
      }}>
        {showIcons && productIcons[gn.item] && (
          <IconWithFallback src={productIcons[gn.item]} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
        )}
        {editing ? (
          <input type="text" value={editVal}
            onChange={e => onEditChange(e.target.value)}
            onBlur={onEditSubmit}
            onKeyDown={e => { if (e.key === 'Enter') onEditSubmit(); if (e.key === 'Escape') onEditCancel(); }}
            style={{ width: 60, padding: '0 2px', fontSize: 10, border: '1px solid #fff', borderRadius: 2, background: 'rgba(255,255,255,.2)', color: '#fff', outline: 'none' }}
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            onClick={e => { e.stopPropagation(); onStartEdit(); }}
            style={{ cursor: 'text', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {t(gn.item, translation).slice(0, 14)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.9, whiteSpace: 'nowrap' }}>
          {gn.rate.toFixed(1)}/min
        </span>
      </div>

      {/* ====== Main row: inputs | factory icon | outputs (daxfb main-row) ====== */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
        flexWrap: 'nowrap',
      }}>
        {/* Left: input ports (normal) / output ports (flipped) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 80 }}>
          {(flipped ? gn.outputPorts : gn.inputPorts).map(p => (
            <GraphPort key={`${flipped ? 'out' : 'in'}-${p.item}`} item={p.item} rate={p.rate}
              direction={flipped ? 'output' : 'input'}
              nodeId={gn.id} portIndex={p.index} flipped={flipped}
              productIcons={productIcons} showIcons={showIcons}
              onDragStart={(e, it, d, el) => onPortDragStart(e, it, d, el)}
              highlightBorder={highlightPorts?.[getIoId(p.item, flipped ? 'output' : 'input', p.index)]}
            />
          ))}
          {(flipped ? !hasOutputs : !hasInputs) && <div style={{ width: 80, minHeight: ICON }} />}
        </div>

        {/* Center: factory icon + building (daxfb single-factory) */}
        <div
          onClick={e => { e.stopPropagation(); onBuildingClick(ref.current); }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '4px 6px', cursor: 'pointer',
            minWidth: 50,
          }}
        >
          <div
            className="main-icon-row"
            style={{
              width: ICON, height: ICON, borderRadius: 4,
              border: '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {showIcons && gn.buildingId && buildingIcons[gn.buildingId] && (
              <IconWithFallback src={buildingIcons[gn.buildingId]} alt=""
                style={{ width: ICON - 4, height: ICON - 4 }} />
            )}
            {!gn.buildingId && gn.isOre && showIcons && productIcons[gn.item] && (
              <IconWithFallback src={productIcons[gn.item]} alt=""
                style={{ width: ICON - 4, height: ICON - 4, opacity: 0.5 }} />
            )}
            {!gn.buildingId && !gn.isOre && (
              <div style={{ width: ICON - 4, height: ICON - 4, background: '#ddd', borderRadius: 2 }} />
            )}
          </div>
          {/* Flip button (daxfb flip toggle) */}
          <div onClick={e => { e.stopPropagation(); onFlipToggle?.(); }}
            style={{ fontSize: '0.75rem', color: flipped ? '#2563eb' : '#999', marginTop: 2,
              cursor: 'pointer', userSelect: 'none', fontWeight: flipped ? 700 : 400,
            }}>
            ↔
          </div>
        </div>

        {/* Right: output ports (normal) / input ports (flipped) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 80 }}>
          {(flipped ? gn.inputPorts : gn.outputPorts).map(p => (
            <GraphPort key={`${flipped ? 'in' : 'out'}-${p.item}`} item={p.item} rate={p.rate}
              direction={flipped ? 'input' : 'output'}
              nodeId={gn.id} portIndex={p.index} flipped={flipped}
              productIcons={productIcons} showIcons={showIcons}
              onDragStart={(e, it, d, el) => onPortDragStart(e, it, d, el)}
              highlightBorder={highlightPorts?.[getIoId(p.item, flipped ? 'input' : 'output', p.index)]}
            />
          ))}
          {(flipped ? !hasInputs : !hasOutputs) && <div style={{ width: 80, minHeight: ICON }} />}
        </div>
      </div>

      {/* ====== Status bar: 1.2rem = 19px (daxfb bg-window-statusbar) ====== */}
      <div style={{
        height: FOOTER_H, background: '#e0e0e0', color: '#666',
        display: 'flex', alignItems: 'center', padding: '0 6px',
        fontSize: '0.6rem', overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        {gn.recipe
          ? <span>{t(gn.recipe.name, translation).slice(0, 18)} · {gn.machines.toFixed(1)}台</span>
          : <span>{gn.isOre ? '基础矿物' : ''}</span>
        }
        {isManual && <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: '#2563eb' }}>📌 手动</span>}
      </div>
    </div>
  );
};

export default GraphNode;
