# Session 09: Cloudflare Access GitHub Authentication Migration

**Date:** 2026-01-06  
**Status:** ✅ Complete  
**Branch:** `explore-github`

## Overview

Migrated LinkedOut authentication from magic links (KV-based) to Cloudflare Access with GitHub as the identity provider. Fixed multiple issues with redirect loops, JWT parsing, missing `name` field, and broken client-side preview functionality.

---

## Problems Solved

### 1. Infinite Redirect Loop (Login ↔ Dashboard)
**Symptom:** Visiting `/login` → redirects to `/dashboard` → no JWT → redirects back to `/login` → infinite loop

**Root Cause:** `/login` route was doing immediate `redirect("/dashboard")`, and when JWT validation failed, it tried to redirect back.

**Solution:**
- Changed `/login` to show a landing page with a button
- User must click "Continue to Dashboard" to proceed
- Breaks the automatic redirect cycle
- `authMiddleware` returns 401 error page instead of redirecting

**Files Changed:**
- `src/routes/auth.ts` - Changed `/login` from redirect to HTML page
- `src/middleware/auth.ts` - Return error page, no redirect

---

### 2. JWT Missing `name` Field
**Symptom:** JWT present in headers but validation failing with "No valid Cloudflare Access JWT found"

**Root Cause:** Cloudflare Access JWT from GitHub only contains:
```json
{
  "email": "craig@cloudflare.com",
  "sub": "dddf6adc-b294-5e4a-bd1b-28a3af1bf4d6",
  "country": "US",
  // NO "name" field!
}
```

Our code required both `email` AND `name`, causing validation to fail.

**Solution:**
- Made `name` field optional in `CloudflareAccessJWT` interface
- Added fallback: derive name from email username (e.g., "craig" from "craig@cloudflare.com")
- Updated validation to only require `email`

**Files Changed:**
- `src/utils/cloudflare-access.ts` - Made `name` optional, added fallback logic

---

### 3. Broken Markdown Preview
**Symptom:** "Show Preview" button not working when creating/editing outies

**Root Cause:** Client-side JavaScript calling `/api/preview` but endpoint moved to `/dashboard/api/preview` after route restructure

**Solution:**
- Updated `fetch()` call in theme-customizer.js to use correct path

**Files Changed:**
- `public/theme-customizer.js` - Changed `/api/preview` → `/dashboard/api/preview`

---

### 4. Broken Analytics Links
**Symptom:** Analytics filter links returning 404

**Root Cause:** Multiple places had `/analytics?slug=...` instead of `/dashboard/analytics?slug=...`

**Solution:**
- Fixed 3 locations with hardcoded `/analytics` links

**Files Changed:**
- `src/routes/dashboard.ts` - Updated analytics links in:
  - Dashboard main page (📊 Analytics button per outie)
  - Link view page (View Analytics button)
  - Analytics page (📊 Filter links in top pages table)

---

## Authentication Flow (Before vs After)

### OLD Flow (Magic Links)
1. User visits `/login`
2. Enters email, receives magic link
3. Clicks magic link with token
4. Token validated against KV store
5. Session created

### NEW Flow (Cloudflare Access + GitHub)
1. User visits `/login` → sees landing page
2. Clicks "Continue to Dashboard"
3. Cloudflare Access intercepts request
4. User authenticates via GitHub OAuth
5. Access issues JWT, adds to `Cf-Access-Jwt-Assertion` header
6. Worker receives request with JWT
7. `authMiddleware` decodes JWT, extracts email/name
8. Checks D1 for user, creates if first login
9. Sets context variables: `userEmail`, `userName`, `isAdmin`
10. Dashboard loads

---

## Cloudflare Access Configuration

### Required Settings
- **Application Type:** Self-hosted
- **Domain:** `linkedout-pipelines.craigsdemos.workers.dev`
- **Path:** `/dashboard` (or `/dashboard/*` for subpaths)
- **Identity Provider:** GitHub
- **Policy:** Allow authenticated users
- **JWT Header:** Must enable "Send Cf-Access-JWT-Assertion header"

### Team Domain
- `craigsone.cloudflareaccess.com`
- Logout URL: `https://craigsone.cloudflareaccess.com/cdn-cgi/access/logout`

---

## JWT Structure

### Headers Received
```
Cf-Access-Jwt-Assertion: eyJhbGciOiJSUzI1NiIsImtpZCI6...
Cf-Access-Authenticated-User-Email: craig@cloudflare.com
```

### Decoded Payload
```json
{
  "aud": ["76aace0b992c4a9320..."],
  "email": "craig@cloudflare.com",
  "exp": 1767837390,
  "iat": 1767750990,
  "nbf": 1767750990,
  "iss": "https://craigsone.cloudflareaccess.com",
  "type": "app",
  "identity_nonce": "S3VU5FpyK6qXyVUo",
  "sub": "dddf6adc-b294-5e4a-bd1b-28a3af1bf4d6",
  "device_id": "4aacab6a-9deb-11ee-86cd-264463ac17d6",
  "country": "US"
}
```

**Note:** No `name` field - must derive from `email` or `sub`

---

## Route Structure

### Public Routes (No Auth)
- `/` - Homepage with map
- `/out/:slug` - View outie page
- `/q/:slug` - QR code tracking redirect
- `/login` - Landing page with "Continue to Dashboard" button
- `/logout` - Redirects to Access logout URL
- `/api/track` - Client-side click tracking (used by track.js)

### Authenticated Routes (`/dashboard/*`)
All require JWT from Cloudflare Access:
- `/dashboard` - Main dashboard (user's outies)
- `/dashboard/links/create` - Create new outie
- `/dashboard/links/view/:slug` - View/manage outie
- `/dashboard/links/:slug/edit` - Edit outie
- `/dashboard/analytics` - Analytics page (filterable by slug)
- `/dashboard/api/preview` - Markdown preview endpoint (POST)
- `/dashboard/debug-headers` - Debug endpoint (shows JWT status)

### Admin-Only Routes
Require `is_admin = 1` in D1:
- `/dashboard/admin` - Admin panel (user management, map)
- `/dashboard/admin/promote` - Make user admin (POST)
- `/dashboard/admin/demote` - Revoke admin (POST)
- `/dashboard/admin/delete-user` - Delete user (POST)
- `/dashboard/admin/clear-map-cache` - Refresh map cache (POST)

---

## Context Variables

Routes have access to these after `authMiddleware`:
```typescript
c.get("userEmail")  // string: "craig@cloudflare.com"
c.get("userName")   // string: "craig" (derived from email)
c.get("isAdmin")    // boolean: from D1 users.is_admin
```

---

## Client-Side Scripts Audit

### ✅ Verified Correct
- **track.js** - Uses `/api/track` (mounted at root, correct for public pages)
- **qr.js** - No API calls, just DOM manipulation
- **theme-customizer.js** - Fixed to use `/dashboard/api/preview`

### Static Assets (All Correct)
- `/styles.css`
- `/favicon.png`
- `/track.js`
- `/qr.js`

---

## Database Changes

### Users Table (No Schema Changes)
```sql
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT
);
```

**Note:** No `name` or `last_login` columns. Name comes from JWT each request.

### First Login Flow
1. JWT decoded, email extracted
2. `getUser(email)` → returns null (first time)
3. `createUser(email, is_admin=false)` → inserts into D1
4. User can now access dashboard

---

## Removed Features

### Magic Links (Deprecated)
- ❌ `/login` POST endpoint (email submission)
- ❌ `/verify` route (token validation)
- ❌ `AUTH_TOKENS` KV namespace usage for auth
- ❌ Console-logged magic links

**Note:** `AUTH_TOKENS` KV namespace still exists but is unused (could be removed or repurposed)

### Debug Routes (Removed)
- ❌ `/debug/pipeline`
- ❌ `/debug/r2sql`

**Note:** `/dashboard/debug-headers` added as replacement for debugging JWT

---

## Files Modified

### New Files
- `src/utils/cloudflare-access.ts` - JWT decoding utilities
- `truth-window/09-cloudflare-access-github-auth.md` - This document

### Modified Files
- `src/middleware/auth.ts` - New JWT-based auth, improved error page
- `src/routes/auth.ts` - Changed `/login` to landing page
- `src/routes/dashboard.ts` - Added debug endpoint, fixed analytics links
- `src/index.tsx` - Route mounting structure
- `src/views/layouts.tsx` - Shows `userName`, updated nav
- `src/views/layouts.test.ts` - Updated tests
- `public/theme-customizer.js` - Fixed preview API path

---

## Testing

### Manual Testing Checklist
- [x] `/login` shows landing page (no redirect loop)
- [x] `/dashboard` requires authentication
- [x] GitHub OAuth flow works
- [x] JWT decoded successfully (email extracted)
- [x] First-time user auto-created in D1
- [x] Display name derived from email ("craig")
- [x] `/dashboard/debug-headers` shows JWT present
- [x] Markdown preview works when creating/editing
- [x] Analytics filter links work
- [x] Admin promotion/demotion works
- [x] Map refresh works
- [x] All navigation links work

### Automated Tests
```bash
npm test
# ✅ 93/93 tests passing
```

### Type Checking
```bash
npx tsc --noEmit
# ✅ No errors
```

---

## Deployment

### Commands Used
```bash
npm test              # Verify tests pass
npx tsc --noEmit      # Type check
npm run deploy        # Deploy to Cloudflare Workers
```

### Deployment History
1. `b2843694` - Added debug endpoint
2. `e71c5490` - Fixed JWT name field issue
3. `8b7ddd4e` - Fixed analytics links
4. `bef31b42` - Fixed markdown preview

### Current Deployment
- **URL:** https://linkedout-pipelines.craigsdemos.workers.dev
- **Version ID:** `bef31b42-ee80-4b75-8ce1-3b62bbc26adb`
- **Branch:** `explore-github`
- **Status:** ✅ Live and working

---

## Known Issues & Limitations

### Display Name Limitation
- GitHub identity doesn't provide full name in JWT
- Currently using email username as display name ("craig")
- Could be improved by:
  - Adding `name` column to D1, letting users customize
  - Fetching from GitHub API after first login
  - Using GitHub username instead of email username

### Session Management
- Session duration controlled by Cloudflare Access settings
- No custom session timeout in Worker
- JWT validation happens on every request (stateless)

### KV Namespace Cleanup
- `AUTH_TOKENS` KV namespace still exists but unused
- Could be deleted or repurposed for other features
- Currently harmless (just takes up binding slot)

---

## Future Improvements

### Authentication
1. Add `name` field to users table (editable profile)
2. Add `last_login` timestamp tracking
3. Fetch GitHub username via API for better display names
4. Add session activity logging

### User Management
1. Build user profile edit page
2. Add email notification system (optional)
3. Add OAuth scope requests (if needed for GitHub data)
4. Support multiple identity providers (Google, email, etc.)

### Admin Features
1. Add user activity dashboard
2. Add bulk user operations
3. Add audit log for admin actions
4. Add user impersonation for support

---

## Debugging Tips

### No JWT Found
1. Check Cloudflare Access is configured
2. Verify application protects `/dashboard/*`
3. Check "Send Cf-Access-JWT-Assertion header" is enabled
4. Visit `/dashboard/debug-headers` to see headers

### JWT Present But Auth Fails
1. Check Worker logs: `npx wrangler tail`
2. Look for JWT decoding errors
3. Verify JWT not expired
4. Check `email` field is present in payload

### User Not Created
1. Check D1 database: `npx wrangler d1 execute linkedout-db --remote --command "SELECT * FROM users"`
2. Check Worker logs for `createUser` errors
3. Verify D1 binding is correct

### Redirect Loop
1. Should be fixed (landing page breaks loop)
2. If still happening, check `/login` isn't redirecting
3. Verify `authMiddleware` returns 401, not redirect

---

## Architecture Notes

### Middleware Chain
```
Request → Cloudflare Access (if /dashboard/*) → Worker receives request
  ↓
authMiddleware: decode JWT, check/create user, set context
  ↓
Route handler: access userEmail, userName, isAdmin from context
  ↓
Response
```

### Stateless Authentication
- No sessions stored in KV/D1
- JWT validated on every request
- User info cached in request context only
- D1 user lookup on every request (could add caching)

### Security Model
- Cloudflare Access validates JWT signature
- Worker trusts Access (no signature verification needed)
- Worker only decodes and extracts payload
- Admin authorization checked server-side via D1

---

## Links & References

### Cloudflare Docs
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/)
- [JWT Structure](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Workers D1](https://developers.cloudflare.com/d1/)

### GitHub
- [Repository](https://github.com/craigsdennis/linkedout-pipelines)
- [Branch](https://github.com/craigsdennis/linkedout-pipelines/tree/explore-github)

---

## Summary

Successfully migrated from magic link authentication to Cloudflare Access with GitHub OAuth. Fixed multiple issues including redirect loops, JWT parsing, missing name fields, broken markdown preview, and incorrect analytics links. All tests passing, deployed and working in production.

**Key Takeaway:** When migrating authentication systems, test the happy path AND edge cases (missing JWT fields, route changes, client-side API calls). The JWT `name` field issue was subtle but critical - always validate actual JWT structure from identity provider, don't assume based on documentation.
