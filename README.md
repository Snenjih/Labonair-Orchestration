# Labonair AI Core

**Mission Control for Claude** — A built-in VS Code extension providing persistent, autonomous Claude agent sessions with full conversation history, permission-based tool execution, and native UI integration.

## 🎯 Overview

Labonair AI Core is the intelligent backbone of the **Labonair** hard-fork of VS Code — a "Zen-Mode First" alternative to proprietary AI coding assistants. It replaces extensions like GitHub Copilot with a fully locally-managed Claude agent that respects your privacy and gives you complete control.

### Core Features

- **Persistent Background Sessions** — Run multiple Claude agent sessions simultaneously in the background
- **Full Conversation History** — Every session retains complete context across VS Code restarts
- **Permission-Based Execution** — Claude requests explicit permission before executing file operations, shell commands, or tool calls
- **Rich Activity UI** — Inspect every Claude action in a structured, collapsible interface (file reads, edits, thinking blocks, tool outputs)
- **Native VS Code Integration** — Sidebar session management, chat panels, status indicators, and background notifications
- **Zero Telemetry** — All processing stays local; no data is sent to third parties
- **Bring Your Own Key (BYOK)** — Use your own Anthropic API key or Claude Code CLI credentials

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features in Detail](#features-in-detail)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Development](#development)
- [License](#license)

## 🚀 Installation

### Prerequisites
- VS Code 1.90.0 or later
- An Anthropic API key (or Claude Code CLI credentials)
- Node.js 18+ (for development)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/labonair/labonair-orchestration.git
   cd labonair-orchestration
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd webview-ui && npm install && cd ..
   ```

3. **Set your API key** (one of):
   - Provide `ANTHROPIC_API_KEY` environment variable
   - Use Claude Code CLI credentials from `~/.claude/`
   - Configure via VS Code command palette: `Labonair: Clear API Key` (will prompt for key on next use)

## 💬 Quick Start

1. **Open the extension in VS Code:**
   - Press `F5` to launch Extension Development Host
   - Or install the built `.vsix` file

2. **Create a new session:**
   - Click the **Sessions** icon (hub icon) in the activity bar
   - Click the **+** button to create a new agent session

3. **Interact with Claude:**
   - Type a message in the chat input
   - Claude will respond and may request permissions for tool use
   - Accept or deny permission requests; Claude shows all actions in detail

4. **Manage sessions:**
   - Rename sessions via the pencil icon
   - Delete sessions via the trash icon
   - Sessions persist across VS Code restarts

## ✨ Features in Detail

### 1. Session Management
- Create, rename, and delete agent sessions
- Each session maintains independent conversation history
- Sessions are persisted to disk and restored on startup
- Status indicators: idle, working, awaiting permission, finished, or error

### 2. Rich Agent Activity View
- **Messages** — Full conversation history with syntax-highlighted code blocks
- **Thinking Blocks** — Expandable Claude reasoning (when available)
- **Tool Calls** — Detailed logs of file reads, edits, shell commands, and API calls
  - Status indicator (pending, running, success, error)
  - Input/output inspection
  - Error messages and diagnostics
- **Permission Requests** — Modal cards for accepting/denying sensitive operations

### 3. Multi-Model Support
- Switch Claude models per message (Opus, Sonnet, Haiku)
- Configure effort level (low, medium, high, xhigh, max) to control thinking depth

### 4. Input Interface
- **Auto-expanding textarea** with markdown syntax support
- **@mention file support** — Reference workspace files by name
- **Model & effort selectors** — Configure Claude parameters per message

### 5. Background Notifications
- Toast notifications for session state changes (working, finished, error)
- Non-intrusive alerts when Claude is ready or needs your attention

## 🏗️ Architecture

Labonair AI Core is structured in three main layers:

### Extension Host (TypeScript)
The core logic layer running in the VS Code process:
- **SessionManager** — Session state machine; orchestrates turns and persistence
- **ClaudeProcess** — SDK wrapper providing permission callbacks and stream translation
- **ChatPanelProvider** — Webview lifecycle management and RPC routing
- **SidebarProvider** — TreeDataProvider for session list with status icons

### Webview UI (React + Vite)
The user-facing chat interface in a sandboxed web context:
- **App.tsx** — Root component; RPC message handling
- **AgentStreamView** — Organizes flat event stream into collapsible sections
- **Message** — User/assistant messages with syntax highlighting
- **ThoughtItem, ToolCall** — Collapsible activity blocks
- **PermissionRequestCard** — Accept/Deny UI for tool execution

### Claude SDK Integration
Powered by `@anthropic-ai/claude-agent-sdk`:
- Persistent `Query` object for cross-turn context preservation
- Async iterable input (push-based message injection)
- Permission callback system (`canUseTool`) for tool authorization
- Structured `SDKMessage` events (no ANSI parsing)

**See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed diagrams and component breakdown.**

## ⚙️ Configuration

### API Key Management
Store API keys securely using VS Code's built-in secret storage (OS Keychain):

```typescript
// Automatically persisted to context.secrets
const apiKey = await context.secrets.get('labonair.apiKey');
```

### Environment Variables
- `ANTHROPIC_API_KEY` — Override stored key (development)
- `CLAUDE_CODE_AUTH` — Use Claude Code CLI credentials (default)

## 🛠️ Development

### Build
```bash
# Full build (webview + TypeScript)
npm run compile

# Webview only
npm run build:webview

# TypeScript only
tsc -p ./
```

### Debug
1. Open this folder in VS Code
2. Press **F5** → Select "Run Extension"
3. Extension Development Host launches with debugger attached
4. Set breakpoints in `src/` files
5. Browser DevTools available via Command Palette: `Developer: Open Webview Developer Tools`

### Project Structure
```
labonair-orchestration/
├── src/                      # Extension Host (TypeScript)
│   ├── extension.ts         # Activation entry point
│   ├── SessionManager.ts    # Session state machine
│   ├── ClaudeProcess.ts     # SDK wrapper
│   ├── ChatPanelProvider.ts # Webview lifecycle
│   ├── SidebarProvider.ts   # Session list provider
│   ├── parser/
│   │   └── SdkEventTranslator.ts  # SDKMessage → ParsedEvent
│   └── shared/
│       └── types.ts         # Shared types (host + webview)
├── webview-ui/              # React UI (Vite)
│   ├── src/
│   │   ├── App.tsx          # Root component
│   │   ├── components/      # UI components
│   │   └── utils/vscode.ts  # VS Code API wrapper
│   └── vite.config.ts
├── dist/webview/            # Built webview assets (gitignored)
├── out/                     # Compiled TypeScript (gitignored)
├── package.json
├── tsconfig.json
└── CLAUDE.md               # Development guidelines
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `SessionManager.ts` | Orchestrates session lifecycle; drives `runTurn()` |
| `ClaudeProcess.ts` | SDK query wrapper; permission callbacks |
| `SdkEventTranslator.ts` | Converts SDK messages to UI-displayable events |
| `ChatPanelProvider.ts` | Manages webview panel instances and RPC routing |
| `webview-ui/src/App.tsx` | React root; handles all messages from extension host |

**See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed developer guide and workflow.**

## 🔌 Integration Points

### Message Protocol
Frontend ↔ Backend communication via `postMessage`:

**Backend → Frontend:**
- `initialState` — Session data on webview mount
- `parsed_event` — Streamed events during agent turn
- `raw_output` — Terminal output (stderr)
- `file_suggestions` — Autocomplete results

**Frontend → Backend:**
- `submit` — New user message with model/effort config
- `respondToPermission` — Accept/deny tool execution
- `requestFileSuggestions` — Fetch file list for @mention

**See [docs/WEBVIEW_PROTOCOL.md](docs/WEBVIEW_PROTOCOL.md) for full specification.**

## 📚 Documentation

- [Architecture & Design](docs/ARCHITECTURE.md)
- [Features Explained](docs/FEATURES.md)
- [Session Management](docs/SESSION_MANAGEMENT.md)
- [Claude SDK Integration](docs/CLAUDE_INTEGRATION.md)
- [Webview Message Protocol](docs/WEBVIEW_PROTOCOL.md)
- [Development Guide](docs/DEVELOPMENT.md)

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Follow the guidelines in [CLAUDE.md](CLAUDE.md)
4. Commit with conventional messages (`feat:`, `fix:`, etc.)
5. Open a pull request

## 📝 License

This project is licensed under the [MIT License](LICENSE) — see LICENSE file for details.

## 🙋 Support & Feedback

- **Issues:** Report bugs via GitHub Issues
- **Documentation:** Check [docs/](docs/) for detailed guides
- **Development:** See [CLAUDE.md](CLAUDE.md) for code standards and architecture rules

---

**Made with ❤️ for developers who want AI that respects their privacy.**
