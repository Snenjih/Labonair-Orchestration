# Session Management

## Overview

A **session** is an independent Claude agent conversation with persistent state. Each session maintains its own:
- Conversation history
- Model/effort configuration
- Status (idle, working, error, etc.)
- Working directory context

Multiple sessions run in parallel with no interference. Each is managed by `SessionManager` and persisted to disk.

---

## Session Lifecycle

### Creation

```typescript
// Via command
const sessionId = sessionManager.createSession(cwd)

// Internal flow:
1. Generate unique sessionId
2. Initialize SessionState:
   {
     id: string
     name: string (auto-generated or user-specified)
     cwd: string (workspace root)
     status: 'idle'
     history: [] (empty)
     claudeProcess: new ClaudeProcess(sessionId, apiKey)
   }
3. Store in sessionManager.sessions Map
4. Persist to context.globalState
5. Emit 'sessionCreated' event
6. UI updates sidebar
```

### Active Usage

```
User types message → submit event → SessionManager.runTurn()
  ↓
ClaudeProcess pushes message into async iterable
  ↓
SDK processes message and yields SDKMessage stream
  ↓
Each SDKMessage translated to ParsedEvent[] via SdkEventTranslator
  ↓
ChatPanelProvider forwards ParsedEvent to webview
  ↓
React UI renders event in real-time
  ↓
When complete, status set to 'finished'
```

### Deletion

```typescript
sessionManager.deleteSession(sessionId)

// Internal flow:
1. Look up session in sessions Map
2. Call session.claudeProcess.dispose() (cleanup SDK resources)
3. Remove from sessions Map
4. Update context.globalState (remove from persistence)
5. Close open ChatPanelProvider (if any)
6. Emit 'sessionDeleted' event
7. Sidebar refreshes
```

### Persistence & Restoration

**On Activation:**
```typescript
sessionManager.loadFromStorage(context)
// Reads context.globalState['labonair.sessions']
// Recreates SessionState objects
// Re-instantiates ClaudeProcess for each
// Sessions are ready for use immediately
```

**On Every Turn:**
```typescript
// After runTurn() completes:
sessionManager._persistSessions(context)
// Writes entire sessions Map to context.globalState
// Includes: id, name, cwd, status, history
// Does NOT include API key (stored in context.secrets)
```

---

## SessionManager API

### Core Methods

#### `createSession(cwd?: string): string`
**Returns:** sessionId

Creates a new session and opens its chat panel.

```typescript
const sessionId = sessionManager.createSession('/path/to/workspace')
// Returns: "session-abc123"
```

#### `deleteSession(sessionId: string): void`

Permanently removes a session and its history.

```typescript
sessionManager.deleteSession('session-abc123')
// Session removed; panel closed; history deleted
```

#### `renameSession(sessionId: string, newName: string): void`

Changes the display name of a session.

```typescript
sessionManager.renameSession('session-abc123', 'My Project Setup')
// Sidebar updates to show new name
```

#### `runTurn(sessionId: string, text: string, config?: Config): Promise<void>`

The main entry point. Sends a user message and processes Claude's response.

```typescript
await sessionManager.runTurn(
  'session-abc123',
  'What does this code do?',
  { model: 'opus', effort: 'high' }
)
```

**Flow:**
1. Set status to `working`
2. Push message into ClaudeProcess input queue
3. Consume AsyncGenerator<SDKMessage>
4. Translate each SDKMessage to ParsedEvent[]
5. Broadcast events to ChatPanelProvider
6. Update session.history
7. Persist to disk
8. Set status to `finished`

**Errors:** On exception, status set to `error`; error message forwarded to UI.

#### `respondToPermission(sessionId: string, requestId: string, allowed: boolean): void`

User's response to a permission request. Resolves the promise callback stored in ClaudeProcess.

```typescript
sessionManager.respondToPermission('session-abc123', 'perm-xyz', true)
// ClaudeProcess callback is resolved; SDK continues tool execution
```

#### `setApiKey(key: string): void`

Store API key in secure storage.

```typescript
sessionManager.setApiKey('sk-ant-...')
// Saved to context.secrets['labonair.apiKey']
```

#### `loadFromStorage(context: ExtensionContext): void`

Restore sessions from the previous VS Code session.

**Called once on extension activation.** Auto-restores all sessions and their history.

#### `dispose(): void`

Clean up all sessions when extension is deactivated.

```typescript
sessionManager.dispose()
// Calls dispose() on all ClaudeProcess instances
// Clears all subscriptions
```

---

## SessionState Data Structure

```typescript
interface SessionState {
  id: string                    // Unique identifier (uuid)
  name: string                  // Display name (user-editable)
  cwd: string                   // Working directory
  status: SessionStatus         // 'idle' | 'working' | 'permission_required' | 'finished' | 'error'
  history: ParsedEvent[]        // Full conversation history (persisted)
  claudeProcess: ClaudeProcess  // SDK wrapper (not persisted)
  error?: string                // Error message if status === 'error'
  createdAt?: Date              // Session creation timestamp
  updatedAt?: Date              // Last modified timestamp
}

type SessionStatus = 'idle' | 'working' | 'permission_required' | 'finished' | 'error'
```

---

## State Transitions

```
         ┌─────────────┐
         │    idle     │
         │  (default)  │
         └──────┬──────┘
                │
       user submits message
                │
                ↓
         ┌──────────────┐
    ╔────┤   working    │◄───┐
    ║    │  (thinking)  │    │
    ║    └──────┬───────┘    │
    ║           │            │
    ║    Claude needs │      │
    ║    permission?  │      │
    ║           │     │      │
    ║    YES    │     │ NO   │
    ║           ↓     │      │
    ║    permission  │      │
    ║    _required   │      │
    ║           │    │      │
    ║    user    │    │      │
    ║    approves├───┘      │
    ║    or denies    │ turn complete
    ║           │     │      │
    ║           ↓     └─────→┤
    ║      working          │
    ║           │            │
    ║           └───────────→┤
    ║                        ↓
    ║                 ┌────────────┐
    ║────────────────→│  finished  │
    ║                 │ (ready for │
    ║                 │  new msg)  │
    ║                 └────────────┘
    ║
    ║ (on error)
    ↓
 ┌──────────┐
 │  error   │
 │ (failed) │
 └──────────┘
```

---

## History Management

### Message Storage
Each message (user or assistant) is stored as a sequence of `ParsedEvent` objects:

```typescript
history: [
  { type: 'user_message', text: 'What is 2+2?' },
  { type: 'agent_message', text: '2+2 equals 4.' },
  { type: 'thought', text: 'Simple arithmetic...', isLoading: false },
  { type: 'tool_call_start', toolName: 'ReadFile', input: {...} },
  { type: 'tool_call_done', toolName: 'ReadFile', output: '...' },
  { type: 'agent_message', text: 'Here's the file content...' },
  { type: 'session_finished' }
]
```

### Persistence Format
Sessions are stored as JSON in `context.globalState`:

```json
{
  "labonair.sessions": [
    {
      "id": "session-abc123",
      "name": "My Project",
      "cwd": "/path/to/workspace",
      "status": "idle",
      "history": [...],
      "createdAt": "2026-04-18T...",
      "updatedAt": "2026-04-18T..."
    }
  ]
}
```

### History Size Limits
- **Current:** No limit (entire history persisted)
- **Future:** May implement rolling buffer or compression
- **Optimization:** Lazy-load old messages (pagination)

---

## Permission Requests

### Anatomy

When Claude attempts to use a tool, SessionManager broadcasts a `permission_request` event:

```typescript
{
  type: 'permission_request',
  toolName: string        // 'EditFile', 'ShellExecution', etc.
  requestId: string       // Unique per request
  input: any              // Tool parameters (filepath, command, etc.)
  timestamp: number       // When request was made
}
```

### Resolution

1. **User in UI clicks "Accept" or "Deny"**
2. **UI calls:** `vscode.postMessage({ command: 'respondToPermission', requestId, allowed })`
3. **ChatPanelProvider receives message**
4. **Calls:** `sessionManager.respondToPermission(sessionId, requestId, allowed)`
5. **ClaudeProcess resolves the stored Promise callback:**
   ```typescript
   const callback = permissionCallbacks[requestId]
   callback({ approved: allowed })
   ```
6. **SDK continues:**
   - If `approved: true` → executes tool → returns output
   - If `approved: false` → skips tool → continues conversation

### Timeout
- Permissions don't expire; user can approve/deny at any time
- Claude is blocked until user responds
- To cancel, delete the session

---

## Error Handling

### Error States

| Scenario | Status | Behavior |
|----------|--------|----------|
| Invalid API key | `error` | Permission request for new key |
| Tool execution failed | `finished` | Error shown in tool_call_done; conversation continues |
| SDK crash | `error` | Session marked failed; user prompted to create new |
| Network error | `working` → `error` | Retry via new message |

### Recovery

```typescript
// If session hits error:
1. Status set to 'error'
2. Error message stored in session.error
3. UI shows error in sidebar (red icon)
4. User can:
   - Create a new session (fresh start)
   - Send another message (may retry)
   - Delete session (cleanup)
```

---

## Event System

SessionManager emits events for state changes:

```typescript
sessionManager.on('sessionCreated', (sessionId: string) => {
  // New session created; update sidebar
})

sessionManager.on('sessionDeleted', (sessionId: string) => {
  // Session removed; update sidebar
})

sessionManager.on('statusChanged', (sessionId: string, status: SessionStatus) => {
  // Status changed; update sidebar icon
})

sessionManager.on('historyUpdated', (sessionId: string, events: ParsedEvent[]) => {
  // History changed; update chat panel UI
})
```

**Subscribers:**
- `SidebarProvider` — Refreshes session list and icons
- `ChatPanelProvider` — Updates chat panel UI with new events
- Extension host — Broadcasts notifications

---

## Multi-Session Concurrency

Sessions are independent and can run concurrently:

```
Session A: working on file edit → needs permission
  ├─ Status: permission_required
  ├─ Waiting for user approval
  └─ Claude is blocked

Session B: generating text → no permissions needed
  ├─ Status: finished
  ├─ Ready for next message
  └─ User can send new message anytime

Session C: processing → no user action needed
  ├─ Status: working
  ├─ Claude thinking/generating
  └─ User can switch to other sessions
```

**No blocking:** One session's permission request doesn't block others.

---

## Best Practices

### For Extension Developers

1. **Always call `loadFromStorage()` on activation**
   - Restores user's session state
   - Must happen before creating new sessions

2. **Handle permission callbacks gracefully**
   - Don't auto-approve; always show UI
   - Respect user's deny decision
   - Log all tool usage for transparency

3. **Persist after every turn**
   - Call `_persistSessions()` at end of `runTurn()`
   - Ensure history is saved even if shutdown is sudden

4. **Clean up on deactivate**
   - Call `sessionManager.dispose()`
   - Prevents memory leaks

### For Users

1. **Descriptive Session Names**
   - Use names like "Fix Auth Bug" instead of "Session 1"
   - Easier to find sessions later

2. **One Session Per Task**
   - Keep conversations focused
   - Delete completed sessions to reduce clutter

3. **Review Permission Requests**
   - Always read what Claude is about to do
   - Deny if unsure
   - Claude can ask again with a different approach

4. **Export Important Conversations**
   - Before deleting a session, consider saving the history
   - (Future: export to Markdown/JSON)

---

## Debugging

### Inspect Session State
In extension dev host, open DevTools (`Ctrl+Shift+I`):

```typescript
// Access SessionManager instance
const sessionManager = // available in extension.ts

// List all sessions
sessionManager.sessions.forEach((session, id) => {
  console.log(`Session ${id}: ${session.name} (${session.status})`)
  console.log(`History: ${session.history.length} events`)
})
```

### View Persisted State
In VS Code settings (`.vscode/settings.json`):

```json
{
  "labonair.debugSession": "session-abc123"
}
```

Then inspect via Extension DevTools or `context.globalState`.

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Sessions don't persist | `loadFromStorage()` not called on activation | Verify extension.ts |
| Permission requests hang | Callback not stored in ClaudeProcess | Check ClaudeProcess constructor |
| Multiple panels for 1 session | `ChatPanelProvider.createOrShow()` not checking existing panels | Look for duplicate panel creation |
| Status doesn't update | Status change event not broadcasted | Verify SessionManager event emission |

