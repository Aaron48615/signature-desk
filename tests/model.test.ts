import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blank,
  crop,
  drawn,
  flip,
  History,
  initial,
  resize,
  rotate,
  type Stroke,
} from '../src/model.ts';
const mark: Stroke = { kind: 'stroke', width: 6, color: '#101010', paths: [[{ x: 5, y: 7 }]] };
test('resize contains existing strokes without changing originals', () => {
  const old = drawn(blank(100, 100), mark),
    result = resize(old, 300, 100);
  assert.deepEqual(result.items[0], { kind: 'group', scene: old, matrix: [1, 0, 0, 1, 100, 0] });
  assert.equal(old.items[0], mark);
});
test('rotation uses the full transformed bounding box; crop retains a clip', () => {
  const original = drawn(blank(200, 80), mark),
    cut = crop(original, { x: 3, y: 4, w: 20, h: 60 });
  const r = rotate(cut, 90);
  assert.deepEqual([r.w, r.h], [60, 20]);
  assert.deepEqual([rotate(r, -90).w, rotate(r, -90).h], [20, 60]);
  assert.equal(flip(cut, true).items[0].kind, 'group');
  assert.equal(cut.items[0].kind === 'group' && cut.items[0].scene, original);
});
test('undo, redo, saved state and branching are independent', () => {
  const h = new History();
  assert.equal(h.dirty, false);
  h.commit({ ...initial(), scene: drawn(blank(), mark) });
  h.saved = h.current;
  h.commit({ ...h.current, background: '#ff0011' });
  assert.equal(h.dirty, true);
  h.undo();
  assert.equal(h.dirty, false);
  h.redo();
  assert.equal(h.dirty, true);
  h.undo();
  h.commit({ ...h.current, background: '#ffee00' });
  assert.equal(h.canRedo, false);
});

import { PathInput } from '../src/path-input.ts';
test('re-entry starts a separate subpath while legal edge strokes are preserved', () => {
  const path = new PathInput();
  assert.deepEqual(path.start({ x: 0, y: 0.2 }), { start: { x: 0, y: 0.2 } });
  assert.deepEqual(path.move({ x: 0, y: 0.3 }), { end: { x: 0, y: 0.3 } });
  path.move({ x: 0.75, y: 0.3 });
  assert.deepEqual(path.move({ x: 1.25, y: 0.5 }), { end: { x: 1, y: 0.4 } });
  assert.deepEqual(path.move({ x: 1.25, y: 0.7 }), {});
  const back = path.move({ x: 0.75, y: 0.7 });
  assert.deepEqual(back, { start: { x: 1, y: 0.7 }, end: { x: 0.75, y: 0.7 } });
  path.move({ x: 1, y: 0.7 });
  assert.deepEqual(path.move({ x: 1, y: 0.9 }), {});
});

test('raw 99.80% plateau and the left edge stop tangential ink, without trimming the interior', () => {
  for (const [near, edge] of [
    [0.99, 0.998],
    [0.01, 0],
  ]) {
    const p = new PathInput();
    p.start({ x: 0.5, y: 0.25 }, { x: 0.004, y: 0.004 });
    assert.deepEqual(p.move({ x: near, y: 0.3 }), { end: { x: near, y: 0.3 } });
    assert.deepEqual(p.move({ x: edge, y: 0.31 }), { end: { x: edge, y: 0.31 } });
    assert.deepEqual(p.move({ x: edge, y: 0.45 }), {});
    assert.deepEqual(p.move({ x: edge, y: 0.55 }), {});
    assert.ok(p.move({ x: 0.5, y: 0.6 }).start);
  }
});

import { onPaper, fullPad, validEdges } from '../src/calibration.ts';
test('the measured right side maps to the edge while the diagnostic input remains raw', () => {
  const edges = { ...fullPad, right: 99.8 },
    raw = { x: 0.998, y: 0.5 };
  assert.equal(validEdges(edges), true);
  assert.deepEqual(onPaper(raw, edges), { x: 1, y: 0.5 });
  assert.equal(raw.x, 0.998);
  assert.equal(onPaper({ x: 0.499, y: 0.5 }, edges).x, 0.5);
  assert.equal(validEdges({ ...edges, left: NaN }), false);
});

test('successive arbitrary angles use the original frame, including tiny increments and narrow images', () => {
  for (const [width, height] of [
    [800, 400],
    [1, 8192],
    [37, 37],
    [1, 1],
  ]) {
    const base = drawn(blank(width, height), mark);
    for (const [step, count] of [
      [89, 360],
      [-89, 360],
      [0.1, 3600],
      [22.5, 16],
    ]) {
      let result = base;
      for (let n = 1; n <= count; n++) {
        result = rotate(result, step);
        const radians = (n * step * Math.PI) / 180;
        const extent = (x: number, y: number) =>
          Math.ceil(x * Math.abs(Math.cos(radians)) + y * Math.abs(Math.sin(radians)) - 1e-8);
        assert.deepEqual([result.w, result.h], [extent(width, height), extent(height, width)]);
        assert.ok(result === base || result.orientation?.base === base);
      }
      assert.equal(result, base);
    }
  }
});
test('flips compose in display coordinates and crop starts a new rotation source', () => {
  const base = drawn(blank(800, 400), mark);
  const turned = rotate(base, 89);
  assert.deepEqual(flip(rotate(flip(base, true), -89), true), turned);
  assert.deepEqual(flip(flip(turned, false), false), turned);
  assert.equal(rotate(rotate(turned, 1), -90), base);
  const cut = crop(turned, { x: 10, y: 20, w: 90, h: 140 });
  assert.equal(rotate(rotate(cut, 31.25), -31.25), cut);
  assert.equal(flip(flip(cut, true), true), cut);
  assert.deepEqual([rotate(cut, -270).w, rotate(cut, -270).h], [140, 90]);
  const withNewInk = drawn(turned, mark);
  assert.equal(rotate(rotate(withNewInk, 89), -89), withNewInk);
});

import { NaturalNib } from '../src/nib.ts';
test('nib speed uses physical aspect, stays bounded across all widths and gives a round resting lift', () => {
  for (let base = 1; base <= 24; base += 0.5) {
    const along = new NaturalNib(base, 800, 400),
      across = new NaturalNib(base, 800, 400);
    for (let i = 0; i < 15; i++) {
      const x = along.sample({ x: 0.1 + i * 0.01, y: 0.25 }, i * 7).width!;
      const y = across.sample({ x: 0.1, y: 0.25 + i * 0.02 }, i * 7).width!;
      assert.ok(Math.abs(x - y) < 1e-10);
      assert.ok(x >= Math.max(1, base * 0.86) - 1e-10 && x <= base * 1.18 + 1e-10);
    }
    assert.equal(along.lift(100), 1);
    along.sample({ x: 0.1 + 14 * 0.01, y: 0.25 }, 200);
    assert.equal(along.lift(201), 0);
    assert.equal(along.lift(), 0);
    for (const t of [201, 201, 200, 30000]) {
      const p = along.sample({ x: t === 201 ? 0.6 : 0.55, y: 0.6 }, t);
      assert.ok(Number.isFinite(p.width));
    }
  }
});
test('clipping interpolates nib widths and discards the same provisional edge prefix', () => {
  const path = new PathInput();
  path.start({ x: 0.8, y: 0.4, width: 8 });
  const exit = path.move({ x: 1.2, y: 0.4, width: 4 }).end!;
  assert.ok(Math.abs(exit.width! - 6) < 1e-10);
  const reentry = path.move({ x: 0.6, y: 0.5, width: 10 }).start!;
  assert.ok(Math.abs(reentry.width! - 6) < 1e-10);
});
