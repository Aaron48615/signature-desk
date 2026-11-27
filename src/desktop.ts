import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
export const desktop = isTauri();
export interface Device {
  id: string;
  name: string;
  ratio: number;
  status: number;
}
export interface Sample {
  timeMs: number;
  phase: 'begin' | 'move' | 'end' | 'stop' | 'lost' | 'undo' | 'redo';
  x: number;
  y: number;
  ratio: number;
}
export const devices = () => invoke<Device[]>('devices');
export function startInput(
  id: string,
  ratio: number,
  session: number,
  receive: (p: Sample) => void,
) {
  const output = new Channel<Sample>();
  output.onmessage = receive;
  return invoke<void>('start_input', { id, ratio, session, output });
}
export const stopInput = () => invoke<void>('stop_input');
export const dirty = (value: boolean) => invoke('set_dirty', { value });
export const loadLanguage = () => invoke<string | null>('load_language');
export const storeLanguage = (language: string) => invoke<void>('store_language', { language });
export const save = (bytes: Uint8Array, language: string) =>
  invoke<boolean>('save_png', bytes, { headers: { 'x-ink-language': language } });
export const closeWindow = () => invoke('close_window');
export async function listenWindow(blur: () => void, close: () => void) {
  await Promise.all([listen('ink-blur', blur), listen('ink-close', close)]);
}
