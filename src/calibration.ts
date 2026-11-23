import type { Point } from './model';

export interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const fullPad: Edges = { left: 0, right: 100, top: 0, bottom: 100 };
export function validEdges(e: Edges) {
  return (
    [e.left, e.top].every((v) => Number.isFinite(v) && v >= -10 && v <= 10) &&
    [e.right, e.bottom].every((v) => Number.isFinite(v) && v >= 90 && v <= 110)
  );
}
export function onPaper(p: Point, e: Edges): Point {
  return {
    x: (p.x * 100 - e.left) / (e.right - e.left),
    y: (p.y * 100 - e.top) / (e.bottom - e.top),
  };
}
