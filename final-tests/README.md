# Final Tests — MCP Terminal Server

Tests exhaustivos de TUI/CLI interactivos usando las 8 tools del MCP Terminal Server.

## Test Plan

| # | Comando | Tipo de Interacción | Dificultad |
|---|---------|---------------------|------------|
| 1 | `npm init` | Multi-prompt con defaults | 🟢 Fácil |
| 2 | `npm create vite@latest` | TUI menú: framework + variant | 🟡 Media |
| 3 | `npx autoskills` | TUI con detección de stack + selección múltiple | 🟡 Media |
| 4 | `npx create-next-app@latest` | TUI: nombre, TS, ESLint, Tailwind, etc. | 🔴 Alta |
| 5 | Paquete con confirmación y/N | Prompt simple | 🟢 Fácil |

## Metodología

Cada test sigue el flujo:

1. `terminal_create_session` — crear sesión con `cmd` shell
2. `terminal_write` — escribir el comando
3. `terminal_read_until` — esperar primer prompt
4. `terminal_screenshot` — **leer pantalla limpia** (sin ANSI)
5. `terminal_write` — responder/navegar
6. Repetir 4-5 hasta completar
7. `terminal_close_session` — cleanup

## Resultados

| # | Comando | Estado | Tiempo | Notas |
|---|---------|--------|--------|-------|
| 1 | npm init | ✅ | ~30s | Multi-prompt: nombre personalizado + defaults. package.json creado (209 bytes) |
| 2 | npx autoskills | ✅ | ~12s | TUI con detección de stack, skills pre-instaladas detectadas, menú mostrado correctamente |
| 3 | Node.js y/N | ✅ | ~5s | Script readline: pregunta → respuesta "y" → continúa correctamente |
