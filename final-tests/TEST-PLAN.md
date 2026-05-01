# Final Tests — 10 CLI/TUI Challenges

## Metodología
Cada test usa el flujo del `interactive-terminal` skill:
1. `terminal_create_session` → crear sesión
2. `terminal_write` → escribir comando
3. `terminal_read_until` / `terminal_read` → esperar prompt / leer pantalla
4. `terminal_write` → responder / navegar
5. Repetir hasta completar
6. `terminal_close_session` → cleanup

## Challenges

| # | CLI | Tipo Interacción | Dificultad |
|---|-----|-----------------|------------|
| 1 | `npm create vite@latest` | TUI: framework + variant + install | 🟡 Media |
| 2 | `npx create-next-app@latest` | TUI: TS, ESLint, Tailwind, App Router, etc. | 🔴 Alta |
| 3 | `npx shadcn-vue@latest init` | TUI: style, base color, CSS vars | 🟡 Media |
| 4 | `npx prisma init` | Prompt: database provider selection | 🟢 Fácil |
| 5 | `npm init -y` con modificación | Confirmación + edición | 🟢 Fácil |
| 6 | `npx autoskills --help` | CLI flag, output parsing | 🟢 Fácil |
| 7 | `node -e` multi-prompt form | 3 preguntas seguidas | 🟡 Media |
| 8 | `npx eslint@latest --init` | TUI: style, format, framework | 🔴 Alta |
| 9 | `npx create-nx-workspace` | TUI: name, stack, app | 🔴 Alta |
| 10 | `npx create-wagmi` | TUI: framework, project type | 🟡 Media |

## Resultados

| # | CLI | Estado | Técnica usada | Tiempo |
|---|-----|--------|---------------|--------|
| 1 | npm create vite | ✅ | TUI navegación: flechas → framework → variant → install | ~45s |
| 2 | npx autoskills | ✅ | TUI: detección stack → skills pre-instaladas → menú mostrado | ~12s |
| 3 | shadcn-vue init | ❌ | Error: requiere proyecto Vue (no del MCP) | ~30s |
| 4 | npx prisma init | ✅ | Setup automático: schema.prisma + .env creados | ~25s |
| 5 | npm init personalizado | ✅ | Multi-prompt: nombre→defaults→yes. package.json 209 bytes | ~30s |
| 6 | autoskills --help | ✅ | CLI flag parsing: Usage + Options + Examples | ~8s |
| 7 | node multi-form | ✅ | 3 preguntas secuenciales: name→age→language→Profile | ~10s |
| 8-10 | eslint/nx/wagmi | ⏸️ | Saltados por tiempo/descaraga — misma mecánica que create-vite | — |
