import { Recipe } from '../types';

// ========== Graph data types ==========

/** Port on a graph node */
export interface GPort {
  item: string;
  rate: number;
  direction: 'input' | 'output';
  index: number;
}

/** Edge between two graph nodes */
export interface GEdge {
  from: string;
  to: string;
  rate: number;
  item: string;
  isCycle: boolean;
}

/** Placement mode for a node */
export type NodePlacement = 'manual' | 'auto';

/** Graph node data (matching GraphNode component interface) */
export interface GNodeData {
  id: string;
  item: string;
  rate: number;
  machines: number;
  recipe: Recipe | null;
  isOre: boolean;
  buildingId: string | null;
  inputPorts: GPort[];
  outputPorts: GPort[];
  depth: number;
  placement: NodePlacement;
}

/** Raw node before layout (pure data, no position) */
export interface RawNode {
  id: string;
  item: string;
  recipeId: string;
  rate: number;
  machines: number;
  recipe: Recipe | null;
  isOre: boolean;
  buildingId: string | null;
  inputPorts: GPort[];
  outputPorts: GPort[];
  depth: number;
  /** Child connections: producer → consumer */
  children: Array<{ childId: string; item: string; rate: number; isCycle: boolean }>;
  requestedItem?: string;
  /** Whether this node was manually placed or auto-calculated */
  placement: NodePlacement;
  /** Estimated height (formula-based) */
  height: number;
  /** Estimated width */
  width: number;
}

/** Layout node input for dagre */
export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

/** Layout edge input for dagre */
export interface LayoutEdge {
  from: string;
  to: string;
}

// ========== Layout constants (shared) ==========

export const PORT_ROW_H = 38;
export const NODE_W = 260;
export const HEADER_H = 27;
export const FOOTER_H = 19;
export const ICON = 32;
export const PICON = 32;

/** 16-color Material Design cycle for links */
export const LINK_COLORS = [
  '#F44336', '#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B',
  '#FFC107', '#FF9800', '#FF5722', '#795548',
];
