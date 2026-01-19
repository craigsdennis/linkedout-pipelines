# Agent Guidelines for LinkedOut Pipelines

## Commands
- **Dev**: `npm run dev` (local Workers dev server at http://localhost:8787)
- **Test**: `npm test` (all tests), `npx vitest run test/utils/db.test.ts` (single file)
- **Deploy**: `npm run deploy` (deploys to production)
- **TypeCheck**: `npx tsc --noEmit` (type checking without emit)
- **Logs**: `npx wrangler tail` (view live Worker logs)
- **Types**: `npx wrangler types` (regenerate TypeScript bindings)

## Architecture Overview

### Authentication
- **Method**: Cloudflare Access with GitHub OAuth (JWT-based)
- **Pattern**: `Cf-Access-Jwt-Assertion` header → decode JWT → check/create user in D1
- **No Magic Links**: Removed in favor of Cloudflare Access
- **Auto-Creation**: Users created automatically on first login

### Data Storage
- **D1 Database**: Users, links, themes, link_maintainers (relational data)
- **KV Namespace**: `MAP_CACHE` only (15-min cache for global map data)
- **R2 + Iceberg**: Analytics event data via Pipelines
- **No AUTH_TOKENS KV**: Removed - authentication is JWT-only

### Database Access Pattern
- **Global env**: All database functions use `import { env } from "cloudflare:workers"`
- **No db parameters**: Functions like `getUser(email)` NOT `getUser(db, email)`
- **Clean API**: Shorter signatures, consistent with auth utilities

## Code Style

### Imports
```typescript
// Utilities use global env
import { env } from "cloudflare:workers";

// Routes use Hono context
const result = await someFunction(c.env.DB); // ← WRONG
const result = await someFunction();         // ← RIGHT (uses env.DB internally)
```

### Database Functions (src/utils/db.ts)
- **All functions use global env**: Don't pass `c.env.DB` as parameter
- **Examples**: 
  - `getUser(email)` - get user by email
  - `createLink(linkData, maintainerEmail)` - create link with maintainer
  - `getUserLinks(email)` - get all links user can access
  - `canUserAccessLink(slug, email)` - check permissions
- **Direct SQL**: Use `c.env.DB.prepare()` only for queries not in db.ts utilities

### Authentication
- **Middleware**: `authMiddleware` decodes JWT, sets context variables
- **Context Variables**: `c.get("userEmail")`, `c.get("userName")`, `c.get("isAdmin")`
- **Admin Check**: Use `adminMiddleware` for admin-only routes
- **No Tokens**: JWT is stateless, no token storage needed

### Testing with Vitest + Cloudflare Workers Pool
- **Test Location**: All tests in `test/` directory (not in `src/`)
- **Integration tests**: Use `@cloudflare/vitest-pool-workers` for real D1/KV/R2 testing
- **Unit tests**: Standard vitest patterns for pure functions
- **Database tests**: See `test/utils/db.test.ts` for Workers pool pattern
- **Config**: Must use TypeScript config (`vitest.config.ts`) for pool to work

**Cloudflare Workers Pool Pattern** (recommended for D1 database tests):
```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";

describe("Database Operations - Integration Tests", () => {
  let db: D1Database;

  beforeAll(async () => {
    // Use D1 database from Cloudflare test environment
    db = env.DB;
    
    // Create schema manually with db.batch()
    await db.batch([
      db.prepare("CREATE TABLE users (...)"),
      db.prepare("CREATE TABLE links (...)"),
    ]);
  }, 30000);

  beforeEach(async () => {
    // Clear data between tests
    await db.batch([
      db.prepare("DELETE FROM links"),
      db.prepare("DELETE FROM users"),
    ]);
  });

  it("should test with real database", async () => {
    await db.prepare("INSERT INTO users (...) VALUES (?, ?, ?)").bind(...).run();
    const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    expect(user).toBeDefined();
  });
});
```

**Configuration** (`vitest.config.ts`):
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        singleWorker: true,
      },
    },
  },
});
```

**TypeScript Setup** (`test/tsconfig.json`):
```jsonc
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-pool-workers"]
  },
  "include": ["./**/*.ts", "../worker-configuration.d.ts"]
}
```

**Environment Types** (`test/env.d.ts`):
```typescript
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    // Add any test-specific bindings here if needed
  }
}
```

**Benefits of @cloudflare/vitest-pool-workers**:
- Official Cloudflare testing solution
- Tests real SQL queries against D1 (no mocks!)
- Access to all Workers APIs: D1, KV, R2, Durable Objects, etc.
- Uses actual wrangler.jsonc configuration
- Catches SQL syntax errors and schema issues
- Tests actual D1/Workers behavior
- Integration with `SELF` fetcher for full Worker testing
- No manual Miniflare setup required

### R2 SQL Queries
- **Response Structure**: `{result: {rows: [...]}}` NOT `{data: [...]}`
- **No Aliases**: Don't use `AS` - use `row['count(*)']` not `row.count`
- **Partition Keys**: Only `ORDER BY __ingest_ts` (partition key), not `timestamp`
- **Table**: `default.events` (current schema)

### Error Handling
5-layer pattern:
1. **Env validation** - Check bindings exist
2. **HTTP status** - Return appropriate status codes (401, 403, 404, 500)
3. **API errors** - Parse error responses from external APIs
4. **Exceptions** - Try/catch with logging
5. **User messages** - Clear, actionable error messages in UI

### Naming Conventions
- **Files/Slugs**: kebab-case (`user-profile.ts`, `my-talk`)
- **Variables/Functions**: camelCase (`getUserLinks`, `isAdmin`)
- **Types/Interfaces**: PascalCase (`User`, `LinkWithMaintainers`)
- **Database Fields**: snake_case (`is_admin`, `created_at`)
- **No Suffixes**: Functions are `getUser()` not `getUserFromDB()`

## Project-Specific Details

### Routes Structure
```
Public (no auth):
  / - Homepage with world map
  /out/:slug - View outie page
  /q/:slug - QR code scan redirect
  /login - Landing page (shows "Continue to Dashboard")
  /logout - Redirects to Cloudflare Access logout

Authenticated (/dashboard/*):
  /dashboard - User's links dashboard
  /dashboard/outies/create - Create new outie
  /dashboard/outies/view/:slug - View/manage outie
  /dashboard/outies/:slug/edit - Edit outie
  /dashboard/analytics - Analytics (filterable by slug)
  /dashboard/api/preview - Markdown preview endpoint (POST)

Admin Only:
  /dashboard/admin - User management + global map
  /dashboard/admin/promote - Promote user to admin
  /dashboard/admin/demote - Demote admin
  /dashboard/admin/delete-user - Delete user
  /dashboard/admin/clear-map-cache - Refresh map cache
```

### Pipeline Configuration
- **Binding**: `EVENT_STREAM` (renamed from CLICK_STREAM)
- **Stream**: `event_stream` (ID: 4fe2606a2aa74a6990662fcc5d508517)
- **Sink**: `events_sink` → R2 Data Catalog
- **Table**: `default.events` in R2 Data Catalog (Iceberg)
- **Batch Interval**: 30 seconds (changed from 300s for faster delivery)
- **Format**: Parquet with zstd compression
- **Event Types**: `page_view`, `click`, `qr_scan`
- **Schema**: 16 event fields (timestamp, event_type, slug, visitor_id, url, out, link_text, user_agent, referer, country, city, region, colo, latitude, longitude, timezone)
- **Location Fields**: `country`, `city`, `region`, `latitude`, `longitude`

### Database Schema (D1)

**users**:
- `email` (PK) - User email from GitHub
- `is_admin` (INTEGER) - 0 or 1
- `created_at` (TEXT) - ISO 8601 timestamp

**links**:
- `slug` (PK) - URL-safe identifier
- `title` - Display title
- `content` - Markdown content
- `theme_id` (FK) - References themes.id
- `created_by` (FK) - References users.email
- `custom_css` - Optional custom CSS
- `created_at`, `updated_at`

**themes**:
- `id` (PK) - Theme identifier
- `name` - Display name
- `description` - Optional description
- `css_variables` (JSON) - 10 CSS variables
- `additional_css` - Optional extra CSS
- `created_by` (FK) - References users.email
- `is_public` (INTEGER) - 0 or 1
- `created_at`

**link_maintainers** (junction table):
- `link_slug` (FK) - References links.slug
- `user_email` (FK) - References users.email
- `added_at` - Timestamp
- `added_by` (FK) - Who added them
- PRIMARY KEY: (link_slug, user_email)

### Key Features

**Multi-Maintainer System**:
- Links can have multiple maintainers (many-to-many)
- All maintainers have equal permissions
- Creator automatically added as first maintainer
- Use `getUserLinks(email)` to get all links user can access

**Theme System**:
- 6 pre-built themes: default, dark, minimal, colorful, conference, retro
- 10 CSS variables per theme: colors, fonts, spacing, etc.
- Public themes visible to all, private themes only to creator
- Apply via `theme_id` when creating/editing links

**Analytics**:
- Slug-based filtering (not owner_email)
- Use `getUserAccessibleSlugs(email)` to build WHERE clause
- Global map with city-level markers (Leaflet.js)
- Real-time stats: views, clicks, QR scans, CTR

**QR Codes**:
- Server-side SVG generation via QRCode library
- Accessible via `/q/:slug` (tracked separately as `qr_scan`)
- Downloadable as PNG (client-side canvas conversion)
- Modal with 'Q' hotkey support

## Common Pitfalls to Avoid

### ❌ DON'T: Pass database bindings as parameters
```typescript
await getUser(c.env.DB, email); // WRONG
```
✅ **DO**: Use functions that access env internally
```typescript
await getUser(email); // RIGHT
```

### ❌ DON'T: Import functions with same name as exports
```typescript
import { getUser } from "./db";
export async function getUser(email) {
  return await getUser(email); // Infinite recursion!
}
```
✅ **DO**: Use import aliases
```typescript
import { getUser as getUserFromDB } from "./db";
export async function getUser(email) {
  return await getUserFromDB(email); // Correct
}
```

### ❌ DON'T: Use column aliases in R2 SQL
```typescript
SELECT COUNT(*) AS count FROM table; // R2 SQL doesn't support this
```
✅ **DO**: Access without aliases
```typescript
SELECT COUNT(*) FROM table; // Access as row['count(*)']
```

### ❌ DON'T: Order by non-partition keys
```typescript
ORDER BY timestamp DESC; // Will fail
```
✅ **DO**: Use partition keys
```typescript
ORDER BY __ingest_ts DESC; // Works
```

### ❌ DON'T: Mock D1 database for integration tests
```typescript
const mockDB = { prepare: vi.fn(), /* ... */ };
vi.mock("cloudflare:workers", () => ({ env: { DB: mockDB } })); // Don't mock!
```
✅ **DO**: Use Cloudflare Workers pool for real D1 testing
```typescript
import { env } from "cloudflare:test";
const db = env.DB;
// Test with real database queries - no setup needed!
```

## Debugging

### View Worker Logs
```bash
npx wrangler tail --format pretty
```

### Check JWT Authentication
Use browser developer tools or Wrangler logs to inspect headers:
```bash
# View live Worker logs including request headers
npx wrangler tail --format pretty
```

### Query D1 Database
```bash
# List all users
npx wrangler d1 execute linkedout-db --remote --command "SELECT * FROM users"

# Check admin status
npx wrangler d1 execute linkedout-db --remote --command "SELECT email, is_admin FROM users WHERE is_admin = 1"

# Check link maintainers
npx wrangler d1 execute linkedout-db --remote --command "SELECT * FROM link_maintainers WHERE link_slug = 'my-slug'"
```

### Common Issues

**"Maximum call stack size exceeded"**:
- Check for recursive function calls (especially in wrapper functions)
- Verify import aliases are used correctly

**"No Cloudflare Access JWT found"**:
- Ensure Access is configured for the domain
- Verify policy protects `/dashboard` or `/dashboard/*`
- Check "Send Cf-Access-JWT-Assertion header" is enabled

**Tests failing with D1 errors**:
- Ensure vitest.config.ts uses `defineWorkersConfig` (not .js file)
- Check schema is created in `beforeAll()` before tests run
- Verify cleanup happens in `beforeEach()`, not during schema setup
- Make sure test files are in `test/` directory with proper imports

**R2 SQL query errors**:
- Remove `AS` aliases
- Use `__ingest_ts` for ordering
- Check response structure is `result.rows`

## Deployment Checklist

Before deploying:
1. ✅ Run `npm test` - all tests must pass
2. ✅ Run `npx tsc --noEmit` - no TypeScript errors
3. ✅ Test locally with `npm run dev`
4. ✅ Check `wrangler.jsonc` bindings are correct
5. ✅ Verify secrets are set: `npx wrangler secret list`

After deploying:
1. ✅ Check `/dashboard` loads (authentication works)
2. ✅ Test creating a new link
3. ✅ Verify analytics page loads
4. ✅ Check worker logs: `npx wrangler tail`

## Resources

- **Docs**: See `README.md` and `QUICKSTART.md` for setup
- **Session Logs**: `truth-window/` directory for development history
- **Latest Session**: `truth-window/09-cloudflare-access-github-auth.md`
- **Cloudflare Docs**: 
  - [Workers](https://developers.cloudflare.com/workers/)
  - [D1](https://developers.cloudflare.com/d1/)
  - [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/)
  - [Pipelines](https://developers.cloudflare.com/pipelines/)
  - [R2 SQL](https://developers.cloudflare.com/r2/data-access/r2-sql/)
