# terminalize Roadmap

`terminalize` is **not** an AI terminal.

It is an:

```txt
MCP server for AI-readable, stateful, interactive terminal sessions.
```

Its job is simple:

```txt
Let AI agents read, understand, and interact with a real terminal session
when one-shot shell tools are not enough.
```

---

## Current Status

As of `v0.5.0`, terminalize already includes:

- 14 MCP tools for interactive PTY sessions
- Stateful terminal sessions with TTL cleanup and session limits
- Incremental reads via byte position
- Token-efficient tail reads
- ANSI-aware screen rendering
- Semantic terminal screenshots (`terminal_mode`, `editor_mode`, status/content split)
- Agent skill for interactive terminal workflows
- Cross-platform shell detection (`cmd`, `pwsh`, `bash`, `zsh`)
- Unit and integration test coverage

So the roadmap is **not** about “building a PTY MVP from scratch”.
It is about **hardening**, **agent reliability**, and **cross-platform validation**.

---

## v0.3.x — Core Hardening

Goal: make the existing PTY/MCP core more reliable under real agent usage.

### Focus

- Stabilize session lifecycle under repeated open/close flows
- Reduce Windows-specific teardown noise and edge cases
- Tighten prompt/response synchronization guidance for agents
- Improve timeout behavior and failure visibility

### Priorities

- [x] Investigate and document Windows `node-pty` / ConPTY teardown noise (`AttachConsole failed`)
- [x] Add targeted regression tests for prompt-by-prompt interactive flows
- [x] Verify session close semantics across `cmd`, `pwsh`, `bash`, and `zsh`
- [x] Audit large-output behavior and trimming under long-running sessions
- [x] Align README, skill, and roadmap with actual shipped capabilities

### Why it matters

Most current failures are **not** “cannot spawn a PTY”.
They are subtle issues like:

- agent sends input too early
- teardown is noisy on Windows
- prompts are misread
- output is technically available but not easy to interpret

---

## v0.4 — Agent State Intelligence + Basic Observability

Goal: help agents understand terminal state better and debug failures earlier, without hardcoding specific CLIs.

### Focus

- Improve AI-readable state
- Improve agent guidance
- Make interactive terminal decisions easier and safer
- Add enough observability to understand desynchronization failures

### Priorities

- [x] Expand semantic screenshot hints:
  - prompt detection
  - interactive state hints
  - recommended next action
- [x] Add cookbook guidance for prompt-by-prompt interaction patterns
- [x] Teach agents to prefer:
  - read → decide → write
  - screenshot-first TUI navigation
  - one prompt → one answer → one wait
- [x] Add guidance for when the agent must ask the user instead of guessing
- [x] Add basic observability to session responses and diagnostics:
  - last output time
  - idle time
  - output volume
  - timeout context
  - best-effort next action hints

### Explicit non-goal

Do **not** hardcode:

- `npm init`
- `create-vite`
- `gh pr create`

The goal is:

```txt
Detect that the terminal is asking for input,
not memorize one CLI per tool.
```

---

## v0.5 — Full Observability

Goal: make failures debuggable.

When an agent fails, maintainers need to know:

- what it saw
- what it wrote
- what it waited for
- where it got desynchronized

### Priorities

- [x] Session event timeline
- [x] Input/output history per session
- [x] Replay-oriented diagnostics for interactive flows
- [x] Clearer timeout/debug information in tool responses
- [x] Structured session export for issue reports and bug reproduction

### Why it matters

Without observability, every agent failure looks like:

```txt
“terminalize broke”
```

even when the real problem is:

```txt
“the agent guessed instead of waiting”
```

---

## v0.6 — Safety Layer

Goal: reduce risk in real team/company environments without making the tool useless.

### Priorities

- [x] Optional cwd restrictions
- [x] Optional command policy hooks (allow/deny patterns)
- [x] Configurable max session duration
- [x] Configurable max output size
- [x] Idle session auto-kill improvements
- [x] Safer defaults for destructive confirmations in agent guidance

### Design rule

Safety must be **configurable**.

Too much safety turns terminalize into a toy.
Too little safety makes it hard to adopt in real teams.

---

## v0.7 — Cross-Platform Validation

Goal: move from “works on my machine” to real platform confidence.

### Target environments

- Windows PowerShell
- Windows CMD
- Linux Bash
- macOS Zsh

### Priorities

- [x] Full validation matrix for Windows / Linux / macOS
- [x] Real interactive smoke tests for:
  - `npm init`
  - `gh pr create`
  - `npx create-vite`
  - `psql`
- [x] Compare screenshot rendering behavior across shells/platforms
- [x] Validate signal/close behavior per platform
- [x] Document known caveats per shell/runtime

### Start earlier, finish here

Basic cross-platform smoke validation should begin before this milestone:

- [x] Add minimal CI smoke coverage for Windows / Linux / macOS as early as possible
- [x] Run a minimal create-session / write / read / close flow per OS

This milestone is where that early validation becomes a full, credible compatibility story.

### Delivered validation shape

- CI smoke coverage on Windows / Linux / macOS
- CI full integration coverage on Ubuntu / macOS
- Manual Windows interactive validation for `gh pr create --dry-run`
- Manual WSL2 / Linux-like validation for:
  - full integration suite
  - interactive `npm init`
  - interactive `npx create-vite`
  - Docker-backed `psql`

Some of the deepest interactive flows remain opt-in/manual because they depend on local auth or local infrastructure. That is acceptable here because the milestone goal is **credible validation**, not pretending everything can or should run in generic CI.

### Why it matters

This is one of the biggest remaining credibility gaps.

The product is already useful, but adoption gets much easier when you can say:

```txt
verified on Windows, Linux, and macOS
```

---

## v0.8 — Cookbook

Goal: show capability without turning the product into a pile of fragile recipes.

### Priorities

- [x] Add example flows for:
  - `npm init`
  - `npx create-vite`
  - `gh pr create`
  - `psql`
  - `git rebase -i`
  - login/auth flows with explicit user confirmation rules

### Rule

This is a **cookbook**, not a hardcoded behavior engine.

Good:

```txt
Examples showing how agents can use terminalize with real interactive CLIs.
```

Bad:

```txt
terminalize knows npm init
```

---

## v1.0 — Compatibility Validation

Goal: prove terminalize works with real agent clients.

### Priorities

- [x] Publish validated compatibility results per client
- [x] Separate:
  - MCP/server correctness
  - agent behavior quality
  - known client-specific caveats
- [x] Add compatibility badges only after real verification

### Candidate clients

- Claude Code
- Cursor
- Antigravity CLI
- Codex
- Kiro CLI
- Windsurf

### Important rule

Compatibility badges should reflect **verified reality**, not marketing.

If a client fails because of its own PTY orchestration or prompt strategy,
document that honestly.

---

## Summary

```txt
v0.3.x  Core hardening
v0.4    Agent state intelligence + basic observability
v0.5    Full observability
v0.6    Safety layer
v0.7    Cross-platform validation
v0.8    Cookbook examples
v1.0    Compatibility validation
```

---

## Project North Star

Do not build an “AI terminal competitor”.

Build the missing piece that AI agents need when the terminal becomes:

- interactive
- stateful
- prompt-driven
- hard to interpret with one-shot shell tools

That is the real value of `terminalize`.
