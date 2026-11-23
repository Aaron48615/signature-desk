// Headless check of the actual bundled WebView and its native device bridge.
use std::sync::atomic::{AtomicBool, Ordering};
pub static ENABLED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn finish_check(app: tauri::AppHandle, ok: bool, devices: usize) {
    if ENABLED.load(Ordering::Relaxed) {
        println!("Bundled editor and IPC: {ok}. Enumerated trackpads: {devices}.");
        app.exit(if ok { 0 } else { 1 });
    }
}
pub const SCRIPT: &str = r#"
(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  let ok = false, devices = [];
  try {
    for (let i = 0; i < 100 && !document.documentElement.dataset.ready; i++) {
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    devices = await invoke('devices');
    document.querySelector('#direct').click();
    for (let i = 0; i < 60 && !document.querySelector('#dialog').open; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    ok = ['en','zh-CN'].includes(document.documentElement.lang) &&
      document.title === document.querySelector('h1')?.textContent &&
      document.title === (document.documentElement.lang === 'en' ? 'Signature Desk' : '签字板') &&
      document.querySelector('#language')?.nextElementSibling?.classList.contains('mode') && !!document.querySelector('#resetSize') &&
      !!document.querySelector('#processDialog #processCanvas') &&
      document.querySelector('#naturalNib')?.checked === false &&
      document.querySelector('#process')?.disabled === true &&
      document.querySelectorAll('[data-ink]').length === 4 &&
      document.querySelector('#deviceSettings').hidden === false &&
      document.querySelector('#devices').options.length === devices.length &&
      document.querySelector('#outW').value === '2400';
  } finally { await invoke('finish_check', {ok, devices:devices.length}); }
})()
"#;
