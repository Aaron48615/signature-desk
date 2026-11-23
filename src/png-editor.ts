import {
  crop,
  flip,
  History,
  rotate,
  validSize,
  type Artwork,
  type Point,
  type Rect,
  type Scene,
} from './model';
import { inkBounds, render } from './render';
import { png, saveMessage, savePng, snapshot, type SaveResult } from './png';
import { t } from './locale';

export function createPngEditor(onSaved: (source: Artwork, result: SaveResult) => void) {
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('processDialog'),
    mat = get('processMat'),
    paper = get('processPaper'),
    canvas = get<HTMLCanvasElement>('processCanvas'),
    box = get('cropBox');
  const button = (id: string) => get<HTMLButtonElement>(id);
  const value = (id: string) => get<HTMLInputElement>(id).valueAsNumber;
  const hint = (key: string) => {
    get('processStatus').textContent = t(key);
  };
  let edits: History | undefined, source: Artwork | undefined;
  let cropActive = false,
    drag: { id: number; start: Point } | undefined;
  let saving = false,
    ticket = 0;
  const ready = () => !!edits && !saving;
  function paint() {
    if (!dialog.open || !edits) return;
    const art = edits.current,
      { w, h } = art.scene;
    const scale = Math.min((mat.clientWidth - 20) / w, (mat.clientHeight - 20) / h);
    const cw = Math.max(1, Math.round(w * scale)),
      ch = Math.max(1, Math.round(h * scale));
    paper.style.width = cw + 'px';
    paper.style.height = ch + 'px';
    render(
      canvas,
      art,
      Math.max(1, Math.round(cw * devicePixelRatio)),
      Math.max(1, Math.round(ch * devicePixelRatio)),
    );
    get('processSize').textContent = w + ' × ' + h + ' px';
  }
  function sync() {
    get('processTools').inert = !ready();
    button('saveProcessed').disabled = !ready();
    button('processClose').disabled = saving;
    button('editUndo').disabled = !edits?.canUndo;
    button('editRedo').disabled = !edits?.canRedo;
    button('manualCrop').setAttribute('aria-pressed', String(cropActive));
    canvas.style.cursor = cropActive ? 'crosshair' : 'default';
    paint();
  }
  function cancelCrop() {
    const pointer = drag?.id;
    drag = undefined;
    cropActive = false;
    box.hidden = true;
    if (pointer !== undefined && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
  }
  function apply(make: (scene: Scene) => Scene) {
    if (!edits || saving) return;
    cancelCrop();
    const next = make(edits.current.scene);
    if (!validSize(next.w, next.h)) hint('处理后的图片超过尺寸上限，请减小导出尺寸或先裁剪。');
    else if (next !== edits.current.scene) {
      edits.commit({ ...edits.current, scene: next });
      hint('仅保存处理后的 PNG。');
    }
    sync();
  }
  button('manualCrop').onclick = () => {
    const enable = !cropActive;
    cancelCrop();
    cropActive = enable;
    hint(enable ? '在预览上拖动以选择裁剪范围。' : '已取消框选。');
    sync();
  };
  const position = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect(),
      { w, h } = edits!.current.scene;
    return {
      x: Math.max(0, Math.min(w, ((e.clientX - r.left) * w) / r.width)),
      y: Math.max(0, Math.min(h, ((e.clientY - r.top) * h) / r.height)),
    };
  };
  const area = (p: Point): Rect => {
    const a = drag!.start;
    const x = Math.floor(Math.min(a.x, p.x)),
      y = Math.floor(Math.min(a.y, p.y));
    return { x, y, w: Math.ceil(Math.max(a.x, p.x)) - x, h: Math.ceil(Math.max(a.y, p.y)) - y };
  };
  canvas.onpointerdown = (e) => {
    if (!ready() || !cropActive || drag || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, start: position(e) };
  };
  canvas.onpointermove = (e) => {
    if (e.pointerId !== drag?.id) return;
    const r = area(position(e)),
      { w, h } = edits!.current.scene;
    box.hidden = false;
    Object.assign(box.style, {
      left: (r.x / w) * 100 + '%',
      top: (r.y / h) * 100 + '%',
      width: (r.w / w) * 100 + '%',
      height: (r.h / h) * 100 + '%',
    });
  };
  canvas.onpointerup = (e) => {
    if (e.pointerId !== drag?.id) return;
    const r = area(position(e));
    if (r.w >= 1 && r.h >= 1) apply((s) => crop(s, r));
    else {
      cancelCrop();
      sync();
    }
  };
  canvas.onlostpointercapture = canvas.onpointercancel = () => {
    if (drag) {
      cancelCrop();
      sync();
    }
  };
  button('trim').onclick = () => {
    const padding = value('padding');
    if (!Number.isInteger(padding) || padding < 0 || padding > 512) {
      hint('留白可设为 0 至 512 px。');
      return;
    }
    apply((s) => {
      const r = inkBounds(s, padding);
      if (!r) {
        hint('没有可裁剪的笔迹。');
        return s;
      }
      return r.x || r.y || r.w !== s.w || r.h !== s.h ? crop(s, r) : s;
    });
  };
  button('rotate').onclick = () => {
    const deg = value('angle');
    if (!Number.isFinite(deg) || Math.abs(deg) > 360) {
      hint('角度范围为 −360° 到 360°。');
      return;
    }
    if (deg % 360) apply((s) => rotate(s, deg));
  };
  button('flipX').onclick = () => apply((s) => flip(s, true));
  button('flipY').onclick = () => apply((s) => flip(s, false));
  function travel(redo: boolean) {
    if (!edits || saving) return;
    cancelCrop();
    if (redo) edits.redo();
    else edits.undo();
    sync();
  }
  button('editUndo').onclick = () => travel(false);
  button('editRedo').onclick = () => travel(true);
  dialog.addEventListener('keydown', (e) => {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === 'z' &&
      !(e.target instanceof HTMLInputElement)
    ) {
      e.preventDefault();
      e.stopPropagation();
      travel(e.shiftKey);
    }
  });
  button('saveProcessed').onclick = async () => {
    if (!edits || !source || saving) return;
    const art = edits.current,
      original = source;
    saving = true;
    sync();
    const result = await savePng(() => png(art, art.scene.w, art.scene.h));
    saving = false;
    if (result === 'saved' || result === 'download') {
      dialog.close();
      onSaved(original, result);
    } else {
      hint(saveMessage[result]);
      sync();
    }
  };
  button('processClose').onclick = () => {
    if (!saving) dialog.close();
  };
  dialog.addEventListener('cancel', (e) => {
    if (saving || cropActive) {
      e.preventDefault();
      if (!saving) {
        cancelCrop();
        hint('已取消框选。');
        sync();
      }
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    ticket++;
    cancelCrop();
    source = undefined;
    edits = undefined;
    canvas.width = canvas.height = 1;
    get('processSize').textContent = '';
  });
  new ResizeObserver(paint).observe(mat);
  return async function open(art: Artwork, w: number, h: number) {
    if (dialog.open) return;
    cancelCrop();
    const version = ++ticket;
    source = art;
    edits = undefined;
    saving = false;
    dialog.showModal();
    hint('正在生成 PNG…');
    sync();
    try {
      const copy = await snapshot(art, w, h);
      if (!dialog.open || version !== ticket) return;
      edits = new History(copy);
      hint('仅保存处理后的 PNG。');
      sync();
    } catch {
      if (dialog.open && version === ticket) hint('无法生成 PNG，请减小导出尺寸后重试。');
    }
  };
}
