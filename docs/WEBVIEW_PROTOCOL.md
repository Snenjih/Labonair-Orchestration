# Webview Message Protocol

## Overview

The extension host (TypeScript) and webview (React) communicate exclusively via `postMessage()`. This document specifies the protocol format, message types, and expected behavior.

---

## Communication Architecture

```
Extension Host                        Webview (React)
    │                                    │
    ├─ postMessage() ────────────────────→│
    │  (initialState, parsed_event, etc) │
    │                                    │
    │←─ postMessage() ────────────────────┤
       (submit, respondToPermission)
```

**No direct imports.** All communication is via `postMessage()` with structured JSON payloads.

### Why postMessage?

1. **Sandbox isolation** — Webview has no access to Node.js or VS Code APIs
2. **Type safety** — Shared `types.ts` ensures both sides understand the schema
3. **Async by design** — Naturally handles real-time events
4. **Security** — No credentials passed to webview

---

## Message Format

All messages follow this structure:

```typescript
// Extension Host → Webview
{
  type: 'initialState' | 'parsed_event' | 'raw_output' | 'file_suggestions'
  payload: any
}

// Webview → Extension Host
{
  command: 'requestInitialState' | 'submit' | 'respondToPermission' | 'requestFileSuggestions'
  payload?: any
}
```

---

## Backend → Frontend Messages

### `initialState`

Sent when webview first mounts. Contains full session state.

```typescript
{
  type: 'initialState',
  payload: {
    sessionId: string              // Unique session identifier
    status: SessionStatus          // Current state
    history: ParsedEvent[]         // Full conversation history
    rawBuffer: string              // Terminal output (stderr)
    model?: string                 // Current model (future)
    effort?: EffortLevel           // Current effort level (future)
  }
}
```

**When sent:** On webview mount (triggered by `requestInitialState` from frontend)

**Example:**
```json
{
  "type": "initialState",
  "payload": {
    "sessionId": "session-abc123",
    "status": "idle",
    "history": [
      { "type": "user_message", "text": "Hello" },
      { "type": "agent_message", "text": "Hi there!" }
    ],
    "rawBuffer": ""
  }
}
```

---

### `parsed_event`

Sent in real-time as Claude responds. Each event is one element of the conversation.

```typescript
{
  type: 'parsed_event',
  payload: ParsedEvent  // Single event (not array)
}
```

**ParsedEvent Union:**
```typescript
type ParsedEvent =
  | { type: 'user_message', text: string }
  | { type: 'agent_message', text: string }
  | { type: 'thought', text: string, isLoading: boolean }
  | { type: 'tool_call_start', toolName: string, input: any }
  | { type: 'tool_call_done', toolName: string, output: any, status: 'success' | 'error' }
  | { type: 'tool_result', toolName: string, output: any }
  | { type: 'permission_request', requestId: string, toolName: string, input: any }
  | { type: 'session_finished', usage?: { input_tokens: number, output_tokens: number } }
```

**When sent:** Continuously during a turn (as SDK yields messages)

**Example Sequence:**
```json
{"type": "parsed_event", "payload": {"type": "agent_message", "text": ""}}
{"type": "parsed_event", "payload": {"type": "thought", "text": "Let me...", "isLoading": true}}
{"type": "parsed_event", "payload": {"type": "tool_call_start", "toolName": "ReadFile", "input": {"path": "app.js"}}}
{"type": "parsed_event", "payload": {"type": "tool_call_done", "toolName": "ReadFile", "output": "...", "status": "success"}}
{"type": "parsed_event", "payload": {"type": "agent_message", "text": "The file contains..."}}
{"type": "parsed_event", "payload": {"type": "session_finished"}}
```

---

### `raw_output`

Sent for terminal/diagnostic output (stderr from Claude process).

```typescript
{
  type: 'raw_output',
  payload: {
    text: string            // Line of output
    timestamp: number       // When message was generated
  }
}
```

**When sent:** As stderr is captured from Claude SDK

**Use case:** Display diagnostics in terminal view; used for debugging

**Example:**
```json
{
  "type": "raw_output",
  "payload": {
    "text": "[SDK] Query initialized with model: claude-opus-4-1",
    "timestamp": 1713448800000
  }
}
```

---

### `file_suggestions`

Sent in response to `requestFileSuggestions` from webview.

```typescript
{
  type: 'file_suggestions',
  payload: {
    query: string         // Original search query
    results: string[]     // Matching file paths
  }
}
```

**When sent:** After receiving `requestFileSuggestions` from webview

**Example:**
```json
{
  "type": "file_suggestions",
  "payload": {
    "query": "App",
    "results": ["src/components/App.tsx", "src/App.css", "public/App.html"]
  }
}
```

---

## Frontend → Backend Messages

### `requestInitialState`

Sent by webview on mount. Triggers `initialState` response from host.

```typescript
{
  command: 'requestInitialState'
  // No payload needed
}
```

**When sent:** On `useEffect(() => { ... }, [])`

**Expected response:** `initialState` message

**Example:**
```typescript
// In webview App.tsx
useEffect(() => {
  vscode.postMessage({ command: 'requestInitialState' })
}, [])
```

---

### `submit`

Sent when user submits a message in the chat input.

```typescript
{
  command: 'submit',
  payload: {
    text: string              // User message text
    config?: {
      model?: string          // 'opus', 'sonnet', 'haiku' (optional)
      effort?: EffortLevel    // 'low' | 'medium' | 'high' | 'xhigh' | 'max' (optional)
    }
  }
}
```

**When sent:** User clicks submit button or presses Cmd/Ctrl+Enter

**What happens:**
1. Extension host receives message
2. Calls `sessionManager.runTurn(sessionId, text, config)`
3. Claude processes message
4. Series of `parsed_event` messages sent back
5. `session_finished` event marks turn completion

**Example:**
```json
{
  "command": "submit",
  "payload": {
    "text": "Fix the bug in @utils/helpers.ts",
    "config": {
      "model": "opus",
      "effort": "high"
    }
  }
}
```

---

### `respondToPermission`

Sent when user accepts or denies a permission request.

```typescript
{
  command: 'respondToPermission',
  payload: {
    requestId: string   // From permission_request event
    allowed: boolean    // true = Accept, false = Deny
  }
}
```

**When sent:** User clicks "Accept" or "Deny" on PermissionRequestCard

**What happens:**
1. Extension host calls `sessionManager.respondToPermission(sessionId, requestId, allowed)`
2. ClaudeProcess resolves the permission callback
3. SDK continues tool execution (if approved) or skips (if denied)

**Example:**
```json
{
  "command": "respondToPermission",
  "payload": {
    "requestId": "perm-xyz789",
    "allowed": true
  }
}
```

---

### `requestFileSuggestions`

Sent when user types `@` in the message input (for @mention autocomplete).

```typescript
{
  command: 'requestFileSuggestions',
  payload: {
    query: string   // Partial filename (e.g., "App")
  }
}
```

**When sent:** User types `@` followed by characters in MessageInput

**Expected response:** `file_suggestions` message

**Example:**
```json
{
  "command": "requestFileSuggestions",
  "payload": {
    "query": "App"
  }
}
```

---

## Type Definitions

Shared types (used by both host and webview):

**File:** `src/shared/types.ts` (extension host)

```typescript
// MUST be kept in sync with webview-ui/src/types.ts

export type SessionStatus = 'idle' | 'working' | 'permission_required' | 'finished' | 'error'

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ParsedEvent =
  | { type: 'user_message', text: string }
  | { type: 'agent_message', text: string }
  | { type: 'thought', text: string, isLoading: boolean }
  | { type: 'tool_call_start', toolName: string, input: any }
  | { type: 'tool_call_done', toolName: string, output: any, status: 'success' | 'error' }
  | { type: 'permission_request', requestId: string, toolName: string, input: any }
  | { type: 'session_finished' }

export interface HostMessage {
  type: 'initialState' | 'parsed_event' | 'raw_output' | 'file_suggestions'
  payload: any
}

export interface WebviewMessage {
  command: 'requestInitialState' | 'submit' | 'respondToPermission' | 'requestFileSuggestions'
  payload?: any
}
```

**File:** `webview-ui/src/types.ts` (React webview)

**⚠️ IMPORTANT:** This file must be kept in manual sync with `src/shared/types.ts`. Never import Node.js modules in the webview.

---

## Synchronization Rules

### 1. Session ID Consistency
All messages include implicit session context (via panel association):

```
ChatPanelProvider manages: Map<sessionId, panel>
  ↓
When user sends submit → ChatPanelProvider routes to correct session
  ↓
SessionManager.runTurn(sessionId, ...)
  ↓
All response events are tagged with this sessionId (implicit)
```

### 2. State Coherence
The webview's local state must match the extension host's state:

```
Extension Host: SessionManager.sessions[sessionId]
Webview: App.useState({ sessionId, status, history })
```

Mismatch can occur if:
- Network latency (messages out of order)
- Race conditions (concurrent submit + permission)

**Prevention:**
- Always assume webview state is correct (it's updated last)
- Resend `initialState` on reconnect
- Debounce rapid submissions

### 3. Message Ordering
Events are delivered in order:

```
send: user_message
send: agent_message
send: tool_call_start
send: tool_call_done
send: session_finished
```

**Guaranteed:** Events from a single turn arrive in the order they were emitted.

---

## Error Handling

### On Host Error

If an error occurs during `runTurn()`:

```
SessionManager catches error
  ↓
Sets status = 'error'
  ↓
Sends parsed_event: { type: 'error', message: '...' }
  ↓
Webview displays error card
```

### On Network Error

If webview loses connection to host:

```
window.addEventListener('message') stops receiving
  ↓
UI freezes (can retry by sending message again)
  ↓
On reconnect, send 'requestInitialState' to sync
```

### User-Initiated Cancellation

No built-in cancel button. User can:

1. **Delete the session** — Immediately stops Claude and closes panel
2. **Close the panel** — Disconnects UI (backend continues until idle)
3. **Deny permission** — Skips the current tool (Claude continues)

---

## Performance Considerations

### Event Streaming
Events arrive as fast as SDK yields them:

```
T=0ms: user_message event
T=50ms: agent_message event (Claude starts responding)
T=100ms: thought event (extended thinking)
T=500ms: tool_call_start event
T=600ms: tool_call_done event
T=700ms: agent_message event (continued response)
T=1000ms: session_finished event
```

**No batching.** Each event is sent immediately (for responsiveness).

### WebSocket Alternative (Future)
Currently uses VS Code's native `postMessage()`. Could upgrade to WebSocket for:
- Lower latency
- Bi-directional streaming
- Multi-tab support

---

## Version Compatibility

Current protocol version: **1.0**

If breaking changes are needed in the future:

```
Add version field:
{
  type: 'initialState',
  version: '1.0',
  payload: { ... }
}
```

Webview checks version and handles accordingly.

---

## Debugging

### Inspect Messages

In Extension Development Host webview console:

```typescript
// Intercept all incoming messages
const originalPostMessage = window.addEventListener
window.addEventListener('message', event => {
  console.log('Message from host:', event.data)
})

// Send message to host
vscode.postMessage({ command: 'submit', payload: { text: 'test' } })
```

### Inspect Host Messages

In Extension Development Host console (`Ctrl+Shift+I`):

```typescript
// In extension.ts or ChatPanelProvider
panel.webview.onDidReceiveMessage(message => {
  console.log('Message from webview:', message)
})

// Send message to webview
panel.webview.postMessage({ type: 'parsed_event', payload: {...} })
```

---

## Migration Guide

### Adding a New Message Type

1. **Update `src/shared/types.ts`:**
   ```typescript
   export interface NewMessage {
     type: 'new_message_type'
     payload: NewPayload
   }
   ```

2. **Update `webview-ui/src/types.ts`:**
   ```typescript
   // Copy the type definition (no imports allowed)
   ```

3. **Add handler in backend:**
   ```typescript
   // In ChatPanelProvider or SessionManager
   case 'new_message_type':
     handleNewMessage(message.payload)
     break
   ```

4. **Add handler in frontend:**
   ```typescript
   // In App.tsx
   case 'new_message_type':
     setState(prev => ({ ...prev, newField: payload }))
     break
   ```

5. **Test:** Send message from webview and verify backend handles it

