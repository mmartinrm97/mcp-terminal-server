# terminalize — Coding Standards

## TypeScript

- Use `const` / `let`, never `var`
- Prefer interfaces over type aliases for object shapes
- Use `type` for unions, intersections, and utility types
- No `any` — use `unknown` if type is not known
- All public functions MUST have JSDoc comments
- Use ES module imports with `.js` extensions (NodeNext)

## Architecture

- Follow the existing layered architecture: types → utils → buffer → session → manager → server
- New features: add types first, then implementation, then MCP tool
- Error handling: use custom error classes from `types.ts` (SessionNotFoundError, etc.)

## Testing

- Write tests FIRST (Strict TDD Mode)
- Unit tests in `test/*.test.ts`, integration in `test/integration/*.test.ts`
- Mock external deps (node-pty) in unit tests
- Integration tests use real PTY sessions with cleanup in afterEach/afterAll

## Async

- Use `async/await`, never raw `.then()`
- No floating promises — always await or handle errors

## Naming

- Classes: PascalCase
- Functions/variables: camelCase
- Interfaces: PascalCase (no `I` prefix)
- Files: kebab-case.ts
- Constants: UPPER_SNAKE_CASE for exported, camelCase for private

## Landing Page

- Astro project in `landing/` directory, independent package (no workspace)
- Use Astro islands pattern: minimal JS, static-first
- Tailwind CSS for styling (installed via `pnpm astro add tailwind`)
- Mobile-first responsive design
- Dark theme with brand colors: `#6C5CE7` (primary purple), `#00d2ff` (accent cyan)
- No TDD required — landing page is static content, no business logic
- Deploy: Cloudflare Pages or Vercel (static export)
