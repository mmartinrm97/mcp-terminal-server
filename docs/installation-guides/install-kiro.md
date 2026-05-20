# Install terminalize in Kiro CLI

## Prerequisites

1. Kiro CLI installed
2. Node.js 22+
3. `npx` available in your shell

## MCP Configuration

Kiro supports workspace and global MCP config.

Workspace:

```text
.kiro/settings/mcp.json
```

Global:

```text
~/.kiro/settings/mcp.json
```

Add:

```json
{
  "mcpServers": {
    "terminalize": {
      "command": "npx",
      "args": ["terminalize"]
    }
  }
}
```

## Skill Install

To install the `terminalize` skill for Kiro CLI:

```bash
npx terminalize install-skills
```

Choose:

- **Project** → `.kiro/skills/terminalize`
- **Global** → `~/.kiro/skills/terminalize`

## Verification

After restarting Kiro:

1. run `kiro-cli mcp list`
2. confirm `terminalize` appears
3. ask Kiro to verify a real interactive flow

Example:

```text
Verify terminalize is configured, then use it to run npm init interactively.
```

## References

- [Kiro MCP configuration docs](https://kiro.dev/docs/cli/mcp/configuration/)
- [Kiro CLI command reference](https://kiro.dev/docs/cli/reference/cli-commands/)
