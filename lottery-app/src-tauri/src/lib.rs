// src/lib.rs 顶部（只保留这些 use，不要重复）

#![cfg_attr(mobile, tauri::mobile_entry_point)]

//use tauri::Manager;               // 只导入一次
use std::path::{PathBuf};

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
        .invoke_handler(tauri::generate_handler![
		show_main_window, 
		read_config_file, 
		get_exe_dir,
		check_ftp_lock,
		verify_password,
		exit_app
	])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 显示主窗口（保持不变）
#[tauri::command]
async fn show_main_window(window: tauri::Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

// 读取配置文件（兼容 dev + release portable）
#[tauri::command]
fn read_config_file(file_name: String, _app: tauri::AppHandle) -> Result<String, String> {  // 加 _app 避免 unused 警告
    let is_dev = cfg!(debug_assertions);

    let config_path: PathBuf = if is_dev {
        // dev 模式：从项目根的 public/configuration 读
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir.parent().ok_or("无法获取项目根目录".to_string())?;
        project_root.join("public").join("configuration").join(&file_name)
    } else {
        // release 模式：从 exe 同目录的 resources/configuration 读
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("无法获取 exe 路径: {}", e))?;
        let exe_dir = exe_path.parent()
            .ok_or("无法获取 exe 所在目录".to_string())?;
        exe_dir.join("resources").join("configuration").join(&file_name)
    };

    // 诊断日志（打包后运行 exe 时可在 cmd 看到）
    println!("[读取诊断] 模式: {}", if is_dev { "DEV" } else { "RELEASE" });
    println!("[读取诊断] 文件: {}", file_name);
    println!("[读取诊断] 路径: {}", config_path.display());
    println!("[读取诊断] 存在?: {}", config_path.exists());

    if !config_path.exists() {
        return Err(format!(
            "文件不存在！\n路径: {}\n模式: {}\n请检查对应位置的文件。",
            config_path.display(),
            if is_dev { "开发模式" } else { "发布模式" }
        ));
    }

    std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取失败: {} → {}", e, config_path.display()))
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("无法获取当前 exe 路径: {}", e))?;

    let exe_dir = exe_path.parent()
        .ok_or_else(|| "无法获取 exe 所在目录".to_string())?;

    Ok(exe_dir.to_string_lossy().into_owned())
}



#[tauri::command]
fn check_ftp_lock() -> Result<bool, String> {
    let url = "ftp://admin:DefDef123$@lisirun.asuscomm.com/160/yangzibox/luckydrawbox.txt";

    let mut cmd = std::process::Command::new("curl");
    cmd.arg("-s")
       .arg("--fail")
       .arg("--max-time").arg("5")
       .arg(url);

    // Windows 隐藏窗口关键参数
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);  // CREATE_NO_WINDOW = 0x08000000
    }

    let output = cmd.output()
        .map_err(|e| format!("curl 执行失败: {}", e))?;

    if !output.status.success() {
        return Ok(false);
    }

    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(content == "YES")
}


#[tauri::command]
fn verify_password(password: String) -> bool {
    use chrono::prelude::*;  // 需要引入 chrono 库来获取日期

    // 获取当前本地日期
    let today = Local::now();
    let day = today.day();  // 日（1-31）

    // 补零成两位字符串
    let day_str = format!("{:02}", day);  // "01" 到 "31"

    // 拆开十位和个位
    let shi_wei = &day_str[0..1];  // 十位字符，如 "0" 或 "2"
    let ge_wei = &day_str[1..2];   // 个位字符，如 "1" 或 "2"

    // 拼接成当天密码：十位 + "lsr" + 个位，【这就是密码】
    let expected = format!("{}lsr{}", shi_wei, ge_wei);

    // 对比用户输入（忽略大小写可选）
    password.to_lowercase() == expected.to_lowercase()
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}