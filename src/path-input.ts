import type { InkPoint as Point } from './model';

export interface Portion {
  start?: Point;
  end?: Point;
}
const inside = (p: Point) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const zero = { x: 0, y: 0 };
const sides = (p: Point, band: Point = zero) =>
  (p.x <= band.x ? 1 : 0) |
  (p.x >= 1 - band.x ? 2 : 0) |
  (p.y <= band.y ? 4 : 0) |
  (p.y >= 1 - band.y ? 8 : 0);

// Intersect the segment with the actual page. Clamping each point separately
// would turn motion outside the page into a line running along its edge.
function clip(a: Point, b: Point): [Point, Point] | undefined {
  let entry = 0,
    exit = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = b[axis] - a[axis];
    if (!delta) {
      if (a[axis] < 0 || a[axis] > 1) return;
      continue;
    }
    const t0 = -a[axis] / delta,
      t1 = (1 - a[axis]) / delta;
    entry = Math.max(entry, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (entry > exit) return;
  }
  const at = (t: number): Point => {
    const p: Point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (a.width !== undefined && b.width !== undefined) p.width = a.width + (b.width - a.width) * t;
    return p;
  };
  return [entry === 0 ? a : at(entry), exit === 1 ? b : at(exit)];
}
export class PathInput {
  private previous?: Point;
  private connected = false;
  private initialSides = 0;
  private band = zero;
  private saturated = 0;
  start(p: Point, band: Point = zero): Portion {
    this.band = band;
    this.saturated = 0;
    this.previous = p;
    this.connected = inside(p);
    this.initialSides = sides(p, band);
    return this.connected ? { start: p } : {};
  }
  move(p: Point): Portion {
    const a = this.previous;
    if (!a) return this.start(p);
    this.previous = p;
    if (a.x === p.x && a.y === p.y) return {};
    const near = sides(p, this.band);
    this.initialSides &= near;
    this.saturated &= near;
    // Only a stationary axis can latch inside the thin band covered by the pen.
    // A normal approach to the boundary retains all its original coordinates.
    const stationary = (a.x === p.x ? 3 : 0) | (a.y === p.y ? 12 : 0);
    const plateau = sides(a, this.band) & near & stationary;
    const outside = sides(a) & sides(p);
    this.saturated |= (plateau | outside) & ~this.initialSides;
    if (this.saturated) {
      this.connected = false;
      return {};
    }
    const segment = clip(a, p);
    if (!segment) {
      this.connected = false;
      return {};
    }
    const [from, to] = segment;
    const result = this.connected ? { end: to } : { start: from, end: to };
    this.connected = inside(p);
    return result;
  }
}

// The first contacts at a sensor edge can describe either a real edge stroke
// or a finger sliding in. Resolve that ambiguity before emitting permanent ink.
export class StrokeInput {
  private readonly path = new PathInput();
  private readonly emit: (part: Portion) => void;
  private buffer: Point[] = [];
  private entrySides = 0;
  private band = zero;
  constructor(emit: (part: Portion) => void) {
    this.emit = emit;
  }
  start(p: Point, band?: Point) {
    this.band = band ?? zero;
    this.entrySides = band ? sides(p, band) : 0;
    this.buffer = this.entrySides ? [p] : [];
    if (!this.entrySides) this.emit(this.path.start(p, band));
  }
  move(p: Point) {
    if (!this.entrySides) {
      this.emit(this.path.move(p));
      if (this.band !== zero && !inside(p)) {
        this.entrySides = sides(p, this.band);
        this.buffer = [p];
      }
      return;
    }
    const previous = this.buffer[this.buffer.length - 1];
    if (p.x === previous.x && p.y === previous.y) return;
    this.buffer.push(p);
    const shared = this.entrySides & sides(p, this.band);
    if (shared) {
      this.entrySides = shared;
      return;
    }
    // Keep the actual inward approach, including its anchor. A nearly pinned
    // normal coordinate can jitter while the other axis slides along the rim.
    let anchor = 0;
    for (let i = 1; i < this.buffer.length - 1; i++) {
      const a = this.buffer[i - 1],
        b = this.buffer[i];
      const dx = Math.abs(b.x - a.x) / this.band.x;
      const dy = Math.abs(b.y - a.y) / this.band.y;
      if (
        (this.entrySides & 3 && dx <= 0.25 && dy > 4 * dx) ||
        (this.entrySides & 12 && dy <= 0.25 && dx > 4 * dy)
      )
        anchor = i;
    }
    this.flush(anchor);
  }
  preview(): Point[][] {
    if (!this.buffer.length) return [];
    const paths: Point[][] = [];
    const clipper = new PathInput();
    for (let i = 0; i < this.buffer.length; i++) {
      const p = this.buffer[i];
      const part = i === 0 ? clipper.start(p, this.band) : clipper.move(p);
      if (part.start) paths.push([part.start]);
      if (part.end) paths[paths.length - 1].push(part.end);
    }
    return paths;
  }
  finish() {
    // A tap or a stroke lifted on the same edge keeps its original samples.
    if (this.entrySides) this.flush(0);
  }
  private flush(first: number) {
    this.emit(this.path.start(this.buffer[first], this.band));
    for (let i = first + 1; i < this.buffer.length; i++) this.emit(this.path.move(this.buffer[i]));
    this.buffer = [];
    this.entrySides = 0;
  }
}
