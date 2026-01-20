# LinkedOut - Cloudflare Data Stack Demo

[<img src="https://img.youtube.com/vi/pkS1ccQBoqg/0.jpg">](https://youtu.be/pkS1ccQBoqg "Building a Scalable Click Tracker with Cloudflare Pipelines
")

📼 https://youtu.be/pkS1ccQBoqg



**LinkedOut** is an educational demo application that showcases Cloudflare's modern data stack for building real-time analytics applications with authenticated multi-user collaboration.

## What This Demo Teaches

This project demonstrates a complete data pipeline using:

- **Workers** - Serverless compute for handling HTTP requests
- **D1** - Serverless SQL database for relational data
- **Pipelines** - Stream ingestion for real-time event data
- **R2 Data Catalog** - Apache Iceberg tables for structured analytics data
- **R2 SQL** - Query analytics data with standard SQL
- **Cloudflare Access** - Zero Trust authentication with GitHub OAuth

## Use Case: Link Sharing with Analytics

LinkedOut allows educators and presenters to share links after talks and track engagement:

1. **Create** markdown pages with links to share
2. **Collaborate** with co-presenters via multi-maintainer system
3. **Customize** with beautiful pre-built themes
4. **Share** via URL or QR code
5. **Track** page views, link clicks, and QR scans
6. **Analyze** engagement data with SQL queries

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
│  - Authenticates via Cloudflare Access (GitHub)                 │
│  - Serves pages from D1 database                                │
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

## Key Features

### Authentication & Security
- **Cloudflare Access** - GitHub OAuth authentication
- **Zero Trust** - JWT-based auth, no passwords to manage
- **Admin Panel** - User management and promotion system
- **Multi-User** - Role-based access control

### Collaboration
- **Multi-Maintainer** - Share link ownership with co-presenters
- **Equal Permissions** - All maintainers can edit and manage links
- **Team Links** - Perfect for conference talks with multiple speakers

### Customization
- **6 Pre-built Themes** - Default, Dark, Minimal, Colorful, Conference, Retro
- **CSS Variables** - 10 customizable variables per theme
- **Theme Selection** - Choose different themes for different links
- **Public/Private Themes** - Share themes or keep them private

### Analytics
- **Real-Time Tracking** - Page views, clicks, QR scans
- **Geographic Data** - Country, city, region from Cloudflare
- **Interactive Map** - Global visualization of page views
- **Link Performance** - Click-through rates, destination URLs, link text
- **Filterable** - View all activity or filter by specific links

### Sharing
- **QR Code Generation** - Automatic QR codes for each page
- **Hotkeys** - Press 'Q' to toggle QR modal
- **Download** - Export QR codes as PNG
- **Tracking** - Separate QR scan tracking

## Getting Started

See [QUICKSTART.md](./QUICKSTART.md) for a quick guide, or follow the detailed setup below.

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/linkedout-pipelines
cd linkedout-pipelines

# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login
```

### Database Setup

```bash
# Create D1 database (if not exists)
npx wrangler d1 create linkedout-db

# Apply migrations
npx wrangler d1 migrations apply linkedout-db --remote

# Create your first admin user
npx wrangler d1 execute linkedout-db --remote \
  --command "INSERT INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"
```

### Cloudflare Access Setup

1. Go to **Zero Trust Dashboard** → **Access** → **Applications**
2. Click **Add an Application** → **Self-hosted**
3. Configure:
   - **Application domain**: `your-worker.workers.dev` (or custom domain)
   - **Path**: `/dashboard` (or `/dashboard/*` for subpaths)
4. Add GitHub as an identity provider
5. Create a policy to allow authenticated users
6. **Important**: Enable "Send Cf-Access-JWT-Assertion header"

### Pipeline Setup

```bash
# Set your R2 API token
export R2_API_TOKEN="your_token_here"

# Create stream
npx wrangler pipelines streams create click_events_v6 \
  --schema-file schema.json \
  --http-enabled true \
  --http-auth false

# Create sink
npx wrangler pipelines sinks create click_events_sink_v6 \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table click_events_v6 \
  --catalog-token "$R2_API_TOKEN" \
  --compression zstd \
  --roll-size 100 \
  --roll-interval 300

# Create pipeline
npx wrangler pipelines create click_events_pipeline_v6 \
  --sql "INSERT INTO click_events_sink_v6 SELECT * FROM click_events_v6"

# Note the pipeline ID and update wrangler.jsonc
```

### Development

```bash
npm run dev         # Start dev server at localhost:8787
npm test            # Run tests
npm run deploy      # Deploy to production
```

## Project Structure

```
linkedout-pipelines/
├── src/
│   ├── index.tsx                 # Main Worker (Hono framework)
│   ├── types.ts                  # TypeScript interfaces
│   ├── middleware/
│   │   └── auth.ts              # Cloudflare Access auth middleware
│   ├── routes/
│   │   ├── dashboard.ts         # Dashboard & link management
│   │   ├── auth.ts              # Login/logout routes
│   │   └── tracking.ts          # Click tracking API
│   ├── utils/
│   │   ├── auth.ts              # Auth helpers
│   │   ├── db.ts                # D1 data access layer
│   │   ├── cloudflare-access.ts # JWT decoding
│   │   ├── helpers.ts           # Utility functions
│   │   └── map-data.ts          # World map data fetching
│   └── views/
│       ├── layouts.tsx          # Page layouts
│       └── leaflet-map.tsx      # Interactive map component
├── public/
│   ├── track.js                 # Client-side tracking
│   ├── qr.js                    # QR code functionality
│   └── theme-customizer.js      # Live preview for themes
├── migrations/
│   ├── 0001_initial_schema.sql  # Database schema
│   └── 0002_seed_themes.sql     # Default themes
├── truth-window/                # Development session logs
├── schema.json                  # Pipeline event schema
├── wrangler.jsonc              # Worker configuration
├── AGENTS.md                   # AI agent guidelines
└── README.md                   # This file
```

## Key Concepts Demonstrated

### 1. Event Streaming with Pipelines

Pipelines ingest high-volume event data without overwhelming downstream systems:

```typescript
// Write event to stream
await env.EVENT_STREAM.send([{
  timestamp: new Date().toISOString(),
  event_type: 'click',
  slug: 'my-talk',
  out: 'https://clicked-link.com',
  link_text: 'Read More',
  city: 'San Francisco',
  country: 'US'
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
  slug,
  event_type,
  COUNT(*) as event_count,
  city,
  country
FROM default.click_events_v6
WHERE event_type = 'click'
  AND slug IN ('talk-1', 'talk-2')
GROUP BY slug, event_type, city, country
ORDER BY event_count DESC
```

### 4. Zero Trust Authentication

Cloudflare Access provides seamless authentication:

```typescript
// Middleware extracts JWT from Cf-Access-Jwt-Assertion header
const userInfo = getUserFromAccessJWT(jwtHeader);

// Auto-create user on first login
if (!await getUser(userInfo.email)) {
  await createUser(userInfo.email, false);
}

// Set context for routes
c.set("userEmail", userInfo.email);
c.set("userName", userInfo.name);
c.set("isAdmin", user.is_admin);
```

### 5. Multi-Maintainer Collaboration

Junction table enables flexible permissions:

```sql
-- Add maintainer to link
INSERT INTO link_maintainers (link_slug, user_email, added_by)
VALUES ('my-talk', 'coworker@example.com', 'me@example.com');

-- Check if user can access link
SELECT COUNT(*) FROM link_maintainers
WHERE link_slug = 'my-talk' AND user_email = 'coworker@example.com';
```

## Why Cloudflare's Data Stack?

Traditional data pipelines require:
- Database servers to manage
- ETL jobs to maintain  
- Message queues to configure
- Analytics databases to scale
- Authentication servers to secure

Cloudflare's approach:
- ✅ **Serverless** - No servers to manage
- ✅ **Scalable** - Handles millions of events
- ✅ **Cost-effective** - Pay only for what you use
- ✅ **Simple** - Standard SQL, familiar patterns
- ✅ **Fast** - Global edge network, low latency
- ✅ **Secure** - Built-in Zero Trust authentication

## Technical Notes

### Pipeline Schema (v6)

Events are written with a defined schema ensuring proper column structure:

- `timestamp` (STRING) - Event timestamp
- `event_type` (STRING) - Type: page_view, click, qr_scan
- `slug` (STRING) - Outie slug
- `url` (STRING) - Page URL
- `out` (STRING) - Clicked link destination
- `link_text` (STRING) - Anchor text clicked
- `visitor_id` (STRING) - Anonymous visitor ID
- `user_agent` (STRING) - Browser user agent
- `referer` (STRING) - HTTP referer
- `country` (STRING) - Country code
- `city` (STRING) - City name
- `region` (STRING) - State/province
- `colo` (STRING) - Cloudflare data center
- `latitude` (STRING) - Geographic latitude
- `longitude` (STRING) - Geographic longitude
- `timezone` (STRING) - Timezone

### R2 SQL Limitations

- ⚠️ No `AS` aliases - use `row['count(*)']` instead of `row.count`
- ⚠️ `ORDER BY` only on partition keys - use `__ingest_ts`, not `timestamp`
- ⚠️ Limited `LIKE` patterns - no multiple `%`, must escape `_` as `\_`

### Authentication Flow

1. User visits `/dashboard` (protected by Access)
2. Cloudflare Access intercepts, shows GitHub OAuth
3. User authenticates with GitHub
4. Access issues JWT, adds `Cf-Access-Jwt-Assertion` header
5. Worker middleware decodes JWT, extracts email
6. Check D1 for user, create if first login
7. Set context variables for routes
8. Render dashboard

## Educational Use

This project is perfect for teaching:
- **Serverless Architecture** - Building apps without servers
- **Data Pipeline Design** - Streaming, batching, querying
- **Web Analytics** - How tracking actually works
- **Modern Data Stack** - Apache Iceberg, Parquet, SQL on object storage
- **Zero Trust Security** - Authentication without passwords
- **Collaborative Systems** - Multi-user permissions

## Deployment

```bash
# Deploy Worker
npm run deploy

# Your app will be at:
https://your-worker-name.workers.dev
```

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Quick setup guide
- **[AGENTS.md](./AGENTS.md)** - AI agent development guidelines
- **[truth-window/](./truth-window/)** - Development session logs
  - `09-cloudflare-access-github-auth.md` - Latest session (GitHub auth migration)
  - `08-d1-migration-progress.md` - D1 database migration
  - And more...

## Learn More

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/)
- [Pipelines Documentation](https://developers.cloudflare.com/pipelines/)
- [R2 Data Catalog](https://developers.cloudflare.com/r2/data-catalog/)
- [R2 SQL](https://developers.cloudflare.com/r2-sql/)
- [Apache Iceberg](https://iceberg.apache.org/)
- [Hono Framework](https://hono.dev/)

## Contributing

This is an educational demo project. Feel free to fork and modify for your own learning!

## License

MIT - Feel free to use this for educational purposes!

---

**Built with 🧡 using Cloudflare's serverless data stack**
