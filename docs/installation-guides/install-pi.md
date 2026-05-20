# Install terminalize in Pi

This is the clean setup that worked most reliably for Pi:

1. install the MCP adapter globally
2. configure `terminalize` in the shared global MCP file
3. keep Pi-specific override files minimal

## Quick path

```bash
pi install npm:pi-mcp-adapter
```

Create:

```text
~/.config/mcp/mcp.json
```

With:

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

Then restart Pi and run:

```text
/mcp reconnect terminalize
```

## Why this layout?

Pi prefers shared MCP files first.

Read order:

1. `~/.config/mcp/mcp.json`
2. `<Pi agent dir>/mcp.json`
3. `.mcp.json`
4. `.pi/mcp.json`

For `terminalize`, the shared global file is the safest default because it avoids accidental Pi-owned overrides that redefine the server without `command` or `args`.

## Do not do this unless you know why

Avoid creating a partial override like:

```json
{
  "mcpServers": {
    "terminalize": {
      "directTools": true,
      "lifecycle": "lazy"
    }
  }
}
```

inside `.pi/mcp.json` or `~/.pi/agent/mcp.json` unless the base server definition already exists somewhere higher in precedence.

If Pi reports:

```text
Server terminalize has no command or url
```

the effective config is incomplete.

## Optional: project-local shared config

If you want project-local shared config for multiple hosts, use:

```text
.mcp.json
```

Example:

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

Prefer this over `.pi/mcp.json` when the goal is a normal shared MCP server definition.

## Verification

Inside Pi:

1. run `/mcp`
2. confirm `terminalize` appears
3. run `/mcp reconnect terminalize`
4. ask Pi to call `terminal_ping`

Prompt:

```text
Use the Pi mcp proxy tool to call the terminalize server tool terminal_ping right now. Do not use shell, bash, or file tools as a fallback. If the MCP call succeeds, reply exactly: PING_OK. If it fails, reply exactly: PING_FAIL.
```

## Notes

- Pi commonly uses the `mcp` proxy tool first instead of exposing every MCP tool directly.
- Shared MCP files are preferred over Pi-owned compatibility files.
- If you deleted local `.pi/` project state by accident, the global setup above is enough to recover a working baseline.

## References

- [Pi docs](https://pi.dev/docs/latest)
- [pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter)
