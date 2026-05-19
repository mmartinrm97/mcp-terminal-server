---
name: terminalize
description: >
  Use terminalize to run interactive commands (npm init, gh pr create,
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

## Tools Overview (12 tools)

| Tool                           | Purpose                                           | When to Use                         |
| ------------------------------ | ------------------------------------------------- | ----------------------------------- |
| `terminal_create_session`      | Create a persistent PTY session                   | Always first                        |
| `terminal_write`               | Write keystrokes/commands to the session          | ⭐ Your main input tool             |
| `terminal_read`                | Read raw buffer (non-blocking)                    | Quick peek at latest output         |
| `terminal_read_until`          | Wait for a pattern, then return output            | Wait for prompts/questions          |
| **`terminal_screenshot`**      | **Get clean screen state with cursor position**   | **⭐ TUI navigation**               |
| `terminal_tail`                | Read last N lines (like `tail -n N`)              | ⭐ Logs from long-running processes |
| `terminal_resize`              | Change terminal dimensions                        | When output is clipped              |
| `terminal_send_signal`         | Send SIGINT/SIGTSTP/SIGQUIT to foreground process | Interrupt stuck processes           |
| `terminal_ping`                | Health check — server status + uptime             | Verify server is alive              |
| `terminal_list_sessions`       | List all active sessions                          | Debugging                           |
| `terminal_session_diagnostics` | Structured debug snapshot for a session           | Diagnose desync / timeouts          |
| `terminal_close_session`       | Close and cleanup a session                       | Always last                         |

## Labels for Multi-Agent Flows

When running multiple sessions (e.g., backend + frontend), use labels to keep them organized:

```
terminal_create_session({ cwd: "./backend", label: "backend-api" })
terminal_create_session({ cwd: "./frontend", label: "frontend-vite" })

terminal_list_sessions()
→ [{ label: "backend-api", ... }, { label: "frontend-vite", ... }]
```

Pass the session `id` between sub-agents so any agent can read/write to any session.

## Interactive Flow Pattern

## Synchronization Rule (CRITICAL)

**Never batch answers into the terminal.**

Interactive CLIs are a synchronized conversation:

1. Wait for the exact next prompt
2. Write exactly one response
3. Wait again

### Anti-patterns

```text
❌ BAD
- Sending "\n\n\n\n\n" to skip multiple prompts
- Guessing that "Is this OK?" will appear next
- Writing before reading the updated screen/prompt
```

```text
✅ GOOD
- read_until("package name:")
- write("my-name\r\n")
- read_until("version:")
- write("\r\n")
- read_until("description:")
- write("\r\n")
```

If a prompt did not arrive yet, **do not spam Enter**. Read again or take a screenshot.

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

### Golden Rule for Text Prompts

For question/field-based CLIs (`npm init`, `gh pr create`, installers, auth prompts):

```text
ONE prompt → ONE answer → ONE wait
```

Do not assume you can safely skip ahead by sending multiple blank lines at once.

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

| Action           | Send                        | Note                                  |
| ---------------- | --------------------------- | ------------------------------------- |
| Enter            | `\r\n`                      | CRLF — works on both Windows and Unix |
| Tab              | `\t`                        | For autocomplete or focus change      |
| Escape           | `\x1b`                      | Cancel/back in many TUIs              |
| Ctrl+C           | `\x03`                      | Interrupt/SIGINT                      |
| Up arrow         | `\x1b[A`                    | Navigate up in menus                  |
| Down arrow       | `\x1b[B`                    | Navigate down in menus                |
| Space            | `\x20` or ` `               | Toggle selection                      |
| `y` / `n`        | `y\r\n` / `n\r\n`           | Yes/No prompts                        |
| SIGINT (Ctrl+C)  | `terminal_send_signal` tool | Interrupt — use INSTEAD of `\x03`     |
| SIGTSTP (Ctrl+Z) | `terminal_send_signal` tool | Suspend — use INSTEAD of `\x1a`       |

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

It also returns semantic guidance fields:

- `detectedPrompt`
- `promptCategory`
- `shouldAskUser`
- `askUserReason`
- `canAcceptDefault`
- `recommendedNextAction`

Use them as hints, not as an excuse to skip reading the actual screen.

## User Consultation Protocol (⭐ CRITICAL)

When the terminal asks a question, you must decide: **answer automatically** or **ask the user**.

### Decision Tree

```
Command asks for confirmation? (y/N, Yes/No, [y/N])
├── Destructive action? (delete, reset, force, rm, drop, clear)
│   ├── YES → ASK THE USER ⚠️
│   └── NO → answer "y" automatically
│
├── Trivial confirmation? (Is this OK?, Proceed?)
│   ├── Things look correct → answer "yes" automatically
│   └── Unsure → ASK THE USER
│
├── Has clear default you agree with? → Just press Enter ⏎
│
Command asks for a CHOICE with menus/options?
├── Options are obvious from context? (React for a JS project)
│   ├── YES → navigate and select automatically
│   └── NO or MULTIPLE valid options → ASK THE USER
│
Command asks for TEXT input? (name, path, etc.)
├── Was specified by user? → use that value
├── Has reasonable default? → press Enter (accept default)
└── Not specified, no default → ASK THE USER
```

### When to ALWAYS ask the user

| Scenario               | Example                                    | Why                  |
| ---------------------- | ------------------------------------------ | -------------------- |
| Destructive action     | `prisma db reset`, `drop table`, `rm -rf`  | Data loss risk       |
| License choice         | MIT, GPL, Apache, ISC                      | Legal implications   |
| Unknown password/token | API keys, database passwords               | Can't guess          |
| Multiple valid options | "Which features?" when user didn't specify | Preference           |
| Unclear intent         | "Customize settings?" without context      | Avoid wrong defaults |

### How to Present Options to the User

When you ask the user, use this structured format:

```
The terminal is asking:

   package name: (my-project)
   version: (1.0.0)
   description:

─────────────────────────────────────
What do you want to do?

A) Use all defaults (just press Enter)          ← recommended
B) Custom package name: ________
C) Custom description: ________
D) See full terminal output
─────────────────────────────────────
```

For a TUI menu with multiple options:

```
The terminal shows a menu:

   Select a framework:
     ○ Vanilla
     ○ Vue
     ● React
     ○ Svelte

   [↑↓] move · [enter] confirm

─────────────────────────────────────
Which framework do you want?

A) React          ← most common
B) Vue
C) Svelte
D) Vanilla
─────────────────────────────────────
```

For a destructive confirmation:

```
⚠️  The terminal is asking:

   "This will reset your database. Are you sure? (y/N)"

─────────────────────────────────────
This is a DESTRUCTIVE action.

A) Yes, proceed with reset
B) No, cancel                    ← recommended
─────────────────────────────────────
```

### y/N Confirmation Protocol

For simple y/N (yes/no) prompts:

```
Prompt shows: "Continue? (Y/n)"
→ "Y" is capitalized = default is YES
→ Answer "n" to skip

Prompt shows: "Are you sure? (y/N)"
→ "N" is capitalized = default is NO
→ Answer "y" to confirm (DESTRUCTIVE → ask user first!)
```

**Rule of thumb**: The capitalized letter is the default when you press Enter.
If the default is safe, press Enter. If the default is destructive, ASK.

### Pattern: Executing what the user asked

When the user gives you instructions upfront (e.g., "create a Vue project with Pinia"):

```
User: "Create a Vue project with Pinia and JSX"

Your flow:
1. Run the command
2. When you see options, match them to the user's request:
   - "Select a framework" → Vue ✓ (user specified)
   - "Add Pinia?" → Yes ✓ (user specified)
   - "Add JSX?" → Yes ✓ (user specified)
   - "Add Router?" → NOT specified → ASK USER or skip
3. Only ask when you hit something the user didn't specify
```

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

| Problem                  | What to do                                    |
| ------------------------ | --------------------------------------------- |
| `read_until` timed out   | Take a screenshot to see current state        |
| Session not found        | Create a new one                              |
| Invalid pty handle       | Close session, create new one                 |
| SIGKILL error on Windows | Use `close_session` without `force: true`     |
| Command seems stuck      | Send `\x03` (Ctrl+C) to interrupt, then close |

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

- **Source**: See `src/` for the terminalize implementation
- **Design**: See `docs/ARCHITECTURE.md` for full architecture
- **Tests**: See `test/` for example usage patterns in integration tests
