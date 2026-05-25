# terminalize MCP Tools

This is the detailed tool reference for the current public MCP surface.

## Core workflow

Most agent integrations should use this pattern:

1. `terminal_create_session`
2. `terminal_execute` for the common write + wait loop
3. `terminal_read` or `terminal_tail` for peeks/logs
4. `terminal_screenshot` for TUIs or timeout recovery
5. `terminal_close_session`

## Tool tiers

- **Core tools**: the long-term agent integration surface
- **Advanced tools**: stable, but more diagnostic/operator-oriented

Contract details live in [./API-CONTRACT.md](./API-CONTRACT.md).

---

## Core tools

### `terminal_create_session`

Creates a new interactive terminal session.

| Parameter | Type     | Default         | Description                          |
| --------- | -------- | --------------- | ------------------------------------ |
| `id`      | `string` | UUID            | Custom session ID                    |
| `shell`   | `string` | `"auto"`        | `auto`, `bash`, `zsh`, `pwsh`, `cmd` |
| `cwd`     | `string` | `process.cwd()` | Working directory                    |
| `cols`    | `number` | `80`            | Terminal columns                     |
| `rows`    | `number` | `24`            | Terminal rows                        |
| `env`     | `object` | `{}`            | Additional environment variables     |

### `terminal_write`

Writes raw text/keystrokes to the PTY.

| Parameter            | Type     | Description              |
| -------------------- | -------- | ------------------------ |
| `id`                 | `string` | Session ID               |
| `data`               | `string` | Text or control bytes (` |
| `, ``, arrows, etc.) |

### `terminal_execute`

Writes and optionally waits for the next prompt/output pattern in the same call.

| Parameter             | Type      | Default | Description                     |
| --------------------- | --------- | ------- | ------------------------------- |
| `id`                  | `string`  | —       | Session ID                      |
| `data`                | `string`  | —       | Data to write                   |
| `await_pattern`       | `string`  | —       | Regex pattern to wait for       |
| `timeout_ms`          | `number`  | `30000` | Wait timeout                    |
| `strip_ansi`          | `boolean` | `true`  | Strip ANSI escape codes         |
| `include_full_output` | `boolean` | `false` | Include matched buffer snapshot |
| `include_debug`       | `boolean` | `false` | Include timeout/debug metadata  |
| `max_output_bytes`    | `number`  | —       | Truncate oversized output       |

### `terminal_read`

Non-blocking read of the current accumulated output.

| Parameter          | Type      | Default | Description                    |
| ------------------ | --------- | ------- | ------------------------------ |
| `id`               | `string`  | —       | Session ID                     |
| `flush`            | `boolean` | `false` | Clear after reading            |
| `since`            | `number`  | —       | Incremental byte-position read |
| `strip_ansi`       | `boolean` | `true`  | Strip ANSI escape codes        |
| `max_output_bytes` | `number`  | —       | Truncate oversized output      |

### `terminal_read_until`

Waits for a regex match or timeout.

| Parameter             | Type      | Default | Description                  |
| --------------------- | --------- | ------- | ---------------------------- |
| `id`                  | `string`  | —       | Session ID                   |
| `pattern`             | `string`  | —       | Regex pattern                |
| `timeout_ms`          | `number`  | `30000` | Maximum wait time            |
| `strip_ansi`          | `boolean` | `true`  | Strip ANSI escape codes      |
| `include_full_output` | `boolean` | `false` | Include full matched buffer  |
| `include_debug`       | `boolean` | `false` | Include extra debug metadata |
| `max_output_bytes`    | `number`  | —       | Truncate oversized output    |

### `terminal_resize`

Resizes the terminal.

### `terminal_tail`

Returns the last N lines without paying for the full history.

| Parameter          | Type      | Default | Description               |
| ------------------ | --------- | ------- | ------------------------- |
| `id`               | `string`  | —       | Session ID                |
| `lines`            | `number`  | `20`    | Number of lines           |
| `strip_ansi`       | `boolean` | `true`  | Strip ANSI escape codes   |
| `max_output_bytes` | `number`  | —       | Truncate oversized output |

### `terminal_send_signal`

Sends `SIGINT`, `SIGTSTP`, `SIGQUIT`, or `SIGKILL` to the foreground process.

### `terminal_screenshot`

Returns rendered screen text plus semantic hints for TUIs/prompts.

Important fields include:

- `terminal_mode`
- `editor_mode`
- `detectedPrompt`
- `promptCategory`
- `shouldAskUser`
- `canAcceptDefault`
- `recommendedNextAction`

### `terminal_list_sessions`

Lists active sessions.

### `terminal_close_session`

Closes a session and frees its resources.

---

## Advanced tools

### `terminal_ping`

Health check for uptime and active session count.

### `terminal_session_diagnostics`

Structured diagnostics snapshot for confusing interactive failures.

### `terminal_session_export`

Replay/debug export payload for issue reports and failure analysis.

---

## Agent usage contract

Use the cheapest tool that still preserves correctness:

1. `terminal_execute` for the common write + wait flow
2. `terminal_read` for quick peeks
3. `terminal_tail` for logs/servers
4. `terminal_screenshot` for TUIs or timeout recovery
5. `terminal_session_diagnostics` / `terminal_session_export` only for failure analysis

Anti-patterns:

- polling full output when `since` or `terminal_tail` would work
- using `terminal_screenshot` on every happy-path step
- calling diagnostics/export during normal execution
- batching blind Enter presses through multi-step prompts

---

## Example: `npm init`

```text
create session
run npm init
wait for package name
answer once
wait for next prompt
repeat
close session
```

## Example: `create-vite`

```text
run command
wait for text prompt
switch to screenshot-driven navigation
use arrow keys
confirm with Enter
verify after each major move
```

## Example: `gh pr create --dry-run`

```text
prefer dry-run first
inspect prompt/menu state
accept safe defaults only when intent is already clear
never publish for real unless explicitly requested
```

For richer examples, see [./COOKBOOK.md](./COOKBOOK.md).
