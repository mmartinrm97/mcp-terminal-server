# Install terminalize in OpenAI Codex

## Prerequisites

1. Codex with MCP support
2. Node.js 22+
3. `npx` available in your shell

## Configuration

Edit:

```text
~/.codex/config.toml
```

Add:

```toml
[mcp_servers.terminalize]
command = "npx"
args = ["terminalize"]
```

## CLI Shortcut

You can also add it with:

```bash
codex mcp add terminalize -- npx terminalize
```

## Skill Install

To install the `terminalize` skill for Codex:

```bash
npx terminalize install-skills
```

Choose **Global** or **Project**, then select **Codex**.

## Verification

After restarting Codex:

1. confirm `terminalize` appears in `/mcp`
2. ask Codex to verify the MCP
3. run a real interactive command such as:

```text
Use terminalize to run npm init interactively and wait for each prompt before answering.
```
