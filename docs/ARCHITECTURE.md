# Architecture & Design

## Overview

Labonair AI Core is built on a **three-layer architecture**:

1. **Extension Host** (TypeScript, VS Code API) — Core logic and state
2. **Webview UI** (React + Vite) — Sandboxed presentation layer
3. **Claude SDK Layer** (via `@anthropic-ai/claude-agent-sdk`) — LLM integration

## Layer 1: Extension Host

The extension host runs in the VS Code process and manages all application state, Claude interactions, and secure credential storage.

### Core Components

#### SessionManager
**File:** `src/SessionManager.ts`

Manages session lifecycle and orchestrates agent turns:

```
Session = {
  id: string
  name: string
  cwd: string
  status: SessionStatus
  history: ParsedEvent[]
  claudeProcess: ClaudeProcess
}
```

**Key Methods:**
- `createSession(cwd)` — Create a new session; instantiate ClaudeProcess
- `runTurn(sessionId, text, config)` — Main entry point for user messages
  - Pushes message into ClaudeProcess async iterable
  - Consumes `AsyncGenerator<SDKMessage>`
  - Translates messages via SdkEventTranslator
  - Emits events; updates history
  - Broadcasts to all open panels for that session
- `deleteSession(sessionId)` — Clean up session state
- `respondToPermission(sessionId, requestId, allowed)` — Delegate to ClaudeProcess
- `loadFromStorage(context)` — Restore persisted sessions on startup

**State Persistence:**
- Sessions stored in `context.globalState`
- Only conversation history and metadata are persisted (not API keys)
- API key stored in `context.secrets` (OS Keychain)

---

#### ClaudeProcess
**File:** `src/ClaudeProcess.ts`

Wraps the Claude agent SDK with permission callbacks:

```typescript
class ClaudeProcess {
  query: Query  // Persistent across turns
  inputQueue: AsyncIterable<SDKUserMessage>  // Push-based input
  onPermissionRequest: Event<PermissionRequest>
  canUseTool?: (toolName, input) => Promise<PermissionResult>
}
```

**How it works:**

1. **First Turn (Session Creation):**
   - Create persistent `Query` with async iterable as prompt
   - Queue async generator consumer: `for await (const message of query) { handleMessage() }`

2. **Subsequent Turns (User Message):**
   - Push new `SDKUserMessage` into the async iterable
   - SDK automatically appends to conversation context
   - Session context is preserved across turns

3. **Permission Requests:**
   - SDK calls `canUseTool(toolName, input)` before tool execution
   - ClaudeProcess stores a `Promise` callback keyed by `requestId`
   - When user approves/denies via UI, callback is resolved
   - If denied, SDK skips the tool; if approved, proceeds

4. **Streaming Output:**
   - SDK yields `SDKMessage` objects as it generates
   - No ANSI parsing; clean structured JSON
   - Stderr captured and forwarded as `raw_output` events

---

#### SdkEventTranslator
**File:** `src/parser/SdkEventTranslator.ts`

Converts SDK messages into UI-displayable events:

```typescript
SDKMessage → ParsedEvent[]

// Examples:
assistant: { role: 'assistant', content: [...] }
  → [agent_message, thought, tool_call_start, tool_result, ...]

stream_event: { type: 'stream_event', ... }
  → [thought (loading)]

result: { type: 'result', ... }
  → [session_finished]
```

**No regex. No ANSI parsing.** SDK events are clean JSON; we just reshape them for display.

---

#### ChatPanelProvider
**File:** `src/ChatPanelProvider.ts`

Manages webview panel instances and RPC routing:

```typescript
static currentPanels: Map<sessionId, ChatPanelProvider>

class ChatPanelProvider {
  panel: WebviewPanel
  sessionId: string
  sessionManager: SessionManager
  
  static createOrShow(context, sessionId, sessionManager)
  sendEvent(parsedEvent: ParsedEvent)
  handleMessage(message, sessionId, sessionManager)
}
```

**Lifecycle:**
1. User clicks "Focus Session" or creates new session
2. `createOrShow()` checks if panel exists for that session
3. If not, create new panel + register message listener
4. Subscribe to SessionManager events for this session
5. Send initial state to webview
6. Forward all subsequent events to webview via `panel.webview.postMessage()`

**RPC Message Handling:**
```
Frontend → Backend:
{
  command: 'submit' | 'respondToPermission' | 'requestFileSuggestions',
  payload: any
}

Backend → Frontend:
{
  type: 'initialState' | 'parsed_event' | 'raw_output',
  payload: any
}
```

---

#### SidebarProvider
**File:** `src/SidebarProvider.ts`

TreeDataProvider for the "Active Sessions" sidebar:

```typescript
class SidebarProvider extends WebviewViewProvider {
  getChildren(element?)
  getTreeItem(element)
  onDidChangeTreeData: Event
}
```

**Features:**
- Lists all sessions with status icons
- Inline actions: rename, delete (context menu)
- Icons reflect session status (idle, working, awaiting permission, done, error)
- Single refresh subscription to SessionManager events

---

## Layer 2: Webview UI (React)

The webview is a sandboxed React application with **no Node.js modules**. All communication is via `postMessage`.

### Core Components

#### App.tsx
Root component; handles all RPC messages from extension host:

```typescript
function App() {
  const [state, setState] = useState<ChatState>({
    sessionId: '',
    status: 'idle',
    history: [],
    rawBuffer: ''
  })
  
  useEffect(() => {
    // On mount: request initial state
    vscode.postMessage({ command: 'requestInitialState' })
    
    // Listen for all messages from host
    window.addEventListener('message', event => {
      switch (event.data.type) {
        case 'initialState':
        case 'parsed_event':
        case 'raw_output':
        case 'file_suggestions':
        // Handle each message type
      }
    })
  }, [])
  
  return (
    <div>
      <AgentStreamView events={state.history} />
      <MessageInput onSubmit={handleSubmit} />
    </div>
  )
}
```

**Key Props Passed Down:**
- `events: ParsedEvent[]` — Full conversation history
- `onSubmit: (text, config) => void` — Send message to Claude
- `onPermissionResponse: (requestId, allowed) => void` — Permission decision

---

#### AgentStreamView
**File:** `webview-ui/src/components/AgentStreamView.tsx`

Organizes flat `ParsedEvent[]` into collapsible sections:

```
User Message
  └─ text content

Agent Message
  ├─ Thinking...
  ├─ Tool Call: ReadFile
  │  ├─ Input: path, options
  │  ├─ Output: file content
  │  └─ Status: ✓ Success
  ├─ Tool Call: EditFile
  └─ Final Response
```

**Logic:**
- Group consecutive events by turn
- Collapse thinking blocks (expandable on click)
- Show tool calls with status indicators
- Highlight code blocks with Prism

---

#### Message, ThoughtItem, ToolCall
Specialized components for rendering event types:

| Component | Purpose |
|-----------|---------|
| `Message.tsx` | Renders UserMessage / AssistantMessage with markdown + Prism |
| `ThoughtItem.tsx` | Collapsible thinking block |
| `ToolCall.tsx` | Tool execution details (input, output, status) |
| `PermissionRequestCard.tsx` | Modal for accepting/denying tool use |

---

#### MessageInput
**File:** `webview-ui/src/components/MessageInput.tsx`

Chat input with advanced features:

- **Auto-expanding textarea** — Grows with content
- **@mention support** — `@filename` triggers file suggestions
- **Model selector** — Switch Claude model per message
- **Effort level** — Configure thinking depth (low/medium/high/xhigh/max)

---

## Layer 3: Claude SDK Integration

### Query Lifecycle

```
Session Creation:
  1. Create async iterable input source
  2. Initialize Query with { prompt: asyncIterable, model, ... }
  3. Begin consuming: for await (const msg of query) { handleMessage(msg) }

User Submits Message:
  1. Push SDKUserMessage into async iterable
  2. SDK appends to conversation history automatically
  3. Claude responds with multiple SDKMessage objects
  4. Each message is handled and translated to ParsedEvent

Permission Request:
  1. SDK calls canUseTool(toolName, input)
  2. ClaudeProcess stores resolve callback keyed by requestId
  3. SessionManager broadcasts PermissionRequest event
  4. UI renders PermissionRequestCard
  5. User clicks Accept/Deny
  6. Callback is resolved; SDK continues or skips tool
```

### Event Types

**SDKMessage** (from SDK):
```typescript
| { role: 'user', content: string }
| { role: 'assistant', content: ContentBlock[] }
| { type: 'stream_event', index: number, delta: ContentBlockDelta }
| { type: 'result', ... }
```

**ParsedEvent** (for UI):
```typescript
| { type: 'user_message', text: string }
| { type: 'agent_message', text: string }
| { type: 'thought', text: string, isLoading: boolean }
| { type: 'tool_call_start', toolName: string, input: any }
| { type: 'tool_call_done', toolName: string, output: any, error?: string }
| { type: 'permission_request', toolName: string, requestId: string, input: any }
| { type: 'session_finished' }
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│           EXTENSION HOST (TypeScript)                │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │        SessionManager                        │   │
│  │ ─────────────────────────────────────────── │   │
│  │ • createSession()                            │   │
│  │ • runTurn() ← User message entry point      │   │
│  │ • deleteSession()                            │   │
│  │ • respondToPermission()                      │   │
│  │                                              │   │
│  │ Sessions: Map<id, SessionState>             │   │
│  │ Events: Event emitter for UI updates        │   │
│  └──────────────────────────────────────────────┘   │
│            │                                         │
│            ↓ (runTurn)                               │
│  ┌──────────────────────────────────────────────┐   │
│  │     ClaudeProcess (per session)              │   │
│  │ ─────────────────────────────────────────── │   │
│  │ • query: Query (persistent)                  │   │
│  │ • inputQueue: AsyncIterable (push-based)     │   │
│  │ • canUseTool callback                        │   │
│  │                                              │   │
│  │ Yields: AsyncGenerator<SDKMessage>           │   │
│  └──────────────────────────────────────────────┘   │
│            │                                         │
│            ↓ (SDKMessage)                            │
│  ┌──────────────────────────────────────────────┐   │
│  │     SdkEventTranslator                       │   │
│  │ ─────────────────────────────────────────── │   │
│  │ • translate(SDKMessage): ParsedEvent[]       │   │
│  │                                              │   │
│  │ Output: ParsedEvent[]                        │   │
│  └──────────────────────────────────────────────┘   │
│            │                                         │
│            ↓ (ParsedEvent[])                         │
│  ┌──────────────────────────────────────────────┐   │
│  │     ChatPanelProvider                        │   │
│  │ ─────────────────────────────────────────── │   │
│  │ • Manages WebviewPanel instance              │   │
│  │ • Forwards events via postMessage()          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
             │
             │ postMessage(type, payload)
             ↓
┌─────────────────────────────────────────────────────┐
│         WEBVIEW (React + Vite)                      │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │       App.tsx (RPC dispatcher)               │   │
│  │ ─────────────────────────────────────────── │   │
│  │ • window.addEventListener('message')         │   │
│  │ • setState on initialState / parsed_event    │   │
│  │ • vscode.postMessage() on user input         │   │
│  └──────────────────────────────────────────────┘   │
│            │                                         │
│            ├─→ AgentStreamView (organize events)    │
│            ├─→ Message (render text)                │
│            ├─→ ThoughtItem (thinking blocks)        │
│            ├─→ ToolCall (tool execution)            │
│            └─→ MessageInput (compose message)       │
│                                                       │
└─────────────────────────────────────────────────────┘
             │
             │ postMessage(command, payload)
             ↓
    [Back to SessionManager/ClaudeProcess]
```

---

## Security Model

### API Key Storage
- **Never** stored as plain text in memory
- **Always** stored in `vscode.ExtensionContext.secrets` (OS Keychain)
- Retrieved once on activation; credentials passed to SDK
- Cleared via `labonair.action.clearApiKey` command

### Webview Sandboxing
- Webview runs in restricted context (no Node.js modules)
- All communication via `postMessage` (typed via `SharedTypes`)
- No direct access to filesystem, secrets, or extension state
- Input validation on all RPC messages

### Permission Callbacks
- Every dangerous tool use (file write, shell exec) requires explicit permission
- User must click "Accept" in UI; no auto-approval
- Permissions are per-request, not cached
- Full transparency: user sees tool name, input, and output

---

## Performance Considerations

1. **Event Streaming** — Events arrive in real-time as SDK yields; no buffering
2. **Lazy Loading** — Thinking blocks and tool outputs are expandable (collapsed by default)
3. **Pagination** — Long conversation histories are virtualized (future optimization)
4. **Webview Reuse** — Panels are cached; re-showing existing session doesn't rebuild DOM

---

## Extension Points

### Adding a New Command
1. Define in `package.json` under `contributes.commands`
2. Register in `extension.ts` via `vscode.commands.registerCommand()`
3. Implement handler (usually delegates to SessionManager)

### Adding a New Event Type
1. Define in `src/shared/types.ts` (add to `ParsedEvent` union)
2. Add translation case in `SdkEventTranslator.ts`
3. Add React component in `webview-ui/src/components/`
4. Render in `AgentStreamView.tsx`

### Custom Tool Integration
1. Extend `ClaudeProcess.canUseTool()` callback
2. Add validation/formatting logic
3. Emit `permission_request` event for user approval

---

## Next Steps (Phase 7+)

- [ ] Session resume from persistent history
- [ ] MCP server configuration UI
- [ ] Settings/preferences panel
- [ ] Advanced search across sessions
- [ ] Export/import conversation history
- [ ] Multi-workspace support
