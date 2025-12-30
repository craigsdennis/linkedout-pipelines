# LinkedOut - Complete Deployment Guide

## 🎉 Your LinkedOut application is fully configured!

All infrastructure is set up and ready to use. Follow these steps to test and deploy.

## What's Already Configured

✅ **R2 Buckets**: 2 buckets created with Data Catalog enabled
✅ **Pipelines Stream**: `click_events` stream for ingesting tracking data
✅ **Pipeline Sink**: `click_events_sink` writing to R2 Data Catalog (Iceberg)
✅ **Pipeline**: `click_events_pipeline` connecting stream → sink
✅ **KV Namespaces**: 3 namespaces for links, users, and auth tokens
✅ **Worker Bindings**: All configured in wrangler.jsonc
✅ **R2 API Token**: Stored as secret for SQL queries

## Quick Test (Development)

### 1. Add yourself as admin

```bash
npx wrangler kv key put --binding USERS "user:craig@cloudflare.com" \
  '{"email":"craig@cloudflare.com","created_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","is_admin":true}' \
  --preview false
```

Replace `craig@cloudflare.com` with your actual email.

### 2. Start development server

```bash
npm run dev
```

Visit: http://localhost:8787

### 3. Test the flow

1. **Login**: Click "Login" and enter your email
2. **Magic Link**: Click the magic link shown on screen
3. **Create Link**: From dashboard, click "Create New Link"
   - Slug: `test-talk`
   - Content:
     ```markdown
     # Test Talk
     
     Links from my talk:
     - [Cloudflare Workers](https://workers.dev)
     - [Hono Framework](https://hono.dev)
     ```
4. **View Link**: Visit http://localhost:8787/out/test-talk
5. **Click Links**: Click on the links in your page
6. **Check QR Code**: Click "View QR Code" from link management
7. **Wait 5 minutes**: Pipelines batch data every 300 seconds
8. **View Analytics**: Go to dashboard → "View Analytics"

## Deploy to Production

### 1. Deploy the Worker

```bash
npm run deploy
```

Your app will be at: `https://linkedout-pipelines.YOUR-SUBDOMAIN.workers.dev`

### 2. Add production admin user

If you want to use a different email in production:

```bash
npx wrangler kv key put --binding USERS "user:your-production-email@example.com" \
  '{"email":"your-production-email@example.com","created_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","is_admin":true}' \
  --preview false
```

### 3. Configure custom domain (optional)

Add a custom domain in the Cloudflare dashboard:
1. Go to Workers & Pages
2. Select `linkedout-pipelines`
3. Settings → Custom Domains
4. Add your domain

## Understanding the Data Flow

### When a user visits your link page:

```
1. User visits /out/test-talk
   ↓
2. Worker fetches content from KV
   ↓
3. Worker writes "page_view" event to CLICK_STREAM
   ↓
4. Event enters Pipeline stream
   ↓
5. Pipeline batches events (every 5 minutes)
   ↓
6. Pipeline runs SQL: INSERT INTO click_events_sink SELECT * FROM click_events
   ↓
7. Sink writes to R2 Data Catalog as Parquet/Iceberg
   ↓
8. Data is queryable via R2 SQL
```

### When a user clicks a link:

```
1. User clicks link in page
   ↓
2. track.js sends beacon to /api/track
   ↓
3. Worker writes "click" event to CLICK_STREAM
   ↓
4. (Same flow as above)
```

## Data Pipeline Details

### Stream Configuration
- **Name**: `click_events`
- **ID**: `24253f4554714e1680ebfab5bdb64bad`
- **Schema**: Unstructured JSON
- **HTTP Endpoint**: https://24253f4554714e1680ebfab5bdb64bad.ingest.cloudflare.com

### Sink Configuration
- **Name**: `click_events_sink`
- **Type**: R2 Data Catalog (Apache Iceberg)
- **Bucket**: `linkedout-data-catalog`
- **Table**: `default.click_events`
- **Format**: Parquet with zstd compression
- **Batching**: 300 seconds (5 minutes)

### Pipeline SQL
```sql
INSERT INTO click_events_sink 
SELECT * FROM click_events
```

### Event Schema
```typescript
{
  timestamp: string,      // ISO 8601 timestamp
  url: string,           // Full URL of the page
  out: string | null,    // Clicked link (null for page_view)
  slug: string,          // Link page slug
  owner_email: string,   // Creator's email
  user_agent: string,    // Browser user agent
  referer: string,       // HTTP referer
  event_type: "page_view" | "click" | "qr_scan"
}
```

## Querying Your Data

### Using R2 SQL API

```bash
curl "https://api.cloudflare.com/client/v4/accounts/51e28e9a83197a9f12a2e39f9477ba4e/r2/buckets/linkedout-data-catalog/sql" \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --data "SELECT event_type, COUNT(*) FROM default.click_events GROUP BY event_type"
```

### Example Queries

**Total events by type:**
```sql
SELECT 
  event_type,
  COUNT(*) as count
FROM default.click_events
GROUP BY event_type
```

**Click-through rate per link:**
```sql
SELECT 
  slug,
  SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) as views,
  SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
  ROUND(100.0 * SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) / 
    NULLIF(SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END), 0), 2) as ctr
FROM default.click_events
GROUP BY slug
ORDER BY views DESC
```

**Events over time:**
```sql
SELECT 
  DATE(timestamp) as date,
  event_type,
  COUNT(*) as count
FROM default.click_events
GROUP BY date, event_type
ORDER BY date DESC
LIMIT 30
```

**Most clicked links:**
```sql
SELECT 
  out as destination_url,
  COUNT(*) as clicks
FROM default.click_events
WHERE event_type = 'click'
  AND out IS NOT NULL
GROUP BY out
ORDER BY clicks DESC
LIMIT 10
```

## Monitoring

### Check Pipeline Status

```bash
npx wrangler pipelines list
```

### View Pipeline Details

```bash
npx wrangler pipelines get click_events_pipeline
```

### Check Stream Status

```bash
npx wrangler pipelines streams get click_events
```

### View Recent Events in R2

```bash
npx wrangler r2 object list linkedout-data-catalog --prefix data/
```

## Troubleshooting

### No data appearing in analytics

1. **Wait 5-10 minutes** - Pipelines batch data every 5 minutes
2. **Check events are being written**:
   ```bash
   # Check Worker logs
   npx wrangler tail
   ```
3. **Verify pipeline is active**:
   ```bash
   npx wrangler pipelines get click_events_pipeline
   ```

### Analytics shows "No data yet"

- Make sure you've visited your link page and clicked some links
- Wait at least 5 minutes for the batch to complete
- Check that the R2 API token secret is set correctly

### Magic links not working

- Ensure you added your email as a user in KV
- Check the user was created:
  ```bash
  npx wrangler kv key get "user:your@email.com" --binding USERS
  ```

## Educational Use

This project demonstrates:

1. **Serverless Data Pipeline**: Stream → Transform → Store → Query
2. **Apache Iceberg**: Modern table format for analytics
3. **Parquet Storage**: Columnar format for efficient queries
4. **SQL on Object Storage**: Query data directly in R2
5. **Event-Driven Architecture**: Async event collection
6. **Real-time Analytics**: Near real-time insights (5-minute batches)

## Next Steps

- Add more users via the admin panel
- Create multiple link pages for different talks
- Share the links and QR codes
- Monitor analytics to see engagement
- Experiment with custom SQL queries
- Add custom CSS themes per link (optional feature)

## Resources

- [Cloudflare Pipelines Docs](https://developers.cloudflare.com/pipelines/)
- [R2 SQL Docs](https://developers.cloudflare.com/r2-sql/)
- [Apache Iceberg](https://iceberg.apache.org/)
- [Hono Framework](https://hono.dev/)

Enjoy your LinkedOut application! 🚀
