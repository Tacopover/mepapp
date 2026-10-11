use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// PDFs the OS asked the app to open ("Open with", a double-click in the file manager) that the page has not taken yet.
#[derive(Default)]
struct OpenRequests(Mutex<Vec<String>>);

// The OS passes each file to open as a command-line argument after the program path.
// Only existing .pdf files count, so other arguments open nothing.
fn pdf_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
  args
    .iter()
    .skip(1)
    .map(|arg| cwd.join(arg))
    .filter(|path| path.is_file() && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")))
    .collect()
}

// The page can read and write only paths in the fs scope, so each file goes into the scope first.
// The persisted-scope plugin keeps it there, so Save still writes back after a restart.
fn queue_open_requests<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>) {
  let scope = app.fs_scope();
  let state = app.state::<OpenRequests>();
  let mut pending = state.0.lock().unwrap();
  for path in paths {
    match scope.allow_file(&path) {
      Ok(()) => pending.push(path.to_string_lossy().into_owned()),
      Err(err) => log::warn!("cannot open {}: {err}", path.display()),
    }
  }
}

#[tauri::command]
fn take_open_requests(state: tauri::State<OpenRequests>) -> Vec<String> {
  std::mem::take(&mut *state.0.lock().unwrap())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();
  // Must be the first plugin. A second start (a double-click on a PDF while the app runs)
  // passes its arguments to this instance and exits, so the PDF opens in the window that is already open.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      use tauri::Emitter;
      queue_open_requests(app, pdf_args(&args, Path::new(&cwd)));
      let _ = app.emit("open-requests", ());
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }));
  }
  builder
    .manage(OpenRequests::default())
    .plugin(tauri_plugin_dialog::init())
    // fs must come before persisted-scope, or the folders and files picked in a dialog are not kept across restarts.
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_persisted_scope::init())
    .invoke_handler(tauri::generate_handler![take_open_requests])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let args: Vec<String> = std::env::args_os().map(|arg| arg.to_string_lossy().into_owned()).collect();
      queue_open_requests(app.handle(), pdf_args(&args, &std::env::current_dir()?));
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
