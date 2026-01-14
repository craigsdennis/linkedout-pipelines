# Pipeline Migration: click_events_v6 → events

## Status
✅ Code updated (all queries use `default.events`)  
❌ Pipeline needs manual creation via Dashboard

## Manual Steps Required

### 1. Create New Pipeline in Dashboard
1. Go to: https://dash.cloudflare.com/51e28e9a83197a9f12a2e39f9477ba4e/workers-and-pages/pipelines
2. Click "Create Pipeline"
3. Configure:
   - **Name**: `events-pipeline`
   - **Source**: Worker (binding: `CLICK_STREAM`)
   - **Destination**: R2 Data Catalog
   - **Bucket**: `linkedout-data-catalog`
   - **Table Name**: `events` (NOT click_events_v6)
   - **Schema**: Use fields from `schema.json`
   - **Batch Interval**: 30 seconds (not 300!)
   - **Format**: Iceberg

### 2. Update wrangler.jsonc
Replace the pipeline ID:
```jsonc
"pipelines": [
  {
    "binding": "CLICK_STREAM",
    "pipeline": "NEW_PIPELINE_ID_HERE"  // Replace this
  }
]
```

### 3. Test
```bash
npm run dev
# Navigate to an outie page, click links
# Wait 30 seconds
# Check R2 for new events table
```

## What's Already Done
- ✅ Deleted old pipeline `click_events_pipeline_v6`
- ✅ Updated all SQL queries to use `default.events`
- ✅ All tests passing (115/115)

## Why Manual?
Wrangler Pipelines CLI changed:
- Old: Flag-based configuration
- New: SQL-based (requires source table to exist first)
- Legacy pipelines can't be created via CLI anymore
- Must use Dashboard or API

