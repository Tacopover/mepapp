# apps/desktop

A real Tauri 2 project, wrapping the same React app `apps/web` builds —
`src-tauri/tauri.conf.json` points `frontendDist` at `../web/dist` and
`devUrl` at the web app's dev server.

## Prerequisites

- Rust + Cargo (https://www.rust-lang.org/tools/install)
- Tauri 2's Linux system dependencies (webkit2gtk, etc. —
  https://v2.tauri.app/start/prerequisites/) if building on Linux

## Commands

From this directory:

```sh
pnpm exec tauri dev      # runs the web dev server + opens a native window
pnpm exec tauri build    # produces a release binary/installer
```

The first `cargo build` compiles Tauri's full dependency tree (webkit2gtk
bindings, GTK, etc.) from scratch and can take a long time — expect 20-40+
minutes on a modest machine the first time, seconds after that.
