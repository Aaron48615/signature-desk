import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StrokeInput, type Portion } from '../src/path-input.ts';
import type { Point } from '../src/model.ts';

const band = { x: 0.004, y: 0.006 };
const point = (x: number, y: number): Point => ({ x, y });
function record() {
  const parts: Portion[] = [];
  const input = new StrokeInput((part) => {
    if (part.start || part.end) parts.push(part);
  });
  return { input, parts };
}

test('direct entry removes the initial contact and tangential jitter on all four sides', () => {
  const orientations = [
    (n: number, t: number) => point(n, t),
    (n: number, t: number) => point(1 - n, t),
    (n: number, t: number) => point(t, n),
    (n: number, t: number) => point(t, 1 - n),
  ];
  for (const at of orientations) {
    const { input, parts } = record();
    input.start(at(0.002, 0.2), band);
    input.move(at(0.0021, 0.33));
    input.move(at(0.002, 0.4));
    assert.deepEqual(parts, [], 'Provisional ink stays out of the committed path');
    assert.deepEqual(input.preview(), [[at(0.002, 0.2), at(0.0021, 0.33), at(0.002, 0.4)]]);
    input.move(at(0.003, 0.4));
    input.move(at(0.3, 0.4));
    assert.deepEqual(input.preview(), []);
    input.finish();
    assert.deepEqual(parts, [
      { start: at(0.002, 0.4) },
      { end: at(0.003, 0.4) },
      { end: at(0.3, 0.4) },
    ]);
  }
});

test('a tap, an all-edge stroke and an inward diagonal retain their original points', () => {
  for (const points of [
    [point(1, 0)],
    [point(0, 0.1), point(0, 0.3), point(0, 0.2)],
    [point(0, 0.1), point(0.001, 0.101), point(0.003, 0.103), point(0.25, 0.3)],
  ]) {
    const { input, parts } = record();
    input.start(points[0], band);
    for (const p of points.slice(1)) input.move(p);
    input.finish();
    input.finish();
    assert.deepEqual(parts, [{ start: points[0] }, ...points.slice(1).map((end) => ({ end }))]);
  }
  const { input, parts } = record();
  input.start(point(0, 0.2)); // Ordinary pointer input remains immediate.
  input.move(point(0, 0.4));
  assert.deepEqual(parts, [{ start: point(0, 0.2) }, { end: point(0, 0.4) }]);
});

test('calibrated outside contacts, re-entry and the top-left corner use the actual entry', () => {
  const { input, parts } = record();
  input.start(point(0.4, 0.2), band);
  input.move(point(-0.02, 0.2));
  input.move(point(0, 0.3));
  input.move(point(0, 0.5));
  input.move(point(0.3, 0.5));
  input.finish();
  assert.deepEqual(parts, [
    { start: point(0.4, 0.2) },
    { end: point(0, 0.2) },
    { start: point(0, 0.5) },
    { end: point(0.3, 0.5) },
  ]);
  parts.length = 0;
  input.start(point(-0.05, -0.01), band);
  input.move(point(0, 0));
  input.move(point(0.2, 0));
  input.move(point(0.3, 0.2));
  input.finish();
  assert.deepEqual(parts, [{ start: point(0.2, 0) }, { end: point(0.3, 0.2) }]);
});
