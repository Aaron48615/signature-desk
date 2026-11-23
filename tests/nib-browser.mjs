import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

// The caller supplies the real offline page with the synthetic desktop bridge.
export async function checkNib(page) {
  const id = (s) => page.locator('#' + s);
  const clear = async () => {
    if (await id('clear').isEnabled()) await id('clear').click();
  };
  await clear();
  await id('sizeTools').evaluate((e) => (e.open = true));
  await id('boardW').fill('400');
  await id('boardH').fill('240');
  await id('applySize').click();
  await id('outW').fill('1600');
  await id('sizeTools').evaluate((e) => (e.open = false));
  assert.equal(await id('naturalNib').isChecked(), false);
  await id('naturalNib').check();
  async function saved(button = 'export') {
    await page.evaluate(() => (window.testSavedPng = undefined));
    await id(button).click();
    await page.waitForFunction(() => !!window.testSavedPng);
    return PNG.sync.read(Buffer.from(await page.evaluate(() => window.testSavedPng)));
  }
  function section(png, x, y) {
    const col = Math.round(x * 4);
    let alpha = 0;
    for (let row = Math.round((y - 18) * 4); row <= Math.round((y + 18) * 4); row++)
      alpha += png.data[(row * png.width + col) * 4 + 3];
    return alpha / (255 * 4);
  }
  const near = (actual, expected, base) =>
    assert.ok(
      Math.abs(actual - expected) < 0.32,
      'Base ' + base + ' measured ' + actual + ' expected ' + expected,
    );
  const samples = [];
  for (let base = 1; base <= 24; base += 0.5) {
    await clear();
    await id('weight').fill(String(base));
    await id('direct').click();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.querySelector('#captureHint').hidden);
    await page.evaluate(() => {
      const send = (phase, x, y, timeMs) =>
        window.testSample.onmessage({ phase, x: x / 400, y: y / 240, ratio: 400 / 240, timeMs });
      let t = 0;
      function line(y, interval, pause) {
        send('begin', 40, y, t);
        for (let i = 1; i <= 28; i++) send('move', 40 + i * 10, y, (t += interval));
        send('end', 0, 0, (t += pause));
        t += 500;
      }
      line(30, 4, 1); // fast body and flick
      line(85, 400, 1); // slow body and gentle lift
      line(140, 4, 120); // same fast body, stationary before lift
      send('begin', 80, 200, t);
      send('end', 0, 0, t + 150);
      t += 200;
      send('begin', 130, 192, t);
      for (const [x, y] of [
        [180, 192],
        [210, 192],
        [160, 192],
        [220, 192],
        [250, 214],
        [280, 193],
        [320, 203],
      ])
        send('move', x, y, (t += 6));
      send('end', 0, 0, t + 3);
      send('stop', 0, 0, t + 160);
    });
    const png = await saved();
    assert.equal(png.width, 1600);
    assert.equal(png.height, 960);
    const fast = section(png, 200, 30),
      slow = section(png, 200, 85);
    near(fast, Math.max(1, 0.86 * base), base);
    near(slow, base * 1.18, base);
    near(section(png, 200, 140), fast, base);
    near(section(png, 80, 200), base, base);
    for (const x of [148, 198])
      assert.ok(png.data[(768 * png.width + x * 4) * 4 + 3] > 200, 'Reversal ' + base);
    assert.equal(png.data[(800 * png.width + 400) * 4 + 3], 0, 'Separate paths ' + base);
    const flick = section(png, 319.5, 30),
      pause = section(png, 319.5, 140);
    assert.ok(flick >= 0.9 && flick <= pause + 0.12, 'Readable flick ' + base);
    if (base >= 3) assert.ok(pause - flick > 0.12 * base, 'Distinct flick ' + base);
    for (let x = 46; x <= 318; x += 0.5)
      assert.ok(
        png.data[(120 * png.width + Math.round(x * 4)) * 4 + 3] > 180,
        'Gap at ' + base + '/' + x,
      );
    if ([1, 4, 12, 24].includes(base))
      samples.push([base, fast, slow, flick].map((n) => Number(n.toFixed(2))));
    if (base === 8) {
      await id('naturalNib').uncheck();
      assert.deepEqual((await saved()).data, png.data);
      await id('undo').click();
      await id('redo').click();
      assert.deepEqual((await saved()).data, png.data);
      await id('process').click();
      await page.waitForFunction(() => !document.querySelector('#saveProcessed').disabled);
      assert.deepEqual((await saved('saveProcessed')).data, png.data);
      await id('naturalNib').check();
    }
  }
  // Use actual mouse events with controlled event times, independent of IPC delivery.
  const cdp = await page.context().newCDPSession(page);
  for (let base = 1; base <= 24; base += 0.5) {
    await clear();
    await id('weight').fill(String(base));
    const box = await id('board').boundingBox();
    let timestamp = Date.now() / 1000;
    for (const [row, step] of [
      [30, 0.004],
      [85, 0.4],
    ]) {
      const send = (type, x, buttons) =>
        cdp.send('Input.dispatchMouseEvent', {
          type,
          x: box.x + (box.width * x) / 400,
          y: box.y + (box.height * row) / 240,
          timestamp,
          button: buttons || type === 'mouseReleased' ? 'left' : 'none',
          buttons,
          clickCount: type === 'mouseMoved' ? 0 : 1,
        });
      await send('mouseMoved', 40, 0);
      await send('mousePressed', 40, 1);
      let lastX = 40;
      for (const x of [90, 140, 190, 240, 290, 320]) {
        timestamp += (step * (x - lastX)) / 10;
        await send('mouseMoved', x, 1);
        lastX = x;
      }
      timestamp += 0.001;
      await send('mouseReleased', 320, 0);
      timestamp += 0.5;
    }
    const png = await saved();
    near(section(png, 200, 30), Math.max(1, 0.86 * base), base);
    near(section(png, 200, 85), base * 1.18, base);
  }
  await cdp.detach();
  await clear();
  await id('weight').fill('6');
  await id('direct').click();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('#captureHint').hidden);
  const edgePreview = await page.evaluate(async () => {
    const send = (phase, x, y, timeMs) =>
      window.testSample.onmessage({ phase, x, y, ratio: 400 / 240, timeMs });
    send('begin', 0, 0.2, 100);
    send('move', 0, 0.4, 120);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const board = document.querySelector('#board');
    const alpha = board.getContext('2d').getImageData(0, Math.floor(0.3 * board.height), 1, 1)
      .data[3];
    send('move', 0.2, 0.4, 126);
    send('end', 0, 0, 132);
    send('stop', 0, 0, 150);
    return alpha;
  });
  assert.ok(edgePreview > 0);
  const edge = await saved();
  assert.equal(edge.data[288 * edge.width * 4 + 3], 0);
  assert.ok(edge.data[(384 * edge.width + 200) * 4 + 3] > 0);

  console.log(
    'PASS all 47 widths: decoded PNG fast/slow/flick/held lift/dot, continuous fast ink, history, processed export, and mouse event timing. [base, fast, slow, near tip]',
    samples,
  );
}
