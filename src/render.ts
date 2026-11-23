import type { Artwork, Rect, Scene, Stroke } from './model';
import { paintNib } from './nib';
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.strokeStyle = ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  for (const p of stroke.paths) {
    if (!p.length) continue;
    if (stroke.endTaper !== undefined) {
      paintNib(
        ctx,
        p,
        stroke.width,
        p === stroke.paths[0],
        p === stroke.paths[stroke.paths.length - 1] ? stroke.endTaper : 0,
      );
      continue;
    }
    const first = p[0],
      last = p[p.length - 1],
      radius = stroke.width / 2;
    if (p.length > 1) {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < p.length - 1; i++) {
        ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
      }
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    // WebKit can drop a sector of a native round cap when nearby samples reverse.
    // A disk at each endpoint gives the same round footprint for any tangent.
    ctx.beginPath();
    ctx.arc(first.x, first.y, radius, 0, 2 * Math.PI);
    if (first.x !== last.x || first.y !== last.y) {
      ctx.moveTo(last.x + radius, last.y);
      ctx.arc(last.x, last.y, radius, 0, 2 * Math.PI);
    }
    ctx.fill();
  }
}
function paintScene(ctx: CanvasRenderingContext2D, scene: Scene, inkOnly: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, scene.w, scene.h);
  ctx.clip();
  for (const item of scene.items) {
    if (item.kind === 'stroke') paintStroke(ctx, item);
    else if (item.kind === 'bitmap')
      ctx.drawImage(inkOnly && item.inkMask ? item.inkMask : item.image, 0, 0);
    else {
      ctx.save();
      ctx.transform(...item.matrix);
      paintScene(ctx, item.scene, inkOnly);
      ctx.restore();
    }
  }
  ctx.restore();
}
function sceneCoordinates(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  width: number,
  height: number,
) {
  const scale = Math.min(width / scene.w, height / scene.h);
  ctx.translate((width - scene.w * scale) / 2, (height - scene.h * scale) / 2);
  ctx.scale(scale, scale);
}
export function render(
  canvas: HTMLCanvasElement,
  art: Artwork,
  width: number,
  height: number,
  inkOnly = false,
) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  if (art.background) {
    ctx.fillStyle = art.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.save();
  sceneCoordinates(ctx, art.scene, width, height);
  paintScene(ctx, art.scene, inkOnly);
  ctx.restore();
}
// Only the display keeps a bitmap of committed ink. PNG export still uses the source scene.
export function boardRenderer(canvas: HTMLCanvasElement) {
  const committed = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let cached: Artwork | undefined;
  let hadDraft = false;
  return (art: Artwork, width: number, height: number, draft?: Stroke) => {
    const changed = cached !== art || committed.width !== width || committed.height !== height;
    if (changed) {
      render(committed, art, width, height);
      cached = art;
    }
    if (!changed && !draft && !hadDraft) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(committed, 0, 0);
    if (draft) {
      ctx.save();
      sceneCoordinates(ctx, art.scene, width, height);
      paintStroke(ctx, draft);
      ctx.restore();
    }
    hadDraft = !!draft;
  };
}
// Scan ink alpha only. Cropped-away marks, paper colour and guides cannot affect bounds.
export function inkBounds(scene: Scene, padding: number): Rect | null {
  const canvas = document.createElement('canvas');
  render(canvas, { scene, background: null }, scene.w, scene.h, true);
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let minX = scene.w,
    minY = scene.h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - padding),
    y = Math.max(0, minY - padding);
  return {
    x,
    y,
    w: Math.min(scene.w, maxX + padding + 1) - x,
    h: Math.min(scene.h, maxY + padding + 1) - y,
  };
}
