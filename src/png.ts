import { render } from './render';
import { type Artwork, type Bitmap } from './model';
import * as host from './desktop';
import { language } from './locale';

function raster(art: Artwork, w: number, h: number) {
  const canvas = document.createElement('canvas');
  render(canvas, art, w, h);
  return canvas;
}
export function png(art: Artwork, w: number, h: number): Promise<Blob> {
  const canvas = raster(art, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 1;
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png'),
  );
}
// Decode the same PNG that direct export would create. A separate ink mask
// lets trimming work even when a stroke and its opaque background match.
export async function snapshot(art: Artwork, w: number, h: number): Promise<Artwork> {
  const url = URL.createObjectURL(await png(art, w, h));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const bitmap: Bitmap = { kind: 'bitmap', image };
    if (art.background) bitmap.inkMask = raster({ ...art, background: null }, w, h);
    return { background: art.background, scene: { w, h, items: [bitmap] } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type SaveResult = 'saved' | 'download' | 'cancel' | 'error';
type SaveHandle = {
  createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }>;
};
export async function savePng(produce: () => Promise<Blob>): Promise<SaveResult> {
  try {
    const name = language === 'zh' ? '签名.png' : 'Signature.png';
    const picker = (
      window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<SaveHandle> }
    ).showSaveFilePicker;
    const handle =
      !host.desktop && picker
        ? await picker.call(window, {
            suggestedName: name,
            types: [{ description: 'PNG', accept: { 'image/png': ['.png'] } }],
          })
        : undefined;
    const blob = await produce();
    if (host.desktop)
      return (await host.save(new Uint8Array(await blob.arrayBuffer()), language))
        ? 'saved'
        : 'cancel';
    if (handle) {
      const stream = await handle.createWritable();
      await stream.write(blob);
      await stream.close();
      return 'saved';
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    return 'download';
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'cancel' : 'error';
  }
}
export const saveMessage: Record<SaveResult, string> = {
  saved: 'PNG 已保存。',
  download: 'PNG 已交给浏览器下载，请在下载记录中确认。',
  cancel: '已取消保存。',
  error: '保存失败，签名仍在画板中。请检查保存位置后重试。',
};
