# Development Guide

## Getting Started

This guide covers local setup, build process, debugging, and contribution workflow.

---

## Prerequisites

- **VS Code** 1.90.0 or later
- **Node.js** 18+
- **Git**
- **Anthropic API key** (for testing with real Claude)

## Local Setup

### 1. Clone & Install

```bash
git clone https://github.com/labonair/labonair-orchestration.git
cd labonair-orchestration

# Install extension host dependencies
npm install

# Install webview dependencies
cd webview-ui && npm install && cd ..
```

### 2. Set API Key

Choose one of:

**Option A: Environment variable (development)**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Option B: VS Code secrets (tested)**
- Launch Extension Development Host (see below)
- Command Palette → "Labonair: Clear API Key"
- You'll be prompted for API key on next session

**Option C: Claude Code CLI (recommended)**
```bash
# Use existing ~/.claude/credentials
# Extension auto-detects when available
```

### 3. Build

```bash
# Full build (webview + TypeScript)
npm run compile

# Watch mode (rebuild on file change)
# TODO: add watch task to package.json
```

---

## Development Workflow

### Extension Development Host

The **Extension Development Host** is a separate VS Code instance running your extension.

#### Launch

1. Open this folder in VS Code
2. Press **F5**
3. Select "Run Extension" from the debug dropdown
4. New VS Code window opens with extension loaded

#### Debugging

In the main VS Code window:
- Set breakpoints in `src/` files
- Watch variables, step through code
- Debugger pauses on breakpoints in Extension Development Host

#### Hot Reload
- Edit TypeScript → Save
- Click "Reload" in debug panel
- Extension Development Host reloads the new code

### Webview Debugging

In Extension Development Host, open webview DevTools:

**Command Palette → "Developer: Open Webview Developer Tools"**

Then:
- Inspect React component state
- Set breakpoints in `webview-ui/src/` files
- View network requests
- Check console for errors

---

## File Structure

```
labonair-orchestration/
├── src/                               # Extension Host (TypeScript)
│   ├── extension.ts                   # Activation entry point
│   ├── SessionManager.ts              # Session lifecycle & state machine
│   ├── ClaudeProcess.ts               # SDK wrapper & permission system
│   ├── ChatPanelProvider.ts           # Webview panel management
│   ├── SidebarProvider.ts             # Session list sidebar
│   ├── parser/
│   │   └── SdkEventTranslator.ts      # SDKMessage → ParsedEvent
│   └── shared/
│       └── types.ts                   # Shared types (extension + webview)
│
├── webview-ui/                        # React UI (Vite)
│   ├── src/
│   │   ├── App.tsx                    # Root component (RPC dispatcher)
│   │   ├── main.tsx                   # React entry point
│   │   ├── types.ts                   # Webview-safe types (manual sync)
│   │   ├── utils/
│   │   │   └── vscode.ts              # VS Code API wrapper
│   │   └── components/
│   │       ├── AgentStreamView.tsx    # Renders ParsedEvent[] stream
│   │       ├── Message.tsx            # User/assistant messages
│   │       ├── ThoughtItem.tsx        # Thinking blocks
│   │       ├── ToolCall.tsx           # Tool execution details
│   │       ├── PermissionRequestCard.tsx  # Accept/Deny UI
│   │       ├── MessageInput.tsx       # Chat input (auto-expand, @mention)
│   │       ├── AgentFormDropdowns.tsx # Model selector
│   │       └── ViewToggles.tsx        # UI/Terminal/Split view toggle
│   ├── vite.config.ts                 # Build config (outputs to ../dist/)
│   └── package.json
│
├── dist/webview/                      # Built webview (gitignored)
│   └── assets/
│       ├── index-*.js                 # React bundle
│       └── index-*.css                # Styles
│
├── out/                               # Compiled TypeScript (gitignored)
│   ├── extension.js
│   ├── SessionManager.js
│   └── ...
│
├── .vscode/
│   ├── launch.json                    # Debug config (F5 to launch)
│   └── tasks.json                     # Build tasks
│
├── package.json                       # Extension manifest + dependencies
├── tsconfig.json                      # TypeScript config
├── CLAUDE.md                          # Developer guidelines
└── docs/                              # Documentation
    ├── ARCHITECTURE.md
    ├── FEATURES.md
    ├── SESSION_MANAGEMENT.md
    ├── CLAUDE_INTEGRATION.md
    ├── WEBVIEW_PROTOCOL.md
    └── DEVELOPMENT.md                 # This file
```

---

## Build System

### TypeScript Compilation

```bash
# Build TypeScript → out/
tsc -p ./

# Watch mode (rebuild on change)
tsc -p ./ --watch
```

**Config:** `tsconfig.json`
- Target: ES2020
- Module: commonjs
- Outdir: `out/`

### Webview Build (Vite)

```bash
cd webview-ui

# Build production bundle → ../dist/webview/
npm run build

# Watch mode (rebuild on change)
npm run dev
```

**Config:** `webview-ui/vite.config.ts`
- Bundler: Vite
- React 18 + JSX
- Output: `../dist/webview/assets/`
- Hashed filenames (cache-busting)

### Full Build

```bash
npm run compile
# Runs: webview build → TypeScript compile

# Single command builds everything
# Output:
#   dist/webview/assets/ (webview bundle)
#   out/extension.js     (extension code)
#   out/...              (compiled .ts files)
```

---

## Testing Checklist

### Manual Testing (Before Committing)

1. **Launch Extension Development Host**
   ```bash
   Press F5 in VS Code
   ```

2. **Create a new session**
   ```
   Click Sessions icon → Click +
   ```

3. **Send a simple message**
   ```
   Type "Hello" → Submit
   Should see Claude response
   ```

4. **Test permissions**
   ```
   Type "@extension.ts Can you read this file?"
   When Claude tries to read, permission card should appear
   Click Accept → File content shown in activity
   ```

5. **Test session persistence**
   ```
   Stop Extension Development Host (close window)
   Re-launch (F5)
   Previous session should be restored with history
   ```

6. **Test multi-session**
   ```
   Create 2-3 sessions with different names
   Verify they appear in sidebar with correct icons
   Switch between them → each has independent history
   ```

7. **Test error handling**
   ```
   Try to read non-existent file
   Should show error in tool_call_done event
   Claude should acknowledge error
   ```

### Browser DevTools Testing

In Extension Development Host:

1. **Open webview DevTools**
   ```
   Command Palette → Developer: Open Webview Developer Tools
   ```

2. **Check console**
   ```
   No red errors
   No warning messages
   postMessage calls logged correctly
   ```

3. **Check React DevTools**
   ```
   Install React DevTools browser extension
   Inspect App.tsx component state
   Verify history array is updating
   ```

4. **Network tab**
   ```
   No unusual network requests
   (all communication should be internal postMessage)
   ```

---

## Key Development Tasks

### Adding a New UI Component

**Example:** Add a custom button component.

1. **Create component file:**
   ```bash
   touch webview-ui/src/components/MyButton.tsx
   ```

2. **Write component:**
   ```typescript
   import React from 'react'
   
   export function MyButton({ label, onClick }) {
     return (
       <button className="my-button" onClick={onClick}>
         {label}
       </button>
     )
   }
   ```

3. **Import in App.tsx:**
   ```typescript
   import { MyButton } from './components/MyButton'
   
   function App() {
     return (
       <div>
         <MyButton label="Click me" onClick={() => console.log('clicked')} />
       </div>
     )
   }
   ```

4. **Add styles (optional):**
   ```css
   /* webview-ui/src/components/MyButton.css */
   .my-button {
     padding: 8px 16px;
     background: #007acc;
     color: white;
     border: none;
     cursor: pointer;
   }
   ```

5. **Build & test:**
   ```bash
   npm run compile
   F5 to reload
   ```

### Adding a New Extension Command

**Example:** Add a "Clear All Sessions" command.

1. **Define in `package.json`:**
   ```json
   {
     "contributes": {
       "commands": [
         {
           "command": "labonair.action.clearAllSessions",
           "title": "Clear All Sessions"
         }
       ]
     }
   }
   ```

2. **Implement in `extension.ts`:**
   ```typescript
   context.subscriptions.push(
     vscode.commands.registerCommand('labonair.action.clearAllSessions', () => {
       sessionManager.sessions.forEach((session, id) => {
         sessionManager.deleteSession(id)
       })
       vscode.window.showInformationMessage('All sessions cleared.')
     })
   )
   ```

3. **Access via Command Palette:**
   ```
   Cmd+Shift+P → Clear All Sessions
   ```

### Adding a New Message Type (Protocol)

**Example:** Add a "user_typing" event to show when user is typing.

1. **Update `src/shared/types.ts`:**
   ```typescript
   export type ParsedEvent = 
     | // ... existing types
     | { type: 'user_typing', userId: string }
   ```

2. **Update `webview-ui/src/types.ts`:**
   ```typescript
   // Copy the type (can't import from src/)
   export type ParsedEvent = 
     | // ... existing types
     | { type: 'user_typing', userId: string }
   ```

3. **Handle in `ChatPanelProvider.ts`:**
   ```typescript
   panel.webview.postMessage({
     type: 'parsed_event',
     payload: { type: 'user_typing', userId: sessionId }
   })
   ```

4. **Render in `App.tsx`:**
   ```typescript
   case 'user_typing':
     console.log(`${event.userId} is typing...`)
     break
   ```

---

## Debugging Tips

### Extension Host Debugging

In VS Code, while debugging extension:

```typescript
// In src/SessionManager.ts
console.log('Creating session:', sessionId)  // Shows in debug console

debugger  // Sets breakpoint (pauses execution)

// Set conditional breakpoint via UI:
// Right-click line number → Add Conditional Breakpoint
// Expression: sessionId === 'specific-id'
```

**Output:** Debug console in VS Code shows all console logs from extension host.

### Webview Debugging

In Extension Development Host, open webview DevTools:

```javascript
// In webview-ui/src/App.tsx
console.log('App mounted')

// React DevTools shows component hierarchy and state
// Set breakpoint in DevTools debugger tab

// Inspect postMessage calls
window.addEventListener('message', event => {
  console.log('Received from host:', event.data)
})
```

### Logging Patterns

**For extension host:**
```typescript
// Don't log API keys
console.log(`Session ${sessionId}: Running turn`)

// Log structured data
console.log({ sessionId, status, messageCount: history.length })
```

**For webview:**
```typescript
// Keep logs minimal (DevTools overhead)
console.log('Event received:', event.type)

// Avoid logging large objects
const { type } = parsedEvent
console.log(`Rendered ${type}`)
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Webview won't load | Build failed | Run `npm run compile` and check output |
| Types not matching | Sync mismatch | Ensure `webview-ui/src/types.ts` matches `src/shared/types.ts` |
| Hot reload not working | TypeScript errors | Check debug console for compilation errors |
| No API key prompt | Wrong setup | Set `ANTHROPIC_API_KEY` or use Claude Code CLI |
| Sessions don't persist | `loadFromStorage()` not called | Check `extension.ts` activation |
| Permissions hang | Callback not stored | Inspect ClaudeProcess.permissionCallbacks |
| Webview blank | Asset loading failed | Check `dist/webview/` exists and has files |

---

## Performance Optimization

### TypeScript Compilation
- Incremental mode: `tsc --incremental` (faster rebuilds)
- Skip unused rules: Set `skipLibCheck: true` in `tsconfig.json`

### Webview Bundling
- Tree-shake unused imports: Vite auto-enables this
- Code splitting: Future optimization (per-component bundles)

### Runtime Performance
- Lazy-load old messages: Not yet implemented (TODO)
- Virtualize long lists: Use react-window for large histories
- Debounce rapid submissions: Check RPC in App.tsx

---

## Contributing

### Workflow

1. **Create feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes:**
   - Follow code style in `CLAUDE.md`
   - Add comments only for non-obvious logic
   - Keep functions focused and single-purpose

3. **Test locally:**
   ```bash
   npm run compile
   F5 to launch Extension Development Host
   Manual testing checklist (see above)
   ```

4. **Commit:**
   ```bash
   git add src/ webview-ui/
   git commit -m "feat: describe your change"
   # Format: feat:, fix:, docs:, refactor:, test:
   ```

5. **Push & create PR:**
   ```bash
   git push origin feature/my-feature
   # Open PR on GitHub
   ```

### Code Style

- **TypeScript:** Use 2-space indents, no semicolons (per `CLAUDE.md`)
- **React:** Functional components, hooks for state
- **Naming:** camelCase for functions/variables, PascalCase for components
- **Comments:** Minimal; only explain WHY, not WHAT

### Testing Before PR

```bash
# Full build
npm run compile

# Manual testing (see checklist above)
F5 to launch
Test all core features

# Commit message format
git commit -m "feat: add feature description

- Detail 1
- Detail 2"
```

---

## Release Process

### Version Bumping
- Major (0.1.0 → 1.0.0): Breaking changes
- Minor (1.0.0 → 1.1.0): New features
- Patch (1.1.0 → 1.1.1): Bug fixes

Update in `package.json`:
```json
{
  "version": "0.0.2"
}
```

### Building Extension Package

```bash
# Install VS Code packaging tool
npm install -g @vscode/vsce

# Create .vsix file
vsce package

# Output: labonair-ai-core-0.0.2.vsix
```

---

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Anthropic Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-js)
- [Vite Documentation](https://vitejs.dev/)
- [React 18 Hooks](https://react.dev/reference/react/hooks)

---

## Getting Help

- **Architecture questions:** See `docs/ARCHITECTURE.md`
- **Feature details:** See `docs/FEATURES.md`
- **Protocol specs:** See `docs/WEBVIEW_PROTOCOL.md`
- **Code guidelines:** See `CLAUDE.md`
- **Issues:** Report on GitHub

