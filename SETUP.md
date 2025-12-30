# LinkedOut Setup Instructions

## Infrastructure Created

### R2 Buckets
- `linkedout-analytics` - For general analytics storage
- `linkedout-data-catalog` - For Apache Iceberg tables (Data Catalog enabled)
  - Catalog URI: `https://catalog.cloudflarestorage.com/51e28e9a83197a9f12a2e39f9477ba4e/linkedout-data-catalog`
  - Warehouse: `51e28e9a83197a9f12a2e39f9477ba4e_linkedout-data-catalog`

### Pipelines
- Stream: `click_events` (ID: `24253f4554714e1680ebfab5bdb64bad`)
  - HTTP Endpoint: `https://24253f4554714e1680ebfab5bdb64bad.ingest.cloudflare.com`
  - Authentication: Required
  - Input Schema: JSON

### KV Namespaces
- `LINKS` (ID: `5a77ea007d054a48921f86528e34ee10`) - Stores link content and metadata
- `USERS` (ID: `bdeb64c984974283acdabf39461c5e12`) - Stores user information
- `AUTH_TOKENS` (ID: `a4d40f72a26f4f6792a6f4bc8038a6b2`) - Stores authentication tokens

## Getting Started

Before you can use LinkedOut, you need to complete a few setup steps.

### 1. Create Your Admin User (REQUIRED FIRST)

Create yourself as the first admin user:

```bash
npx wrangler kv key put --binding USERS "user:your@email.com" \
  '{"email":"your@email.com","created_at":"2025-12-29T00:00:00.000Z","is_admin":true}' \
  --preview false
```

Replace `your@email.com` with your actual email address.

### 2. Create R2 API Token (REQUIRED)

You need to create an API token to allow the pipeline to write to R2 Data Catalog:

1. Go to [Cloudflare R2 Dashboard](https://dash.cloudflare.com/?to=/:account/r2/overview)
2. Click **Manage R2 API tokens**
3. Click **Create Account API token**
4. Name it: `linkedout-pipeline-token`
5. Under **Permissions**, choose **Admin Read & Write**
6. Click **Create Account API Token**
7. Copy the token value

### 3. Create Pipeline with Schema

The project includes a `schema.json` file that defines the event structure. Create the complete pipeline:

**Step 1: Create the stream with schema**
```bash
npx wrangler pipelines streams create click_events \
  --schema-file schema.json \
  --http-enabled true \
  --http-auth false
```

**Step 2: Create the sink**
```bash
npx wrangler pipelines sinks create click_events_sink \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table click_events_v2 \
  --catalog-token YOUR_TOKEN_HERE \
  --compression zstd \
  --roll-size 100 \
  --roll-interval 300
```

**Step 3: Create and connect the pipeline**
```bash
npx wrangler pipelines create click_events_pipeline \
  --sql "INSERT INTO click_events_sink SELECT * FROM click_events"
```

The pipeline will automatically connect the stream and sink. Note the stream ID from the output - you'll need it for `wrangler.jsonc`.

### 4. Update wrangler.jsonc

Update the pipeline ID in `wrangler.jsonc` with the stream ID from step 3:

```jsonc
"pipelines": [
  {
    "binding": "CLICK_STREAM",
    "pipeline": "YOUR_STREAM_ID_HERE"
  }
]
```

### 5. Store API Token as Secret

Store the R2 API token as a secret for querying R2 SQL:

```bash
npx wrangler secret put R2_API_TOKEN
# Paste your token when prompted
```

### 5. Configure Email Service

For magic link authentication, you'll need to configure an email service. Options:
- Resend (recommended for simplicity)
- Mailgun
- SendGrid

Store your email API key:

```bash
npx wrangler secret put EMAIL_API_KEY
```

## Development

1. **Create `.dev.vars` file** (for local R2 SQL queries):
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   
   Edit `.dev.vars` and add your R2 API token:
   ```
   R2_API_TOKEN=your_actual_token_here
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

## Deployment

```bash
npm run deploy
```

## Architecture

```
User clicks link → sendBeacon → Worker receives event
                                     ↓
                               CLICK_STREAM (Pipeline)
                                     ↓
                               click_events_sink
                                     ↓
                          R2 Data Catalog (Iceberg)
                                     ↓
                          R2 SQL Query on Dashboard
```
