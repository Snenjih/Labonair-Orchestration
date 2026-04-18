# Labonair AI Core — Claude Code Instructions

## 📌 STARTUP PROTOCOL
**At the start of every new chat, read the memory file for this project** — it contains the most up-to-date phase status and architecture context.

---

## Product Vision

**Labonair** is a "Zen-Mode First" hard-fork of VS Code. The goal: replace proprietary AI extensions (GitHub Copilot, etc.) with a fully locally-managed autonomous Claude agent — BYOK, full privacy, background persistence, zero telemetry.

**`labonair-ai-core`** is the built-in extension that provides "Mission Control" for Claude. It is NOT a marketplace extension — it ships as part of the Labonair VS Code fork itself.

### Core User Problem
Developers want a persistent AI agent that:
- Runs in the background across multiple sessions simultaneously
- Retains full conversation history per session
- Requests permission before executing dangerous operations
- Shows structured tool call activity (file reads, edits, shell commands) in a readable UI
- Integrates natively into VS Code (sidebar, editor tabs, notifications)

---

## ⚠️ IMPORTANT — Extension Root
**The extension root IS this repository root** (`Labnair-Orchestration/`). There is NO `extensions/labonair-ai-core/` subdirectory. All source files (`src/`, `package.json`, `tsconfig.json`) live directly at the repo root. Do NOT create or reference an `extensions/` subfolder.

---

## Architecture

```
/ (repo root = extension root)
  src/
    extension.ts              — Activation entry; registers commands & providers
    SessionManager.ts         — Map<SessionId, SessionState>; drives runTurn(); emits events
    ClaudeProcess.ts          — SDK query wrapper; push-based async iterable input; permission callbacks
    ChatPanelProvider.ts      — Webview panel lifecycle; RPC routing; forwards events to webview
    SidebarProvider.ts        — TreeDataProvider; reflects SessionManager state with status icons
    shared/
      types.ts                — ParsedEvent union + SessionStatus (shared by host & webview)
    parser/
      SdkEventTranslator.ts   — Translates SDKMessage → ParsedEvent[] (no regex, no ANSI)
  webview-ui/                 — Vite + React source (compiled → dist/webview/)
    src/
      App.tsx                 — Root component; handles all RPC messages from host
      main.tsx                — React entry point (createRoot)
      types.ts                — Browser-safe mirror of src/shared/types.ts
      utils/vscode.ts         — acquireVsCodeApi singleton wrapper
      components/
        AgentStreamView.tsx   — Reduces flat ParsedEvent[] into display groups
        Message.tsx           — UserMessage + AssistantMessage (react-markdown + Prism)
        ThoughtItem.tsx        — Collapsible thinking block
        ToolCall.tsx           — Collapsible tool call with status icon
        PermissionRequestCard.tsx — Accept/Deny card; sends requestId back to host
        MessageInput.tsx       — Auto-resize textarea with @file mention support
        AgentFormDropdowns.tsx — Model selector dropdown
        TerminalEmulator.tsx   — xterm.js terminal (shows stderr from Claude process)
        ViewToggles.tsx        — UI / Terminal / Split segmented control
    vite.config.ts            — Outputs to ../dist/webview/assets/ (deterministic filenames)
  .vscode/
    launch.json               — "Run Extension" debug config (extensionHost)
    tasks.json                — Default build task: npm run compile
  dist/webview/               — Built React assets (gitignored)
  out/                        — Compiled extension JS (tsc output, gitignored)
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Extension Host | TypeScript, VS Code Extension API |
| Claude Integration | `@anthropic-ai/claude-agent-sdk` — structured JSON events, no ANSI parsing |
| Webview UI | React 18 + Vite |
| Terminal View | `@xterm/xterm` + `@xterm/addon-fit` |
| Markdown rendering | `react-markdown` + `prismjs` |
| Icons | `lucide-react` |

**Removed (legacy):** `node-pty`, `PtyParser.ts`, `ansi-utils.ts`

---

## How Claude Integration Works

Claude is driven via `@anthropic-ai/claude-agent-sdk` — NOT via a PTY/shell. Key design:

### `ClaudeProcess.ts`
- Creates a **persistent `Query`** on the first turn using a push-based async iterable as `prompt`
- Subsequent turns push new `SDKUserMessage` objects into the same query — Claude's session context is preserved across turns automatically
- **Permission:** The SDK calls `canUseTool(toolName, input)` before each tool execution. `ClaudeProcess` stores a `Promise` resolve callback keyed by `requestId`. When the user responds via the webview, the callback is resolved with `PermissionResult`
- **Stderr:** Captured and forwarded as `raw_output` → xterm terminal view (diagnostics only)

### `SdkEventTranslator.ts`
Converts `SDKMessage` → `ParsedEvent[]`:
- `'assistant'` message → `agent_message` / `thought` / `tool_call_start` events per content block
- `'stream_event'` → `thought` loading state
- `'result'` → `session_finished`

### `SessionManager.ts`
- `runTurn(sessionId, text)` — the only entry point for sending a message. Drives the `AsyncGenerator<SDKMessage>`, translates each message, fires events, updates status
- `respondToPermission(sessionId, requestId, allowed)` — delegates to `ClaudeProcess`
- Permission requests are wired from `claudeProcess.onPermissionRequest` in `createSession()`

---

## Critical Rules

- **Never modify VS Code core** (`src/vs/workbench/…`). All logic stays in this repo root.
- **State lives in the Extension Host** (SessionManager), NOT in the React Webview. The Webview is purely presentational.
- **No plain-text API keys.** Use `vscode.ExtensionContext.secrets` (OS Keychain) for anything sensitive.
- **Frontend ↔ Backend** communication via `postMessage` only — never import Node.js modules in the webview.
- **`webview-ui/src/types.ts`** must be kept in manual sync with `src/shared/types.ts` — never import Node modules in the webview.

---

## Message Protocol (Frontend ↔ Backend)

**Backend → Frontend:**
- `initialState` — `{ sessionId, status, history: ParsedEvent[], rawBuffer: string }`
- `parsed_event` — `{ payload: ParsedEvent }` — streamed in real-time during a turn
- `raw_output` — `{ payload: string }` — stderr from Claude process → xterm
- `file_suggestions` — `{ payload: string[] }` — response to `requestFileSuggestions`

**Frontend → Backend:**
- `requestInitialState` — on webview mount
- `submit` — `{ payload: { text: string, config: { model: string } } }`
- `respondToPermission` — `{ requestId: string, allowed: boolean }`
- `requestFileSuggestions` — `{ query: string }`

---

## Session Status & Sidebar Icons

| Status | ThemeIcon | Color |
|---|---|---|
| `idle` | `$(clock)` | default |
| `working` | `$(sync~spin)` | default |
| `permission_required` | `$(warning)` | `charts.orange` |
| `finished` | `$(check)` | `charts.green` |
| `error` | `$(error)` | `charts.red` |

---

## Build & Debug

```bash
# Full build (webview + TypeScript)
npm run compile

# Webview only
npm run build:webview

# TypeScript only
tsc -p ./
```

**Debug:** Open this folder in VS Code → press **F5** → "Run Extension" launches Extension Development Host.

---

## Phase Status

- ✅ Phase 1.1 — Scaffolding (package.json, tsconfig, extension.ts)
- ✅ Phase 1.2 — ClaudeProcess (SDK query, permission callbacks, async iterable input)
- ✅ Phase 2 — SdkEventTranslator (SDKMessage → ParsedEvent, replaces PtyParser)
- ✅ Phase 3.1 — React Webview Scaffolding & RPC (App.tsx, vscode.ts, postMessage bridge)
- ✅ Phase 3.2 — Agent Input Area (MessageInput as pill design with @mention, model + effort selectors)
- ✅ Phase 3.3 — Agent Stream View (AgentStreamView, Message, ThoughtItem, ToolCall, PermissionRequestCard)
- ✅ Phase 4 — Terminal View removed (SDK stderr handled internally; xterm/ViewToggles/split removed)
- ✅ Phase 5 — Sidebar & Notifications (SidebarProvider with dynamic icons, background toast notifications)
- ✅ SDK Rework — Replaced node-pty + PtyParser with @anthropic-ai/claude-agent-sdk
- ✅ Phase 6 — UI Polish: pill input with effort (low/medium/high/xhigh/max), centered chat layout, duplicate message fix
- ✅ Phase 7 — Session Auto-Titles: first user message auto-generates tab + sidebar label via `_generateTitle()`; `onLabelChanged` event propagates to panel title and webview header in real-time
- ✅ Phase 8 — Settings System: persistent `AgentSettings` (model, effort, permissionMode) stored in `globalState`; sidebar footer with GitHub username + gear button; inline settings panel with auto-save; new sessions use saved defaults; chat panel pre-populates model/effort from settings

**Effort:** `EffortLevel` ('low'|'medium'|'high'|'xhigh'|'max') passed via query options in ClaudeProcess.ts.

**AgentSettings storage key:** `labonair.settings` in `context.globalState`. Defaults: `{ defaultModel: 'claude-sonnet-4-6', defaultEffort: 'medium', permissionMode: 'default' }`.

**Next:** End-to-end testing in Extension Development Host. Potential Phase 9: AI-generated session titles (SDK call on first turn), MCP server config UI, session resume/fork.
