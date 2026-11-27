import './style.css';
import { StrokeInput, type Portion } from './path-input';
import { onPaper, fullPad, validEdges, type Edges } from './calibration';
import { icons } from './icons';
import {
  blank,
  drawn,
  History,
  resize,
  validSize,
  type Point,
  type InkPoint,
  type Scene,
  type Stroke,
} from './model';
import { NaturalNib } from './nib';
import { boardRenderer, render } from './render';
import { t, initLanguage } from './locale';
import { png, savePng, saveMessage, type SaveResult } from './png';
import { createPngEditor } from './png-editor';
import * as host from './desktop';

icons();
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
const on = (id: string, fn: () => void) => button(id).addEventListener('click', fn);
let statusKey = '按住鼠标或触控板拖动即可签名。';
const say = (message: string) => {
  statusKey = message;
  el('status').textContent = t(message);
};
const board = el<HTMLCanvasElement>('board'),
  preview = el<HTMLCanvasElement>('preview'),
  paper = el('paper');
const drawInk = boardRenderer(board);
let hover: { clientX: number; clientY: number } | undefined;
const dialog = el<HTMLDialogElement>('dialog');
const history = new History();
const current = () => history.current.scene;
let color = '#282823',
  draft: Stroke | undefined,
  pointer: number | undefined;
let pen: { color: string; width: number; nib?: NaturalNib } | undefined;
function onBoard(p: InkPoint): InkPoint {
  return { ...p, x: p.x * current().w, y: p.y * current().h };
}
let locked = true,
  customOutput = false;
let session = 0,
  direct = false,
  opening = false,
  saving = false,
  pendingPaint = false;
let deviceList: host.Device[] = [];
let macDirect = false;
let lastDirty = false,
  modeDialog = false,
  confirmAction: (() => void) | undefined;
const pair = (a: string, b: string) => [input(a).valueAsNumber, input(b).valueAsNumber] as const;
function setOutput(w: number, h: number) {
  input('outW').value = String(w);
  input('outH').value = String(h);
}
function defaultOutput() {
  const { w, h } = current();
  const scale = Math.min(2, 8192 / w, 8192 / h, Math.sqrt(16777216 / (w * h)));
  setOutput(Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale)));
}
function drawBoard() {
  const w = Math.max(1, Math.round(paper.clientWidth * devicePixelRatio));
  const h = Math.max(1, Math.round(paper.clientHeight * devicePixelRatio));
  const provisional = direct ? pathInput.preview() : [];
  let live = draft;
  if (provisional.length && pen) {
    const paths = provisional.map((path) => path.map(onBoard));
    live = {
      kind: 'stroke',
      color: pen.color,
      width: pen.width,
      endTaper: pen.nib ? 0 : undefined,
      paths: [...(draft?.paths ?? []), ...paths],
    };
  }
  drawInk(history.current, w, h, live);
  const show = direct && input('showPosition').checked;
  const readout = el('touchPosition');
  readout.hidden = !show;
  if (show) {
    readout.textContent = shownTouch
      ? t('原始 X') +
        ' ' +
        (shownTouch.x * 100).toFixed(2) +
        '% · Y ' +
        (shownTouch.y * 100).toFixed(2) +
        '%'
      : t('等待接触');
  }
  const point = direct
    ? show && shownTouch
      ? onPaper(shownTouch, activeEdges)
      : undefined
    : hover && relative(hover);
  const marker = el('touchMarker');
  marker.hidden = !point || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1;
  if (point && !marker.hidden) {
    const size = current();
    const r = board.getBoundingClientRect();
    const tip = live?.paths.at(-1)?.at(-1)?.width ?? input('weight').valueAsNumber;
    const diameter = tip * Math.min(r.width / size.w, r.height / size.h);
    marker.style.left = point.x * 100 + '%';
    marker.style.top = point.y * 100 + '%';
    marker.style.width = marker.style.height = diameter + 'px';
    marker.style.color = color;
  }
}
function repaint() {
  if (pendingPaint) return;
  pendingPaint = true;
  requestAnimationFrame(() => {
    pendingPaint = false;
    drawBoard();
  });
}
function showPreview() {
  const [w, h] = pair('outW', 'outH');
  const ok = validSize(w, h);
  el('previewSize').textContent = ok ? w + ' × ' + h + ' px' : t('尺寸无效');
  button('process').disabled = button('export').disabled =
    !ok || !current().items.length || saving || direct;
  if (!ok) {
    preview.width = 1;
    return;
  }
  const wrap = preview.parentElement!;
  const scale = Math.min(wrap.clientWidth / w, wrap.clientHeight / h) * devicePixelRatio;
  const pw = Math.max(1, Math.round(w * scale)),
    ph = Math.max(1, Math.round(h * scale));
  render(preview, history.current, pw, ph);
  preview.style.width = pw / devicePixelRatio + 'px';
  preview.style.height = ph / devicePixelRatio + 'px';
}
// Stable reference for Mac input edge filtering, independent of display size.
const macEdgeReferenceWidth = 359;
function fitBoard() {
  const s = current();
  paper.style.aspectRatio = s.w + '/' + s.h;
  const mat = paper.parentElement!,
    size = el('sizeTools'),
    style = getComputedStyle(mat);
  const reserved =
    mat.getBoundingClientRect().top +
    scrollY +
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    el('sheetFoot').offsetHeight +
    size.offsetHeight +
    parseFloat(getComputedStyle(size).marginTop) +
    14;
  const stacked = innerWidth < 640;
  const below = stacked ? el('exportSidebar').offsetHeight + 10 : 0;
  const available = Math.max(stacked ? 98 : 90, innerHeight - reserved - below);
  const width = (available * s.w) / s.h;
  paper.style.maxWidth = 'min(100%, ' + width + 'px)';
}
function sync() {
  const s = current();
  fitBoard();
  el('guide').hidden = !!s.items.length || !!draft || direct;
  el('boardSize').textContent = s.w + ' × ' + s.h + ' px';
  input('boardW').value = String(s.w);
  input('boardH').value = String(s.h);
  button('undo').disabled = !history.canUndo || direct;
  button('redo').disabled = !history.canRedo || direct;
  button('clear').disabled = !s.items.length || direct;
  document
    .querySelectorAll<HTMLButtonElement>('[data-bg]')
    .forEach((b) =>
      b.setAttribute(
        'aria-pressed',
        String((b.dataset.bg === 'transparent' ? null : '#ffffff') === history.current.background),
      ),
    );
  el('bgCustomLabel').classList.toggle(
    'selected',
    !!history.current.background && history.current.background !== '#ffffff',
  );
  if (history.current.background) input('bgCustom').value = history.current.background;
  if (host.desktop && lastDirty !== history.dirty) {
    lastDirty = history.dirty;
    void host.dirty(lastDirty).catch(() => say('关闭提醒未就绪，请先导出签名'));
  }
  repaint();
  showPreview();
}
function change(scene: Scene, kind: 'edit' | 'stroke' = 'edit') {
  if (!validSize(scene.w, scene.h)) {
    say('画板最大边长 8192 px，总面积最多 1677 万像素。');
    return;
  }
  const previous = current();
  history.commit({ ...history.current, scene }, kind);
  if (!customOutput || (locked && (previous.w !== scene.w || previous.h !== scene.h))) {
    if (!customOutput) defaultOutput();
    else
      setOutput(
        input('outW').valueAsNumber,
        Math.max(1, Math.round((input('outW').valueAsNumber * scene.h) / scene.w)),
      );
  }
  sync();
}
function background(value: string | null) {
  if (history.current.background !== value)
    history.commit({ ...history.current, background: value });
  sync();
}
function chooseInk(value: string) {
  color = value;
  repaint();
  input('ink').value = value;
  document
    .querySelectorAll<HTMLButtonElement>('[data-ink]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ink === value)));
}
for (const [value, name] of [
  ['#282823', '墨黑'],
  ['#233b61', '藏蓝'],
  ['#86473d', '赭红'],
  ['#53684f', '松绿'],
]) {
  const b = document.createElement('button');
  b.className = 'colour';
  b.dataset.ink = value;
  b.style.background = value;
  b.title = name;
  b.setAttribute('aria-label', name);
  b.onclick = () => chooseInk(value);
  el('palette').append(b);
}
chooseInk(color);
input('ink').oninput = () => chooseInk(input('ink').value);
input('weight').oninput = () => {
  repaint();
  el('weightText').textContent = input('weight').value + ' px';
};
document
  .querySelectorAll<HTMLButtonElement>('[data-bg]')
  .forEach((b) => (b.onclick = () => background(b.dataset.bg === 'white' ? '#ffffff' : null)));
input('bgCustom').onchange = () => background(input('bgCustom').value);

function message(title: string, body: string, ok = '知道了', action?: () => void) {
  if (dialog.open) dialog.close();
  modeDialog = false;
  confirmAction = action;
  el('dialogTitle').textContent = t(title);
  el('dialogBody').textContent = t(body);
  el('deviceSettings').hidden = true;
  button('okDialog').textContent = t(ok);
  button('okDialog').disabled = false;
  button('cancelDialog').hidden = !action;
  dialog.returnValue = '';
  dialog.showModal();
}
dialog.addEventListener('close', () => {
  const act = confirmAction;
  confirmAction = undefined;
  if (dialog.returnValue === 'ok') act?.();
  modeDialog = false;
});
function finishStroke(time?: number) {
  pathInput.finish();
  if (draft) {
    if (pen?.nib) draft.endTaper = pen.nib.lift(time);
    const stroke = draft;
    draft = undefined;
    change(drawn(current(), stroke), 'stroke');
  }
  pen = undefined;
}
function markStrokeDirty() {
  if (host.desktop && !lastDirty) {
    lastDirty = true;
    void host.dirty(true).catch(() => say('请在关闭前导出签名。'));
  }
}
function begin(p: InkPoint) {
  if (!pen) return;
  markStrokeDirty();
  draft = {
    kind: 'stroke',
    width: pen.width,
    color: pen.color,
    endTaper: pen.nib ? 0 : undefined,
    paths: [[p]],
  };
  el('guide').hidden = true;
  repaint();
}
function move(p: InkPoint) {
  if (!draft) return;
  const path = draft.paths[draft.paths.length - 1];
  const last = path[path.length - 1];
  if (p.x !== last.x || p.y !== last.y) {
    path.push(p);
    repaint();
  }
}
const pathInput = new StrokeInput(appendPortion);
let shownTouch: Point | undefined;
let activeEdges = fullPad;
const deviceEdges = new Map<string, Edges>();
function samplePath(p: Point, first: boolean, time: number) {
  if (first) {
    const width = input('weight').valueAsNumber;
    pen = {
      width,
      color,
      nib: input('naturalNib').checked
        ? new NaturalNib(width, current().w, current().h)
        : undefined,
    };
  }
  const ink = pen?.nib?.sample(p, time) ?? p;
  if (direct && !lastDirty && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) markStrokeDirty();
  if (first) pathInput.start(ink, direct ? edgeBand() : undefined);
  else pathInput.move(ink);
}
function edgeBand(): Point {
  const s = current(), radius = input('weight').valueAsNumber / 2;
  // A one-pixel allowance at the reference size keeps Mac edge filtering
  // independent of the current window's display scale.
  const w = macDirect ? macEdgeReferenceWidth : board.clientWidth;
  const h = macDirect ? macEdgeReferenceWidth * s.h / s.w : board.clientHeight;
  return {
    x: Math.min(0.02, radius / s.w + 1 / Math.max(1, w)),
    y: Math.min(0.02, radius / s.h + 1 / Math.max(1, h)),
  };
}
function appendPortion(part: Portion) {
  if (!part.start && !part.end) return;
  if (part.start) {
    const start = onBoard(part.start);
    if (draft) {
      draft.paths.push([start]);
      repaint();
    } else begin(start);
  }
  if (part.end) move(onBoard(part.end));
}
function relative(e: Pick<PointerEvent, 'clientX' | 'clientY'>): Point {
  const r = board.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
function trackTip(e: PointerEvent) {
  if (direct || opening || !e.isPrimary || e.pointerType === 'touch') return;
  hover = { clientX: e.clientX, clientY: e.clientY };
  repaint();
}
function hideTip() {
  hover = undefined;
  repaint();
}
board.onpointerenter = trackTip;
board.onpointerleave = hideTip;
board.onpointerdown = (e) => {
  if (direct || opening || pointer !== undefined || e.button !== 0 || !e.isPrimary) return;
  e.preventDefault();
  board.setPointerCapture(e.pointerId);
  pointer = e.pointerId;
  trackTip(e);
  samplePath(relative(e), true, e.timeStamp);
};
board.onpointermove = (e) => {
  trackTip(e);
  if (pointer !== e.pointerId) return;
  const events = e.getCoalescedEvents?.() ?? [];
  for (const sample of events.length ? events : [e])
    samplePath(relative(sample), false, sample.timeStamp);
};
board.onpointerup = (e) => {
  if (pointer !== e.pointerId) return;
  pointer = undefined;
  samplePath(relative(e), false, e.timeStamp);
  finishStroke(e.timeStamp);
};
function cancelPointer() {
  hideTip();
  pointer = undefined;
  finishStroke();
  sync();
}
board.onpointercancel = cancelPointer;
board.onlostpointercapture = () => {
  if (pointer !== undefined) cancelPointer();
};
function travel(redo: boolean) {
  if (direct && (pen || !history.isStrokeStep(redo))) return;
  if (redo) history.redo();
  else history.undo();
  if (!customOutput) defaultOutput();
  else if (locked) ratioFrom('outW');
  sync();
}
on('undo', () => travel(false));
on('redo', () => travel(true));
on('clear', () => {
  change(blank(current().w, current().h));
  say('画板已清空，可撤销。');
});
on('applySize', () => {
  const [w, h] = pair('boardW', 'boardH');
  if (!validSize(w, h)) {
    say('请输入有效尺寸，单边最多 8192 px，总面积最多 1677 万像素。');
    return;
  }
  change(resize(current(), w, h));
});
on('resetSize', () => {
  const { w, h } = blank();
  change(resize(current(), w, h));
  say('画板尺寸已重置为 1200 × 640。');
});
function ratioFrom(id: string) {
  const s = current(),
    v = input(id).valueAsNumber;
  if (!(v > 0)) return;
  if (id === 'outW') input('outH').value = String(Math.max(1, Math.round((v * s.h) / s.w)));
  else input('outW').value = String(Math.max(1, Math.round((v * s.w) / s.h)));
}
for (const id of ['outW', 'outH'])
  input(id).oninput = () => {
    customOutput = true;
    if (locked) ratioFrom(id);
    showPreview();
  };
on('lock', () => {
  locked = !locked;
  button('lock').setAttribute('aria-pressed', String(locked));
  button('lock').title = t(locked ? '锁定宽高比' : '自由设置尺寸，笔迹等比居中');
  if (locked) ratioFrom('outW');
  showPreview();
});

function finishExport(art: typeof history.current, result: SaveResult) {
  if (result === 'saved') history.saved = art;
  say(saveMessage[result]);
  sync();
}
const openEditor = createPngEditor(finishExport);
on('process', () => {
  const [w, h] = pair('outW', 'outH');
  if (!direct && !saving && validSize(w, h) && current().items.length)
    void openEditor(history.current, w, h);
});
on('export', async () => {
  const [w, h] = pair('outW', 'outH');
  if (direct || saving || !validSize(w, h) || !current().items.length) return;
  const art = history.current;
  saving = true;
  showPreview();
  const result = await savePng(() => png(art, w, h));
  saving = false;
  finishExport(art, result);
});
let lastAspect = 0;
function receive(sample: host.Sample, id: number) {
  if (session !== id || !direct) return;
  if (sample.phase === 'stop' || sample.phase === 'lost') {
    void leaveDirect(sample.phase === 'lost' ? '输入已中断，已保留笔迹。' : '已结束直写。');
    return;
  }
  if (sample.phase === 'undo' || sample.phase === 'redo') {
    travel(sample.phase === 'redo');
    return;
  }
  const time = sample.timeMs ?? performance.now();
  if (sample.phase === 'end') {
    shownTouch = undefined;
    repaint();
    finishStroke(time);
    return;
  }
  if (sample.phase === 'begin') finishStroke();
  if (
    sample.phase === 'begin' &&
    sample.ratio > 0 &&
    Math.abs(lastAspect - sample.ratio) > 0.0001
  ) {
    const ratio = sample.ratio;
    lastAspect = ratio;
    const width = Math.max(
      1,
      Math.round(Math.min(current().w, 8192, 8192 * ratio, Math.sqrt(16777216 * ratio))),
    );
    const height = Math.max(1, Math.round(width / ratio));
    if (width !== current().w || height !== current().h) change(resize(current(), width, height));
  }
  const p = { x: sample.x, y: sample.y };
  shownTouch = p;
  samplePath(onPaper(p, activeEdges), sample.phase === 'begin', time);
  repaint();
}
function mode(active: boolean) {
  direct = active;
  macDirect = active && selectedDevice()?.id === 'appkit';
  hideTip();
  shownTouch = undefined;
  el('captureHint').hidden = !active;
  button('regular').setAttribute('aria-pressed', String(!active));
  button('direct').setAttribute('aria-pressed', String(active));
  el('sizeTools').inert = active;
  button('language').disabled = active;
  el('paper').setAttribute('aria-busy', String(active));
  sync();
}
async function leaveDirect(note = '已结束直写。') {
  if (!direct && !opening) return;
  session++;
  opening = false;
  finishStroke();
  mode(false);
  try {
    await host.stopInput();
  } catch {
    say('触控板已断开。');
    return;
  }
  say(note);
}
function selectedDevice() {
  return deviceList.find((d) => d.id === el<HTMLSelectElement>('devices').value);
}
const edgeKeys = ['left', 'right', 'top', 'bottom'] as const;
function edgeValues(): Edges {
  return {
    left: input('edge-left').valueAsNumber,
    right: input('edge-right').valueAsNumber,
    top: input('edge-top').valueAsNumber,
    bottom: input('edge-bottom').valueAsNumber,
  };
}
function putEdges(edges: Edges) {
  for (const k of edgeKeys) input('edge-' + k).value = String(edges[k]);
}
function showDevice() {
  putEdges(deviceEdges.get(selectedDevice()?.id ?? '') ?? fullPad);
  deviceStatus();
}
on('resetEdges', () => {
  putEdges(fullPad);
  deviceStatus();
});
for (const k of edgeKeys) input('edge-' + k).oninput = () => deviceStatus();
function deviceStatus() {
  const d = selectedDevice();
  const needsRatio = !!d && !d.ratio && d.id !== 'appkit' && d.status === 0;
  el('calibration').hidden = !needsRatio;
  const [w, h] = pair('padW', 'padH');
  const ready =
    !!d &&
    d.status === 0 &&
    validEdges(edgeValues()) &&
    (!needsRatio || (w > 0 && h > 0 && w <= 1000 && h <= 1000));
  button('okDialog').disabled = !ready;
  el('deviceState').textContent = t(
    !d
      ? '没有发现可读取绝对位置的触控板。'
      : d.status === 2
        ? '缺少这块触控板的读取权限。按 README 中的设备授权说明配置后重试。'
        : d.status === 3
          ? '驱动未提供绝对位置，可使用常规签名。'
          : ready
            ? '手指离开触控板，按空格开始。按 Esc 可随时结束。'
            : !validEdges(edgeValues())
              ? '左、上边界可填 −10 到 10，右、下边界可填 90 到 110。'
              : '请填入两个有效尺寸。',
  );
}
async function activate() {
  const d = selectedDevice();
  if (!d || d.status || direct) return;
  const [w, h] = pair('padW', 'padH');
  activeEdges = edgeValues();
  if (!validEdges(activeEdges)) return;
  deviceEdges.set(d.id, activeEdges);
  const id = ++session;
  opening = true;
  lastAspect = 0;
  mode(true);
  try {
    await host.startInput(d.id, d.ratio || w / h || 0, id, (p) => receive(p, id));
    if (session === id) say('单指轻写，抬手断笔。');
  } catch (e) {
    if (session === id) {
      finishStroke();
      mode(false);
      say(String(e));
    }
  } finally {
    if (session === id) opening = false;
  }
}
on('regular', () => {
  void leaveDirect();
});
on('direct', async () => {
  if (direct || opening) return;
  if (!host.desktop) {
    message(
      '在本地应用中使用触板直写',
      '浏览器可以按住拖动签名。打开签字板桌面应用，即可在支持的触控板上单指轻写。',
    );
    return;
  }
  try {
    deviceList = await host.devices();
  } catch {
    say('设备检测失败，请重新打开应用后重试。');
    return;
  }
  message(
    '触板直写',
    '画板将按触控板的比例显示，已有笔迹会等比保留。',
    '开始直写',
    () => void activate(),
  );
  modeDialog = true;
  el('deviceSettings').hidden = false;
  const select = el<HTMLSelectElement>('devices');
  select.replaceChildren();
  for (const d of deviceList) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = t(d.name);
    select.append(opt);
  }
  showDevice();
  button('okDialog').focus();
});
el('devices').onchange = showDevice;
input('padW').oninput = deviceStatus;
input('padH').oninput = deviceStatus;
// Keyboard activation lets the user lift the finger that operated the mode selector.
button('okDialog').addEventListener('click', (e) => {
  if (modeDialog && e.detail > 0) {
    e.preventDefault();
    el('deviceState').textContent = t('请抬起手指，按空格开始直写。');
    button('okDialog').focus();
  }
});
document.addEventListener('keydown', (e) => {
  if (el<HTMLDialogElement>('processDialog').open) return;
  if (dialog.open) {
    if (
      modeDialog &&
      e.code === 'Space' &&
      !(e.target as HTMLElement).matches('select,input[type=checkbox]')
    ) {
      e.preventDefault();
      if (!e.repeat && !button('okDialog').disabled) dialog.close('ok');
    }
    return;
  }
  if (direct) {
    if (e.key === 'Escape') {
      e.preventDefault();
      void leaveDirect();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
               !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) travel(e.key === 'ArrowRight');
    }
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    travel(e.shiftKey);
  }
});
for (const type of ['pointerdown', 'pointerup', 'click', 'contextmenu', 'wheel']) {
  document.addEventListener(
    type,
    (e) => {
      if (direct) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true, passive: false },
  );
}
if (host.desktop) {
  host
    .listenWindow(
      () => void leaveDirect('窗口失焦，已结束直写。'),
      () => {
        void leaveDirect();
        message(
          '关闭签字板？',
          '尚有未导出的修改。关闭后，本次签名会从内存中清除。',
          '放弃并关闭',
          () => void host.closeWindow(),
        );
      },
    )
    .catch(() => say('桌面事件连接失败，请重新打开应用。'));
} else {
  window.addEventListener('beforeunload', (e) => {
    if (history.dirty || draft) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
window.addEventListener('blur', () => {
  hideTip();
  if (pointer !== undefined) cancelPointer();
  // A native capture view can take keyboard focus while its OS window stays active.
  // Window deactivation is handled by the native ink-blur event.
});
new ResizeObserver(() => {
  repaint();
  showPreview();
}).observe(paper);
new ResizeObserver(showPreview).observe(preview.parentElement!);
window.addEventListener('resize', fitBoard);
el('sizeTools').addEventListener('toggle', fitBoard);
defaultOutput();
initLanguage(
  () => {
    const widths = [input('boardW').value, input('boardH').value];
    say(statusKey);
    button('lock').title = t(locked ? '锁定宽高比' : '自由设置尺寸，笔迹等比居中');
    sync();
    [input('boardW').value, input('boardH').value] = widths;
  },
  () => say('语言仅在本次打开时生效。'),
);
