# terminalize Compatibility Matrix

This document tracks **verified client compatibility**, not marketing claims.

The key rule is simple:

- if the MCP server/session layer worked, say so
- if the agent made bad interactive decisions, say that too
- do not blame `terminalize` for orchestration mistakes that belong to the client

---

## Status Legend

- **Verified** — real validation completed with evidence
- **Partial** — MCP/server path works, but the client flow did not complete reliably
- **Unverified** — no credible validation evidence yet

---

## Client Matrix

| Client                | Status     | What was verified                                                                                                                                                                                                      | Caveats                                                                                                                                             | Classification                                                                 |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Claude Code           | Verified   | MCP reachable, session tools work, real `npm init` flow completed                                                                                                                                                      | A burst of input can desynchronize prompts on Windows if the agent does not wait prompt-by-prompt                                                   | Agent usage caveat, not MCP failure                                            |
| Cursor                | Verified   | MCP reachable, session lifecycle works, interactive prompt/response loop verified, `npm` flow validated                                                                                                                | `npm 10` may skip the classic `npm init` questionnaire; use another interactive flow when needed                                                    | Environment/tool behavior caveat                                               |
| Codex                 | Verified   | MCP configured, skill present, real interactive `npm init` flow completed                                                                                                                                              | PowerShell profile noise from missing `oh-my-posh` can dirty startup output                                                                         | Local shell/profile caveat                                                     |
| GitHub Copilot CLI    | Partial    | MCP reachability was validated successfully with `terminal_ping` once `terminalize` was added to `~/.copilot/mcp-config.json` and tool execution was explicitly approved                                               | Non-interactive runs may fail with a permission error unless Copilot is allowed to execute MCP tools (`--allow-all-tools` in print-mode validation) | MCP works; permission model still needs client-aware handling                  |
| Kiro CLI              | Verified   | MCP configured, skill present, full interactive `npm init` flow completed                                                                                                                                              | Windows ConPTY can briefly echo prior input in the version field before recovery                                                                    | Runtime caveat, flow still succeeds                                            |
| Antigravity CLI (AGY) | Partial    | AGY can discover the plugin, expose cached MCP tool metadata, and successfully call `terminalize/terminal_ping` when installed from `~/.gemini/config/plugins/terminalize`                                             | A full interactive `npm init` flow has not completed reliably yet, and AGY logs still intermittently report local auth instability                  | Basic MCP bridge works, deep interactive reliability still under investigation |
| OpenCode              | Verified   | MCP reachability validated with `terminal_ping`; CLI run successfully invoked `terminalize_terminal_ping` and returned `PING_OK`                                                                                       | Deep interactive flows should still be validated case-by-case, but the MCP bridge itself is healthy                                                 | Verified basic MCP bridge                                                      |
| Pi                    | Partial    | Pi can be configured successfully through `pi-mcp-adapter` plus shared MCP config in `~/.config/mcp/mcp.json`; interactive UI validation confirmed the `terminalize` server can become available after reconnect/setup | Pi prefers shared MCP files and can fail with `Server terminalize has no command or url` if a Pi-owned override shadows the base server definition  | Configuration-sensitive; document shared config path clearly                   |
| Windsurf              | Unverified | No evidence published yet                                                                                                                                                                                              | —                                                                                                                                                   | Needs validation                                                               |

---

## What “Verified” Means Here

For this project, “verified” means evidence exists that the client could use `terminalize` for a **real interactive PTY workflow**, not just `terminal_ping`.

Typical evidence includes:

- MCP health check succeeded
- PTY session was created
- prompts or TUI state were read
- the client wrote responses successfully
- the interactive command completed, or the failure was clearly outside the MCP/server layer

---

## MCP Correctness vs Agent Quality

This split matters a LOT.

### MCP / server correctness

Examples:

- session can be created
- PTY output is readable
- prompts are visible
- signals and close behavior work

### Agent behavior quality

Examples:

- waits for the next prompt before writing
- uses screenshot-first navigation for TUIs
- asks the human instead of guessing on risky prompts
- does not spam Enter to “skip ahead”

If a client reaches prompts correctly and then fails because it guessed badly, that is **not** the same thing as “terminalize is broken”.

---

## Known Cross-Client Caveats

- Windows ConPTY can echo intermediate input in some interactive flows.
- `npm init` behavior depends on the installed `npm` version; some versions skip the older questionnaire.
- TUI flows like `create-vite` require navigation semantics, not plain line-prompt logic.
- PowerShell startup profiles can inject unrelated noise into PTY output.
- Google has transitioned consumer Gemini CLI users toward Antigravity CLI as of May 19, 2026; compatibility claims should now target Antigravity, not legacy Gemini consumer installs.
- Antigravity was able to call `terminalize/terminal_ping` once the plugin was installed from `~/.gemini/config/plugins/terminalize`, but deep interactive completion is still not consistently reliable.
- Pi prefers shared MCP files over Pi-owned overrides; use `~/.config/mcp/mcp.json` or `.mcp.json` for the base server definition.
- GitHub Copilot CLI may require explicit tool approval even when the MCP server is configured correctly.

---

## Evidence Basis

This matrix is grounded in:

- real CLI validation runs shared and reviewed during roadmap execution
- verified MCP connectivity and session behavior
- documented caveats captured while testing Windows, WSL/Linux-like, and Unix-like flows

If you validate another client or find a regression, update this file with the same standard:

```text
evidence first, badge later
```
