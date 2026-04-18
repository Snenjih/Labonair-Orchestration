# Claude SDK Integration

## Overview

Labonair AI Core uses the **`@anthropic-ai/claude-agent-sdk`** to interact with Claude. This document explains how the SDK is integrated, how the permission system works, and how to extend it.

---

## SDK Basics

### What is the Claude Agent SDK?

The Claude Agent SDK provides:
- **Persistent Query objects** — Maintain conversation context across turns
- **Async iterable input** — Push messages into an ongoing conversation
- **Permission callbacks** — Request user approval for tool execution
- **Structured JSON events** — Clean message format (no ANSI parsing)

### Why Not Use the REST API Directly?

The SDK handles complex concerns:
- Session context management (automatic)
- Tool call lifecycle (request → execute → result)
- Permission callbacks (before tool use)
- Event streaming (real-time message handling)
- Error recovery (transparent)

Using the SDK simplifies our code and provides a more reliable integration.

---

## ClaudeProcess: The SDK Wrapper

**File:** `src/ClaudeProcess.ts`

`ClaudeProcess` wraps the SDK's `Query` object and provides:
1. **Permission callback system**
2. **Async iterable input queue**
3. **Message streaming**
4. **Lifecycle management**

### Initialization

```typescript
class ClaudeProcess {
  private query: Query
  private inputQueue: AsyncIterable<SDKUserMessage>
  
  constructor(sessionId: string, apiKey: string) {
    this.inputQueue = this.createInputQueue()
    
    this.query = client.query({
      model: 'claude-opus-4-1',
      prompt: this.inputQueue,  // Push-based async iterable
      canUseTool: this.canUseTool.bind(this),  // Permission callback
    })
  }
}
```

### Push-Based Input

Rather than creating a new `Query` for each message, we reuse a single persistent `Query` and push messages into an async iterable:

```typescript
private inputQueue: AsyncQueue<SDKUserMessage>

private createInputQueue(): AsyncIterable<SDKUserMessage> {
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const message = await this.inputQueue.next()
        if (message.done) break
        yield message.value
      }
    }
  }
}

pushMessage(text: string): void {
  this.inputQueue.enqueue({ role: 'user', content: text })
}
```

**Why this approach?**
- Keeps conversation history automatically (SDK appends to context)
- No need to manually manage message history (SDK does it)
- Single Query object maintains session state
- Clean, push-based interface

### Message Streaming

The SDK yields messages as they're generated:

```typescript
async *stream(): AsyncGenerator<SDKMessage> {
  for await (const message of this.query) {
    yield message  // Each message is structured JSON
  }
}
```

**Example flow:**
```
1. User sends: "Write a function"
2. SDK yields: { role: 'assistant', content: [{ type: 'thinking', text: '...' }] }
3. SDK yields: { role: 'assistant', content: [{ type: 'text', text: 'function foo() {...}' }] }
4. SDK yields: { type: 'result', ... }
```

---

## Permission System

The permission system is a **callback-based protocol** where the SDK pauses before tool execution and requests user approval.

### How It Works

#### 1. SDK Prepares Tool Use
```
Claude decides to use EditFile tool
  ↓
SDK calls: canUseTool('EditFile', { filepath: 'src/App.tsx', ... })
  ↓
canUseTool returns: Promise<PermissionResult>
  ↓
SDK waits for promise to resolve
```

#### 2. ClaudeProcess Stores Callback
```typescript
canUseTool(toolName: string, input: any): Promise<PermissionResult> {
  const requestId = generateId()
  
  // Store resolve callback for later
  const promise = new Promise<PermissionResult>(resolve => {
    this.permissionCallbacks[requestId] = resolve
  })
  
  // Emit permission request event
  this.emit('permissionRequest', {
    requestId,
    toolName,
    input,
  })
  
  // Return promise (SDK waits here)
  return promise
}
```

#### 3. UI Shows Permission Card
```
SessionManager broadcasts 'permissionRequest' event
  ↓
ChatPanelProvider forwards to webview
  ↓
React renders PermissionRequestCard
  ↓
User clicks "Accept" or "Deny"
```

#### 4. User Response Resolves Callback
```typescript
respondToPermission(requestId: string, allowed: boolean): void {
  const callback = this.permissionCallbacks[requestId]
  
  if (callback) {
    callback({
      approved: allowed,
      explanation: allowed ? 'User approved' : 'User denied'
    })
    
    delete this.permissionCallbacks[requestId]
  }
}
```

#### 5. SDK Continues
```
Promise resolves
  ↓
SDK checks: result.approved === true?
  ├─ YES: Execute tool → return output
  └─ NO: Skip tool → continue conversation
```

### Permission Request Example

**User:** "Edit the config file to add a new setting"

```
Claude thinks: "I need to edit config.yaml"
  ↓
SDK calls: canUseTool('EditFile', {
  filepath: 'config.yaml',
  new_content: '...'
})
  ↓
ClaudeProcess emits: { requestId: 'perm-123', toolName: 'EditFile', ... }
  ↓
UI shows: "Claude wants to edit config.yaml. Accept or Deny?"
  ↓
User clicks: "Accept"
  ↓
callback({ approved: true })
  ↓
SDK: "Permission granted. Executing EditFile..."
  ↓
Tool output returned to Claude
  ↓
Claude: "I've updated the config file. Here's what I changed..."
```

---

## Event Translation Pipeline

The SDK yields `SDKMessage` objects (raw SDK format). We translate them to `ParsedEvent` (UI-displayable format).

### SDKMessage Types

```typescript
// User message
{
  role: 'user',
  content: string
}

// Assistant message (can have multiple content blocks)
{
  role: 'assistant',
  content: [
    { type: 'thinking', text: '...' },
    { type: 'text', text: '...' },
    { type: 'tool_use', id: '...', name: 'EditFile', input: {...} }
  ]
}

// Streaming event (for extended thinking)
{
  type: 'stream_event',
  index: 0,  // content block index
  delta: {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: 'more text' }
  }
}

// Final result
{
  type: 'result',
  usage: { input_tokens: 100, output_tokens: 50 }
}
```

### Translation Examples

**Example 1: Simple message**
```
SDKMessage: { role: 'user', content: 'What is 2+2?' }
  ↓
ParsedEvent: { type: 'user_message', text: 'What is 2+2?' }
```

**Example 2: Assistant with thinking**
```
SDKMessage: {
  role: 'assistant',
  content: [
    { type: 'thinking', text: 'Simple arithmetic...' },
    { type: 'text', text: '2+2 equals 4' }
  ]
}
  ↓
ParsedEvent[]:
  1. { type: 'agent_message', text: '' }
  2. { type: 'thought', text: 'Simple arithmetic...', isLoading: false }
  3. { type: 'agent_message', text: '2+2 equals 4' }
```

**Example 3: Tool use**
```
SDKMessage: {
  role: 'assistant',
  content: [
    { type: 'tool_use', id: 't1', name: 'ReadFile', input: { path: 'app.js' } },
    { type: 'tool_result', tool_use_id: 't1', content: '...' }
  ]
}
  ↓
ParsedEvent[]:
  1. { type: 'tool_call_start', toolName: 'ReadFile', input: { path: 'app.js' } }
  2. { type: 'tool_call_done', toolName: 'ReadFile', output: '...' }
```

### Translation Code

**File:** `src/parser/SdkEventTranslator.ts`

```typescript
export function translateMessage(message: SDKMessage): ParsedEvent[] {
  const events: ParsedEvent[] = []
  
  if (message.role === 'user') {
    events.push({
      type: 'user_message',
      text: typeof message.content === 'string' ? message.content : ''
    })
  }
  
  if (message.role === 'assistant') {
    for (const block of message.content) {
      if (block.type === 'thinking') {
        events.push({
          type: 'thought',
          text: block.text,
          isLoading: false
        })
      }
      
      if (block.type === 'text') {
        events.push({
          type: 'agent_message',
          text: block.text
        })
      }
      
      if (block.type === 'tool_use') {
        events.push({
          type: 'tool_call_start',
          toolName: block.name,
          input: block.input
        })
      }
      
      if (block.type === 'tool_result') {
        events.push({
          type: 'tool_call_done',
          toolName: findToolName(block.tool_use_id),
          output: block.content
        })
      }
    }
  }
  
  if (message.type === 'result') {
    events.push({
      type: 'session_finished',
      usage: message.usage
    })
  }
  
  return events
}
```

---

## Configuration & Options

### Model Selection

```typescript
const query = client.query({
  model: 'claude-opus-4-1',  // or 'claude-sonnet-4', 'claude-haiku-3'
  // ...
})
```

### Thinking Depth (Extended Thinking)

```typescript
const query = client.query({
  thinking: {
    type: 'enabled',
    budget_tokens: 5000  // Higher = more thinking
  }
})
```

Effort levels map to thinking budgets:
- `low` → 1000 tokens
- `medium` → 3000 tokens
- `high` → 5000 tokens
- `xhigh` → 8000 tokens
- `max` → 10000 tokens

### System Prompt (Future)

```typescript
const query = client.query({
  system: `You are a helpful coding assistant...`,
  // ...
})
```

---

## Tool Definitions

The SDK automatically handles tool definitions. Custom tools can be added via MCP servers (future phase).

### Built-In Tools
- `ReadFile` — Read file contents
- `EditFile` — Modify file
- `DeleteFile` — Remove file
- `ShellExecution` — Run shell commands
- `DirSearch` — Find files in directory

### Adding Custom Tools (Future)

```typescript
// Via MCP server registration
const query = client.query({
  mcp_servers: [
    {
      name: 'my-tools',
      command: 'python /path/to/mcp_server.py'
    }
  ]
})
```

---

## Error Handling

### SDK Errors

**API Key Invalid:**
```
Error: Invalid API key
→ ClaudeProcess.onError()
→ SessionManager sets status = 'error'
→ UI shows error card with retry option
```

**Rate Limit:**
```
Error: Rate limit exceeded
→ Automatic retry after delay
→ User notified via sidebar status
```

**Tool Execution Failed:**
```
Error: Tool 'EditFile' failed (permission denied)
→ Included in tool_result content
→ Claude sees error and adjusts
→ Conversation continues
```

### Permission Denial

When user denies a permission request:

```
User clicks "Deny"
  ↓
respondToPermission(requestId, false)
  ↓
callback({ approved: false })
  ↓
SDK: "Permission denied"
  ↓
Claude receives: "Tool denied by user"
  ↓
Claude can retry with different approach or apologize
```

---

## Performance Optimization

### Token Usage
Monitor token usage from `result` event:

```typescript
if (message.type === 'result') {
  const { input_tokens, output_tokens } = message.usage
  console.log(`Turn: ${input_tokens} in, ${output_tokens} out`)
}
```

**Future:** Display token usage in UI; implement quotas.

### Streaming Efficiency
Events arrive in real-time as SDK generates them:

```
SDK yields → SdkEventTranslator → ParsedEvent → Webview UI
(no buffering, immediate display)
```

**Result:** Chat feels responsive; user sees Claude's thinking as it happens.

### Caching (Future)
- Cache conversation embeddings for similarity search
- Implement message pagination for long histories
- Lazy-load old messages on scroll

---

## Testing & Debugging

### Mock SDK for Testing

```typescript
class MockQuery {
  async *[Symbol.asyncIterator]() {
    yield { role: 'assistant', content: [{ type: 'text', text: 'test response' }] }
    yield { type: 'result', usage: { input_tokens: 10, output_tokens: 5 } }
  }
}

// Use in tests instead of real SDK
```

### SDK Debug Logging

Enable SDK debug output:

```typescript
const query = client.query({
  debug: true,  // Logs all SDK events
})
```

Check terminal output (stderr) for detailed logs.

### Inspect Permission Callbacks

```typescript
console.log(claudeProcess.permissionCallbacks)
// Shows pending permission requests
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Permissions hang forever | Callback not stored | Check `canUseTool` implementation |
| Context lost between turns | New Query created per turn | Ensure single persistent Query |
| SDK won't start | Invalid API key | Check `ANTHROPIC_API_KEY` |
| Duplicate messages | Events processed twice | Check message queue |
| Permission denied but tool runs | Denial callback not called | Verify respondToPermission() |

---

## Future SDK Features

- [ ] Custom tool registration (MCP)
- [ ] Streaming token usage (real-time quota tracking)
- [ ] Batch processing (multiple queries at once)
- [ ] Context window optimization (auto-summarization)
- [ ] Tool result caching (avoid re-execution)
