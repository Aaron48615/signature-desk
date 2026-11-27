import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { installCapBridge } from './stroke-caps.mjs';

export async function checkDirectGeometry(context, url) {
  const page = await context.newPage();
  await page.addInitScript(installCapBridge, 'appkit');
  const board = page.locator('#board');
  async function replay(width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    assert.equal(await page.locator('#weight').inputValue(), '6');
    assert.equal(await page.locator('#weightText').textContent(), '6 px');
    await page.locator('#direct').click();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !!window.capInput);
    await page.evaluate(() => {
      let time = 0;
      const send = (phase, x, y) =>
        window.capInput.onmessage({ phase, x, y, ratio: 1.5, timeMs: (time += 4) });
      const stroke = (...points) => {
        points.forEach(([x, y], i) => send(i ? 'move' : 'begin', x, y));
        send('end', 0, 0);
      };
      for (const x of [0, 1]) for (const y of [0, 1]) stroke([x, y]);
      for (const v of [0.25, 0.5, 0.75]) {
        stroke([0.25, v], [0.75, v]);
        stroke([v, 0.25], [v, 0.75]);
      }
      // A near-edge approach straddles the old window-dependent filter threshold.
      stroke([0.00465, 0.1], [0.00465, 0.2], [0.15, 0.2]);
      send('begin', 0.8, 0.9);
      send('move', 0.95, 0.9);
      send('move', 0.94, 0.9);
    });
    // Inspect the live canvas while the final fixed-width stroke is still down.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#board');
      const ctx = canvas.getContext('2d');
      const alpha = (x, y) =>
        ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data[3];
      return alpha(0.5, 0.5) > 0 && alpha(0.375, 0.375) === 0;
    });
    const active = await board.boundingBox();
    const sheet = await page.locator('#paper').boundingBox();
    assert.deepEqual(active, sheet, 'Ink must fill the sheet during capture');
    assert.ok(Math.abs(active.width / active.height - 1.5) < 0.001);
    const lastStrokeBounds = () =>
      board.evaluate(async (canvas) => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        // The isolated final stroke runs from x=80% to 95% at y=90%.
        const x0 = Math.floor(canvas.width * 0.78),
          y0 = Math.floor(canvas.height * 0.85);
        const w = Math.ceil(canvas.width * 0.2),
          h = Math.ceil(canvas.height * 0.1);
        const { data } = canvas.getContext('2d').getImageData(x0, y0, w, h);
        const box = [w, h, -1, -1];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] < 64) continue;
            box[0] = Math.min(box[0], x);
            box[1] = Math.min(box[1], y);
            box[2] = Math.max(box[2], x);
            box[3] = Math.max(box[3], y);
          }
        return box[2] < 0 ? null : box;
      });
    const command = (phase) =>
      page.evaluate((phase) => window.capInput.onmessage({ phase }), phase);
    const live = await lastStrokeBounds();
    assert.ok(live && live[2] - live[0] > active.width * 0.14);
    await command('undo');
    assert.deepEqual(await lastStrokeBounds(), live, 'Ignore shortcuts during an active stroke');
    await command('end');
    const committed = await lastStrokeBounds();
    // The committed cache can antialias the perimeter differently from the live stroke.
    assert.ok(committed && committed.every((v, i) => Math.abs(v - live[i]) <= 1));
    for (const native of [false, true]) {
      if (native) await command('undo');
      else await page.keyboard.press('ArrowLeft');
      assert.equal(await lastStrokeBounds(), null);
      if (native) await command('redo');
      else await page.keyboard.press('ArrowRight');
      const restored = await lastStrokeBounds();
      assert.ok(restored && restored.every((v, i) => Math.abs(v - committed[i]) <= 1));
    }
    assert.equal(await page.locator('#captureHint').isVisible(), true);
    const beforeExit = await board.evaluate((canvas) => canvas.toDataURL());
    await command('stop');
    const editing = await board.boundingBox();
    assert.deepEqual(editing, active);
    await lastStrokeBounds();
    assert.ok(
      await board.evaluate((canvas, before) => canvas.toDataURL() === before, beforeExit),
      'Leaving capture must preserve the displayed pixels',
    );
    await page.locator('#export').click();
    await page.waitForFunction(() => !!window.capFile);
    const bytes = await page.evaluate(async () =>
      Array.from(new Uint8Array(await window.capFile.arrayBuffer())),
    );
    return { active, editing, png: PNG.sync.read(Buffer.from(bytes)) };
  }
  try {
    const wide = await replay(1150, 820);
    const small = await replay(640, 540);
    assert.ok(wide.active.width > 359);
    assert.ok(small.active.width < wide.active.width);
    assert.equal(wide.png.width, 2400);
    assert.equal(wide.png.height, 1600);
    assert.equal(small.png.width, wide.png.width);
    assert.equal(small.png.height, wide.png.height);
    assert.ok(wide.png.data.equals(small.png.data), 'Window size must not alter exported ink');
    for (const [x, y, ink] of [
      [0, 0, true],
      [1, 1, true],
      [0, 1, true],
      [1, 0, true],
      [0.25, 0.25, true],
      [0.5, 0.5, true],
      [0.75, 0.75, true],
      [0.375, 0.375, false],
      [0.94, 0.9, true],
    ]) {
      const px = Math.min(wide.png.width - 1, Math.round(x * wide.png.width));
      const py = Math.min(wide.png.height - 1, Math.round(y * wide.png.height));
      assert.equal(wide.png.data[(py * wide.png.width + px) * 4 + 3] > 0, ink);
    }
    console.log(
      'PASS Mac capture widths ' +
        wide.active.width +
        ' / ' +
        small.active.width +
        ', identical 2400 × 1600 PNG pixels at both sizes',
    );
  } finally {
    await page.close();
  }
}
