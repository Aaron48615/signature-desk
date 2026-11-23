use serde::Serialize;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Serialize)]
pub struct Device {
    id: String,
    name: String,
    ratio: f64,
    status: i32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    phase: &'static str,
    time_ms: f64,
    x: f64,
    y: f64,
    ratio: f64,
}
struct Session {
    id: u32,
    output: Channel<Sample>,
    gate: Gate,
}
#[derive(Default)]
struct Gate {
    drawing: bool,
    blocked: bool,
}
impl Gate {
    fn phase(&mut self, count: i32) -> Option<&'static str> {
        if count < 0 {
            self.drawing = false;
            return Some(if count == -1 { "stop" } else { "lost" });
        }
        if count == 0 {
            self.blocked = false;
            return std::mem::take(&mut self.drawing).then_some("end");
        }
        if count > 1 {
            self.blocked = true;
            return std::mem::take(&mut self.drawing).then_some("end");
        }
        if self.blocked {
            return None;
        }
        Some(if std::mem::replace(&mut self.drawing, true) {
            "move"
        } else {
            "begin"
        })
    }
}

static ACTIVE: Mutex<Option<Session>> = Mutex::new(None);
thread_local! { static DEVICES: std::cell::RefCell<Vec<Device>> = const { std::cell::RefCell::new(Vec::new()) }; }
extern "C" {
    fn ink_devices(sink: extern "C" fn(*const c_char, *const c_char, f64, c_int));
    fn ink_start(
        window: *mut c_void,
        device: *const c_char,
        ratio: f64,
        session: u32,
        sink: extern "C" fn(u32, c_int, f64, f64, f64, f64),
    ) -> c_int;
    fn ink_stop();
}
extern "C" fn device(id: *const c_char, name: *const c_char, ratio: f64, status: c_int) {
    let string = |p| unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
    DEVICES.with(|v| {
        v.borrow_mut().push(Device {
            id: string(id),
            name: string(name),
            ratio,
            status,
        })
    });
}
extern "C" fn frame(id: u32, count: c_int, x: f64, y: f64, ratio: f64, time_ms: f64) {
    let packet = {
        let Ok(mut lock) = ACTIVE.lock() else { return };
        let Some(s) = lock.as_mut().filter(|s| s.id == id) else {
            return;
        };
        s.gate.phase(count).map(|phase| {
            (
                s.output.clone(),
                Sample {
                    phase,
                    x,
                    y,
                    ratio,
                    time_ms,
                },
            )
        })
    };
    if let Some((channel, sample)) = packet {
        let _ = channel.send(sample);
    }
}
#[tauri::command]
pub fn devices() -> Vec<Device> {
    unsafe {
        ink_devices(device);
    }
    DEVICES.with(|v| v.take())
}
#[tauri::command]
pub fn start_input(
    window: tauri::WebviewWindow,
    id: String,
    ratio: f64,
    session: u32,
    output: Channel<Sample>,
) -> Result<(), String> {
    if !window.is_focused().unwrap_or(false) {
        return Err("请先激活签名窗口".into());
    }
    stop_input();
    let id = CString::new(id).map_err(|_| "设备标识无效")?;
    #[cfg(target_os = "macos")]
    let handle = window.ns_window().map_err(|_| "窗口不可用")?;
    #[cfg(target_os = "windows")]
    let handle = window.hwnd().map_err(|_| "窗口不可用")?.0 as *mut c_void;
    #[cfg(target_os = "linux")]
    let handle = std::ptr::null_mut();
    *ACTIVE.lock().unwrap() = Some(Session {
        id: session,
        output,
        gate: Gate::default(),
    });
    match unsafe { ink_start(handle, id.as_ptr(), ratio, session, frame) } {
        0 => Ok(()),
        code => {
            stop_input();
            Err(match code {
                2 => "无法读取或独占这块触控板，请检查设备权限和占用情况",
                3 => "设备未提供绝对位置",
                4 => "请输入触控板的实际宽高",
                _ => "无法开启直写，请确认触控板已连接且窗口处于前台",
            }
            .into())
        }
    }
}
#[tauri::command]
pub fn stop_input() {
    let had_session = ACTIVE.lock().unwrap().take().is_some();
    if had_session {
        unsafe { ink_stop() };
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn synthetic_trace_matches_expected_phases() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/contacts.json")).unwrap();
        let mut gate = Gate::default();
        for entry in fixture.as_array().unwrap() {
            assert_eq!(
                gate.phase(entry["count"].as_i64().unwrap() as i32),
                entry["expect"].as_str()
            );
        }
    }
}
