import type { InkPoint, Point } from './model';

// Motion is measured in fractions of the pad's longer side per second.
export class NaturalNib {
  private last?: Point;
  private movedAt = 0;
  private speed?: number;
  private readonly base: number;
  private readonly scaleX: number;
  private readonly scaleY: number;

  constructor(base: number, w: number, h: number) {
    this.base = base;
    this.scaleX = w / Math.max(w, h);
    this.scaleY = h / Math.max(w, h);
  }

  sample(p: Point, time: number): InkPoint {
    if (this.last) {
      const distance = Math.hypot(
        (p.x - this.last.x) * this.scaleX,
        (p.y - this.last.y) * this.scaleY,
      );
      if (distance > 0) {
        const elapsed = time - this.movedAt;
        // Low-resolution and batched input can produce equal timestamps.
        const dt = elapsed > 0 ? elapsed : 8;
        const instant = Math.min(2, (distance * 1000) / dt);
        const blend = -Math.expm1(-dt / 22);
        this.speed =
          this.speed === undefined ? instant : this.speed + (instant - this.speed) * blend;
        this.movedAt = time;
      }
    } else this.movedAt = time;
    this.last = p;
    const width =
      this.speed === undefined
        ? this.base
        : Math.max(1, this.base * (1.18 - 0.32 * ramp(this.speed, 0.08, 1.15)));
    return { ...p, width };
  }

  lift(time?: number): number {
    if (
      time === undefined ||
      this.speed === undefined ||
      !this.last ||
      this.last.x <= 0 ||
      this.last.x >= 1 ||
      this.last.y <= 0 ||
      this.last.y >= 1
    )
      return 0;
    return ramp(this.speed, 0.3, 1.12) * (1 - ramp(time - this.movedAt, 20, 85));
  }
}

function ramp(value: number, low: number, high: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

interface Vertex extends Point {
  width: number;
  length: number;
}

// Follow the same midpoint quadratic centerline used by the fixed-width pen.
function centerline(path: InkPoint[], base: number, pixelsPerUnit: number): Vertex[] {
  const vertices: Vertex[] = [{ ...path[0], width: path[0].width ?? base, length: 0 }];
  function append(x: number, y: number, width: number) {
    const last = vertices[vertices.length - 1];
    const distance = Math.hypot(x - last.x, y - last.y);
    if (distance) vertices.push({ x, y, width, length: last.length + distance });
  }
  for (let i = 1; i < path.length - 1; i++) {
    const a = vertices[vertices.length - 1],
      b = path[i],
      next = path[i + 1];
    const bw = b.width ?? base;
    const x = (b.x + next.x) / 2,
      y = (b.y + next.y) / 2,
      width = (bw + (next.width ?? base)) / 2;
    // Limit curve and width error to 0.15 pixels even on enlarged PNG exports.
    const curvature = Math.max(
      Math.hypot(a.x - 2 * b.x + x, a.y - 2 * b.y + y),
      Math.abs(a.width - 2 * bw + width),
    );
    const steps = Math.max(1, Math.ceil(Math.sqrt((curvature * pixelsPerUnit) / 0.6)));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps,
        u = 1 - t;
      append(
        u * u * a.x + 2 * u * t * b.x + t * t * x,
        u * u * a.y + 2 * u * t * b.y + t * t * y,
        u * u * a.width + 2 * u * t * bw + t * t * width,
      );
    }
  }
  const last = path[path.length - 1];
  append(last.x, last.y, last.width ?? base);
  return vertices;
}

export function paintNib(
  ctx: CanvasRenderingContext2D,
  path: InkPoint[],
  base: number,
  start: boolean,
  flick: number,
) {
  const transform = ctx.getTransform();
  const pixelsPerUnit = Math.max(
    1,
    Math.hypot(transform.a, transform.b),
    Math.hypot(transform.c, transform.d),
  );
  const points = centerline(path, base, pixelsPerUnit);
  const total = points[points.length - 1].length;
  const head = start ? Math.min(total * 0.26, base * 1.15) : 0;
  const tail = flick > 0 ? Math.min(total * 0.32, base * 1.7 + 1) : 0;
  const strength = Math.min(1, total / (base * 2.5));
  const profile = (p: Vertex) => {
    let width = p.width;
    if (head && p.length < head) width += (base * 0.78 - width) * strength * (1 - p.length / head);
    if (tail && total - p.length < tail) {
      const progress = 1 - (total - p.length) / tail;
      // Keep a full shoulder, then narrow only the last few pixels of a quick lift.
      width += (base * 0.22 - width) * strength * flick * progress * progress;
    }
    return Math.max(1, width) / 2;
  };

  // Fill the disks and connecting strips together. Reversals and joins stay solid,
  // and antialiasing is applied once even where several strips overlap.
  ctx.beginPath();
  let previous = points[0],
    radius = profile(previous);
  const disk = (p: Point, r: number) => {
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
  };
  disk(previous, radius);
  const join = (p: Vertex) => {
    const dx = p.x - previous.x,
      dy = p.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const nx = dy / distance,
      ny = -dx / distance,
      r = profile(p);
    ctx.moveTo(previous.x + nx * radius, previous.y + ny * radius);
    ctx.lineTo(p.x + nx * r, p.y + ny * r);
    ctx.lineTo(p.x - nx * r, p.y - ny * r);
    ctx.lineTo(previous.x - nx * radius, previous.y - ny * radius);
    ctx.closePath();
    disk(p, r);
    previous = p;
    radius = r;
  };
  const transitions = tail ? [head, total - tail, total - tail / 2, total - tail / 4] : [head];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    // A two-sample flick can be long. Keep both tapers local to the ends.
    for (const edge of transitions) {
      if (edge <= a.length || edge >= b.length) continue;
      const t = (edge - a.length) / (b.length - a.length);
      join({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        width: a.width + (b.width - a.width) * t,
        length: edge,
      });
    }
    join(b);
  }
  ctx.fill();
}
