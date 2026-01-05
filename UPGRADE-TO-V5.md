# Upgrade to Pipeline v5 with Link Text Tracking

The application now tracks link text (the anchor text that users click), but the existing pipeline schema doesn't include this field yet.

## Current Status

- ✅ Client-side tracking (`track.js`) captures link text
- ✅ Schema updated (`schema.json`) includes `link_text` field
- ✅ TypeScript types updated
- ⚠️ Pipeline still using v4 schema (without `link_text`)
- ⚠️ Analytics queries temporarily disabled for link text

## Option 1: Create New Pipeline (Recommended)

This creates a fresh pipeline with the new schema:

```bash
# 1. Create new stream with updated schema
npx wrangler pipelines streams create click_events_v5 \
  --schema-file schema.json \
  --http-enabled true \
  --http-auth false

# 2. Create new sink (same settings as v4)
npx wrangler pipelines sinks create click_events_sink_v5 \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table click_events_v5 \
  --catalog-token "$R2_API_TOKEN" \
  --compression zstd \
  --roll-size 100 \
  --roll-interval 300

# 3. Create new pipeline
npx wrangler pipelines create click_events_pipeline_v5 \
  --sql "INSERT INTO click_events_sink_v5 SELECT * FROM click_events_v5"

# 4. Get the new pipeline binding ID
npx wrangler pipelines list
```

### Update wrangler.jsonc

Replace the pipeline binding:

```jsonc
{
  "name": "linkedout-pipelines",
  "pipelines": [
    {
      "binding": "CLICK_STREAM",
      "pipeline": "click_events_pipeline_v5"  // ← Update this
    }
  ]
}
```

### Update Code

In `src/index.tsx`, update all SQL queries from `click_events_v4` to `click_events_v5`:

```typescript
// Find and replace in analytics queries
FROM default.click_events_v4  →  FROM default.click_events_v5
```

Uncomment the link text query (search for "TODO: After creating v5 pipeline").

### Deploy

```bash
npm run deploy
```

## Option 2: Keep Using v4 (Link Text Disabled)

If you don't want to migrate yet:

- Link text will be captured on client side
- Sent to pipeline and stored
- But won't be queryable until you upgrade
- Analytics will show "(coming soon)" for link text column

## What You Get with v5

Once upgraded, you'll see:

1. **Most Clicked Link Text** section
   - Shows which link text gets the most clicks
   - Grouped by link text + destination
   - Helps optimize call-to-action text

2. **Link Text in Recent Events**
   - See exactly what users clicked
   - Better understanding of user behavior

## Migration Notes

- **Data separation**: v4 and v5 are separate tables
- **No data loss**: v4 data remains intact
- **Historical data**: v4 won't have link_text (that's OK)
- **Forward only**: New data goes to v5 with link_text

## Testing

After upgrade:

1. Click a link on your link page
2. Wait 5-10 minutes (pipeline batching)
3. Check analytics for link text data
4. Check console logs for query success

## Rollback

If issues occur, revert `wrangler.jsonc` to use `click_events_pipeline_v4` and redeploy.

---

**Current Version**: v4 (no link_text)  
**Upgrade Path**: Create v5 pipeline with updated schema  
**Effort**: ~10 minutes
