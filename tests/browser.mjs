// Real file:// page, no network, no existing browser profile; only synthetic strokes.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { checkDirectGeometry } from './direct-geometry.mjs';
import { checkNib } from './nib-browser.mjs';
import { installCapBridge, checkStrokeCaps } from './stroke-caps.mjs';
const dir = await mkdtemp(join(tmpdir(), 'inkpad-test-'));
const browser = await chromium.launch(
  process.env.INKPAD_CHROME ? { executablePath: process.env.INKPAD_CHROME } : { channel: 'chrome' },
);
try {
  const ctx = await browser.newContext({
    offline: true,
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
  });
  const errors = [],
    net = [];
  await ctx.addInitScript(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }),
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) net.push(r.url());
  });
  const url = pathToFileURL(resolve('release/Signature Desk.html')).href;
  await page.goto(url);
  const byId = (id) => page.locator('#' + id);
  const click = (id) => byId(id).click(),
    fill = (id, v) => byId(id).fill(String(v));
  const pixel = (png, x, y) =>
    Array.from(png.data.subarray(4 * (y * png.width + x), 4 * (y * png.width + x) + 4));
  async function exported(id = 'export') {
    const download = page.waitForEvent('download');
    await click(id);
    const item = await download;
    const path = join(dir, 'test.png');
    await item.saveAs(path);
    return PNG.sync.read(await readFile(path));
  }
  async function stroke(points, id = 'board') {
    const box = await byId(id).boundingBox(),
      xy = ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
    await page.mouse.move(...xy(points[0]));
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...xy(p), { steps: 4 });
    await page.mouse.up();
  }
  assert.equal(await byId('export').isDisabled(), true);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.title(), 'Signature Desk');
  assert.equal(await page.locator('h1').textContent(), 'Signature Desk');
  assert.equal(await page.locator('#language + .mode').count(), 1);
  assert.equal(await byId('process').innerText(), 'Edit & export');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await click('language');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.evaluate(() => localStorage.length), 1);
  assert.equal(await page.title(), '签字板');
  assert.equal(await page.locator('h1').textContent(), '签字板');
  await click('direct');
  assert.match(await byId('dialogBody').textContent(), /桌面应用/);
  await click('okDialog');
  await byId('sizeTools').locator('summary').click();
  await fill('boardW', 400);
  await fill('boardH', 200);
  await click('applySize');
  await page.getByRole('button', { name: '赭红', exact: true }).click();
  await fill('weight', 10);
  const board = await byId('board').boundingBox();
  await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
  await byId('touchMarker').waitFor({ state: 'visible' });
  const tip = await byId('touchMarker').evaluate((e) => [
    e.getBoundingClientRect().width,
    getComputedStyle(e).color,
  ]);
  assert.ok(Math.abs(tip[0] - 10 * Math.min(board.width / 400, board.height / 200)) < 0.1);
  assert.equal(tip[1], 'rgb(134, 71, 61)');
  assert.equal(await byId('export').isDisabled(), true);
  await page.mouse.move(1, 1);
  await byId('touchMarker').waitFor({ state: 'hidden' });
  await stroke([[0.125, 0.25]]);
  await stroke([
    [0.65, 0.7],
    [0.8, 0.7],
  ]);
  let png = await exported();
  assert.deepEqual([png.width, png.height], [800, 400]);
  assert.deepEqual(pixel(png, 100, 100), [134, 71, 61, 255]);
  assert.equal(pixel(png, 301, 180)[3], 0);
  const edge = pixel(png, 100, 91)[3];
  assert.ok(edge > 0);
  assert.equal(pixel(png, 100, 86)[3], 0);
  await page.locator('[data-bg=white]').click();
  assert.deepEqual(pixel(await exported(), 0, 0), [255, 255, 255, 255]);
  await page.locator('#bgCustom').fill('#abc123');
  assert.deepEqual(pixel(await exported(), 0, 0), [171, 193, 35, 255]);
  await click('process');
  await fill('padding', 5);
  await click('trim');
  const opaqueTrim = await exported('saveProcessed');
  assert.ok(opaqueTrim.width < 800 && opaqueTrim.height < 400);
  assert.deepEqual(pixel(opaqueTrim, 0, 0), [171, 193, 35, 255]);
  await page.locator('[data-bg=transparent]').click();
  const unchanged = await exported();
  let downloads = 0;
  page.on('download', () => downloads++);
  async function edit() {
    await click('process');
    await page.waitForFunction(() => !document.getElementById('saveProcessed').disabled);
  }
  await edit();
  await click('flipX');
  assert.deepEqual(pixel(await exported('saveProcessed'), 699, 100), [134, 71, 61, 255]);
  assert.equal(downloads, 1);
  await edit();
  await click('flipX');
  await click('flipY');
  assert.deepEqual(pixel(await exported('saveProcessed'), 699, 299), [134, 71, 61, 255]);
  await edit();
  await fill('angle', 37);
  await click('rotate');
  const arbitrary = await exported('saveProcessed');
  assert.ok(arbitrary.width > 800 && arbitrary.height > 400);
  await edit();
  await fill('angle', 89);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) document.getElementById('rotate').click();
  });
  const after20 = await byId('processSize').textContent();
  assert.equal(after20, '889 × 650 px');
  await click('editUndo');
  await click('editRedo');
  assert.equal(await byId('processSize').textContent(), after20);
  const twenty = await exported('saveProcessed');
  await edit();
  await fill('angle', -20);
  await click('rotate');
  const once = await exported('saveProcessed');
  assert.deepEqual(twenty.data, once.data);
  await edit();
  await fill('angle', 89);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) document.getElementById('rotate').click();
  });
  await fill('angle', -89);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) document.getElementById('rotate').click();
  });
  assert.deepEqual((await exported('saveProcessed')).data, unchanged.data);
  await edit();
  await fill('angle', 89);
  await click('rotate');
  await fill('angle', 1);
  await click('rotate');
  let quarter = await exported('saveProcessed');
  assert.deepEqual([quarter.width, quarter.height], [400, 800]);
  assert.deepEqual(pixel(quarter, 299, 100), [134, 71, 61, 255]);
  await edit();
  await fill('angle', 89);
  await click('rotate');
  await click('flipX');
  await click('rotate');
  await click('flipX');
  assert.deepEqual((await exported('saveProcessed')).data, unchanged.data);
  await edit();
  await fill('angle', 360);
  await click('rotate');
  assert.equal(await byId('editUndo').isDisabled(), true);
  await fill('angle', '');
  await click('rotate');
  assert.match(await byId('processStatus').innerText(), /360/);
  await click('processClose');
  await edit();
  await fill('padding', 5);
  await click('trim');
  const trimSize = await byId('processSize').innerText();
  await fill('angle', 90);
  await click('rotate');
  await click('editUndo');
  await click('editRedo');
  const turned = await exported('saveProcessed');
  assert.equal(trimSize, turned.height + ' × ' + turned.width + ' px');
  await edit();
  await click('manualCrop');
  await page.keyboard.press('Escape');
  assert.equal(await byId('processDialog').isVisible(), true);
  await click('manualCrop');
  await stroke(
    [
      [0.05, 0.1],
      [0.3, 0.5],
    ],
    'processCanvas',
  );
  let cut = await exported('saveProcessed');
  assert.ok(cut.width <= 203 && cut.height <= 163);
  assert.ok(cut.data.some((v, i) => i % 4 === 3 && v));
  await edit();
  await click('manualCrop');
  await stroke(
    [
      [0.05, 0.1],
      [0.3, 0.5],
    ],
    'processCanvas',
  );
  await fill('angle', 89.5);
  await click('rotate');
  await fill('angle', -89.5);
  await click('rotate');
  const restoredCrop = await exported('saveProcessed');
  assert.deepEqual([restoredCrop.width, restoredCrop.height], [cut.width, cut.height]);
  assert.deepEqual(restoredCrop.data, cut.data);
  await edit();
  await click('trim');
  await click('processClose');
  assert.deepEqual((await exported()).data, unchanged.data);
  assert.equal(await byId('boardSize').innerText(), '400 × 200 px');
  await click('resetSize');
  assert.equal(await byId('boardSize').innerText(), '1200 × 640 px');
  await click('undo');
  assert.deepEqual((await exported()).data, unchanged.data);
  await click('language');
  await click('language');
  assert.deepEqual((await exported()).data, unchanged.data);
  await click('lock');
  await fill('outW', 320);
  await fill('outH', 220);
  png = await exported();
  assert.deepEqual([png.width, png.height], [320, 220]);
  await fill('outW', 8192);
  await fill('outH', 1);
  await edit();
  await fill('angle', 45);
  await click('rotate');
  assert.equal(await byId('processSize').textContent(), '8192 × 1 px');
  assert.equal(await byId('editUndo').isDisabled(), true);
  assert.match(await byId('processStatus').innerText(), /超过尺寸上限/);
  await fill('angle', 90);
  await click('rotate');
  assert.equal(await byId('processSize').textContent(), '1 × 8192 px');
  await click('processClose');
  await fill('outW', 320);
  await fill('outH', 220);
  await click('clear');
  assert.equal(await byId('export').isDisabled(), true);
  await click('undo');
  for (const reason of ['AbortError', 'NotAllowedError']) {
    await page.evaluate(
      (reason) =>
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: async () => {
            throw new DOMException('synthetic', reason);
          },
        }),
      reason,
    );
    await click('export');
    await page.waitForFunction(() => !document.querySelector('#export').disabled);
    assert.match(await byId('status').textContent(), reason === 'AbortError' ? /取消/ : /保存失败/);
    await edit();
    await click('flipX');
    await click('saveProcessed');
    await page.waitForFunction(() => !document.getElementById('saveProcessed').disabled);
    assert.equal(await byId('processDialog').isVisible(), true);
    assert.ok(!(await byId('editUndo').isDisabled()));
    await click('processClose');
  }
  for (const [width, height] of [
    [1150, 760],
    [1280, 720],
    [1024, 640],
    [900, 600],
    [640, 540],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(60);
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.querySelector('#status').getBoundingClientRect().bottom <= innerHeight,
      ),
      'Desktop fits ' + width + 'x' + height,
    );
  }
  await page.setViewportSize({ width: 390, height: 750 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await click('language');
  await page.setViewportSize({ width: 320, height: 568 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const selector = await byId('language').boundingBox();
  const mode = await page.locator('.mode').boundingBox();
  assert.ok(selector.x + selector.width <= mode.x);
  await click('language');
  assert.deepEqual(net, []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS offline file, dot and split strokes, PNG RGBA and edges, resize, crop, rotate, flips, history, free dimensions and mobile layout',
  );
  const native = await ctx.newPage();
  await native.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      transformCallback: (fn) => {
        (window.testCallbacks ??= []).push(fn);
        return window.testCallbacks.length - 1;
      },
      invoke: async (cmd, args, options) => {
        if (cmd === 'load_language') return sessionStorage.getItem('fixture-language');
        if (cmd === 'store_language') {
          sessionStorage.setItem('fixture-language', args.language);
          return;
        }
        if (cmd === 'plugin:event|listen' && args.event === 'ink-blur')
          window.testWindowBlur = window.testCallbacks[args.handler];
        if (cmd === 'devices')
          return [{ id: 'fixture', name: '合成测试设备', ratio: 2, status: 0 }];
        if (cmd === 'start_input') {
          window.testSample = args.output;
          return;
        }
        if (cmd === 'save_png') {
          window.testSavedLanguage = options?.headers?.['x-ink-language'];
          window.testSavedPng = Array.from(args);
          return true;
        }
      },
    };
  });
  native.on('pageerror', (e) => errors.push(e.message));
  await native.goto(url);
  await native.locator('#language').click();
  await native.waitForFunction(() => sessionStorage.getItem('fixture-language') === 'zh');
  await native.reload();
  await native.waitForFunction(
    () => document.documentElement.dataset.ready && document.documentElement.lang === 'zh-CN',
  );
  await native.locator('#language').click();
  await native.waitForFunction(() => sessionStorage.getItem('fixture-language') === 'en');
  await native.locator('#direct').click();
  await native.keyboard.press('Space');
  await native.waitForFunction(() => !!window.testSample);
  await native.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(
    await native.locator('#captureHint').isVisible(),
    true,
    'Native responder handoff must keep direct writing active',
  );
  const frames = JSON.parse(await readFile(new URL('./contacts.json', import.meta.url), 'utf8'));
  await native.evaluate((frames) => {
    for (const f of frames) {
      if (f.expect) window.testSample.onmessage({ phase: f.expect, x: f.x, y: f.y, ratio: 2 });
    }
  }, frames);
  await native.waitForFunction(() => document.querySelector('#captureHint').hidden);
  await native.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const points = await native.evaluate(() => {
    const c = document.querySelector('#board'),
      g = c.getContext('2d');
    return [
      [0.08, 0.1],
      [0.5, 0.5],
      [0.84, 0.83],
      [0.12, 0.87],
    ].map(
      ([x, y]) => g.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data[3],
    );
  });
  assert.ok(points[0] > 0 && points[2] > 0 && points[3] > 0);
  assert.equal(points[1], 0);
  await native.locator('#direct').click();
  await native.keyboard.press('Space');
  await native.waitForFunction(() => !document.querySelector('#captureHint').hidden);
  await native.evaluate(() => window.testWindowBlur({ event: 'ink-blur', id: 1, payload: null }));
  assert.equal(
    await native.locator('#captureHint').isHidden(),
    true,
    'Native window deactivation must stop writing',
  );
  async function edgeReplay(interval) {
    await native.locator('#clear').click();
    await native.locator('#direct').click();
    await native.keyboard.press('Space');
    await native.waitForFunction(() => !document.querySelector('#captureHint').hidden);
    return native.evaluate(async (interval) => {
      const send = (phase, x, y) => window.testSample.onmessage({ phase, x, y, ratio: 2 });
      const samples = [
        ['begin', 0, 0.25],
        ['move', 0.5, 0.25],
        ['move', 0.995, 0.25],
        ['move', 1, 0.25],
        ['move', 1, 0.65],
        ['move', 1.02, 0.72],
        ['move', 1.03, 0.79],
        ['move', 0.8, 0.85],
        ['end', 0, 0],
        ['stop', 0, 0],
      ];
      for (const v of samples) {
        send(...v);
        await new Promise((r) => setTimeout(r, interval));
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.querySelector('#board'),
        ctx = c.getContext('2d');
      const alpha = (x, y) => ctx.getImageData(x, Math.round(y * c.height), 1, 1).data[3];
      return {
        edge: alpha(c.width - 1, 0.5),
        near: alpha(Math.round(0.995 * c.width), 0.25),
        image: c.toDataURL(),
      };
    }, interval);
  }
  const fast = await edgeReplay(3),
    slow = await edgeReplay(35);
  assert.equal(fast.edge, 0, 'A stroke that exits the right edge must not draw a vertical tail');
  assert.ok(fast.near > 0, 'The last part inside the pad stays writable');
  assert.equal(
    fast.image,
    slow.image,
    'Different sample times on identical coordinates must render identical pixels',
  );
  console.log(
    'PASS edge clipping, re-entry and identical pixels for 3 ms / 35 ms coordinate replay',
  );
  await native.locator('#clear').click();
  await native.locator('#direct').click();
  await native.keyboard.press('Space');
  await native.waitForFunction(() => !document.querySelector('#captureHint').hidden);
  const entry = await native.evaluate(async () => {
    const send = (phase, x, y) => window.testSample.onmessage({ phase, x, y, ratio: 2 });
    send('begin', 0, 0.2);
    send('move', 0, 0.4);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const activeCanvas = document.querySelector('#board');
    const live = activeCanvas
      .getContext('2d')
      .getImageData(0, Math.round(activeCanvas.height * 0.3), 1, 1).data[3];
    send('move', 0.3, 0.4);
    send('end', 0, 0);
    send('stop', 0, 0);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const c = document.querySelector('#board'),
      ctx = c.getContext('2d');
    const alpha = (x, y) =>
      ctx.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data[3];
    const row = ctx.getImageData(0, Math.round(0.3 * c.height), c.width, 1).data;
    return [
      row.some((v, i) => i % 4 === 3 && v),
      alpha(0, 0.2),
      alpha(0, 0.4),
      alpha(0.15, 0.4),
      live,
    ];
  });
  assert.ok(entry[4] > 0, 'Ink must appear along the edge before lift or turning inward');
  assert.equal(entry[0], false, 'Entering from the left must not leave a leading hook');
  assert.equal(entry[1], 0, 'The first ambiguous contact must not leave an isolated dot');
  assert.ok(entry[2] > 0 && entry[3] > 0, 'The inward stroke starts at the edge');
  await native.locator('#export').click();
  await native.waitForFunction(() => !!window.testSavedPng);
  assert.equal(await native.evaluate(() => window.testSavedLanguage), 'en');
  const saved = PNG.sync.read(Buffer.from(await native.evaluate(() => window.testSavedPng)));
  const aboveEntry = saved.data.subarray(0, 4 * saved.width * Math.floor(saved.height * 0.35));
  assert.equal(
    aboveEntry.some((v, i) => i % 4 === 3 && v > 0),
    false,
  );
  assert.ok(pixel(saved, 0, Math.round(saved.height * 0.4))[3] > 0);
  await native.locator('#undo').click();
  assert.ok(
    await native.locator('#export').isDisabled(),
    'The inward stroke is a single undo step',
  );
  console.log('PASS edge entry has no leading hook or isolated dot on canvas or exported PNG');
  await native.locator('#direct').click();
  await native.locator('#edgeOptions summary').click();
  await native.locator('#showPosition').check();
  await native.locator('#edge-right').fill('80');
  assert.ok(await native.locator('#okDialog').isDisabled());
  await native.locator('#edge-right').fill('99.80');
  await native.keyboard.press('Space');
  await native.waitForFunction(() => !document.querySelector('#captureHint').hidden);
  await native.evaluate(() =>
    window.testSample.onmessage({ phase: 'begin', x: 0.998, y: 0.5, ratio: 2 }),
  );
  await native.waitForFunction(() =>
    document.querySelector('#touchPosition').textContent.includes('99.80%'),
  );
  assert.equal(await native.locator('#touchMarker').evaluate((e) => e.style.left), '100%');
  await native.evaluate(() => window.testSample.onmessage({ phase: 'stop', x: 0, y: 0, ratio: 0 }));
  await native.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  assert.ok(
    await native
      .locator('#board')
      .evaluate(
        (canvas) =>
          canvas
            .getContext('2d')
            .getImageData(canvas.width - 1, Math.round(canvas.height / 2), 1, 1).data[3] > 0,
      ),
    'Exiting during an unresolved edge tap preserves the dot',
  );
  await native.locator('#direct').click();
  assert.equal(await native.locator('#edge-right').inputValue(), '99.8');
  await native.locator('#resetEdges').click();
  assert.equal(await native.locator('#edge-right').inputValue(), '100');
  await native.locator('#cancelDialog').click();
  console.log('PASS raw 99.80% readout, calibrated marker at 100%, validation and reset');
  await native.locator('#clear').click();
  await native.locator('#direct').click();
  await native.keyboard.press('Space');
  await native.waitForFunction(() => !document.querySelector('#captureHint').hidden);
  const calls = await native.evaluate(async () => {
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const send = (phase, x, y) => window.testSample.onmessage({ phase, x, y, ratio: 2 });
    const prototype = CanvasRenderingContext2D.prototype;
    const original = prototype.quadraticCurveTo;
    let curves = 0;
    prototype.quadraticCurveTo = function (...points) {
      curves++;
      return original.apply(this, points);
    };
    async function activeFrame() {
      send('begin', 0.2, 0.25);
      for (let i = 1; i <= 8; i++) send('move', 0.2 + i * 0.004, 0.25);
      await frame();
      curves = 0;
      send('move', 0.236, 0.25);
      await frame();
      return curves;
    }
    try {
      const empty = await activeFrame();
      for (let i = 10; i < 64; i++) send('move', 0.2 + i * 0.004, 0.25);
      send('end', 0, 0);
      for (let j = 1; j < 20; j++) {
        const y = 0.3 + j * 0.01;
        send('begin', 0.2, y);
        for (let i = 1; i < 64; i++) send('move', 0.2 + i * 0.004, y);
        send('end', 0, 0);
      }
      const filled = await activeFrame();
      return [empty, filled];
    } finally {
      prototype.quadraticCurveTo = original;
      send('stop', 0, 0);
    }
  });
  assert.deepEqual(calls, [8, 8]);
  console.log(
    'PASS active frame with 10 points, empty vs 20 completed strokes: ' +
      calls.join(' / ') +
      ' quadratic segments',
  );
  const caps = await ctx.newPage();
  await caps.addInitScript(installCapBridge);
  await caps.goto(url);
  console.log('PASS ' + (await caps.evaluate(checkStrokeCaps)));
  await caps.close();
  await checkNib(native);
  await checkDirectGeometry(ctx, url);
  assert.deepEqual(errors, []);
  console.log(
    'PASS synthetic native channel maps absolute corners, keeps gaps and exits on interruption',
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
