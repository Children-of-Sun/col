import { line, curveBumpX, curveBasis } from 'd3-shape';

/**
 * Build an SVG path string for edges connecting node ports.
 *
 * Uses d3 curveBumpX for a smooth horizontal bump curve (daxfb-style).
 * Supports multi-segment paths when ports are in opposite directions.
 * Returns the path `d` attribute and the midpoint for placing connector pills.
 */
export function buildEdgePath(
  sx: number, sy: number,
  tx: number, ty: number,
  sourceFlipped?: boolean,
  targetFlipped?: boolean,
): { d: string; mx: number; my: number } {
  // Both ports same direction or simple case: direct curveBumpX
  if (sourceFlipped === targetFlipped || sourceFlipped === undefined) {
    const lineGen = line().curve(curveBumpX);
    const d = lineGen([[sx, sy], [tx, ty]]) || '';
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    return { d, mx, my };
  }

  // Opposite directions: route through a common midpoint
  // (daxfb _buildShapeMultiDirection pattern)
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const lineGen = line().curve(curveBasis);
  const d = lineGen([
    [sx, sy],
    [midX, sy],
    [midX, midY],
    [midX, ty],
    [tx, ty],
  ]) || '';

  return { d, mx: midX, my: midY };
}
