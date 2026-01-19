# Quick Start Guide

Get LinkedOut running in under 10 minutes!

## Prerequisites

- Cloudflare account ([sign up free](https://dash.cloudflare.com/sign-up))
- Node.js 18+
- GitHub account (for authentication)

## 1. Clone & Install

```bash
git clone https://github.com/yourusername/linkedout-pipelines
cd linkedout-pipelines
npm install
npx wrangler login
```

## 2. Create Database

```bash
# Create D1 database
npx wrangler d1 create linkedout-db

# Copy the database_id from output and update wrangler.jsonc:
# [[d1_databases]]
# binding = "DB"
# database_name = "linkedout-db"
# database_id = "YOUR_DATABASE_ID_HERE"

# Apply migrations
npx wrangler d1 migrations apply linkedout-db --remote
```

## 3. Create Your Admin User

```bash
# Replace with your actual email
npx wrangler d1 execute linkedout-db --remote \
  --command "INSERT INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"
```

## 4. Setup Cloudflare Access

This is required for authentication to work:

1. Go to [Zero Trust Dashboard](https://one.dash.cloudflare.com/) → **Access** → **Applications**
2. Click **Add an Application** → **Self-hosted**
3. **Application Configuration:**
   - Name: `LinkedOut`
   - Session Duration: `24 hours` (or your preference)
   - Application domain: `your-subdomain.workers.dev` (you'll get this after first deploy)
   - Path: `/dashboard`
4. **Add GitHub Identity Provider** (if not already added):
   - Go to **Settings** → **Authentication** → **Add new**
   - Select **GitHub**
   - Follow GitHub OAuth app setup
5. **Create Access Policy:**
   - Policy name: `Allow GitHub Users`
   - Action: `Allow`
   - Configure rule: `Emails` → Your email (or use GitHub org rule)
6. **Important**: In Application settings, ensure **"Send Cf-Access-JWT-Assertion header"** is enabled

## 5. Deploy Worker

```bash
npm run deploy
```

Your app will be deployed to: `https://linkedout-pipelines.your-subdomain.workers.dev`

## 6. Update Cloudflare Access Domain

Now that you have your Worker URL, go back to Cloudflare Access and update the application domain to match your actual Worker URL.

## 7. Test Authentication

1. Visit `https://your-worker-url.workers.dev/dashboard`
2. You'll be redirected to GitHub OAuth
3. Authenticate with GitHub
4. You should see your dashboard!

## 8. Create Your First Outie

1. Click **Create New Outie**
2. Enter a slug: `my-first-talk`
3. Choose a theme: `Default` (or try others!)
4. Add markdown content:
   ```markdown
   # Welcome to My Talk
   
   Here are the resources I mentioned:
   
   - [Cloudflare Workers](https://workers.dev)
   - [Hono Framework](https://hono.dev)
   - [TypeScript](https://typescriptlang.org)
   ```
5. Click **Create Outie**

## 9. View Your Outie

Visit: `https://your-worker-url.workers.dev/out/my-first-talk`

Try:
- Click on the links (they'll be tracked!)
- Press `Q` to see the QR code
- Download the QR code as PNG

## 10. Setup Analytics Pipeline (Optional)

For analytics to work, you need to setup a Pipeline. This is optional but recommended.

### Create R2 Bucket & API Token

```bash
# Create bucket with Data Catalog enabled
npx wrangler r2 bucket create linkedout-data-catalog --jurisdiction eu

# Create R2 API token at: https://dash.cloudflare.com/r2/api-tokens
# Save the token value
export R2_API_TOKEN="your_token_here"

# Store as Worker secret
npx wrangler secret put R2_API_TOKEN
# Paste your token when prompted
```

### Create Pipeline Components

```bash
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

# Get the pipeline ID
npx wrangler pipelines list
```

### Update Configuration

Update `wrangler.jsonc` with the pipeline ID:

```jsonc
{
  "pipelines": [
    {
      "binding": "EVENT_PIPELINE",
      "pipeline": "your-pipeline-id-here"
    }
  ],
  "vars": {
    "ACCOUNT_ID": "your-account-id"
  }
}
```

### Redeploy

```bash
npm run deploy
```

### Wait for Data

- Click some links in your outie
- Wait 5-10 minutes (pipeline batches every 300 seconds)
- Go to Dashboard → Analytics
- You should see click data!

## Common Issues

### "No valid Cloudflare Access JWT found"

- Make sure Cloudflare Access is configured for your Worker URL
- Verify the application path is `/dashboard` or `/dashboard/*`
- Check that "Send Cf-Access-JWT-Assertion header" is enabled
- Try logging out and back in: visit `/logout` then `/dashboard`

### "User not found" or "Access denied"

- Make sure you created your user in step 3
- Verify the email matches what GitHub returns
- Check with: `npx wrangler d1 execute linkedout-db --remote --command "SELECT * FROM users"`

### Redirect loop between /login and /dashboard

- This should be fixed in the latest version
- Try visiting `/login` directly - you should see a landing page with a button
- If loop persists, check Cloudflare Access configuration

### Analytics showing "No data yet"

- Pipeline takes 5-10 minutes to batch and write data
- Make sure you completed step 10 (Pipeline setup)
- Check Worker logs: `npx wrangler tail`
- Verify R2 API token is set: `npx wrangler secret list`

### Markdown preview not working

- Check browser console for errors
- Should be calling `/dashboard/api/preview`
- Try refreshing the page

## Development Commands

```bash
npm run dev              # Local dev server (http://localhost:8787)
npm test                 # Run tests
npm run deploy           # Deploy to production
npx tsc --noEmit         # Type check
npx wrangler tail        # View live logs
npx wrangler d1 execute  # Run SQL commands
```

## Next Steps

- **Add maintainers**: Share link ownership with co-presenters
- **Try different themes**: Edit an outie and change the theme
- **Explore analytics**: Filter by slug, view geographic data
- **Create more outies**: Each talk/presentation gets its own
- **Customize themes**: Create your own theme with CSS variables (coming soon)

## Learn More

- [README.md](./README.md) - Complete documentation
- [AGENTS.md](./AGENTS.md) - AI agent guidelines for development
- [truth-window/](./truth-window/) - Development session logs

## Get Help

- Check [truth-window/09-cloudflare-access-github-auth.md](./truth-window/09-cloudflare-access-github-auth.md) for auth troubleshooting
- Review Worker logs: `npx wrangler tail`
- Check D1 data: `npx wrangler d1 execute linkedout-db --remote --command "SELECT * FROM users"`

Happy sharing! 🚀
