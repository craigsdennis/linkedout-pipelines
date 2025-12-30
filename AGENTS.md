# Agent Guidelines for LinkedOut Pipelines

## Commands
- **Dev**: `npm run dev` (local Workers dev server)
- **Test**: `npm test` (all tests), `npx vitest run src/auth.test.ts` (single file)
- **Deploy**: `npm run deploy`
- **TypeCheck**: `npx tsc --noEmit`

## Code Style
- **Imports**: Use `import { env } from "cloudflare:workers"` for global env access in utilities. Main app uses Hono context `c.env`.
- **Types**: Strict TypeScript enabled. All interfaces in `src/types.ts`. Use `CloudflareBindings` from `worker-configuration.d.ts`.
- **Auth Pattern**: Auth utilities (`src/utils/auth.ts`) use global `env` - don't pass bindings as parameters.
- **R2 SQL Responses**: Always parse as `{result: {rows: [...]}}` not `{data: [...]}`. No column aliases (`AS`). Only ORDER BY partition keys.
- **Async/Await**: Use throughout - no callbacks or `.then()` chains.
- **Error Handling**: 5-layer pattern: env validation → HTTP status → API errors → exceptions → user messages. Log verbosely to console.
- **Testing**: Unit tests only (Vitest). No Workers runtime in tests. Mock `cloudflare:workers` env.
- **Pipeline Events**: Use schema.json structure (15 fields). Extract CF properties via `getCfProperties(request)`.
- **Naming**: Kebab-case for files/slugs, camelCase for variables, PascalCase for types, snake_case for database fields.

## Project-Specific
- Magic links log to console (no email service yet). QR codes are server-side SVG. Pipeline batches every 300s. Table is `default.click_events_v3`.
