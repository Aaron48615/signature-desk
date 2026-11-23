export interface Point {
  x: number;
  y: number;
}
export interface InkPoint extends Point {
  width?: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}
export type Matrix = [number, number, number, number, number, number];
export interface Stroke {
  kind: 'stroke';
  paths: InkPoint[][];
  endTaper?: number;
  color: string;
  width: number;
}
interface Group {
  kind: 'group';
  scene: Scene;
  matrix: Matrix;
}
export interface Bitmap {
  kind: 'bitmap';
  image: HTMLImageElement;
  inkMask?: HTMLCanvasElement;
}
export interface Scene {
  w: number;
  h: number;
  items: readonly (Stroke | Group | Bitmap)[];
  orientation?: { base: Scene; degrees: number; mirrored: boolean };
}
export interface Artwork {
  scene: Scene;
  background: string | null;
}

export const blank = (w = 1200, h = 640): Scene => ({ w, h, items: [] });
export const initial = (): Artwork => ({ scene: blank(), background: null });
export const drawn = (scene: Scene, stroke: Stroke): Scene => ({
  w: scene.w,
  h: scene.h,
  items: [...scene.items, stroke],
});

function wrap(scene: Scene, w: number, h: number, matrix: Matrix): Scene {
  return { w, h, items: scene.items.length ? [{ kind: 'group', scene, matrix }] : [] };
}
export function resize(scene: Scene, w: number, h: number): Scene {
  if (scene.w === w && scene.h === h) return scene;
  const scale = Math.min(w / scene.w, h / scene.h);
  return wrap(scene, w, h, [
    scale,
    0,
    0,
    scale,
    (w - scene.w * scale) / 2,
    (h - scene.h * scale) / 2,
  ]);
}
export function crop(scene: Scene, rect: Rect): Scene {
  if (rect.x === 0 && rect.y === 0 && rect.w === scene.w && rect.h === scene.h) return scene;
  return wrap(scene, rect.w, rect.h, [1, 0, 0, 1, -rect.x, -rect.y]);
}
// Angles and reflections share one source rectangle. A crop or resize starts a new one.
function orient(base: Scene, degrees: number, mirrored: boolean): Scene {
  const normalized = ((degrees % 360) + 360) % 360;
  const quarter = Math.round(normalized / 90);
  const snapped = Math.abs(quarter * 90 - normalized) < 1e-10;
  const angle = snapped ? (quarter % 4) * 90 : normalized;
  if (angle === 0 && !mirrored) return base;
  const rad = (angle * Math.PI) / 180;
  const cos = snapped ? [1, 0, -1, 0][quarter % 4] : Math.cos(rad);
  const sin = snapped ? [0, 1, 0, -1][quarter % 4] : Math.sin(rad);
  const w = Math.ceil(base.w * Math.abs(cos) + base.h * Math.abs(sin));
  const h = Math.ceil(base.w * Math.abs(sin) + base.h * Math.abs(cos));
  const a = mirrored ? -cos : cos;
  const b = mirrored ? -sin : sin;
  const scene = wrap(base, w, h, [
    a,
    b,
    -sin,
    cos,
    (w - a * base.w + sin * base.h) / 2,
    (h - b * base.w - cos * base.h) / 2,
  ]);
  return { ...scene, orientation: { base, degrees: angle, mirrored } };
}
export function rotate(scene: Scene, degrees: number): Scene {
  if (degrees % 360 === 0) return scene;
  const previous = scene.orientation;
  return orient(
    previous?.base ?? scene,
    (previous?.degrees ?? 0) + degrees,
    previous?.mirrored ?? false,
  );
}
export function flip(scene: Scene, horizontal: boolean): Scene {
  const previous = scene.orientation;
  return orient(
    previous?.base ?? scene,
    (horizontal ? 0 : 180) - (previous?.degrees ?? 0),
    !previous?.mirrored,
  );
}

export class History {
  private past: Artwork[] = [];
  private future: Artwork[] = [];
  current: Artwork;
  saved: Artwork;
  constructor(start = initial()) {
    this.current = this.saved = start;
  }
  get dirty() {
    return this.saved !== this.current;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next: Artwork) {
    if (this.current === next) return;
    this.past.push(this.current);
    this.current = next;
    this.future = [];
  }
  undo() {
    if (this.canUndo) {
      this.future.push(this.current);
      this.current = this.past.pop()!;
    }
  }
  redo() {
    if (this.canRedo) {
      this.past.push(this.current);
      this.current = this.future.pop()!;
    }
  }
}

export const validSize = (w: number, h: number) =>
  Number.isInteger(w) &&
  Number.isInteger(h) &&
  w > 0 &&
  h > 0 &&
  w <= 8192 &&
  h <= 8192 &&
  w * h <= 16777216;
