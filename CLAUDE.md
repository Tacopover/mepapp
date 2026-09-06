# Environment notes

This repo gets worked on from two different machines:

- **Windows** (this dev machine, native filesystem, PowerShell/Git Bash)
- **Docker container on Linux** (running on a NAS)

`node_modules`, symlinks, and build artifacts (`dist/`) are **not portable** between these two — they're OS-specific or just missing entirely when the repo is pulled fresh on the other side. If you hit errors like:

- "Failed to run dependency scan" / "imported but could not be resolved" for `@mepapp/*` workspace packages
- Missing `dist/` output in a workspace package

**First check:** did `pnpm install` run on *this* machine, and did `pnpm build` (root, via turbo) run to produce `dist/` for every workspace package? Don't assume a previous session's install/build carried over — it didn't if that session ran on the other machine.

Fix: `pnpm install` then `pnpm build` at repo root.

# Delegate to subagents

Use the Agent tool for menial/mechanical sub-tasks (repo surveys, locating code, running a build/test and reporting output, applying a well-specified small edit) and for any task big enough to blow up context if done inline. Keep the main thread's context small — push exploration and grunt work to subagents, do the synthesis/decisions yourself.

# Project overview

MepApp is a from-scratch, open-source (AGPLv3) rebuild of MEPSketcher — a CAD tool for drawing annotated HVAC/electrical/plumbing/fire-protection elements onto PDF architectural drawings. Web + desktop targets. Currently in active prototype-validation phase, not a finished product.

Stack: TypeScript, PixiJS v8 (interactive overlay), MuPDF.js behind a swappable engine interface, Tauri 2 (desktop), pnpm workspaces + Turborepo.

## Monorepo map

- `@mepapp/core` — headless domain model: geometry/calibration math, commands, undo, schema migrations. No rendering/I/O. **Only package with real test coverage** (vitest).
- `@mepapp/pdf-engine` — abstract `PdfEngine`/`PdfDocumentHandle` interface only. No deps.
- `@mepapp/pdf-engine-mupdf` — concrete MuPDF.js adapter. **Rule: nothing outside this package may import `mupdf` directly** — go through the `pdf-engine` interface.
- `@mepapp/render` — PixiJS scene graph, hit-testing, interactive tools. Depends on `core` only.
- `@mepapp/ui` — React panels/dialogs. Depends on `core` + `render`.
- `@mepapp/platform` — abstract interface for file access, secure storage, window chrome (the layer that differs web vs. desktop).
- `@mepapp/platform-web` / `@mepapp/platform-tauri` — concrete implementations. `platform-tauri` is currently a stub, not wired to a real Tauri project yet.
- `apps/web` — Vite + React app, wires everything together. **The only real running app right now.**
- `apps/desktop` — placeholder only (README, no code). Blocked on scaffolding via `pnpm create tauri-app` pointed at `../web` — dev environment doesn't have Rust/Cargo/Tauri CLI yet.

## Fixtures policy

`fixtures/pdfs/` and `fixtures/stamps/` must contain **real** files, not synthetic/faked ones — real vector CAD-exported PDFs (small/large/rotated-page samples) and real 300-DPI PNG stamp art with alpha and asymmetric shapes (to catch rotation bugs). Code in `pdf-engine-mupdf` and `render/scene.ts` depends on these being genuine to catch real bugs; don't generate placeholder fixtures to unblock tests.

## License constraint

AGPLv3. No paid SDKs or non-free libraries — everything in the dependency tree must stay free/open. Network-use (§13) triggers source-disclosure obligations if a modified version is run as a network service — keep this in mind before adding SaaS-style backend dependencies.

## Documentation Hub

- Hub: `/taco/notes/Obsidian Vault/Project Docs/MepApp/` (this container's mount of `C:\Users\taco\OneDrive - MEPover\Taco\Notes\Obsidian Vault\Project Docs\MepApp\`)
- Temp plans: `.claude/plans/` — delete when task done; save 2–3 line summary to Decisions-Log first
- Session end: run `/session-handoff` — writes Claude memory + Obsidian Session-Summary + Decisions-Log entries
- Cross-project patterns: check `/taco/notes/Obsidian Vault/Project Docs/_Cross-Project/` before implementing a known pattern
- Do NOT log to hub: git history, code structure, CLAUDE.md content, or anything already in the repo
