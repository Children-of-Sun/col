import dagre from 'dagre';
import { LayoutNode, LayoutEdge } from './types';

export type { LayoutNode, LayoutEdge } from './types';

export interface LayoutOptions {
  rankdir?: 'LR' | 'TB' | 'RL';
  ranksep?: number;
  nodesep?: number;
  /** Ore node IDs — edges from these get increased minlen to push them left */
  oreNodeIds?: Set<string>;
}

export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: LayoutOptions,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: opts?.rankdir ?? 'LR',
    ranksep: opts?.ranksep ?? 80,
    nodesep: opts?.nodesep ?? 30,
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  const oreIds = opts?.oreNodeIds;

  for (const n of nodes) {
    g.setNode(n.id, { width: n.width, height: n.height });
  }
  for (const e of edges) {
    // Edges FROM ore nodes: increase minlen so dagre naturally pushes ores left
    const isOreEdge = oreIds?.has(e.from);
    g.setEdge(e.from, e.to, { minlen: isOreEdge ? 2 : 1 });
  }

  dagre.layout(g);

  const result = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    const dn = g.node(n.id);
    if (dn) {
      result.set(n.id, { x: dn.x - n.width / 2, y: dn.y - n.height / 2 });
    }
  }

  return result;
}
