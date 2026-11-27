// Synthetic desktop input with an in-memory PNG destination, for both browser engines.
export function installCapBridge(deviceId = 'test') {
  window.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    invoke: async (command, args) => {
      if (command === 'devices')
        return [{ id: deviceId, name: 'Synthetic', ratio: deviceId === 'appkit' ? 0 : 1.5, status: 0 }];
      if (command === 'start_input') window.capInput = args.output;
      if (command === 'save_png') {
        window.capFile = new Blob([args], { type: 'image/png' });
        return true;
      }
    },
  };
}

export async function checkStrokeCaps() {
  const get = (id) => document.getElementById(id);
  const wait = async (test) => {
    for (let i = 0; i < 300; i++) {
      if (test()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error('Timed out waiting for the offline signature editor');
  };
  await wait(() => document.documentElement.dataset.ready);
  const w = 480,
    h = 320;
  get('boardW').value = w;
  get('boardH').value = h;
  get('applySize').click();
  const board = get('board');
  const frame = () =>
    new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  let checks = 0;
  let firstFailure;
  let failures = 0;
  function solid(canvas, p, radius, stage) {
    const g = canvas.getContext('2d'),
      scale = Math.min(canvas.width / w, canvas.height / h);
    const x = (canvas.width - w * scale) / 2 + p.x * scale,
      y = (canvas.height - h * scale) / 2 + p.y * scale;
    // Exclude antialiased boundary pixels. Every pixel inside this disk is ink.
    const r = radius * scale - 1.3;
    if (r <= 0) return;
    const left = Math.floor(x - r),
      top = Math.floor(y - r),
      size = Math.ceil(r * 2) + 2;
    const data = g.getImageData(left, top, size, size).data;
    let missing = 0;
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++)
        if (
          Math.hypot(left + i + 0.5 - x, top + j + 0.5 - y) < r &&
          data[(j * size + i) * 4 + 3] < 220
        )
          missing++;
    if (missing) {
      failures++;
      firstFailure ??= stage + ' has ' + missing + ' missing interior pixels';
    }
    checks++;
  }
  for (const nib of [false, true])
    for (const width of [4, 22.5, 24]) {
      if (!get('clear').disabled) get('clear').click();
      get('naturalNib').checked = nib;
      get('weight').value = width;
      get('direct').click();
      await wait(() => get('dialog').open);
      window.capInput = undefined;
      get('dialog').close('ok');
      await wait(() => window.capInput);
      let time = 10;
      const send = (phase, p) =>
        window.capInput.onmessage({
          phase,
          x: p.x / w,
          y: p.y / h,
          ratio: w / h,
          timeMs: (time += 4),
        });
      const marks = [];
      const checkMark = (canvas, mark, stage) => {
        const label = (nib ? 'nib' : 'fixed') + ' ' + width + ' ' + stage + ' #' + mark.index;
        solid(canvas, mark.a, (width * (nib ? 0.75 : 1)) / 2, label + ' start');
        solid(canvas, mark.b, (width * (nib ? 0.85 : 1)) / 2, label + ' end');
      };
      for (let i = 0; i < 8; i++) {
        const a0 = (i * Math.PI) / 4,
          dx = Math.cos(a0),
          dy = Math.sin(a0);
        const center = { x: 60 + 120 * (i % 4) + 0.25, y: 85 + 145 * Math.floor(i / 4) + 0.25 };
        const pt = (along, across = 0) => ({
          x: center.x + dx * along - dy * across,
          y: center.y + dy * along + dx * across,
        });
        const start = pt(-36),
          end = pt(36);
        // A nearly coincident sample can turn back or turn sideways at either end.
        const back = i % 2 === 0 ? pt(35.75) : pt(36, 0.001);
        const points = [start, pt(-36.06), pt(0), end, back];
        send('begin', start);
        for (const p of points.slice(1)) send('move', p);
        const mark = { a: start, b: back, index: i };
        marks.push(mark);
        await frame();
        checkMark(board, mark, 'live');
        time += 130;
        send('end', back);
      }
      send('stop', marks.at(-1).b);
      await frame();
      for (const mark of marks) checkMark(board, mark, 'committed');
      window.capFile = undefined;
      get('export').click();
      await wait(() => window.capFile);
      const img = await createImageBitmap(window.capFile),
        c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      img.close();
      for (const mark of marks) checkMark(c, mark, 'PNG');
    }
  if (failures)
    throw Error(firstFailure + ' (' + failures + ' failed disk checks out of ' + checks + ')');
  return checks + ' solid endpoint checks across live ink, committed ink and decoded PNGs';
}
