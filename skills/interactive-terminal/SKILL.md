---
name: interactive-terminal
description: >
  Use the MCP Terminal Server to run interactive commands (npm init, gh pr create,
  npx create-vite, psql, etc.) that require TUI navigation or multi-step input.
  Trigger: When running commands that wait for user input, display TUI menus,
  or require interactive responses (npm init, gh pr create, npx create-vite,
  git rebase -i, psql, npx autoskills, etc.).
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

The `bash` tool executes commands in **one-shot non-interactive** mode. When a command
waits for input or shows a TUI menu, `bash` will time out or return truncated output.

**Use the terminal tools instead** when:
- Running `npm init`, `npm create`, or any `npm` command that asks questions
- Running `gh pr create`, `gh issue create` — GitHub CLI prompts
- Running `npx create-vite`, `npx autoskills`, or any `npx` scaffolding tool
- Running `psql`, `mysql`, `redis-cli` — database interactive shells
- Running `git rebase -i`, `git commit` (with editor) — git interactive commands
- Running `shadcn-vue add`, `prisma init` — CLI tools with questions
- Any command that shows a menu with `↑↓` arrows or `[y/N]` prompts

## Tools Overview (8 tools)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `terminal_create_session` | Create a persistent PTY session | Always first |
| `terminal_write` | Write keystrokes/commands to the session | ⭐ Your main input tool |
| `terminal_read` | Read raw buffer (non-blocking) | Quick peek at latest output |
| `terminal_read_until` | Wait for a pattern, then return output | Wait for prompts/questions |
| **`terminal_screenshot`** | **Get clean screen state with cursor position** | **⭐ TUI navigation** |
| `terminal_resize` | Change terminal dimensions | When output is clipped |
| `terminal_list_sessions` | List all active sessions | Debugging |
| `terminal_close_session` | Close and cleanup a session | Always last |

## Interactive Flow Pattern

### Basic Flow

```
1. terminal_create_session({ cwd: "/project", shell: "auto" })
   → Get session ID

2. terminal_write({ id, data: "command\n" })
   → Write command with Enter

3. terminal_read_until({ id, pattern: "prompt pattern", timeout_ms: 10000 })
   → Wait for the first prompt

4. terminal_write({ id, data: "response\n" })
   → Answer

5. Repeat steps 3-4 until command finishes

6. terminal_close_session({ id })
   → Cleanup
```

### TUI Menu Navigation (⭐ IMPORTANT)

For menus with arrow-key navigation (like create-vite, autoskills):

```
1. terminal_screenshot({ id })
   → Returns { rows: [...], cursorRow, cursorCol, text }
   → READ the text to see what options are available
   → Example output:
     rows: [
       "  Select a framework:",
       "  │  ○ Vanilla",
       "  │  ○ Vue",
       "  │  ● React",        ← selected item
       "  │  ○ Preact"
     ],
     cursorRow: 4,
     cursorCol: 2

2. Navigate with arrow keys:
   terminal_write({ id, data: "\x1b[B" })   → Down arrow
   terminal_write({ id, data: "\x1b[A" })   → Up arrow
   terminal_write({ id, data: "\x1b[C" })   → Right arrow
   terminal_write({ id, data: "\x1b[D" })   → Left arrow

3. Confirm selection:
   terminal_write({ id, data: "\r\n" })      → Enter (CRLF)

4. Verify by taking another screenshot:
   terminal_screenshot({ id })
   → Check that "●" moved to the desired option
```

### Keyboard Reference

| Action | Send | Note |
|--------|------|------|
| Enter | `\r\n` | CRLF — works on both Windows and Unix |
| Tab | `\t` | For autocomplete or focus change |
| Escape | `\x1b` | Cancel/back in many TUIs |
| Ctrl+C | `\x03` | Interrupt/SIGINT |
| Up arrow | `\x1b[A` | Navigate up in menus |
| Down arrow | `\x1b[B` | Navigate down in menus |
| Space | `\x20` or ` ` | Toggle selection |
| `y` / `n` | `y\r\n` / `n\r\n` | Yes/No prompts |

## Screenshot-First Navigation Strategy

Always use `terminal_screenshot` BEFORE `terminal_write` when navigating TUIs:

```
❌ BAD: Guessing what keys to press
  terminal_write({ id, data: "\x1b[B\r\n" })  // might be wrong!

✅ GOOD: Read screen first, then navigate
  terminal_screenshot({ id })
  → See that "● Vanilla" is selected
  → Calculate: need 2 down arrows to reach React
  terminal_write({ id, data: "\x1b[B\x1b[B" })
  terminal_screenshot({ id })
  → Confirm "● React" is now selected
  terminal_write({ id, data: "\r\n" })
```

The `terminal_screenshot` returns clean text rows — you can search for `●` or
`○` to find selected/unselected items without parsing ANSI codes.

## Platform Notes

### Windows (ConPTY)
- **Use `cmd` shell** for best compatibility with CLI tools
- Commands may be echoed to output — this is normal
- `SIGKILL` (`\x1b[3~` or POSIX signals) is NOT supported
- Close sessions gracefully: `terminal_close_session({ id })` without force

### Unix (macOS/Linux)
- **Use `auto` shell** (detects zsh/bash)
- Line feeds with `\n` alone work (no need for `\r\n`)

## Common Patterns

### Pattern: Unknown number of prompts
```
loop:
  result = terminal_read_until({
    id, pattern: "name:|version:|password:|\\[y/n\\]|\\[Y/n\\]|\\$ |# ",
    timeout_ms: 5000
  })
  
  if result.timed_out:
    → Take screenshot to understand current state
    → If confused, ask the user what to do
    → If clear, respond accordingly

  if contains shell prompt ($ or #):
    → Command completed
    break

  → Match the prompt and respond
```

### Pattern: Agent doesn't know what to answer
```
terminal_screenshot({ id })
→ Presents options to user with context:
  "The terminal is asking:
     package name: (my-project)
     version: (1.0.0)
     description:
   
   What values do you want to use?
   A) All defaults (just press Enter)
   B) Custom values..."
```

## Error Recovery

| Problem | What to do |
|---------|------------|
| `read_until` timed out | Take a screenshot to see current state |
| Session not found | Create a new one |
| Invalid pty handle | Close session, create new one |
| SIGKILL error on Windows | Use `close_session` without `force: true` |
| Command seems stuck | Send `\x03` (Ctrl+C) to interrupt, then close |

## Commands

```bash
# Create session with specific shell
terminal_create_session({ cwd: ".", shell: "cmd" })

# Write a command
terminal_write({ id, data: "npm init\n" })

# Take a screenshot of current screen
terminal_screenshot({ id })

# Wait for specific pattern (timeout in ms)
terminal_read_until({ id, pattern: "package name:", timeout_ms: 10000 })

# Close session
terminal_close_session({ id })
```

## Resources

- **Source**: See `src/` for the MCP Terminal Server implementation
- **Design**: See `docs/MCP-TERMINAL-SERVER.md` for full architecture
- **Tests**: See `test/` for example usage patterns in integration tests
