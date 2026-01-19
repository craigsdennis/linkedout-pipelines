# Pipeline Migration: COMPLETE ✅

## Status
✅ **Migration Complete!** Pipeline is live in production.

## What Was Done

### 1. Binding Rename: CLICK_STREAM → EVENT_PIPELINE
- Updated all source files to use `EVENT_PIPELINE` binding
- Files changed: `wrangler.jsonc`, `worker-configuration.d.ts`, `src/index.tsx`, `src/routes/tracking.ts`, `src/routes/dashboard.ts`

### 2. Created New Pipeline Infrastructure via Wrangler CLI
**Stream**: `event_stream`
- ID: `4fe2606a2aa74a6990662fcc5d508517`
- Schema: 16 fields from `schema.json`
- HTTP ingest enabled with authentication

**Sink**: `events_sink`
- ID: `d59e49464eaf4f7c9003dd8538acd2aa`
- Type: R2 Data Catalog (Apache Iceberg)
- Destination: `linkedout-data-catalog` bucket
- Table: `default.events`
- Format: Parquet with zstd compression
- Batch interval: 30 seconds (changed from 300s for faster testing)

**Pipeline**: `events_pipeline`
- ID: `f8a82f1d662442d1a90766c41e4db098`
- SQL: `INSERT INTO events_sink SELECT * FROM event_stream`

### 3. Updated Configuration
- `wrangler.jsonc`: Pipeline binding now points to stream ID `4fe2606a2aa74a6990662fcc5d508517`
- Note: The binding uses the **stream ID**, not the pipeline ID

### 4. Deployed to Production
- Version: `98b5e001-2b9b-412a-a37b-1bb4f58b2e45`
- URL: https://linkedout-pipelines.craigsdemos.workers.dev
- EVENT_PIPELINE binding active and working

## Implementation Notes

### Why CLI Instead of Dashboard?
The new Wrangler CLI (v4.59.1) supports SQL-based pipeline creation:
```bash
npx wrangler pipelines streams create event_stream --schema-file schema.json
npx wrangler pipelines sinks create events_sink \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table events \
  --catalog-token $R2_API_TOKEN \
  --roll-interval 30
npx wrangler pipelines create events_pipeline \
  --sql "INSERT INTO events_sink SELECT * FROM event_stream"
```

### Key Configuration Details
- **Catalog Token**: Used R2_API_TOKEN from `.dev.vars` (has Admin Read & Write permissions)
- **Batch Interval**: Changed from 300s → 30s for faster event delivery
- **Table Name**: Now `default.events` (namespace.table convention)
- **Binding Convention**: Bindings point to stream IDs, not pipeline IDs

## Testing
To verify the pipeline is working:
1. Visit any outie page: https://linkedout-pipelines.craigsdemos.workers.dev/out/{slug}
2. Click a link or trigger a QR scan
3. Wait 30 seconds for batch to process
4. Query R2 Data Catalog:
   ```bash
   curl -X POST "https://r2.cloudflarestorage.com/$ACCOUNT_ID/linkedout-data-catalog/sql" \
     -H "Authorization: Bearer $R2_API_TOKEN" \
     -d "SELECT COUNT(*) FROM default.events"
   ```

