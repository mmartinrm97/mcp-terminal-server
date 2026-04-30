# MCP Terminal Server — Interactive Terminal para Agentes AI

## Problema

El `bash` tool de OpenCode (y de la mayoría de plataformas AI) ejecuta comandos en modo **one-shot no interactivo**:
- Envía un comando, captura stdout/stderr, devuelve el resultado.
- No hay un TTY real, no hay sesión persistente, no hay stdin abierto.
- Cuando un comando como `npm init`, `gh pr create`, `shadcn-vue add button`, `git rebase -i`, `psql`, etc. espera input del usuario, el agente **no puede responder** — el comando termina en timeout o el agente ve output truncado.

Los **sub-agentes** (como `sdd-apply`) tienen aún menos herramientas que el orchestrator y sufren el mismo problema.

## Visión

Un **MCP Server** que expone un terminal interactivo real (PTY) como herramientas que los agentes pueden llamar múltiples veces para:

1. **Crear** una sesión de terminal persistente
2. **Escribir** comandos y keystrokes
3. **Leer** el contenido actual del terminal (buffer de pantalla)
4. **Esperar** a que aparezca un patrón específico (como un prompt)
5. **Redimensionar** el terminal si es necesario
6. **Cerrar** la sesión cuando termina

El agente usa su modelo de IA para **interpretar el output**, decidir qué responder, y si tiene dudas, preguntarle al usuario con opciones sugeridas — exactamente como VS Code Copilot hace con "focus terminal".

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

## MCP Tools

### 1. `terminal_create_session`

Crea una nueva sesión de terminal interactiva.

**Input:**
```json
{
  "id": "optional-custom-id",      // si no se provee, se genera UUID
  "shell": "auto",                  // "auto" | "bash" | "zsh" | "pwsh" | "cmd"
  "cwd": "/path/to/workspace",      // working directory (default: proyecto activo)
  "cols": 80,                       // columnas del terminal (default: 80)
  "rows": 24,                       // filas del terminal (default: 24)
  "env": {                          // variables de entorno adicionales
    "TERM": "xterm-256color"
  }
}
```

**Output:**
```json
{
  "id": "session-uuid-1234",
  "shell": "/usr/bin/zsh",
  "cwd": "/path/to/workspace",
  "cols": 80,
  "rows": 24,
  "created_at": "2026-04-30T20:00:00.000Z"
}
```

**Cross-platform shell detection (modo `auto`):**
| SO | Shell preferido | Fallback |
|----|----------------|----------|
| Linux | `$SHELL` → `bash` | `sh` |
| macOS | `$SHELL` → `zsh` | `bash` |
| Windows | `pwsh.exe` | `cmd.exe` |

---

### 2. `terminal_write`

Escribe texto/keystrokes en el terminal.

**Input:**
```json
{
  "id": "session-uuid-1234",
  "data": "npm init\n"              // \n para Enter, \x03 para Ctrl+C, etc.
}
```

**Output:**
```json
{
  "ok": true,
  "bytes_written": 8
}
```

**Notas:**
- Soporta secuencias de control: `\n` (Enter), `\x03` (Ctrl+C/SIGINT), `\x1b` (Escape), `\t` (Tab)
- También soporta entrada de a un carácter si es necesario

---

### 3. `terminal_read`

Lee el contenido actual del buffer de salida del terminal. No espera — devuelve lo que haya acumulado hasta ahora.

**Input:**
```json
{
  "id": "session-uuid-1234",
  "flush": true                     // si true, limpia el buffer después de leer
}
```

**Output:**
```json
{
  "data": "package name: (my-project) ",
  "ended": false,                   // true si el proceso hijo terminó
  "exit_code": null                 // null si sigue vivo, número si ended=true
}
```

---

### 4. `terminal_read_until` ⭐ (el más importante)

Lee el buffer del terminal **hasta que aparece un patrón** o se cumple el timeout. Esta es la herramienta clave para flujos interactivos.

**Input:**
```json
{
  "id": "session-uuid-1234",
  "pattern": "package name:|version:|entry point:",  // regex patterns
  "timeout_ms": 30000,              // timeout máximo de espera (default: 30000)
  "strip_ansi": true                // si true, limpia códigos ANSI del output
}
```

**Output:**
```json
{
  "data": "package name: (my-project) ",
  "full_output": "my-app\nversion: 1.0.0\npackage name: (my-project) ",
  "matched": "package name:",
  "ended": false,
  "exit_code": null,
  "timed_out": false
}
```

**Algoritmo:**
1. Acumula todo el output del PTY en un buffer interno por sesión
2. El buffer se va limpiando de lo que ya se ha leído/entregado
3. Cada llamada a `read_until` espera hasta que el buffer haga match con el pattern regex
4. Si no hay match antes del timeout, devuelve lo que tenga y `timed_out: true`
5. El `data` contiene el output desde la última lectura hasta el match inclusive
6. El `full_output` es todo el output acumulado desde que se creó la sesión (útil para debugging)

---

### 5. `terminal_resize`

Cambia el tamaño del terminal (útil si el agente necesita ver más contenido).

**Input:**
```json
{
  "id": "session-uuid-1234",
  "cols": 120,
  "rows": 40
}
```

**Output:**
```json
{
  "cols": 120,
  "rows": 40
}
```

---

### 6. `terminal_list_sessions`

Lista todas las sesiones activas.

**Input:**
```json
{
  "verbose": false                  // si true, incluye últimos N chars del buffer
}
```

**Output:**
```json
{
  "sessions": [
    {
      "id": "session-uuid-1234",
      "shell": "/usr/bin/zsh",
      "cwd": "/path/to/workspace",
      "cols": 80,
      "rows": 24,
      "created_at": "2026-04-30T20:00:00.000Z",
      "last_activity": "2026-04-30T20:05:00.000Z",
      "alive": true
    }
  ]
}
```

---

### 7. `terminal_close_session`

Cierra una sesión de terminal.

**Input:**
```json
{
  "id": "session-uuid-1234",
  "force": false                    // si true, SIGKILL en vez de SIGHUP/SIGTERM
}
```

**Output:**
```json
{
  "ok": true,
  "exit_code": 0
}
```

**Comportamiento:**
1. Envía `SIGHUP` (seguido de `SIGTERM` si no termina en 3s)
2. Si `force: true` o no termina después de SIGTERM, envía `SIGKILL`
3. Limpia todos los recursos del PTY
4. Elimina la sesión del Session Manager

---

## Recursos MCP (opcionales)

Además de tools, el servidor puede exponer recursos para que el agente pueda inspeccionar sesiones:

- `terminal://sessions` → lista de sesiones activas (como JSON)
- `terminal://sessions/{id}/buffer` → contenido completo del buffer de la sesión
- `terminal://sessions/{id}/status` → estado actual de la sesión

---

## Ejemplo de Flujo: `npm init`

Este es el caso de uso típico que hoy no funciona:

```
Agente: Quiere inicializar un proyecto con npm init

Paso 1: Crear sesión
→ terminal_create_session({ cwd: "/proyecto" })
← { id: "sess-1", cwd: "/proyecto" }

Paso 2: Escribir comando
→ terminal_write({ id: "sess-1", data: "npm init\n" })
← { ok: true }

Paso 3: Esperar primer prompt
→ terminal_read_until({ id: "sess-1", pattern: "package name:", timeout_ms: 10000 })
← { data: "\r\npackage name: (my-project) ", matched: "package name:" }

Paso 4: IA analiza el prompt, decide respuesta
→ terminal_write({ id: "sess-1", data: "my-awesome-project\n" })
← { ok: true }

Paso 5: Esperar siguiente prompt
→ terminal_read_until({ id: "sess-1", pattern: "version:|entry point:", timeout_ms: 10000 })
← { data: "\r\nversion: (1.0.0) ", matched: "version:" }

Paso 6: IA decide usar default
→ terminal_write({ id: "sess-1", data: "\n" })  // Enter para default

... repetir hasta que el comando termine ...

Paso N: Verificar fin
→ terminal_read_until({ id: "sess-1", pattern: "\\$ |# ", timeout_ms: 5000 })
← { data: "...", matched: "$ " }
→ La sesión está de vuelta en el prompt del shell → comando completado

Paso N+1: Cerrar sesión
→ terminal_close_session({ id: "sess-1" })
```

## Ejemplo de Flujo: `gh pr create` con editor

```
Agente: Quiere crear un PR con gh pr create

Paso 1: Crear sesión
→ terminal_create_session({ cwd: "/repos/mi-app" })

Paso 2: Escribir comando
→ terminal_write({ data: "gh pr create --fill\n" })

Paso 3: Esperar (gh puede preguntar cosas)
→ terminal_read_until({ pattern: "Choose a template|Submit|What", timeout_ms: 15000 })
← { data: "...", matched: "Submit" }

Paso 4: IA ve que gh espera confirmación
→ terminal_write({ data: "\n" })  // Enter para confirmar

Paso 5: Esperar resultado
→ terminal_read_until({ pattern: "https://github.com|Error|\\$ ", timeout_ms: 20000 })
```

## Ejemplo de Flujo: `npx create-vite` con selección interactiva

```
Agente: Quiere crear un proyecto Vite con React + TypeScript

Paso 1: terminal_create_session
Paso 2: terminal_write({ data: "npm create vite@latest\n" })
Paso 3: terminal_read_until({ pattern: "Project name:" })
       → IA responde "my-app\n"
Paso 4: terminal_read_until({ pattern: "Select a framework:" })
       → IA ve un menú, necesita elegir "React"
       → terminal_write({ data: "React\n" })
Paso 5: terminal_read_until({ pattern: "Select a variant:" })
       → IA ve opciones, elige "TypeScript"
       → terminal_write({ data: "TypeScript\n" })
Paso 6: Esperar a que termine
       → terminal_read_until({ pattern: "Done|\\$ ", timeout_ms: 30000 })
```

## Manejo de "No sé" / Consulta al Usuario

Cuando el agente no está seguro de qué responder:

1. Llama a `terminal_read_until` con timeout corto o `terminal_read`
2. Analiza el output con su modelo de IA
3. Si no puede decidir, **presenta las opciones al usuario**:

```
He ejecutado "npm init" y el terminal muestra:

  package name: (my-project)
  version: (1.0.0)
  description:
  entry point: (index.js)

¿Qué valores quieres usar?
A) Todos defaults (solo Enter)
B) Personalizar nombre: ________
C) Ver output completo
```

El usuario responde, y el agente continúa la interacción con el terminal.

## Implementación Técnica

### Stack recomendado

| Componente | Tecnología | Razón |
|------------|-----------|-------|
| Runtime | Node.js 22+ | El usuario ya usa Node, compatible con `node-pty` |
| MCP SDK | `@modelcontextprotocol/sdk` | SDK oficial del protocolo MCP |
| PTY | `node-pty` | Cross-platform, battle-tested (VS Code lo usa) |
| Transport | stdio (local) / SSE (remoto) | stdio para setup local zero-config |
| Build | TypeScript → compilado | Tipado fuerte, mismo stack del proyecto |

### node-pty Cross-Platform

`node-pty` maneja las diferencias de plataforma automáticamente:

| Plataforma | Backend | Notas |
|-----------|---------|-------|
| **Windows 10+** | `conpty.exe` (ConPTY API) | Nativo desde Windows 10 v1809 |
| **Windows (fallback)** | `winpty.dll` | Para Windows 8/7 o entornos restrictivos |
| **macOS** | `forkpty()` via `util.forkpty()` | Nativo del sistema |
| **Linux** | `forkpty()` via `util.forkpty()` | Nativo del sistema |

### Instalación

```bash
# En Node 22+
npm install node-pty @modelcontextprotocol/sdk
pnpm add node-pty @modelcontextprotocol/sdk

# node-pty requiere compilación nativa:
# - Windows: necesita Visual Studio Build Tools o MSVC
# - Linux: necesita make, gcc, python3
# - macOS: necesita Xcode Command Line Tools
```

### Estructura del proyecto sugerida

```
packages/mcp-terminal-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point: inicia el MCP server
│   ├── server.ts             # Configuración del MCP server (tools, resources)
│   ├── session-manager.ts    # Gestión de sesiones PTY (crear, listar, cerrar, cleanup)
│   ├── pty-session.ts        # Wrapper alrededor de node-pty (eventos, buffer, pattern matching)
│   ├── output-buffer.ts      # Buffer circular con soporte de regex matching
│   ├── shell-detector.ts     # Detecta shell según plataforma (auto mode)
│   ├── ansi-stripper.ts      # Limpia códigos ANSI del output
│   ├── types.ts              # Tipos compartidos
│   └── utils.ts              # Utilidades (timeouts, IDs, etc.)
├── test/
│   └── ...
└── README.md
```

### Diagrama de flujo interno (pty-session.ts)

```
┌─────────────────────────────────────────────────────┐
│                    PTYSession                        │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  node-pty     │───▶│   OutputBuffer            │   │
│  │  child process│    │   (acumula + FIFO)        │   │
│  │               │    │                           │   │
│  │  .on('data')  │───▶│  .append(chunk)           │   │
│  │               │    │  .readUntil(pattern)      │   │
│  │  .write(data) │◀───│  .readAll()               │   │
│  │               │    │  .clear()                 │   │
│  │  .resize()    │    └──────────────────────────┘   │
│  │               │                                   │
│  │  .kill()      │                                   │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

### Consideraciones de seguridad

1. **Sanitización de input**: El `data` que escribe el agente debe escaparse apropiadamente. El agente podría escribir `rm -rf /` — pero eso es intencional, porque el agente actúa como el usuario.
2. **Timeout global**: Cada sesión tiene un TTL máximo (ej: 30 minutos). Después se mata automáticamente.
3. **Límite de sesiones**: Máximo N sesiones simultáneas (configurable, default 10).
4. **Kill orphans**: Si el proceso padre del MCP server muere, los PTY hijos deben limpiarse.
5. **No input secreto**: El servidor NO debe usarse para inputs sensibles (passwords, tokens) porque el agente intermediario ve todo. Si se necesita, el usuario debe escribir directamente.

### Configuración en opencode.json

```json
{
  "mcpServers": {
    "terminal": {
      "command": "node",
      "args": ["path/to/mcp-terminal-server/dist/index.js"],
      "env": {
        "MCP_TERMINAL_MAX_SESSIONS": "10",
        "MCP_TERMINAL_SESSION_TTL_MS": "1800000"
      }
    }
  }
}
```

## Hacia OpenCode Core (PR futuro)

Si después queremos que esto sea nativo en OpenCode (sin MCP), el PR debería:

1. Agregar un nuevo tipo de tool `"terminal"` en el protocolo del runtime
2. El runtime mantendría un pool de PTYs reutilizables
3. Los agentes tendrían acceso a `terminal_read` / `terminal_write` / `terminal_read_until` como tools nativas
4. El runtime manejaría la limpieza de sesiones huérfanas automáticamente
5. Los sub-agentes también tendrían acceso a estas tools

## Próximos Pasos para Implementar

1. ✅ **Decisión tomada**: Arquitectura MCP Server con node-pty
2. ⏳ **Crear repo/package**: `packages/mcp-terminal-server/` o repo separado
3. ⏳ **Implementar core**:
   - `output-buffer.ts` con pattern matching
   - `pty-session.ts` wrapper node-pty
   - `session-manager.ts` con TTL cleanup
   - `server.ts` tools MCP
   - `index.ts` entry point
4. ⏳ **Probar en los 3 SO**: Windows, macOS, Linux
5. ⏳ **Crear skill para agentes**: `interactive-terminal` skill que enseña a los agentes a usar estas tools correctamente
6. ⏳ **Publicar**: npm package + opencode.json instructions

## Referencias

- [MCP Specification](https://spec.modelcontextprotocol.io)
- [node-pty](https://github.com/microsoft/node-pty) — Microsoft's pseudo-terminal for Node.js
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [VS Code Terminal API](https://code.visualstudio.com/api/extension-guides/terminal) — inspiración para PTY management
- [ConPTY (Windows)](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/) — Windows Pseudo Console API
