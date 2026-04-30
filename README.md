# MCP Terminal Server

![Node.js](https://img.shields.io/badge/node.js-22%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.8%2B-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.9.0-blueviolet)](https://spec.modelcontextprotocol.io)
[![node-pty](https://img.shields.io/badge/node--pty-1.0-FF6C37)](https://github.com/microsoft/node-pty)
![Tests](https://img.shields.io/badge/tests-132%20passing-brightgreen)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

> **Un MCP Server que expone un terminal interactivo real (PTY) como herramientas que los agentes de IA pueden usar para ejecutar comandos interactivos.**

---

## El Problema

Las herramientas de terminal en plataformas AI (OpenCode, Claude Code, etc.) ejecutan comandos en modo **one-shot no interactivo**:

```
bash("npm init")  →  timeout ❌  (npm init espera input del usuario)
```

- No hay un TTY real, no hay sesión persistente
- Cuando `npm init`, `gh pr create`, `npx create-vite`, `psql` esperan input del usuario, el agente **se queda bloqueado**
- Los sub-agentes sufren aún más porque tienen menos herramientas disponibles

## La Solución

Un **MCP Server** que expone un pseudo-terminal (PTY) real como herramientas MCP. El agente puede crear una sesión, escribir comandos, leer el output hasta que aparezca un patrón, y responder — **exactamente como un humano usando una terminal**.

```
OpenCode Agent ──MCP──▶ MCP Terminal Server ──PTY──▶ Shell (bash/zsh/pwsh)
                              │
                              ├── Session Manager (multi-session)
                              ├── Output Buffer (pattern matching)
                              └── Cleanup Worker (TTL auto-kill)
```

## MCP Tools

### 1. `terminal_create_session`

Crea una nueva sesión de terminal interactiva.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `id` | `string` | UUID | ID personalizado para la sesión |
| `shell` | `string` | `"auto"` | Shell: `auto`, `bash`, `zsh`, `pwsh`, `cmd` |
| `cwd` | `string` | `cwd` | Directorio de trabajo |
| `cols` | `number` | `80` | Columnas del terminal |
| `rows` | `number` | `24` | Filas del terminal |
| `env` | `object` | `{}` | Variables de entorno adicionales |

### 2. `terminal_write`

Escribe texto/keystrokes en el terminal.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | `string` | ID de la sesión |
| `data` | `string` | Texto a escribir (`\n` para Enter, `\x03` para Ctrl+C) |

### 3. `terminal_read`

Lee el contenido actual del buffer de salida del terminal.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `id` | `string` | — | ID de la sesión |
| `flush` | `boolean` | `false` | Si `true`, limpia el buffer después de leer |

### 4. `terminal_read_until` ⭐

**La herramienta más importante.** Lee el buffer del terminal hasta que aparece un patrón regex.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `id` | `string` | — | ID de la sesión |
| `pattern` | `string` | — | Patrón regex a esperar |
| `timeout_ms` | `number` | `30000` | Timeout máximo de espera |
| `strip_ansi` | `boolean` | `false` | Si `true`, limpia códigos ANSI |

### 5. `terminal_resize`

Cambia el tamaño del terminal.

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | `string` | ID de la sesión |
| `cols` | `number` | Nuevas columnas |
| `rows` | `number` | Nuevas filas |

### 6. `terminal_list_sessions`

Lista todas las sesiones activas.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Incluye últimos N caracteres del buffer |

### 7. `terminal_close_session`

Cierra una sesión de terminal.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `id` | `string` | — | ID de la sesión |
| `force` | `boolean` | `false` | Terminación inmediata (SIGKILL) |

## Ejemplos de Flujo

### `npm init`

```json
// 1. Crear sesión
→ terminal_create_session({ "cwd": "/proyecto" })
← { "id": "sess-1" }

// 2. Ejecutar comando
→ terminal_write({ "id": "sess-1", "data": "npm init\n" })

// 3. Esperar prompt
→ terminal_read_until({ "id": "sess-1", "pattern": "package name:", "timeout_ms": 10000 })
← { "data": "package name: (my-project) ", "matched": "package name:" }

// 4. Responder
→ terminal_write({ "id": "sess-1", "data": "my-awesome-project\n" })

// 5. Esperar siguiente prompt
→ terminal_read_until({ "id": "sess-1", "pattern": "version:|entry point:", "timeout_ms": 10000 })
← { "data": "version: (1.0.0) ", "matched": "version:" }

// 6. Aceptar default
→ terminal_write({ "id": "sess-1", "data": "\n" })

// ... repetir hasta que termine ...

// N. Cerrar sesión
→ terminal_close_session({ "id": "sess-1" })
```

### `npx create-vite` con selección

```json
→ terminal_create_session({ "cwd": "/proyectos" })
→ terminal_write({ "id": "sess-1", "data": "npm create vite@latest\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "Project name:" })
→ terminal_write({ "id": "sess-1", "data": "my-app\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "Select a framework:" })
→ terminal_write({ "id": "sess-1", "data": "React\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "Select a variant:" })
→ terminal_write({ "id": "sess-1", "data": "TypeScript\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "Done|\\$ ", "timeout_ms": 30000 })
→ terminal_close_session({ "id": "sess-1" })
```

### `gh pr create`

```json
→ terminal_create_session({ "cwd": "/repos/mi-app" })
→ terminal_write({ "id": "sess-1", "data": "gh pr create --fill\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "Submit|What", "timeout_ms": 15000 })
// IA analiza y decide
→ terminal_write({ "id": "sess-1", "data": "\n" })
→ terminal_read_until({ "id": "sess-1", "pattern": "https://github.com|Error|\\$ ", "timeout_ms": 20000 })
→ terminal_close_session({ "id": "sess-1" })
```

## Instalación

```bash
npm install mcp-terminal-server

# O global:
npm install -g mcp-terminal-server
```

### Prerequisitos

- **Node.js 22+** (requerido para `crypto.randomUUID()`)
- **Compilación nativa**: `node-pty` requiere herramientas de compilación:
  - **Windows**: Visual Studio Build Tools o MSVC
  - **Linux**: `make`, `gcc`, `python3`
  - **macOS**: Xcode Command Line Tools

## Configuración en OpenCode

Agrega esto a tu `opencode.json`:

```json
{
  "mcpServers": {
    "terminal": {
      "command": "node",
      "args": ["ruta/a/dist/index.js"],
      "env": {
        "MCP_TERMINAL_MAX_SESSIONS": "10",
        "MCP_TERMINAL_SESSION_TTL_MS": "1800000"
      }
    }
  }
}
```

### Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MCP_TERMINAL_MAX_SESSIONS` | `10` | Máximo de sesiones simultáneas |
| `MCP_TERMINAL_SESSION_TTL_MS` | `1800000` (30min) | TTL de inactividad por sesión |

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│                  OpenCode Agent                   │
│  (orchestrator / sdd-apply / cualquier sub-agent) │
└──────────────┬──────────────────────────────────┘
               │ MCP Protocol (stdio transport)
               ▼
┌─────────────────────────────────────────────────┐
│              MCP Terminal Server                  │
│  ┌─────────────────────────────────────────────┐  │
│  │          Session Manager                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ Session 1 │  │ Session 2 │  │ Session N │  │  │
│  │  │  (PTY)    │  │  (PTY)    │  │  (PTY)    │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  │  │
│  └─────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐  │
│  │         Output Buffer                        │  │
│  │  (acumula data events del PTY,               │  │
│  │   disponible para lectura + pattern matching)│  │
│  └─────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐  │
│  │         Cleanup Worker                       │  │
│  │  (TTL timeout, kill child process,           │  │
│  │   liberar recursos)                          │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **OutputBuffer** | `src/output-buffer.ts` | Buffer circular con pattern matching regex. Acumula data del PTY y permite `readUntil()` con polling de 50ms. |
| **PTYSession** | `src/pty-session.ts` | Wrapper de `node-pty`. Conecta el OutputBuffer con el proceso real del shell. |
| **SessionManager** | `src/session-manager.ts` | Gestiona ciclo de vida de sesiones: creación, listing, cierre, cleanup automático por TTL. |
| **MCPServer** | `src/server.ts` | Expone las 7 herramientas vía protocolo MCP. Maneja errores y validación de input. |
| **ShellDetector** | `src/shell-detector.ts` | Detecta el shell preferido según la plataforma (auto/bash/zsh/pwsh/cmd). |
| **AnsiStripper** | `src/ansi-stripper.ts` | Limpia códigos ANSI del output del terminal. |

## Desarrollo

```bash
# Clonar e instalar
git clone https://github.com/tu-usuario/mcp-terminal-server
cd mcp-terminal-server
npm install

# Compilar
npm run build

# Tests
npm test            # Unitarios
npm run test:watch  # Watch mode

# Type checking
npx tsc --noEmit
```

### Tests

El proyecto usa [vitest](https://vitest.dev/) con **Strict TDD Mode**:

```
npm test
  ✓ test/types.test.ts              (8 tests)
  ✓ test/utils.test.ts              (14 tests)
  ✓ test/ansi-stripper.test.ts      (9 tests)
  ✓ test/shell-detector.test.ts     (8 tests)
  ✓ test/output-buffer.test.ts      (19 tests)
  ✓ test/pty-session.test.ts        (17 tests)
  ✓ test/session-manager.test.ts    (14 tests)
  ✓ test/server.test.ts             (37 tests)
  ✓ test/index.test.ts              (6 tests)

 Test Files  9 passed (9)
      Tests  132 passed (132)
```

## Seguridad

1. **Input del agente**: El agente escribe directamente en el PTY. Si el agente escribe `rm -rf /`, el comando se ejecuta — el servidor no filtra comandos porque el agente actúa como el usuario.
2. **Timeout global**: Cada sesión tiene un TTL máximo (default: 30 minutos de inactividad).
3. **Límite de sesiones**: Máximo N sesiones simultáneas (configurable, default: 10).
4. **Kill orphans**: Si el proceso padre del MCP server muere, los PTY hijos se limpian automáticamente.
5. **No input secreto**: El servidor NO debe usarse para inputs sensibles (passwords, tokens) porque el agente intermediario ve todo.

## Roadmap

- [x] Core: OutputBuffer, PTYSession, SessionManager
- [x] MCP Server con 7 tools
- [x] Tests unitarios (132 tests)
- [ ] Tests de integración con ejecutables reales
- [ ] Skill para agentes OpenCode (`interactive-terminal`)
- [ ] Publicación en npm
- [ ] Soporte SSE para conexiones remotas

## Licencia

MIT
