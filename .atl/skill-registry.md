# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger                                                                                                         | Skill          | Path                                              |
| --------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------- |
| PR creation, opening PR, preparing for review                                                                   | branch-pr      | ~/.config/opencode/skills/branch-pr/SKILL.md      |
| Go tests, Bubbletea TUI testing, teatest                                                                        | go-testing     | ~/.config/opencode/skills/go-testing/SKILL.md     |
| Creating GitHub issue, bug report, feature request                                                              | issue-creation | ~/.config/opencode/skills/issue-creation/SKILL.md |
| "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day   | ~/.config/opencode/skills/judgment-day/SKILL.md   |
| Implement tasks from change, writing code                                                                       | sdd-apply      | ~/.config/opencode/skills/sdd-apply/SKILL.md      |
| Archive completed change, sync delta specs                                                                      | sdd-archive    | ~/.config/opencode/skills/sdd-archive/SKILL.md    |
| Create technical design document                                                                                | sdd-design     | ~/.config/opencode/skills/sdd-design/SKILL.md     |
| Explore ideas, investigate codebase                                                                             | sdd-explore    | ~/.config/opencode/skills/sdd-explore/SKILL.md    |
| "sdd init", "iniciar sdd", "openspec init"                                                                      | sdd-init       | ~/.config/opencode/skills/sdd-init/SKILL.md       |
| SDD onboarding walkthrough                                                                                      | sdd-onboard    | ~/.config/opencode/skills/sdd-onboard/SKILL.md    |
| Create change proposal                                                                                          | sdd-propose    | ~/.config/opencode/skills/sdd-propose/SKILL.md    |
| Write specifications with scenarios                                                                             | sdd-spec       | ~/.config/opencode/skills/sdd-spec/SKILL.md       |
| Break down change into tasks                                                                                    | sdd-tasks      | ~/.config/opencode/skills/sdd-tasks/SKILL.md      |
| Validate implementation matches specs                                                                           | sdd-verify     | ~/.config/opencode/skills/sdd-verify/SKILL.md     |
| Create new AI agent skill                                                                                       | skill-creator  | ~/.config/opencode/skills/skill-creator/SKILL.md  |
| Update skill registry                                                                                           | skill-registry | ~/.config/opencode/skills/skill-registry/SKILL.md |
| Interactive CLI tools, TUI navigation, commands needing user input (npm init, gh pr, npx create-vite, etc.)     | terminalize    | ~/.config/opencode/skills/terminalize/SKILL.md    |

## Project Skills

| Trigger                                                                                            | Skill                     | Path                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Building Node.js backend services (Express/Fastify), middleware, auth, database, API design        | nodejs-backend-patterns   | .agents/skills/nodejs-backend-patterns/SKILL.md   |
| Node.js development principles, framework selection, async patterns, security, architecture        | nodejs-best-practices     | .agents/skills/nodejs-best-practices/SKILL.md     |
| Run/configure oxlint linter, fix errors, configure rules/plugins, migrate from ESLint              | oxlint                    | .agents/skills/oxlint/SKILL.md                    |
| TypeScript advanced types: generics, conditional types, mapped types, template literals, utilities | typescript-advanced-types | .agents/skills/typescript-advanced-types/SKILL.md |
| Writing tests with Vitest, mocking, coverage config, test filtering, fixtures                      | vitest                    | .agents/skills/vitest/SKILL.md                    |

## Compact Rules

### terminalize

- ALWAYS use terminal tools instead of bash for interactive commands (npm init, gh pr, npx create-vite, psql, etc.)
- Flow: create_session → write command → read_until screenshot → navigate → close_session
- Use terminal_screenshot FIRST to read the screen (returns clean text rows, no ANSI codes), THEN navigate
- Arrow keys: up=\x1b[A, down=\x1b[B, left=\x1b[D, right=\x1b[C
- Enter=\r\n (CRLF), Space=\x20, Ctrl+C=\x03, Escape=\x1b
- On Windows use cmd shell; SIGKILL not supported — close without force
- If read_until times out, take a screenshot to understand current state
- **DESTRUCTIVE prompts** (delete, reset, drop, force) → ALWAYS ask the user
- **Confirmation (y/N)**: capitalized letter is default; safe defaults → auto-answer; destructive → ask
- **Options**: if user specified what they want → auto-select; if multiple valid choices → ask
- **Unknown**: if you don't know what to answer → ask user with structured options
- Ask format: show terminal output + labeled options (A/B/C/D) + recommendation

## Project Conventions

| File                           | Path                 | Notes                                     |
| ------------------------------ | -------------------- | ----------------------------------------- |
| terminalize Coding Standards   | AGENTS.md            | TypeScript, architecture, testing, naming |
| terminalize Architecture & API | docs/ARCHITECTURE.md | Architecture and API spec for terminalize |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
