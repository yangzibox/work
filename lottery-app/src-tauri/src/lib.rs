#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    // 新增：注册命令
    .invoke_handler(tauri::generate_handler![show_main_window])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// 新增：显示主窗口的命令
#[tauri::command]
async fn show_main_window(window: tauri::Window) {
    let _ = window.show();
    let _ = window.set_focus();
}