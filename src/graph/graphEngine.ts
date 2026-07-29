import { TreeNode } from '../recipeTree';
import { GPort, GEdge, RawNode, GNodeData, NodePlacement, PORT_ROW_H, NODE_W, HEADER_H, FOOTER_H } from './types';

// Re-export
export type { GPort, GEdge, RawNode, NodePlacement, GNodeData } from './types';

/** Positioned graph node (includes layout x,y) */
export interface GNode extends GNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
  /** merged node IDs that were collapsed into this one */
  mergedIds?: string[];
}

/**
 * Convert tree to graph with DAG merging.
 * Nodes with the same (item, recipe.id) are merged into one,
 * combining rates and redirecting all edges.
 *
 * Pure function — no side effects, no external mutable state.
 */
export function treeToGraph(roots: TreeNode[]): { nodes: GNode[]; edges: GEdge[] } {
  // First pass: collect all raw nodes
  const rawNodes: Array<{
    id: string; item: string; recipeId: string; rate: number; machines: number;
    recipe: import('../types').Recipe | null; isOre: boolean; buildingId: string | null;
    inputPorts: GPort[]; outputPorts: GPort[]; depth: number;
    children: Array<{ childId: string; item: string; rate: number; isCycle: boolean }>;
    requestedItem?: string;
    placement: NodePlacement;
  }> = [];

  const nodeKeyToId = new Map<string, string>(); // "item|recipeId" → first id
  let c = 0;

  function walk(n: TreeNode, parentKey?: string, parentItem?: string, parentRate?: number) {
    const rId = n.recipe?.id || '__ore__';
    const key = `${n.item}|${rId}`;

    // Build ports
    const ips: GPort[] = [], ops: GPort[] = [];
    if (n.recipe) {
      let i = 0;
      for (const [it, q] of Object.entries(n.recipe.inputs))
        ips.push({ item: it, rate: n.machines * (q * 60 / n.recipe.duration), direction: 'input', index: i++ });
      i = 0;
      ops.push({ item: n.item, rate: n.rate, direction: 'output', index: i++ });
      for (const [it, q] of Object.entries(n.recipe.outputs))
        if (it !== n.item) ops.push({ item: it, rate: n.machines * (q * 60 / n.recipe.duration), direction: 'output', index: i++ });
    } else {
      ops.push({ item: n.item, rate: n.rate, direction: 'output', index: 0 });
    }

    let existingId = nodeKeyToId.get(key);
    if (existingId) {
      // Merge into existing node
      const existing = rawNodes.find(rn => rn.id === existingId)!;
      existing.rate += n.rate;
      existing.machines += n.machines;
      // Merge children
      if (parentKey && parentItem) {
        existing.children.push({ childId: parentKey, item: parentItem, rate: parentRate ?? n.rate, isCycle: n.isCycle });
      }
    } else {
      const id = `${n.item}_${rId}_${c++}`;
      nodeKeyToId.set(key, id);
      const node = {
        id, item: n.item, recipeId: rId, rate: n.rate, machines: n.machines,
        recipe: n.recipe, isOre: !n.recipe && n.children.length === 0,
        buildingId: n.recipe?.buildingId || null,
        inputPorts: ips, outputPorts: ops, depth: n.depth,
        children: [] as Array<{ childId: string; item: string; rate: number; isCycle: boolean }>,
        requestedItem: n.requestedItem,
        placement: 'auto' as NodePlacement,
      };
      if (parentKey && parentItem) {
        node.children.push({ childId: parentKey, item: parentItem, rate: parentRate ?? n.rate, isCycle: n.isCycle });
      }
      rawNodes.push(node);
    }

    // Recurse into grandchildren
    const myKey = existingId || nodeKeyToId.get(key)!;
    for (const ch of n.children) {
      const matchItem = ch.requestedItem || ch.item;
      let cr = 0;
      if (n.recipe) for (const [it] of Object.entries(n.recipe.inputs))
        if (it === matchItem) cr = n.machines * (n.recipe.inputs[it] * 60 / n.recipe.duration);
      walk(ch, myKey, matchItem, cr || ch.rate);
    }
  }

  for (const r of roots) walk(r);

  // Second pass: build GNode and GEdge lists
  const gnodeMap = new Map<string, GNode>();
  for (const rn of rawNodes) {
    const h = HEADER_H + Math.max(1, Math.max(rn.inputPorts.length, rn.outputPorts.length)) * PORT_ROW_H + FOOTER_H;
    gnodeMap.set(rn.id, {
      id: rn.id, item: rn.item, rate: rn.rate, machines: rn.machines,
      recipe: rn.recipe, isOre: rn.isOre, buildingId: rn.buildingId,
      inputPorts: rn.inputPorts, outputPorts: rn.outputPorts, depth: rn.depth,
      placement: rn.placement,
      x: 0, y: 0, width: NODE_W, height: h,
    });
  }

  // Build edges from children (inverted: child → parent in visual graph)
  const edgeSet = new Set<string>();
  const gedges: GEdge[] = [];
  for (const rn of rawNodes) {
    for (const ch of rn.children) {
      // Edge from rn (producer) → ch.childId (consumer parent)
      if (!gnodeMap.has(ch.childId)) continue;
      const ek = `${rn.id}→${ch.childId}:${ch.item}`;
      if (edgeSet.has(ek)) continue;
      edgeSet.add(ek);
      // Detect cycle: if child (consumer) is the same as rn (producer), it's a self-loop
      const isCycle = ch.isCycle || rn.id === ch.childId;
      gedges.push({ from: rn.id, to: ch.childId, rate: ch.rate, item: ch.item, isCycle });
    }
  }

  // Byproduct matching pass: connect unmatched inputs to byproduct outputs
  // 1. Find byproduct output ports (outputs beyond the primary product at index 0)
  const byproductOutputs: Array<{ nodeId: string; item: string; rate: number; index: number }> = [];
  for (const rn of rawNodes) {
    for (let i = 1; i < rn.outputPorts.length; i++) {
      const op = rn.outputPorts[i];
      byproductOutputs.push({ nodeId: rn.id, item: op.item, rate: op.rate, index: i });
    }
  }
  // 2. Find unmatched input ports on non-ore nodes
  for (const rn of rawNodes) {
    if (rn.isOre) continue; // skip ore nodes — they have no inputs
    for (const ip of rn.inputPorts) {
      // Check if this input already has an incoming edge
      const hasEdge = gedges.some(e => e.to === rn.id && e.item === ip.item);
      if (hasEdge) continue;
      // Find a matching byproduct output
      const match = byproductOutputs.find(bp => bp.item === ip.item && bp.nodeId !== rn.id);
      if (match) {
        const ek = `${match.nodeId}→${rn.id}:${ip.item}`;
        if (!edgeSet.has(ek)) {
          edgeSet.add(ek);
          gedges.push({ from: match.nodeId, to: rn.id, rate: ip.rate, item: ip.item, isCycle: false });
        }
      }
    }
  }
  // 3. Remove virtual ore nodes that are now supplied by byproducts
  const replacedOreIds = new Set<string>();
  for (const bp of byproductOutputs) {
    // Find ore nodes producing the same item
    for (const rn of rawNodes) {
      if (rn.isOre && rn.item === bp.item && rn.id !== bp.nodeId) {
        // Check if this ore node still has consumers not covered by the byproduct
        const oreHasEdges = gedges.some(e => e.from === rn.id);
        if (!oreHasEdges) {
          replacedOreIds.add(rn.id);
        }
      }
    }
  }

  return { nodes: [...gnodeMap.values()].filter(n => !replacedOreIds.has(n.id)), edges: gedges };
}
