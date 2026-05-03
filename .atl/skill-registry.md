# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger                                                                                                         | Skill                | Path                                                    |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| PR creation, opening PR, preparing for review                                                                   | branch-pr            | ~/.config/opencode/skills/branch-pr/SKILL.md            |
| Go tests, Bubbletea TUI testing, teatest                                                                        | go-testing           | ~/.config/opencode/skills/go-testing/SKILL.md           |
| Creating GitHub issue, bug report, feature request                                                              | issue-creation       | ~/.config/opencode/skills/issue-creation/SKILL.md       |
| "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day         | ~/.config/opencode/skills/judgment-day/SKILL.md         |
| Implement tasks from change, writing code                                                                       | sdd-apply            | ~/.config/opencode/skills/sdd-apply/SKILL.md            |
| Archive completed change, sync delta specs                                                                      | sdd-archive          | ~/.config/opencode/skills/sdd-archive/SKILL.md          |
| Create technical design document                                                                                | sdd-design           | ~/.config/opencode/skills/sdd-design/SKILL.md           |
| Explore ideas, investigate codebase                                                                             | sdd-explore          | ~/.config/opencode/skills/sdd-explore/SKILL.md          |
| "sdd init", "iniciar sdd", "openspec init"                                                                      | sdd-init             | ~/.config/opencode/skills/sdd-init/SKILL.md             |
| SDD onboarding walkthrough                                                                                      | sdd-onboard          | ~/.config/opencode/skills/sdd-onboard/SKILL.md          |
| Create change proposal                                                                                          | sdd-propose          | ~/.config/opencode/skills/sdd-propose/SKILL.md          |
| Write specifications with scenarios                                                                             | sdd-spec             | ~/.config/opencode/skills/sdd-spec/SKILL.md             |
| Break down change into tasks                                                                                    | sdd-tasks            | ~/.config/opencode/skills/sdd-tasks/SKILL.md            |
| Validate implementation matches specs                                                                           | sdd-verify           | ~/.config/opencode/skills/sdd-verify/SKILL.md           |
| Create new AI agent skill                                                                                       | skill-creator        | ~/.config/opencode/skills/skill-creator/SKILL.md        |
| Interactive CLI tools, TUI navigation, commands needing user input (npm init, gh pr, npx create-vite, etc.)     | interactive-terminal | ~/.config/opencode/skills/interactive-terminal/SKILL.md |

## Compact Rules

### branch-pr

- Every PR MUST link an approved issue with `status:approved` label
- Every PR MUST have exactly one `type:*` label (type:bug, type:feature, type:docs, etc.)
- Branch names MUST match: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- Commit messages MUST follow Conventional Commits: `type(scope): description`
- Run `shellcheck scripts/*.sh` before pushing any shell script changes

### go-testing

- Use table-driven tests for pure functions with multiple cases
- Test Bubbletea models directly: `m.Update(tea.KeyMsg{...})` then assert state
- Use `teatest.NewTestModel()` for full TUI integration flows
- Use golden files for visual output: `testdata/TestName.golden`
- Mock system info for controlled test environments

### issue-creation

- Blank issues disabled — MUST use template (Bug Report or Feature Request)
- Every issue gets `status:needs-review` automatically on creation
- Maintainer MUST add `status:approved` before any PR can be opened
- Questions go to Discussions, not issues
- Use `gh issue create --template "bug_report.yml"` or `feature_request.yml`

### judgment-day

- Launch TWO parallel blind judges via `delegate()` — never sequential, never review yourself
- Synthesize verdict: Confirmed (both agree), Suspect (one found), Contradiction (disagree)
- Classify warnings: `WARNING (real)` = normal user can trigger; `WARNING (theoretical)` = requires contrived scenario
- After Fix Agent returns, IMMEDIATELY re-launch both judges — do NOT commit/push before re-judgment
- After 2 fix iterations, ASK user before continuing — never escalate automatically

### sdd-apply

- Read specs BEFORE implementing — specs are acceptance criteria
- Follow design decisions strictly — don't freelance different approaches
- Match existing code patterns and conventions in the project
- In Strict TDD mode: write test FIRST (RED), then implementation (GREEN), then refactor
- Mark tasks complete `[x]` AS you go, not at the end

### sdd-archive

- Sync delta specs to main specs BEFORE moving to archive
- When merging, PRESERVE requirements not mentioned in delta
- Move change folder to: `openspec/changes/archive/YYYY-MM-DD-{change-name}/`
- Archive is audit trail — never delete or modify archived changes
- Record all observation IDs in archive report for traceability

### sdd-design

- Read actual codebase BEFORE designing — never guess
- Every decision MUST have rationale (the "why"), not just the choice
- Include concrete file paths, not abstract descriptions
- Use ASCII diagrams for data flow when helpful
- Size budget: under 800 words, use tables for decisions

### sdd-explore

- DO NOT modify any existing code — only research and report
- Read real code, never guess about the codebase
- Compare options in table format: Approach | Pros | Cons | Complexity
- Keep analysis CONCISE — summary, not a novel
- Only create `exploration.md` when tied to a named change

### sdd-init

- Detect real tech stack from package.json, go.mod, etc. — don't guess
- ALWAYS detect testing capabilities — determines TDD mode availability
- Resolve Strict TDD Mode: system prompt > openspec config > default true if test runner exists
- Create `openspec/` structure only in openspec/hybrid mode
- Build skill registry scanning user + project skills

### sdd-propose

- ALWAYS fill Capabilities section — it's the contract with sdd-spec
- New Capabilities → each becomes `openspec/specs/<name>/spec.md`
- Modified Capabilities → each needs delta spec
- Every proposal MUST have rollback plan and success criteria
- Size budget: under 450 words, use bullets/tables over prose

### sdd-spec

- ALWAYS use Given/When/Then format for scenarios
- ALWAYS use RFC 2119 keywords: MUST, SHALL, SHOULD, MAY
- MODIFIED requirements: copy FULL block from main spec, then edit — partial blocks lose content
- Every requirement MUST have at least one scenario
- Include both happy path AND edge case scenarios
- Size budget: under 650 words

### sdd-tasks

- Tasks MUST be specific: "Create `path/to/file.ts` with `validateEmail()`" not "Add validation"
- Order tasks by dependency — Phase 1 shouldn't depend on Phase 2
- Each task completable in ONE session
- Use hierarchical numbering: 1.1, 1.2, 2.1, 2.2
- Size budget: under 530 words, 1-2 lines per task max

### sdd-verify

- ALWAYS execute tests — static analysis alone is NOT verification
- A spec scenario is COMPLIANT only when a covering test PASSED
- Compare against SPECS first (behavioral), DESIGN second (structural)
- CRITICAL = must fix before archive; WARNING = should fix; SUGGESTION = nice to have
- DO NOT fix issues — only report them

### skill-creator

- Create skill when pattern is reusable, not one-off
- Frontmatter required: name, description (with Trigger), license, metadata
- Structure: `skills/{name}/SKILL.md` + optional `assets/` or `references/`
- Content: Critical Patterns first, then examples, then Commands section
- DO NOT add Keywords section — agent searches frontmatter, not body

### interactive-terminal

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
| terminalize Architecture & API | docs/ARCHITECTURE.md | Architecture and API spec for terminalize |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
