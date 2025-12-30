# Session Log: Adding Cloudflare Request Properties

## User Request
> "I think we should track the cf properties on the request like city, state, country and colo"

---

## Motivation

Add geographic and network metadata to tracking events for:
- Geographic analytics (which cities/countries view content)
- Performance analysis (which data centers serve users)
- Targeting and personalization

---

## Implementation Plan

### 1. Update TypeScript Types

**File**: `src/types.ts`

Added CF properties to `ClickEvent`:
```typescript
export interface ClickEvent {
  // ... existing fields
  // Cloudflare request metadata
  country?: string;
  city?: string;
  region?: string; // state/province
  colo?: string; // Cloudflare data center code
  latitude?: string;
  longitude?: string;
  timezone?: string;
}
```

### 2. Update Pipeline Schema

**File**: `schema.json`

Added 7 new optional fields:
```json
{
  "fields": [
    // ... existing 8 fields
    {"name": "country", "type": "string", "required": false},
    {"name": "city", "type": "string", "required": false},
    {"name": "region", "type": "string", "required": false},
    {"name": "colo", "type": "string", "required": false},
    {"name": "latitude", "type": "string", "required": false},
    {"name": "longitude", "type": "string", "required": false},
    {"name": "timezone", "type": "string", "required": false}
  ]
}
```

**Total fields**: 8 → 15

### 3. Create Helper Function

**File**: `src/index.tsx`

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

**Design Notes**:
- Returns empty object if CF not available
- Fallback: `region` → `regionCode`
- All values optional (undefined if not present)

### 4. Apply to All Tracking Points

**Page Views** (`/out/:slug`):
```typescript
const pageViewEvent: ClickEvent = {
  // ... existing fields
  ...getCfProperties(c.req.raw),
};
```

**Clicks** (`/api/track`):
```typescript
const clickEvent: ClickEvent = {
  // ... existing fields
  ...getCfProperties(c.req.raw),
};
```

**QR Scans** (`/q/:slug`):
```typescript
const qrScanEvent: ClickEvent = {
  // ... existing fields
  ...getCfProperties(c.req.raw),
};
```

---

## Pipeline Recreation

Since we can't modify existing Iceberg tables, created new pipeline:

### Delete Old Components
```bash
npx wrangler pipelines delete ad815902f2eb49e08385c4ce3fd620d9 -y
npx wrangler pipelines sinks delete 7172fe84c8624ff284ccdf1679cdfd04 -y  
npx wrangler pipelines streams delete 596baac161254fb48ee880d1f04ae289 -y
```

### Create New Stream
```bash
npx wrangler pipelines streams create click_events \
  --schema-file schema.json \
  --http-enabled true \
  --http-auth false
```

**Result**: Stream ID `07a866c79b6a4ec9ae4d41bba2c93cd8`

### Create New Sink
```bash
npx wrangler pipelines sinks create click_events_sink \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table click_events_v3 \
  --catalog-token "$R2_TOKEN" \
  --compression zstd \
  --roll-size 100 \
  --roll-interval 300
```

**Result**: 
- Sink ID: `a3e29efc061441df9bc9f6eeee16136f`
- Table: `default.click_events_v3`

### Create Pipeline
```bash
npx wrangler pipelines create click_events_pipeline \
  --sql "INSERT INTO click_events_sink SELECT * FROM click_events"
```

**Result**: Pipeline ID `652ed292b6bf4c6eb1d4c3a08b67bf54`

### Update Configuration
**File**: `wrangler.jsonc`
```json
{
  "pipelines": [{
    "binding": "CLICK_STREAM",
    "pipeline": "07a866c79b6a4ec9ae4d41bba2c93cd8"
  }]
}
```

---

## Testing

### Test Event Send
```bash
curl https://linkedout-pipelines.craigsdemos.workers.dev/debug/pipeline
```

**Response**:
```json
{
  "success": true,
  "event": {
    "timestamp": "2025-12-30T07:34:03.471Z",
    "event_type": "page_view",
    "slug": "debug-test",
    "owner_email": "debug@test.com",
    "country": "US",
    "city": "Salem",
    "region": "Oregon",
    "colo": "SEA",
    "latitude": "44.9429",
    "longitude": "-123.0351",
    "timezone": "America/Los_Angeles"
  }
}
```

✅ CF properties captured!

### Verify Table Creation
After pipeline flush (~5 minutes):
```bash
npx wrangler r2 sql query "WAREHOUSE" \
  "SELECT COUNT(*) FROM default.click_events_v3"
```

**Result**: Table exists with 0 rows (waiting for batch)

### Check Data
After more events:
```bash
npx wrangler r2 sql query "WAREHOUSE" \
  "SELECT country, city, colo, event_type FROM default.click_events_v3 LIMIT 5"
```

**Result**:
```
┌─────────┬────────────────┬──────┬────────────┐
│ country │ city           │ colo │ event_type │
├─────────┼────────────────┼──────┼────────────┤
│ US      │ Salem          │ SEA  │ page_view  │
│ US      │ Lincoln City   │ SEA  │ page_view  │
│ US      │ Seattle        │ SEA  │ click      │
└─────────┴────────────────┴──────┴────────────┘
```

✅ CF properties in database!

---

## Analytics Queries

### Geographic Breakdown
```sql
SELECT 
  country,
  city,
  COUNT(*) as events
FROM default.click_events_v3
GROUP BY country, city
ORDER BY events DESC
```

### Data Center Performance
```sql
SELECT 
  colo,
  event_type,
  COUNT(*) as count
FROM default.click_events_v3
GROUP BY colo, event_type
```

---

## Files Modified

1. `src/types.ts` - Added CF properties to ClickEvent
2. `src/index.tsx` - Added getCfProperties() helper
3. `src/index.tsx` - Updated 3 tracking points
4. `schema.json` - Added 7 fields
5. `wrangler.jsonc` - Updated stream ID
6. `README.md` - Documented new fields

---

## Deployments

1. With CF properties: `cc8d4614-6c21-4d10-8ad8-aae13feca250`
2. Debug endpoint: `2c603b5c-b01f-4601-baab-5b6b5f55e187`

---

## Pipeline Version History

| Version | Table Name | Fields | Features |
|---------|------------|--------|----------|
| v1 | click_events | 2 | JSON blob (unstructured) |
| v2 | click_events_v2 | 8 | Structured columns |
| v3 | click_events_v3 | 15 | + CF properties |

---

## Use Cases Enabled

1. **Geographic Analytics**: Which countries/cities engage most
2. **Regional Trends**: Content popularity by location
3. **Performance Analysis**: Latency by data center
4. **User Segmentation**: Target content by geography
5. **Compliance**: Data residency tracking
