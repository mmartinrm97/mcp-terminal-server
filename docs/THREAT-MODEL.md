# terminalize Threat Model

terminalize gives an AI agent a real PTY. That is powerful, but it also means the security question is not:

> “Can this server execute commands?”

It obviously can.

The real question is:

> “Under what trust assumptions is that acceptable, and what controls exist when those assumptions are weaker?”

## Security posture

terminalize is designed for:

- local development workstations
- CI or ephemeral automation runners
- trusted project workspaces
- agent-driven shell automation where operators consciously accept shell-level power

terminalize is **not** designed to be a multi-tenant remote shell service.

## Assets worth protecting

- host filesystem outside the intended workspace
- shell credentials, API tokens, SSH agents, cloud CLIs
- long-lived background processes
- package registries and release credentials
- source repositories and git history
- CI runners executing with elevated repository permissions

## Trust boundaries

1. **Host operator** — chooses where terminalize runs and which environment variables are present.
2. **MCP client / agent host** — decides what requests reach the server.
3. **terminalize server** — enforces session limits, cwd restrictions, command policy hooks, and lifecycle cleanup.
4. **PTY shell + child processes** — execute the actual commands and are the highest-risk boundary.

If the MCP client is compromised or overly autonomous, terminalize alone cannot make that safe. It can only narrow blast radius.

## Primary threats

### 1. Workspace escape

An agent may attempt to start sessions outside the intended project root.

**Controls**

- `MCP_TERMINAL_ALLOWED_CWD_ROOTS`
- default allowed root = `process.cwd()`
- cwd validation in `SessionManager`

### 2. Dangerous command execution

An agent may issue destructive commands (`rm -rf`, `git reset --hard`, `docker system prune`, etc.).

**Controls**

- `MCP_TERMINAL_COMMAND_DENY_PATTERNS`
- `MCP_TERMINAL_COMMAND_ALLOW_PATTERNS`
- confirmation policies for risky patterns

### 3. Secret exposure through the agent

A real PTY means prompts and typed input are visible to the agent/orchestrator path.

**Controls**

- semantic prompt detection escalates password/token/passphrase flows
- explicit guidance: do not use terminalize for secrets you would not reveal to the agent

**Residual risk**

- terminalize cannot make secret entry safe if the agent can see the terminal stream

### 4. Resource exhaustion

Long-running noisy sessions can consume memory or keep orphaned processes alive.

**Controls**

- max active sessions
- inactivity TTL
- optional hard max session duration
- bounded retained output buffer
- explicit session close / process cleanup

### 5. Cross-platform cleanup failures

Windows ConPTY and shell teardown are historically trickier than Unix PTYs.

**Controls**

- Windows-specific cleanup path
- integration coverage around interrupts, close semantics, and shell recovery
- automatic TTL cleanup for abandoned sessions

### 6. Supply-chain compromise

The server ships through npm and GitHub Actions. Release integrity matters.

**Controls**

- `pnpm audit`
- secret scanning
- CodeQL
- dependency review
- npm trusted publishing
- SBOM + checksums + artifact attestations

## Non-goals

terminalize does **not** aim to provide:

- syscall sandboxing
- container isolation
- mandatory access control
- multi-user authorization
- per-command approval UX inside the server
- secret redaction from a malicious or compromised client

If you need those properties, run terminalize inside a stronger boundary such as:

- an ephemeral container
- an isolated VM
- a constrained CI runner
- a locked-down devcontainer

## Recommended deployment profiles

### Solo local development

- keep `MCP_TERMINAL_ALLOWED_CWD_ROOTS` narrow
- use default session TTL
- optionally set deny patterns for destructive commands

### Shared team environment

- explicitly set allowed cwd roots
- define allow/deny/confirm command policies
- set a hard session duration cap
- lower retained buffer size if logs are noisy

### CI / automation

- prefer ephemeral runners
- inject only the minimum required credentials
- avoid exposing publish credentials unless the workflow step truly needs them
- keep sessions short-lived and deterministic

## Operational checklist

Before enabling terminalize in a higher-risk environment, confirm:

1. the workspace root restriction matches your actual trust boundary
2. destructive command patterns are blocked or confirmation-gated
3. secrets are not expected to be typed through the agent
4. session TTL and max duration are configured for the environment
5. retained output size is appropriate for your expected log volume
6. the host itself is disposable enough for the level of autonomy you grant the agent

## Bottom line

terminalize is safe **only** under the same basic assumption as giving an agent a shell:

> the environment, credentials, and allowed working directory must already be appropriate for that level of power.

The server reduces risk with policy hooks and lifecycle controls, but it does not turn an untrusted shell into a trusted one.
