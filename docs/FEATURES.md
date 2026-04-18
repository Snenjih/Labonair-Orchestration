# Features Guide

## Complete Feature Overview

### 1. Persistent Multi-Session Management

Each Claude agent session runs independently in the background, maintaining its own conversation history.

#### Creating a Session
1. Click the **Sessions** icon in the activity bar (hub icon)
2. Click the **+** button in the sidebar header
3. A new chat panel opens with a fresh session
4. Each session gets a default name and unique ID

#### Session Persistence
- Sessions are automatically saved to disk on every turn
- When VS Code restarts, all previous sessions are restored
- Conversation history is fully retained (no context loss)
- Metadata (name, status, creation time) is persisted

#### Renaming & Deleting
- **Rename:** Right-click session → "Rename Session" or click pencil icon
- **Delete:** Right-click session → "Delete Session" or click trash icon
- Deletion is permanent; conversation history is removed

#### Session Status Indicators
Each session shows a visual status icon in the sidebar:

| Icon | Meaning | Color |
|------|---------|-------|
| ⏰ | Idle (ready for input) | default |
| ⟳ | Working (Claude is thinking) | default (spinning) |
| ⚠️ | Permission Required (awaiting user approval) | orange |
| ✓ | Finished (last turn completed) | green |
| ✕ | Error (something went wrong) | red |

---

### 2. Rich Activity Viewer

Every Claude action is displayed in a structured, collapsible interface. You see exactly what Claude is doing.

#### Message Organization
Conversations are organized by turn:

```
You:
  What is the capital of France?

Claude:
  Thinking... (expandable)
  Tool: ReadFile...
  Response: Paris is the capital...

You:
  Tell me more about the Eiffel Tower
```

#### User Messages
- Display exactly what you sent
- Preserve markdown formatting
- Show timestamp of each turn

#### Assistant Messages
Broken down into components:

##### Thinking Blocks
- **What:** Claude's internal reasoning/problem-solving
- **When:** Appears when Claude enables extended thinking
- **Display:** Collapsed by default (click to expand)
- **Why:** Understand Claude's reasoning before seeing the response

##### Tool Calls
Every tool execution (file read, edit, shell command, API call) is shown:

- **Tool Name** — What operation (ReadFile, EditFile, ShellExecution, etc.)
- **Input** — Parameters sent to the tool (filepath, command, etc.)
- **Status** — Pending → Running → Success/Error
- **Output** — What the tool returned (file contents, command output, etc.)
- **Error Details** — If tool failed, see the error message

**Expandable:** Tool calls are collapsed by default; click to inspect details.

##### Response Text
- Final text Claude generates for the user
- Syntax-highlighted code blocks (via Prism)
- Markdown formatting (bold, italics, lists, etc.)
- Links are rendered as clickable

#### Code Highlighting
Code blocks are automatically syntax-highlighted based on language:

````
```typescript
function hello() {
  console.log("world");
}
```
````

Supported: JavaScript, TypeScript, Python, Go, Rust, SQL, and 100+ others (via Prism).

---

### 3. Permission-Based Tool Execution

Claude must request your explicit permission before executing sensitive operations. You retain full control.

#### What Requires Permission?
- **File Operations:** Create, read, edit, delete files
- **Shell Commands:** Execute terminal commands (npm, git, bash, etc.)
- **API Calls:** HTTP requests to external APIs
- **Any Tool Use:** Every tool invocation requires consent

#### Permission Request Flow

1. **Claude attempts a tool** (e.g., editing `src/App.tsx`)
2. **Permission card appears** showing:
   - Tool name: "EditFile"
   - Input: filepath, new content snippet
   - Two buttons: **Accept** / **Deny**
3. **You decide:**
   - **Accept (✓):** Tool proceeds; output shown in activity view
   - **Deny (✕):** Tool is skipped; Claude continues conversation
4. **Result displayed:** Success, error, or skip message in activity log

#### Permission Transparency
- No auto-approval; every tool requires explicit permission
- You see exactly what Claude is about to do before it happens
- Full input/output inspection capability
- Permissions don't carry over (each tool requires fresh approval)

---

### 4. Multi-Model Support

Choose which Claude model to use for each message.

#### Available Models
- **Claude Opus** (most capable, slowest)
- **Claude Sonnet** (balanced, recommended)
- **Claude Haiku** (fastest, lightweight tasks)

#### Effort Level (Thinking Depth)
Configure how much "thinking" Claude does per message:

| Level | Use Case | Speed | Thinking |
|-------|----------|-------|----------|
| **low** | Simple questions, quick tasks | ⚡⚡⚡ | None |
| **medium** | Normal conversation | ⚡⚡ | Brief |
| **high** | Complex reasoning problems | ⚡ | Moderate |
| **xhigh** | Very hard problems, edge cases | 🐢 | Extensive |
| **max** | Absolute best answer needed | 🐌 | Maximum |

#### How to Switch
1. Look at the message input area (bottom of panel)
2. Click the **Model dropdown** (shows current model)
3. Select a different model
4. Click the **Effort dropdown** (shows current level)
5. Select effort level (1-5)
6. Type your message and submit

**Note:** Settings apply to the next message only; you can change models/effort per message.

---

### 5. Smart Input Interface

The message input box has advanced features for power users.

#### Auto-Expanding Textarea
- Grows vertically as you type
- Never loses scroll position
- Supports multi-line input
- Paste large code blocks easily

#### @Mention File Support
Reference workspace files inline:

```
@src/App.tsx Check if this component has any memory leaks
```

**How it works:**
1. Type `@` in the input
2. Start typing a filename (e.g., `@App`)
3. Autocomplete suggestions appear
4. Select a file
5. Claude can then reference that file in the agent context

**Use cases:**
- "Check this file for bugs: @utils/helpers.ts"
- "Add a test for @MyComponent.tsx"
- "Fix the issue in @pages/index.tsx"

#### Markdown Support
Full markdown formatting in messages:

- **bold** with `**text**`
- *italics* with `*text*`
- `code` with backticks
- Code blocks with triple backticks
- Lists, tables, links, etc.

---

### 6. Background Notifications

VS Code notifications alert you to session state changes without interrupting work.

#### Notification Types

| Event | Message | Type |
|-------|---------|------|
| Session starts | "Session 'MySession' is working..." | Info |
| Session finishes | "Session 'MySession' finished" | Success |
| Permission needed | "MySession needs your permission for EditFile" | Warning |
| Error occurred | "MySession encountered an error" | Error |

#### Behavior
- Toasts appear in bottom-right of VS Code
- Non-intrusive; doesn't interrupt your editing
- Clicking a notification switches to that session's panel
- Notifications fade after 5 seconds (or on click)

#### When They Trigger
1. Claude starts processing a message (working state)
2. Claude finishes responding (finished state)
3. Claude needs permission (permission_required state)
4. An error occurs (error state)

---

### 7. Terminal Output View (Diagnostics)

Stderr from Claude's execution environment is captured and displayed.

#### What Gets Logged?
- **Claude SDK Diagnostics** — Debug output from SDK internals
- **Tool Errors** — Stack traces from failed tool execution
- **System Messages** — Permission callbacks, session lifecycle

#### Viewing Terminal Output
1. In the chat panel, look for the **View Toggle** (UI / Terminal / Split)
2. Click **Terminal** to see raw output
3. Click **Split** to see both chat and terminal side-by-side
4. Output auto-scrolls to latest message

#### Use Cases
- Diagnosing tool failures
- Inspecting SDK behavior
- Debugging custom MCP servers (future)
- Performance monitoring

---

### 8. Sidebar Session Management

The sidebar ("Active Sessions" view) gives a live overview of all sessions.

#### Session List
- Lists all active sessions with current name
- Shows status icon (idle, working, permission, finished, error)
- Click to focus a session's chat panel
- Right-click for context menu

#### Quick Actions
- **New Session** (+ button at top)
- **Rename** (pencil icon inline)
- **Delete** (trash icon inline)

#### Visual Feedback
- **Spinning icon** while Claude is working
- **Orange warning icon** when permission is needed
- **Green checkmark** when a turn completes
- **Red error icon** if something failed

---

### 9. Keyboard Shortcuts & Quick Actions

#### Built-in Commands
Access via Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux):

| Command | Description |
|---------|-------------|
| `Labonair: New Agent Session` | Create a new session |
| `Labonair: Focus Agent Session` | Switch to a session (with picker) |
| `Labonair: Delete Session` | Remove a session |
| `Labonair: Rename Session` | Change session name |
| `Labonair: Clear API Key` | Remove stored API credentials |

#### Webview Shortcuts (in chat panel)
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Submit message |
| `Shift + Enter` | New line in input |
| `Cmd/Ctrl + A` | Select all in input |
| `Escape` | Clear input (if empty) |

---

### 10. Secure Credential Management

API keys are stored securely and never exposed.

#### Storage Methods

**Option 1: VS Code Secrets (Recommended)**
```bash
# VS Code automatically stores in OS Keychain/Credential Manager
# On first use, you'll be prompted for API key
# Stored in: native OS secret storage
```

**Option 2: Claude Code CLI**
```bash
# Uses existing ~/.claude/credentials
# Automatic if CLAUDE_CODE_AUTH is set
# Most seamless if you use Claude Code CLI
```

**Option 3: Environment Variable (Development)**
```bash
export ANTHROPIC_API_KEY="sk-..."
```

#### Clearing Credentials
```
Command Palette → "Labonair: Clear API Key"
# Next session will prompt for key again
```

#### Security Guarantees
- ✓ Keys never logged to console
- ✓ Keys never sent to third-party services
- ✓ Keys stored in OS-native secret storage
- ✓ Keys cleared on user request
- ✓ Webview has no access to keys (all API calls happen in extension host)

---

## Feature Roadmap (Phase 7+)

- [ ] **Session Search** — Full-text search across all conversation history
- [ ] **Conversation Export** — Save sessions as JSON, Markdown, or PDF
- [ ] **MCP Server Config UI** — Configure custom LLM tools visually
- [ ] **Settings Panel** — Customize behavior (notifications, effort defaults, etc.)
- [ ] **Session Templates** — Pre-configured prompts for common tasks
- [ ] **Integrated Terminal** — Execute commands directly in Claude's context
- [ ] **Performance Profiling** — View token usage and latency metrics
- [ ] **Custom Instructions** — System prompt customization per session
