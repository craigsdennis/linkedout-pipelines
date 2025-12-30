# Implementation Plan & Technical Decisions

## Architecture Overview

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────────────────────────────┐
│     Cloudflare Worker (Hono)        │
│  - Routes: /out, /api/track, etc.  │
│  - Sends events to Pipeline         │
└──────┬──────────────────────────────┘
       │
       ├─► KV (links, users, auth)
       │
       └─► Pipeline Stream
           └─► (300s batch)
               └─► R2 Data Catalog (Iceberg)
                   └─► R2 SQL
                       └─► Analytics Dashboard
```

---

## Key Technical Decisions

### 1. Pipeline Schema Definition

**Problem**: Initial pipeline stored events as JSON blobs in a `value` column.

**Decision**: Define explicit schema with 15 fields:
- Core: timestamp, event_type, slug, owner_email
- Tracking: url, out, user_agent, referer
- CF Properties: country, city, region, colo, latitude, longitude, timezone

**Rationale**: 
- Enables SQL queries on individual fields
- Better compression (columnar Parquet format)
- No client-side JSON parsing needed
- Compatible with all Iceberg engines

**Implementation**:
```bash
npx wrangler pipelines streams create click_events \
  --schema-file schema.json \
  --http-enabled true \
  --http-auth false
```

---

### 2. R2 SQL Response Format

**Problem**: Expected `{data: [...]}` but API returns `{result: {rows: [...]}}`

**Decision**: Update all response parsing to use `result.rows`

**Example**:
```typescript
// ❌ Before
const data = await response.json() as { data?: Array<...> };
if (data.data) { ... }

// ✅ After
const data = await response.json() as { result?: { rows?: Array<...> } };
const rows = data.result?.rows;
if (rows) { ... }
```

---

### 3. Cloudflare Properties Extraction

**Problem**: Need to capture geographic and network metadata.

**Decision**: Create helper function to extract from `request.cf`

**Implementation**:
```typescript
function getCfProperties(request: Request): Partial<ClickEvent> {
  const cf = (request as any).cf;
  if (!cf) return {};
  
  return {
    country: cf.country || undefined,
    city: cf.city || undefined,
    region: cf.region || cf.regionCode || undefined,
    colo: cf.colo || undefined,
    latitude: cf.latitude || undefined,
    longitude: cf.longitude || undefined,
    timezone: cf.timezone || undefined,
  };
}
```

**Applied to**: All tracking points (page views, clicks, QR scans)

---

### 4. Global env Pattern for Auth Utils

**Problem**: Passing bindings as parameters is verbose.

**Decision**: Import global `env` from `cloudflare:workers`

**Example**:
```typescript
// ❌ Before
export async function verifyToken(token: string, kvNamespace: KVNamespace) {
  const data = await kvNamespace.get(token);
  // ...
}

// ✅ After
import { env } from "cloudflare:workers";

export async function verifyToken(token: string) {
  const data = await env.AUTH_TOKENS.get(token);
  // ...
}
```

---

### 5. Error Handling Strategy

**Decision**: Multi-layered error handling

**Levels**:
1. Environment validation (check R2_API_TOKEN exists)
2. HTTP response status checks
3. R2 SQL API error detection (errors array)
4. JavaScript exception catching with stack traces
5. User-facing error messages

**Implementation**:
```typescript
try {
  if (!c.env.R2_API_TOKEN) {
    console.error("R2_API_TOKEN not configured");
    throw new Error("Analytics not configured");
  }
  
  const response = await fetch(...);
  
  if (response.ok) {
    const data = await response.json();
    
    if (data.errors && data.errors.length > 0) {
      console.error("R2 SQL errors:", JSON.stringify(data.errors));
      console.error("Query was:", query);
    }
  } else {
    console.error("Query failed:", response.status, await response.text());
  }
} catch (error) {
  console.error("Exception:", error);
  errorMessage = error instanceof Error ? error.message : "Unknown error";
}
```

---

### 6. Testing Approach

**Problem**: Workers integration tests require specific Vitest versions.

**Decision**: Focus on unit tests for business logic

**Coverage**:
- Types (7 tests)
- Auth logic (3 tests)
- Schema validation (4 tests)
- Helper functions (19 tests)

**Rationale**:
- Faster execution
- Simpler setup
- No version conflicts
- Validates core logic

**Alternative for integration**: wrangler dev + e2e tests

---

### 7. Table Versioning Strategy

**Problem**: Can't update existing Iceberg table schema.

**Decision**: Create new tables (v1 → v2 → v3)

**History**:
- `click_events` (v1): JSON blob format (unstructured)
- `click_events_v2`: Structured columns (8 fields)
- `click_events_v3`: + CF properties (15 fields)

**Rationale**:
- Iceberg tables are immutable once created
- Clean slate for schema changes
- Old data preserved for reference

---

### 8. ORDER BY Limitation Workaround

**Problem**: R2 SQL only allows ORDER BY on partition keys.

**Decision**: Use `__ingest_ts` instead of `timestamp`

**Example**:
```sql
-- ❌ Fails
ORDER BY timestamp DESC

-- ✅ Works
ORDER BY __ingest_ts DESC
```

**Note**: `__ingest_ts` is when data arrived, `timestamp` is event time.

---

### 9. Configuration Management

**Decision**: Use `.dev.vars` for local development

**Structure**:
```bash
# .dev.vars (local only, gitignored)
R2_API_TOKEN="actual_token"

# .dev.vars.example (committed)
R2_API_TOKEN="your_token_here"

# Production: wrangler secret
npx wrangler secret put R2_API_TOKEN
```

**Rationale**:
- Secrets never committed
- Easy local development
- Template for new developers

---

### 10. QR Code Implementation

**Decision**: Server-side SVG generation (not canvas)

**Rationale**:
- Workers don't support Canvas API
- SVG works everywhere
- Client can convert to PNG if needed

**Implementation**:
```typescript
import QRCode from "qrcode";

const qrSvg = await QRCode.toString(url, {
  type: 'svg',
  width: 400,
  margin: 2,
});
```

---

## Data Flow

### Event Lifecycle

1. **User Action** (click link on `/out/:slug`)
2. **Client JavaScript** sends beacon to `/api/track`
3. **Worker** enriches event with CF properties
4. **Pipeline Stream** receives event
5. **Batch Wait** (up to 300 seconds)
6. **Sink Write** to R2 Data Catalog (Parquet/Iceberg)
7. **R2 SQL** queries for analytics
8. **Dashboard** displays results

### Typical Delays

- Click to Worker: ~100ms
- Worker to Pipeline: ~10ms
- Pipeline to R2: 0-300 seconds (batch)
- R2 SQL query: ~500ms-2s

---

## Performance Considerations

1. **Pipeline Batching**: 300s interval balances freshness vs efficiency
2. **Async Tracking**: Page views sent async (don't block render)
3. **KV Caching**: Links cached at edge
4. **R2 SQL**: Queries ~30KB data for typical dashboards
5. **Columnar Format**: Parquet enables fast analytics

---

## Security Measures

1. **Magic Links**: No password storage
2. **Token Expiry**: 24 hours
3. **Admin-only Routes**: Middleware checks `is_admin`
4. **No SQL Injection**: Template queries (note: could use parameterized queries)
5. **CORS**: Disabled on Pipeline (Worker-only access)

---

## Future Improvements

1. **Parameterized SQL Queries**: Prevent injection attacks
2. **Email Service**: Integrate Resend/Mailgun for production magic links
3. **Real-time Analytics**: WebSocket updates or polling
4. **Data Retention**: Iceberg time-travel for historical queries
5. **Rate Limiting**: Prevent abuse of tracking endpoints
6. **Integration Tests**: Full Workers environment testing
7. **Monitoring**: Alerts on pipeline failures
8. **Custom CSS**: Per-link styling (field exists, not implemented)
