use std::{io::Write, path::Path};
use tauri::Manager;

fn read(dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir.join("language"))
        .ok()
        .filter(|v| v == "en" || v == "zh")
}

fn write(dir: &Path, lang: &str) -> Result<(), ()> {
    if !matches!(lang, "en" | "zh") {
        return Err(());
    }
    std::fs::create_dir_all(dir).map_err(|_| ())?;
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|_| ())?;
    file.write_all(lang.as_bytes()).map_err(|_| ())?;
    file.persist(dir.join("language")).map_err(|_| ())?;
    Ok(())
}

fn apply_window_title(app: &tauri::AppHandle, language: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let title = if language == Some("zh") {
            "签字板"
        } else {
            "Signature Desk"
        };
        let _ = window.set_title(title);
    }
}

#[tauri::command]
pub fn load_language(app: tauri::AppHandle) -> Option<String> {
    let language = read(&app.path().app_config_dir().ok()?);
    apply_window_title(&app, language.as_deref());
    language
}
#[tauri::command]
pub fn store_language(app: tauri::AppHandle, language: String) -> Result<(), ()> {
    if !matches!(language.as_str(), "en" | "zh") {
        return Err(());
    }
    apply_window_title(&app, Some(&language));
    write(&app.path().app_config_dir().map_err(|_| ())?, &language)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn store_only_a_supported_language_and_reopen() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("settings");
        assert_eq!(read(&dir), None);
        assert!(!dir.exists());
        for lang in ["zh", "en"] {
            write(&dir, lang).unwrap();
            assert_eq!(read(&dir).as_deref(), Some(lang));
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        }
        assert!(write(&dir, "invalid").is_err());
        assert_eq!(read(&dir).as_deref(), Some("en"));
    }
}
