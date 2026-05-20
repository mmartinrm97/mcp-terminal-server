# terminalize Cookbook

This cookbook shows **example interaction patterns**, not built-in recipes.

`terminalize` does **not** know `npm init`, `create-vite`, `gh pr create`, or `psql` as special cases.
The value is that an agent can:

- create a real PTY session
- read prompts or TUI state
- decide the next step
- ask the human when the choice is ambiguous or risky

---

## Core Rules

Before any example, keep these rules straight:

1. **Read before writing**
2. **One prompt → one answer → one wait**
3. **Use `terminal_screenshot` for TUIs**
4. **Ask the user on destructive, legal, credential, or preference-sensitive prompts**
5. **Treat these as patterns, not scripts to cargo-cult blindly**

---

## 1. `npm init`

Best for classic text prompts.

### Pattern

```text
create session
run npm init
wait for each prompt
answer once
wait again
```

### Example flow

```json
terminal_create_session({ "cwd": "/project", "shell": "auto" })
terminal_write({ "id": "sess-1", "data": "npm init\n" })
terminal_read_until({ "id": "sess-1", "pattern": "package name:" })
terminal_write({ "id": "sess-1", "data": "my-package\n" })
terminal_read_until({ "id": "sess-1", "pattern": "version:" })
terminal_write({ "id": "sess-1", "data": "\n" })
terminal_read_until({ "id": "sess-1", "pattern": "description:" })
terminal_write({ "id": "sess-1", "data": "\n" })
```

### Ask the user when

- license is not specified
- author field matters
- package name should reflect a business or product choice

### Good default

If the prompt has a safe default and the user did not specify otherwise:

```text
press Enter, then wait for the next prompt
```

---

## 2. `npx create-vite`

This is a **TUI/navigation** example, not a plain line-prompt example.

### Pattern

```text
run command
wait for first text prompt
switch to screenshot-driven navigation
use arrows
confirm with Enter
verify screen after every major move
```

### Example flow

```json
terminal_write({ "id": "sess-1", "data": "npm_config_yes=true npm create vite@latest\n" })
terminal_read_until({ "id": "sess-1", "pattern": "Project name:" })
terminal_write({ "id": "sess-1", "data": "my-vite-app\r" })
terminal_screenshot({ "id": "sess-1" })
terminal_write({ "id": "sess-1", "data": "\u001b[B\r" })
terminal_screenshot({ "id": "sess-1" })
terminal_write({ "id": "sess-1", "data": "\u001b[B\r" })
```

### Important note

For some Unix-like TUI flows, `\r` is more reliable than plain `\n`.

### Ask the user when

- framework choice was not specified
- TypeScript vs JavaScript matters
- install/start prompts would trigger extra work the user did not request

---

## 3. `gh pr create --dry-run`

Use `--dry-run` when you want to validate the interactive flow without publishing anything.

### Pattern

```text
run gh pr create --draft --dry-run
observe title/template/body/menu prompts
accept safe defaults when the user already approved the PR direction
never publish for real unless explicitly requested
```

### Example flow

```json
terminal_write({
  "id": "sess-1",
  "data": "gh pr create --draft --dry-run --base main --head my-branch\n"
})
terminal_screenshot({ "id": "sess-1" })
terminal_write({ "id": "sess-1", "data": "\r" })
terminal_screenshot({ "id": "sess-1" })
terminal_write({ "id": "sess-1", "data": "\r" })
terminal_screenshot({ "id": "sess-1" })
terminal_write({ "id": "sess-1", "data": "\r" })
```

### Ask the user when

- title/body content is not obvious
- reviewer/label/milestone choices matter
- the command is **not** dry-run and would actually create the PR

### Good safety rule

```text
Prefer dry-run first, real publish second.
```

---

## 4. `psql`

Great example of an interactive shell prompt.

### Pattern

```text
enter psql
wait for the database prompt
run one query
verify output
quit cleanly
```

### Example flow

```json
terminal_write({
  "id": "sess-1",
  "data": "docker exec -it terminalize-pg psql -U postgres -d terminalize_test\n"
})
terminal_read_until({ "id": "sess-1", "pattern": "terminalize_test=#" })
terminal_write({ "id": "sess-1", "data": "select 1;\n" })
terminal_read_until({ "id": "sess-1", "pattern": "\\(1 row\\)" })
terminal_write({ "id": "sess-1", "data": "\\q\n" })
```

### Ask the user when

- the query mutates data
- credentials or target database were not specified
- the prompt implies a production environment

---

## 5. `git rebase -i`

This is a higher-risk interactive case because it can rewrite history.

### Pattern

```text
start rebase
inspect the editor/TUI state
do not guess history-rewrite choices
ask before squash/fixup/drop/reword if intent is not explicit
```

### Example flow

```json
terminal_write({ "id": "sess-1", "data": "git rebase -i HEAD~3\n" })
terminal_screenshot({ "id": "sess-1" })
```

After that, the agent should classify the state:

- editor open?
- shell waiting?
- merge conflict?

### Ask the user when

- commit order changes
- squash/fixup/drop decisions are unclear
- conflicts appear and intent is not explicit

### Hard rule

```text
Never silently rewrite history on behalf of the user.
```

---

## 6. Login / Auth Flows

Examples:

- `gh auth login`
- `docker login`
- any prompt asking for token, device code, or password

### Pattern

```text
run command
read the auth method prompt
if a secret or browser/device step is required, stop and ask the user
resume only after the user confirms what to do
```

### Example flow

```json
terminal_write({ "id": "sess-1", "data": "gh auth login\n" })
terminal_screenshot({ "id": "sess-1" })
```

### Always ask the user when

- a password/token is needed
- the CLI wants to open a browser
- the flow may bind the local machine/account permanently

### Good safety rule

```text
Agents may guide auth flows, but humans own credentials.
```

---

## Prompt Classification Cheatsheet

### Safe to accept default

Examples:

- `version: (1.0.0)`
- `entry point: (index.js)`
- `Press enter to continue`

### Ask the user

Examples:

- `license:`
- `Password:`
- `Select an option` with several valid choices
- `This will reset your database. Continue?`

### Use screenshot-first

Examples:

- `create-vite`
- checkbox menus
- arrow-key selectors
- full-screen TUIs

---

## Closing Advice

If an agent fails on one of these examples, the first question should be:

```text
Did it read, understand, and wait correctly?
```

Not:

```text
Does terminalize need a hardcoded recipe?
```

That distinction is the whole point of the project.
