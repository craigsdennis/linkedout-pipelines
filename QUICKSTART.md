# Quick Start Guide

Follow these steps to get LinkedOut running locally.

## 1. Install Dependencies

```bash
npm install
```

## 2. Create Your Admin User

Replace `your@email.com` with your actual email address:

```bash
npx wrangler kv key put --binding USERS "user:your@email.com" \
  '{"email":"your@email.com","created_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'","is_admin":true}' \
  --preview false
```

## 3. Start the Development Server

```bash
npm run dev
```

The app will be available at http://localhost:8787

## 4. Test the Application

### Login Flow

1. Go to http://localhost:8787
2. Click "Login"
3. Enter your email address (the one you added as admin)
4. You'll see a magic link on screen (in production, this would be emailed)
5. Click the magic link to login

### Create a Link Page

1. From the dashboard, click "Create New Link"
2. Enter a slug (e.g., `my-first-talk`)
3. Add markdown content with links:
   ```markdown
   # My Talk Title
   
   Here are the resources from my talk:
   
   - [Cloudflare Workers](https://workers.dev)
   - [Hono Framework](https://hono.dev)
   - [TypeScript](https://typescriptlang.org)
   ```
4. Click "Create Link Page"

### View Your Link

1. Your link will be at: http://localhost:8787/out/my-first-talk
2. Open it in a new tab to see the rendered page
3. Click any of the links - they'll be tracked!

### Generate QR Code

1. From the link details page, click "View QR Code"
2. You'll see a QR code that redirects to your link page
3. Scanning the QR code will track it separately as a "qr_scan" event

### Add Other Users (Admin Only)

1. Go to the Admin panel (link in dashboard nav)
2. Enter an email address
3. Optionally check "Admin" to give them admin privileges
4. Click "Add User"

## 5. Deploy to Production

When you're ready to deploy:

```bash
npm run deploy
```

Your app will be deployed to `linkedout-pipelines.YOURSUBDOMAIN.workers.dev`

## Completing the Pipeline Setup

To enable analytics, you need to complete the pipeline sink configuration. See SETUP.md for detailed instructions on:

1. Creating the correct R2 API token
2. Configuring the pipeline sink
3. Connecting the stream to the sink
4. Querying data with R2 SQL

## Testing Without Pipeline

You can use the app fully without the pipeline configured - the only difference is:

- ✅ Link pages work
- ✅ Authentication works  
- ✅ QR codes work
- ✅ Click tracking events are written to the stream
- ❌ Analytics dashboard shows placeholder data (waiting for sink configuration)

Once the pipeline sink is configured, events will be queryable via R2 SQL!

## Troubleshooting

### "Access Denied" when logging in

Make sure you added your email as a user in step 2.

### Link page shows 404

Check that:
1. The slug matches what you created (lowercase, no spaces)
2. The link was successfully created (check the dashboard)

### Dev server won't start

Try:
```bash
npx wrangler login
npm run dev
```

### Types are out of sync

Regenerate types:
```bash
npm run cf-typegen
```

## Next Steps

- Read [README.md](./README.md) for architectural details
- Read [SETUP.md](./SETUP.md) for complete pipeline setup
- Check out the [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
