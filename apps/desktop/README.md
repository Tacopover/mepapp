# apps/desktop

Placeholder. This becomes a real Tauri 2 project once a validation step
actually needs the desktop shell — the frame-rate prototype (Step 3 of the
plan) is the first one that does.

Not scaffolded yet because this environment doesn't have the Rust toolchain,
Cargo, or the Tauri CLI installed. Before this can become a real Tauri project:

1. Install Rust: https://www.rust-lang.org/tools/install
2. Install Tauri 2's Linux system dependencies (webkit2gtk, etc. — see
   https://v2.tauri.app/start/prerequisites/)
3. Run `pnpm create tauri-app` (or `cargo install tauri-cli` +
   `cargo tauri init`) from this directory, pointing it at `../web` as the
   frontend so it wraps the same React app the browser build uses.
