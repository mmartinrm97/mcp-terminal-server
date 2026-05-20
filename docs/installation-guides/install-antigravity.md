# Install terminalize in Antigravity CLI (AGY)

This guide installs `terminalize` for **Antigravity CLI** using the plugin layout documented by Google Antigravity.

It gives AGY both:

- the `terminalize` skill
- the `terminalize` MCP server config

## Why plugin install?

Antigravity plugins can bundle:

- `plugin.json`
- `mcp_config.json`
- `skills/...`

That maps perfectly to what `terminalize` needs.

## Recommended: use `terminalize install-skills`

From your project:

```bash
npx terminalize install-skills
```

Then choose:

- **Project** → installs under `.agents/plugins/terminalize`
- or **Global** → installs under the Antigravity home plugin locations

For Antigravity, the installer writes:

```text
plugin.json
mcp_config.json
skills/terminalize/SKILL.md
```

## Manual project-level install

Create this structure at the root of your project:

```text
.agents/plugins/terminalize/
├── plugin.json
├── mcp_config.json
└── skills/
    └── terminalize/
        └── SKILL.md
```

### `plugin.json`

```json
{
  "name": "terminalize"
}
```

### `mcp_config.json`

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

### `SKILL.md`

Copy from:

```text
skills/terminalize/SKILL.md
```

## Manual global install

Antigravity documentation currently references more than one customization path depending on the surface and workflow.

The safest global locations to know are:

```text
~/.gemini/config/plugins/terminalize/
~/.gemini/antigravity-cli/plugins/terminalize/
```

If you want the least ambiguity, use the installer command and let `terminalize` stage both global plugin locations for you.

## Verification

After restarting AGY:

1. open `/skills` and confirm `terminalize` appears
2. open `/mcp` and confirm the `terminalize` server is visible
3. ask AGY to run a real interactive flow, for example:

```text
Verify terminalize is configured, then use it to run npm init interactively.
```

## References

- [Antigravity CLI usage docs](https://antigravity.google/docs/cli-using)
- [Antigravity CLI features / plugins](https://antigravity.google/docs/cli-features)
- [Antigravity plugins docs](https://antigravity.google/docs/plugins)
