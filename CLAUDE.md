# Labonair AI Core — Claude Code Instructions

## 📌 STARTUP PROTOCOL
**At the start of every new chat, read these files in order:**
1. `@project-information/context.md` — Architectural boundaries, strict limitations, core components
2. `@project-information/prd.md` — Product vision, requirements, technical constraints

These files are the source of truth for this project. Always refer back to them when in doubt.

## Project Overview
Labonair is a "Zen-Mode First" hard-fork of VS Code. This repo orchestrates the `labonair-ai-core` built-in extension: a "Mission Control" that wraps the `claude` CLI via `node-pty`, presenting it through a React Webview with a native TreeView sidebar.

## ⚠️ IMPORTANT — Extension Root
**The extension root IS this repository root** (`Labnair-Orchestration/`). There is NO `extensions/labonair-ai-core/` subdirectory. All source files (`src/`, `package.json`, `tsconfig.json`) live directly at the repo root. Do NOT create or reference an `extensions/` subfolder.

## Architecture at a Glance
```
/ (repo root = extension root)
  src/
    extension.ts          — Activation entry point; registers commands & providers
    SessionManager.ts     — Singleton Map<SessionId, SessionState>; EventEmitter for sidebar refresh
    ChatPanelProvider.ts  — Webview panel lifecycle; loads Vite assets; RPC routing
    SidebarProvider.ts    — TreeDataProvider; reflects SessionManager state
  webview-ui/             — Vite + React source (compiled → dist/webview/)
    src/
      App.tsx             — Root component; handles RPC messages from host
      main.tsx            — React entry point (createRoot)
      utils/vscode.ts     — acquireVsCodeApi singleton wrapper
    vite.config.ts        — Outputs to ../dist/webview/assets/
  dist/webview/           — Built React assets (gitignored)
  out/                    — Compiled extension JS (tsc output)
```

## Critical Rules
- **Never modify VS Code core** (`src/vs/workbench/…`). All logic stays in this repo root.
- **State lives in the Extension Host**, NOT in the React Webview. The Webview is purely presentational.
- **No plain-text API keys.** Use `vscode.ExtensionContext.secrets` (OS Keychain).
- **Frontend ↔ Backend** communication via `postMessage` only — never import Node.js modules in the webview.

## Current Phase
**Phase 3 — React Webview**
- Phase 1.1 (Scaffolding): ✅ COMPLETE
- Phase 1.2 (PTY Spawner — `ClaudeProcess.ts`): ✅ COMPLETE
- Phase 3.1 (React Webview Scaffolding & RPC): ✅ COMPLETE

## Key Technologies
- TypeScript, VS Code Extension API
- `node-pty` — PTY process spawner (Phase 1.2+)
- `strip-ansi` / regex state-machine — ANSI-to-JSON parser (Phase 2)
- React + Vite — Webview UI (Phase 3)
- `xterm.js` — Raw terminal in Webview (Phase 4)

## Message Protocol (Frontend ↔ Backend)
Backend → Frontend: `initialState`, `parsed_event`, `raw_output`, `file_suggestions`
Frontend → Backend: `submit`, `requestInitialState`, `respondToPermission`, `requestFileSuggestions`

## Session Status Icons (ThemeIcon)
- Idle: `$(clock)` | Working: `$(sync~spin)` | Permission: `$(warning)` | Finished: `$(check)` | Error: `$(error)`
