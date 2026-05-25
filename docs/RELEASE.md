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
- [ ] npm trusted publishing is configured for this package/workflow
- [ ] compatibility claims in `README.md` and `docs/COMPATIBILITY.md` match real evidence
- [ ] changelog/release notes match the shipped version

## One-time trusted publishing setup

Trusted publishing is an npm-side configuration, not something the repo can finish by itself.

Recommended path:

```bash
npm install -g npm@11.15.0
npm trust github terminalize --file release.yml --repo mmartinrm97/terminalize --yes
```

Then, on npmjs.com for the `terminalize` package, prefer **"Require two-factor authentication and disallow tokens"** after trusted publishing is verified.

The release workflow is already prepared for this model:

- `id-token: write`
- no `NPM_TOKEN`
- `npm publish` from GitHub-hosted runners
- automatic npm provenance for public packages from public repos
- GitHub artifact attestations for the packaged tarball
- CycloneDX SBOM + SHA256 checksums uploaded as release artifacts

## Artifact verification

Local integrity check after downloading release artifacts:

```bash
pnpm verify:checksums artifacts/SHASUMS256.txt
```

GitHub attestation verification:

```bash
gh attestation verify "terminalize-<version>.tgz" --repo mmartinrm97/terminalize
```

## Next step

After the checklist is green, either:

### Preferred: tag-driven GitHub Actions release

```bash
git tag v<version>
git push origin v<version>
```

This runs `.github/workflows/release.yml`, re-checks `pnpm release:check`, generates SBOM/checksums/attestations, and publishes via npm trusted publishing.

### Local fallback

```bash
pnpm publish
```
