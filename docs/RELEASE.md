# Release Checklist

Use this checklist before publishing a new `terminalize` version.

## Quick path

1. Run `pnpm release:check`
2. Run `pnpm quality` when SonarQube is available
3. Publish only from a clean working tree
4. Prefer the GitHub Actions `release.yml` workflow so npm provenance is attached automatically

## Required gates

| Gate             | Command           | Why it matters                                     |
| ---------------- | ----------------- | -------------------------------------------------- |
| Unit tests       | `pnpm test:unit`  | Catches behavior regressions before packaging      |
| Build            | `pnpm build`      | Proves the published TypeScript output compiles    |
| Dependency audit | `pnpm audit:deps` | Blocks releases with known vulnerable dependencies |

`pnpm release:check` runs all three required gates, and `prepublishOnly` enforces it automatically.

## Recommended gates

| Gate               | Command               | When to require it                                |
| ------------------ | --------------------- | ------------------------------------------------- |
| Quality gate       | `pnpm quality`        | Whenever SonarQube is running locally or in CI    |
| Payload benchmark  | `pnpm bench:payload`  | Before releases that claim token-efficiency gains |
| Workflow benchmark | `pnpm bench:workflow` | Before releases that claim fewer MCP round-trips  |

## Publish checklist

- [ ] `git status --short` is clean
- [ ] `pnpm release:check` passed
- [ ] `pnpm quality` passed or the SonarQube environment is explicitly unavailable
- [ ] `NPM_TOKEN` is configured for the release workflow
- [ ] compatibility claims in `README.md` and `docs/COMPATIBILITY.md` match real evidence
- [ ] changelog/release notes match the shipped version

## Next step

After the checklist is green, either:

### Preferred: tag-driven GitHub Actions release

```bash
git tag v0.4.0
git push origin v0.4.0
```

This runs `.github/workflows/release.yml`, re-checks `pnpm release:check`, and publishes with `--provenance`.

### Local fallback

```bash
pnpm publish
```
