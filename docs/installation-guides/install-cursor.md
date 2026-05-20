# Install terminalize in Cursor

## Prerequisites

1. Cursor with MCP support
2. Node.js 22+
3. `npx` available in your shell

## MCP Configuration

Cursor supports project and global MCP config.

Project:

```text
.cursor/mcp.json
```

Global:

```text
~/.cursor/mcp.json
```

Add:

```json
{
  "mcpServers": {
    "terminalize": {
      "command": "npx",
      "args": ["terminalize"],
      "type": "stdio"
    }
  }
}
```

## Skill Install

To install the `terminalize` skill for Cursor:

```bash
npx terminalize install-skills
```

Choose:

- **Project** → `.agents/skills/terminalize`
- **Global** → `~/.cursor/skills/terminalize`

## Verification

After restarting Cursor:

1. run `cursor-agent mcp list`
2. confirm `terminalize` is connected
3. ask Cursor to run a real interactive flow, for example:

```text
Use terminalize to run npm init interactively and wait for each prompt before answering.
```

## References

- [Cursor MCP docs](https://docs.cursor.com/cli/mcp)
