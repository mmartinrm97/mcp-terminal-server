# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-30

### Added

- **Core**: `OutputBuffer` — circular buffer with regex pattern matching (50ms polling, 1MB max, FIFO trimming)
- **Core**: `PTYSession` — node-pty wrapper with write/read/readUntil/resize/close operations
- **Core**: `SessionManager` — session lifecycle manager (max 10 sessions, 30min TTL cleanup)
- **MCP Server**: 7 tools exposed via `@modelcontextprotocol/sdk`:
  - `terminal_create_session` — create interactive terminal session
  - `terminal_write` — write keystrokes/commands
  - `terminal_read` — read current buffer contents
  - `terminal_read_until` — read until regex pattern matches (⭐ key tool)
  - `terminal_resize` — change terminal dimensions
  - `terminal_list_sessions` — list active sessions
  - `terminal_close_session` — close and cleanup session
- **MCP Resources**: 3 resources for session inspection (`terminal://sessions`, `.../{id}/buffer`, `.../{id}/status`)
- **Shell detection**: Cross-platform auto-detection (Windows: pwsh/cmd, Unix: $SHELL/bash/zsh)
- **ANSI stripping**: Comprehensive regex for CSI and OSC escape sequences
- **Configuration**: Env-based (`MCP_TERMINAL_MAX_SESSIONS`, `MCP_TERMINAL_SESSION_TTL_MS`)
- **Graceful shutdown**: SIGINT/SIGTERM handlers with session cleanup

### Testing

- **132 unit tests**: All core modules with mocked node-pty
- **42 integration tests**: Real PTY sessions on Windows ConPTY:
  - Echo command execution and output capture
  - Sequential write/read cycles
  - `readUntil` pattern matching (simple, regex, multi-line, timeout)
  - Session lifecycle (create, list, close, force close)
  - Real executables (npx version, npx create-vite --help, node -e)
  - Ctrl+C interrupt of long-running processes
  - MCP server full pipeline (create → write → read_until → close)
  - Session limit enforcement
- **Strict TDD Mode**: All tests written before implementation

### Infrastructure

- TypeScript 5.8+ with NodeNext module resolution
- Vitest 3.x test runner
- oxlint 1.62.0 linter (94 rules, 0 warnings)
- oxfmt 0.47.0 formatter
- pnpm package manager
- Engram persistent memory for SDD workflow
