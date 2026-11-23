#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod check;
mod input;
mod preferences;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, WindowEvent};
static DIRTY: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_dirty(value: bool) {
    DIRTY.store(value, Ordering::Release);
}
#[tauri::command]
fn close_window(window: tauri::WebviewWindow) -> Result<(), String> {
    input::stop_input();
    window.destroy().map_err(|e| e.to_string())
}
#[tauri::command]
async fn save_png(
    window: tauri::WebviewWindow,
    request: tauri::ipc::Request<'_>,
) -> Result<bool, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("PNG 数据无效".into());
    };
    if !data.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("PNG 数据无效".into());
    }
    let chinese = request
        .headers()
        .get("x-ink-language")
        .and_then(|v| v.to_str().ok())
        == Some("zh");
    let panel = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title(if chinese {
            "保存签名"
        } else {
            "Save signature"
        })
        .set_file_name(if chinese {
            "签名.png"
        } else {
            "Signature.png"
        })
        .add_filter("PNG", &["png"]);
    let Some(file) = panel.save_file().await else {
        return Ok(false);
    };
    let path = file.path();
    let parent = path.parent().ok_or("保存目录无效")?;
    use std::io::Write;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "保存目录不可写")?;
    tmp.write_all(data)
        .and_then(|_| tmp.flush())
        .map_err(|_| "写入失败，请检查可用空间")?;
    tmp.persist(path).map_err(|_| "无法替换目标文件")?;
    Ok(true)
}
fn main() {
    let verifying = std::env::args().any(|arg| arg == "--check-ui");
    let mut context = tauri::generate_context!();
    if verifying {
        check::ENABLED.store(true, Ordering::Relaxed);
        for w in &mut context.config_mut().app.windows {
            w.visible = false;
            w.focus = false;
        }
    }
    tauri::Builder::default()
        .setup(move |app| {
            if verifying {
                #[cfg(target_os = "macos")]
                app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(20));
                    eprintln!("Hidden WebView check timed out");
                    handle.exit(2);
                });
            }
            Ok(())
        })
        .on_page_load(move |window, page| {
            if verifying && matches!(page.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = window.eval(check::SCRIPT);
            }
        })
        .invoke_handler(tauri::generate_handler![
            check::finish_check,
            input::devices,
            input::start_input,
            input::stop_input,
            preferences::load_language,
            preferences::store_language,
            set_dirty,
            save_png,
            close_window
        ])
        .on_window_event(|win, event| match event {
            WindowEvent::Focused(false) => {
                input::stop_input();
                let _ = win.emit("ink-blur", ());
            }
            WindowEvent::CloseRequested { api, .. } if DIRTY.load(Ordering::Acquire) => {
                api.prevent_close();
                input::stop_input();
                let _ = win.emit("ink-close", ());
            }
            WindowEvent::Destroyed => input::stop_input(),
            _ => {}
        })
        .run(context)
        .expect("Signature Desk 启动失败");
}
