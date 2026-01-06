# LinkedOut - Cloudflare Data Stack Demo

**LinkedOut** is an educational demo application that showcases Cloudflare's modern data stack for building real-time analytics applications. Built for educators and students learning about serverless data pipelines and analytics.

## What This Demo Teaches

This project demonstrates a complete data pipeline using:

- **Workers** - Serverless compute for handling HTTP requests
- **KV** - Low-latency key-value storage for user data and link content  
- **Pipelines** - Stream ingestion for real-time event data
- **R2 Data Catalog** - Apache Iceberg tables for structured analytics data
- **R2 SQL** - Query analytics data with standard SQL

## Use Case: Link Sharing with Analytics

LinkedOut allows educators to share links after talks/presentations and track engagement:

1. **Create** markdown pages with links to share
2. **Share** via URL or QR code
3. **Track** page views, link clicks, and QR scans
4. **Analyze** engagement data with SQL queries

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Actions                             │
│  - Visits /out/my-talk                                          │
│  - Clicks link to external site                                 │
│  - Scans QR code                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker                          │
│  - Serves outies from KV                                    │
│  - Receives tracking events via sendBeacon                      │
│  - Writes events to Pipeline stream                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────────┐
│                    Pipelines (Stream)                           │
│  - Batches events for efficient writes                          │
│  - Applies SQL transformations (SELECT * FROM stream)           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────────┐
│              R2 Data Catalog (Sink)                             │
│  - Writes to Apache Iceberg table                               │
│  - Stores as Parquet files in R2                                │
│  - Maintains Iceberg metadata for queries                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────────┐
│                        R2 SQL                                   │
│  - Query data with standard SQL                                 │
│  - Aggregations, filters, time-series analysis                  │
│  - Powers analytics dashboard                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts Demonstrated

### 1. Event Streaming with Pipelines

Pipelines ingest high-volume event data without overwhelming downstream systems:

```typescript
// Write event to stream
await env.CLICK_STREAM.send([{
  timestamp: new Date().toISOString(),
  event_type: 'click',
  slug: 'my-talk',
  owner_email: 'educator@example.com',
  out: 'https://clicked-link.com'
}]);
```

### 2. Apache Iceberg for Analytics

R2 Data Catalog uses Apache Iceberg for:
- **Schema evolution** - Add columns without breaking existing queries
- **Time travel** - Query historical data snapshots
- **ACID transactions** - Consistent reads and writes
- **Efficient queries** - Columnar format (Parquet) for fast aggregations

### 3. SQL Analytics on Object Storage

R2 SQL lets you query data in R2 directly:

```sql
SELECT 
  event_type,
  COUNT(*) as event_count,
  DATE(timestamp) as date
FROM click_events
WHERE owner_email = 'educator@example.com'
GROUP BY event_type, date
ORDER BY date DESC
```

## Getting Started

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### Quick Start

```bash
# Install dependencies
npm install

# Create your admin user (replace with your email)
npx wrangler kv key put --binding USERS "user:your@email.com" \
  '{"email":"your@email.com","created_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","is_admin":true}' \
  --preview false

# Run development server
npm run dev
```

### Development

```bash
npm run dev         # Start dev server
npm run deploy      # Deploy to production
npm run cf-typegen  # Regenerate TypeScript types
```

## Features

### For Educators

- **Magic Link Authentication** - No passwords, email-based login
- **Link Management** - Create/edit markdown outies
- **QR Code Generation** - Automatic QR codes for each page
- **Analytics Dashboard** - View engagement metrics
- **Multi-user Support** - Add other educators via admin panel

### For Attendees

- **Clean Outies** - Markdown-formatted content
- **Click Tracking** - Automatic tracking (privacy-focused)
- **Mobile Friendly** - Works great on phones

## Project Structure

```
linkedout-pipelines/
├── src/
│   ├── index.tsx          # Main Worker application (Hono)
│   ├── types.ts           # TypeScript interfaces
│   └── utils/
│       └── auth.ts        # Authentication helpers
├── public/
│   ├── index.html         # Static homepage
│   └── track.js           # Client-side tracking script
├── scripts/
│   └── seed-admin.ts      # Admin user setup helper
├── wrangler.jsonc         # Cloudflare Worker configuration
├── SETUP.md              # Detailed setup instructions
└── README.md             # This file
```

## Why Cloudflare's Data Stack?

Traditional data pipelines require:
- Database servers to manage
- ETL jobs to maintain  
- Message queues to configure
- Analytics databases to scale

Cloudflare's approach:
- ✅ **Serverless** - No servers to manage
- ✅ **Scalable** - Handles millions of events
- ✅ **Cost-effective** - Pay only for what you use
- ✅ **Simple** - Standard SQL, familiar patterns
- ✅ **Fast** - Global edge network, low latency

## Technical Notes

### Pipeline Schema Definition

This project uses a **defined schema** (`schema.json`) when creating the Pipeline stream. This ensures that events are written to the Iceberg table with proper columns instead of as JSON blobs:

**Schema columns**:
- `timestamp` (STRING) - Event timestamp
- `event_type` (STRING) - Type of event (page_view, click, qr_scan)
- `slug` (STRING) - Outie slug
- `owner_email` (STRING) - Outie owner
- `url` (STRING) - Page URL
- `out` (STRING) - Clicked link destination
- `user_agent` (STRING) - Browser user agent
- `referer` (STRING) - HTTP referer
- `country` (STRING) - Country code (from Cloudflare)
- `city` (STRING) - City name (from Cloudflare)
- `region` (STRING) - State/province (from Cloudflare)
- `colo` (STRING) - Cloudflare data center code
- `latitude` (STRING) - Geographic latitude (from Cloudflare)
- `longitude` (STRING) - Geographic longitude (from Cloudflare)
- `timezone` (STRING) - Timezone (from Cloudflare)

**Benefits**:
- ✅ Query with standard SQL (no JSON parsing needed)
- ✅ Efficient columnar storage (Parquet format)
- ✅ Better compression and query performance
- ✅ Works with any Iceberg-compatible engine (Spark, DuckDB, etc.)

**R2 SQL Limitations**:
- ⚠️ No `AS` aliases in SQL (use `row['count(*)']` instead of `row.count`)
- ⚠️ `ORDER BY` only works on partition key columns (use `__ingest_ts`, not `timestamp`)
- ⚠️ Limited `LIKE` patterns (no multiple `%`, must escape `_` as `\_`)

## Educational Use

This project is perfect for teaching:
- **Serverless Architecture** - Building apps without servers
- **Data Pipeline Design** - Streaming, batching, querying
- **Web Analytics** - How tracking actually works
- **Modern Data Stack** - Apache Iceberg, Parquet, SQL on object storage

## Learn More

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Pipelines Documentation](https://developers.cloudflare.com/pipelines/)
- [R2 Data Catalog](https://developers.cloudflare.com/r2/data-catalog/)
- [R2 SQL](https://developers.cloudflare.com/r2-sql/)
- [Apache Iceberg](https://iceberg.apache.org/)

## License

MIT - Feel free to use this for educational purposes!
