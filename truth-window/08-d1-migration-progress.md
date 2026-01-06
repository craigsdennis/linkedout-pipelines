# D1 Migration Progress - Session 08

## Date
January 5, 2026

## Objective
Complete migration from KV to D1, implement multi-maintainer system, add theme support, and migrate to Pipeline v6 (removing owner_email from events).

## Progress Summary

### ✅ COMPLETED (8/18 tasks)

#### Phase 1: D1 Database Setup
1. ✅ Created D1 database `linkedout-db` (ID: `40b9890c-3dea-4165-aa87-a58355de955e`)
2. ✅ Created `migrations/0001_initial_schema.sql` with:
   - `users` table (email, is_admin, created_at)
   - `themes` table (id, name, description, css_variables JSON, additional_css, created_by, is_public, created_at)
   - `links` table (slug, title, content, theme_id, created_by, created_at, updated_at)
   - `link_maintainers` junction table (link_slug, user_email, added_at, added_by)
   - Indexes for performance optimization
3. ✅ Created `migrations/0002_seed_themes.sql` with 6 default themes:
   - `default` - Clean light theme with blue accents
   - `dark` - Dark mode with purple accents
   - `minimal` - Typography-focused serif design
   - `colorful` - Vibrant gradients
   - `conference` - Professional theme for talks
   - `retro` - Nostalgic 90s web styling
4. ✅ Applied migrations locally and remotely
5. ✅ Updated `wrangler.jsonc`:
   - Added D1 binding: `DB`
   - Removed `LINKS` and `USERS` KV bindings
   - Kept `AUTH_TOKENS` in KV (auth tokens stay in KV)

#### Phase 2: TypeScript Types
6. ✅ Updated `src/types.ts`:
   - Removed `owner_email` from `ClickEvent` (Pipeline v6 schema)
   - Updated `Link` interface: replaced `custom_css` with `theme_id`, `owner_email` with `created_by`
   - Added new interfaces: `Theme`, `LinkWithMaintainers`, `LinkMaintainer`
7. ✅ Updated `worker-configuration.d.ts`:
   - Replaced `LINKS` and `USERS` KV bindings with `DB: D1Database`

#### Phase 3: D1 Data Access Layer
8. ✅ Created `src/utils/db.ts` (580 lines) with comprehensive query functions:
   - **User ops**: `getUserFromDB`, `createUserInDB`, `deleteUserFromDB`, `getAllUsersFromDB`
   - **Link ops**: `getLinkFromDB`, `getLinkWithMaintainers`, `createLinkInDB`, `updateLinkInDB`, `deleteLinkFromDB`, `getUserLinks`
   - **Maintainer ops**: `canUserAccessLink`, `addMaintainerToDB`, `removeMaintainerFromDB`, `getLinkMaintainers`, `getUserAccessibleSlugs`
   - **Theme ops**: `getThemeFromDB`, `getAllThemesFromDB`, `getPublicThemesFromDB`, `getUserThemes`, `createThemeInDB`, `updateThemeInDB`, `deleteThemeFromDB`

#### Phase 4: Update Core Application Files
9. ✅ Updated `src/utils/auth.ts`:
   - Replaced `env.USERS.get()` with `getUserFromDB(env.DB, email)`
   - Replaced `env.USERS.put()` with `createUserInDB(env.DB, email, isAdmin)`
   - AUTH_TOKENS still uses KV (no changes needed)

10. ✅ Updated `src/routes/tracking.ts`:
    - Replaced `c.env.LINKS.get()` with `getLinkFromDB(c.env.DB, slug)`
    - Removed `owner_email` from ClickEvent

11. ✅ Updated `schema.json`:
    - Removed `owner_email` field completely (Pipeline v6 breaking change)
    - Schema now has 16 fields (was 17)

12. ✅ Updated `src/index.tsx` (public link viewing):
    - Replaced KV link fetching with `getLinkFromDB(c.env.DB, slug)`
    - Added theme fetching: `getThemeFromDB(c.env.DB, link.theme_id)`
    - Implemented CSS variable injection from themes
    - Removed `owner_email` from page_view events
    - Theme CSS generation: converts JSON CSS variables to `:root {}` CSS

### 🔄 IN PROGRESS (1/18 tasks)

#### Phase 5: Update Dashboard Routes
13. 🔄 **NEXT**: Update `src/routes/dashboard.ts` (1,264 lines) - **CRITICAL TASK**
    - This is the largest and most complex file
    - Must update ALL routes to use D1 instead of KV
    - Key changes needed:
      - `/dashboard` - Replace `c.env.LINKS.list()` with `getUserLinks(c.env.DB, email)`
      - `/admin` - Replace `c.env.USERS.list()` with `getAllUsersFromDB(c.env.DB)`
      - `/links/create` - Add theme selector, use `createLinkInDB()`
      - `/links/view/:slug` - Replace ownership check with `canUserAccessLink()`, show maintainers
      - `/links/edit/:slug` - Add theme selector
      - `/q/:slug` (QR scan) - Remove `owner_email` from qr_scan event
      - `/analytics` - **CRITICAL**: Replace `owner_email` filtering with slug-based filtering
        - For all user links: Use `getUserAccessibleSlugs()` then build `slug IN (...)` query
        - Update all analytics queries to use `default.click_events_v6` (not v5)

### ⏳ PENDING (9/18 tasks)

#### Phase 6: Theme Management UI (Medium Priority)
14. ⏳ Add theme management routes and pages:
    - `/themes` - List public themes and user's themes
    - `/themes/create` - Form to create new theme with CSS variable inputs
    - `/themes/edit/:id` - Edit existing theme
    - Theme selector in create/edit link forms

#### Phase 7: Pipeline v6 Creation
15. ⏳ Create new pipeline resources (breaking change from v5):
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
    ```

16. ⏳ Update `wrangler.jsonc` with new pipeline binding

17. ⏳ Update all analytics queries in dashboard.ts:
    - Change `default.click_events_v5` to `default.click_events_v6`
    - Remove all `owner_email = '${email}'` WHERE clauses
    - Replace with slug-based filtering using `getUserAccessibleSlugs()`

#### Phase 8: Testing & Deployment
18. ⏳ Run tests and fix failures:
    - Update test mocks to use D1 instead of KV
    - Mock `env.DB` in tests
    - Fix any breaking tests

19. ⏳ Deploy and verify:
    - `npm run deploy`
    - Test login flow
    - Create test link with theme
    - Verify analytics work with new schema
    - **THEN**: Delete old KV namespaces (LINKS and USERS)

## Key Architectural Changes

### Multi-Maintainer Model
- **OLD**: Each link has single `owner_email` field
- **NEW**: Each link has `created_by` + many-to-many `link_maintainers` table
- All maintainers have equal permissions (no roles)
- Creator is automatically added as first maintainer

### Theme System
- **OLD**: Links had optional `custom_css` raw CSS field
- **NEW**: Links reference themes via `theme_id` foreign key
- Themes store CSS as JSON variables + optional additional CSS
- Users can create private OR public themes
- 6 default system themes provided

### Analytics Architecture Change
- **OLD**: Query with `WHERE owner_email = 'user@example.com'`
- **NEW**: 
  1. Get user's accessible slugs from D1: `getUserAccessibleSlugs(email)`
  2. Build query: `WHERE slug IN ('slug1', 'slug2', 'slug3'...)`
  3. This allows multi-maintainer analytics properly

### Pipeline v6 Breaking Change
- **Removed field**: `owner_email` completely removed from ClickEvent schema
- **Reason**: Events should only track behavior, not ownership
- **Impact**: Must create new stream/sink/pipeline with new schema
- **Migration**: Old v5 data remains queryable, new v6 starts fresh

## Files Modified

### Created (3 files)
- `migrations/0001_initial_schema.sql`
- `migrations/0002_seed_themes.sql`
- `src/utils/db.ts`

### Modified (6 files)
- `wrangler.jsonc` - D1 binding, removed KV
- `worker-configuration.d.ts` - Updated type bindings
- `src/types.ts` - New interfaces
- `src/utils/auth.ts` - D1 integration
- `src/routes/tracking.ts` - D1 + removed owner_email
- `schema.json` - Removed owner_email field
- `src/index.tsx` - D1 + theme injection

### Pending Modification (1 file)
- `src/routes/dashboard.ts` - **NEEDS MAJOR REFACTOR**

## Current Issues

None - all completed work compiles successfully!

TypeScript errors in dashboard.ts are expected since it hasn't been updated yet.

## Next Steps (Immediate)

1. **Update dashboard.ts** - This is the critical path blocker
   - Systematic replacement of all KV operations with D1
   - Add maintainer management UI
   - Update analytics queries for slug-based filtering
   - Add theme selector to forms

2. **Create Pipeline v6** - After dashboard.ts is done
   - Run wrangler commands to create new pipeline
   - Update wrangler.jsonc binding
   - This will start collecting events with new schema

3. **Add Theme Management UI** - Can be done in parallel
   - New routes for theme CRUD operations
   - Theme selector dropdowns in link forms

4. **Testing** - Final validation
   - Update test mocks
   - Manual testing of all flows
   - Deploy to production

## Estimated Time Remaining

- Dashboard.ts refactor: **2-3 hours**
- Pipeline v6 setup: **30 minutes**
- Theme UI: **1-2 hours**
- Testing & deployment: **1 hour**
- **Total**: ~5-7 hours remaining

## Notes

- Clean slate approach: All existing data will be deleted (it's test data)
- AUTH_TOKENS deliberately stays in KV (fast token lookups)
- Theme CSS variables provide safe customization (no XSS risk)
- Slug-based analytics properly supports multi-maintainer model

---

## Commands Reference

### D1 Operations
```bash
# Apply migrations
npx wrangler d1 migrations apply linkedout-db --local
npx wrangler d1 migrations apply linkedout-db --remote

# Query database
npx wrangler d1 execute linkedout-db --command "SELECT * FROM themes"

# Backup
npx wrangler d1 backup create linkedout-db
```

### Pipeline v6 Creation (When Ready)
```bash
# 1. Create stream with updated schema
npx wrangler pipelines streams create click_events_v6 \
  --schema-file schema.json

# 2. Create sink
npx wrangler pipelines sinks create click_events_sink_v6 \
  --type r2-data-catalog \
  --bucket linkedout-data-catalog \
  --namespace default \
  --table click_events_v6

# 3. Create pipeline
npx wrangler pipelines create click_events_pipeline_v6 \
  --sql "INSERT INTO click_events_sink_v6 SELECT * FROM click_events_v6"

# 4. Update wrangler.jsonc with new pipeline ID
```

### Deploy
```bash
npm run deploy
```
