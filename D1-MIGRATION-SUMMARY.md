# LinkedOut D1 Migration - Implementation Summary

## Overview

This document provides a high-level summary of the D1 migration project. We're migrating from Cloudflare KV to D1 database, implementing a multi-maintainer system, adding theme support, and upgrading to Pipeline v6.

## Architecture Changes

### Before (KV-based)
```
┌─────────────────────────────────────────────────────────┐
│                      KV Namespaces                       │
├─────────────────────────────────────────────────────────┤
│  LINKS KV        │  USERS KV        │  AUTH_TOKENS KV   │
│  link:{slug}     │  user:{email}    │  {token}          │
└─────────────────────────────────────────────────────────┘

Links have:
- owner_email (single owner)
- custom_css (raw CSS)

Events have:
- owner_email field
```

### After (D1-based)
```
┌─────────────────────────────────────────────────────────┐
│                    D1 Database (DB)                      │
├──────────────┬──────────────┬──────────────┬────────────┤
│    users     │    links     │    themes    │ link_      │
│              │              │              │ maintainers│
└──────────────┴──────────────┴──────────────┴────────────┘
                                               ┌────────────┐
                                               │AUTH_TOKENS │
                                               │    (KV)    │
                                               └────────────┘

Links have:
- created_by (creator email)
- theme_id (FK to themes)
- Multiple maintainers via junction table

Events have:
- NO owner_email (slug only)
```

## Database Schema

### Tables Created

#### 1. `users`
```sql
- email (PK)
- is_admin (INTEGER)
- created_at (TEXT)
```

#### 2. `themes`
```sql
- id (PK)
- name
- description
- css_variables (JSON text)
- additional_css
- created_by (FK → users)
- is_public (INTEGER)
- created_at
```

#### 3. `links`
```sql
- slug (PK)
- title
- content
- theme_id (FK → themes, default 'default')
- created_by (FK → users)
- created_at
- updated_at
```

#### 4. `link_maintainers`
```sql
- link_slug (FK → links)
- user_email (FK → users)
- added_at
- added_by (FK → users)
- PRIMARY KEY (link_slug, user_email)
```

### Default Themes

6 pre-built themes are seeded:

1. **default** - Clean light theme with blue accents
2. **dark** - Dark mode with purple accents  
3. **minimal** - Typography-focused serif design
4. **colorful** - Vibrant gradient backgrounds
5. **conference** - Professional theme for talks
6. **retro** - Nostalgic 90s web styling

Each theme has 10 CSS variables:
- `--primary-color`
- `--background`
- `--text-color`
- `--link-color`
- `--link-hover-color`
- `--font-family`
- `--max-width`
- `--border-radius`
- `--spacing`
- `--secondary-background`

## Multi-Maintainer System

### How It Works

1. **Creator**: When a link is created, the creator becomes the first maintainer automatically
2. **Add Maintainers**: Any maintainer can add other registered users as maintainers
3. **Equal Permissions**: All maintainers have full edit/delete permissions (no roles)
4. **Junction Table**: Many-to-many relationship via `link_maintainers` table

### Use Cases

- **Conference Speaker**: Share maintenance with co-presenters
- **Team Links**: Multiple team members can update shared link pages
- **Backup**: Ensure links aren't orphaned if one person leaves

## Theme System

### How Themes Work

1. **Selection**: Users choose a theme when creating/editing a link
2. **CSS Variables**: Theme defines standard CSS variables
3. **Additional CSS**: Optional custom CSS for advanced styling
4. **Public vs Private**: Users can create private themes or share publicly

### Theme Application

When rendering `/out/{slug}`:
```typescript
// 1. Fetch link from D1
const link = await getLinkFromDB(db, slug);

// 2. Fetch theme
const theme = await getThemeFromDB(db, link.theme_id);

// 3. Generate CSS from theme.css_variables
const cssVars = Object.entries(theme.css_variables)
  .map(([key, value]) => `${key}: ${value};`)
  .join('\n');

// 4. Inject into page
const css = `:root { ${cssVars} } ${theme.additional_css}`;
```

## Pipeline v6 Migration

### Breaking Change

**Removed**: `owner_email` field from ClickEvent schema

**Why**: 
- Events should track user behavior, not ownership
- Multi-maintainer model makes single owner ambiguous
- Cleaner separation of concerns

### New Analytics Query Pattern

**Old (v5)**:
```sql
SELECT * FROM default.click_events_v5
WHERE owner_email = 'user@example.com'
```

**New (v6)**:
```sql
-- Step 1: Get user's accessible slugs from D1
const slugs = await getUserAccessibleSlugs(db, email); 
// Returns: ['slug1', 'slug2', 'slug3']

-- Step 2: Query with slug filter
SELECT * FROM default.click_events_v6
WHERE slug IN ('slug1', 'slug2', 'slug3')
```

### Pipeline Resources

New pipeline components to be created:
- **Stream**: `click_events_v6` (no owner_email field)
- **Sink**: `click_events_sink_v6` → `default.click_events_v6` table
- **Pipeline**: Maps stream to sink

Old v5 pipeline will continue running (dual operation during transition).

## API Changes

### D1 Data Access Layer (`src/utils/db.ts`)

Comprehensive query functions organized by domain:

#### User Operations
- `getUserFromDB(db, email)`
- `createUserInDB(db, email, isAdmin)`
- `deleteUserFromDB(db, email)`
- `getAllUsersFromDB(db)`

#### Link Operations
- `getLinkFromDB(db, slug)`
- `getLinkWithMaintainers(db, slug)` - includes maintainer list
- `createLinkInDB(db, link, maintainerEmail)` - auto-adds creator
- `updateLinkInDB(db, slug, updates)`
- `deleteLinkFromDB(db, slug)`
- `getUserLinks(db, email)` - all links user can access

#### Maintainer Operations
- `canUserAccessLink(db, slug, email)` - permission check
- `addMaintainerToDB(db, slug, email, addedBy)`
- `removeMaintainerFromDB(db, slug, email)`
- `getLinkMaintainers(db, slug)`
- `getUserAccessibleSlugs(db, email)` - for analytics

#### Theme Operations
- `getThemeFromDB(db, themeId)`
- `getAllThemesFromDB(db)`
- `getPublicThemesFromDB(db)`
- `getUserThemes(db, email)` - public + user's private themes
- `createThemeInDB(db, theme)`
- `updateThemeInDB(db, themeId, updates)`
- `deleteThemeInDB(db, themeId)`

### Auth Changes

Auth tokens still use KV (fast lookups), but user data is in D1:

```typescript
// Before
const user = await env.USERS.get(`user:${email}`);

// After
const user = await getUserFromDB(env.DB, email);
```

## Files Modified

### Created (4 files)
1. `migrations/0001_initial_schema.sql` - Database schema
2. `migrations/0002_seed_themes.sql` - Default themes
3. `src/utils/db.ts` - D1 data access layer (580 lines)
4. `truth-window/08-d1-migration-progress.md` - Session log

### Updated (7 files)
1. `wrangler.jsonc` - Added D1 binding, removed LINKS/USERS KV
2. `worker-configuration.d.ts` - Updated TypeScript bindings
3. `src/types.ts` - New interfaces (Theme, LinkWithMaintainers, LinkMaintainer)
4. `src/utils/auth.ts` - Uses D1 for user data
5. `src/routes/tracking.ts` - Removed owner_email from events
6. `schema.json` - Removed owner_email field (Pipeline v6)
7. `src/index.tsx` - D1 integration + theme CSS injection

### Pending (1 file)
1. `src/routes/dashboard.ts` - **IN PROGRESS** (major refactor needed)

## Testing Strategy

### Unit Tests
- Mock `env.DB` instead of KV namespaces
- Test D1 query functions in isolation
- Verify maintainer permission logic

### Integration Tests
1. Create user
2. Create link with theme
3. Add maintainer
4. Access link as maintainer
5. View analytics
6. Remove maintainer
7. Verify access denied

### Manual Testing Checklist
- [ ] Login flow works
- [ ] Create link with theme selection
- [ ] View link (theme applied correctly)
- [ ] Edit link (change theme)
- [ ] Add maintainer to link
- [ ] Access link as maintainer
- [ ] Remove maintainer
- [ ] Analytics shows correct data
- [ ] QR code generation/scanning
- [ ] Admin panel user management

## Deployment Plan

### Pre-Deployment
1. ✅ Apply D1 migrations (done)
2. ✅ Update all application code (in progress)
3. ⏳ Run tests
4. ⏳ Create Pipeline v6 resources

### Deployment Steps
```bash
# 1. Deploy updated Worker
npm run deploy

# 2. Verify deployment
curl https://linkedout-pipelines.craigsdemos.workers.dev/

# 3. Test login flow

# 4. Create test link with theme

# 5. Verify analytics work
```

### Post-Deployment
```bash
# After 24 hours of successful operation:

# Delete old KV namespaces (LINKS and USERS)
npx wrangler kv:namespace delete --namespace-id 5a77ea007d054a48921f86528e34ee10
npx wrangler kv:namespace delete --namespace-id bdeb64c984974283acdabf39461c5e12

# Keep AUTH_TOKENS KV namespace (still in use)
```

## Rollback Plan

If issues arise:

1. **Keep old KV namespaces** for 7 days (don't delete immediately)
2. **Pipeline v5 continues running** (parallel operation)
3. **D1 backup available**: `npx wrangler d1 backup create linkedout-db`

To rollback:
1. Restore KV bindings in wrangler.jsonc
2. Revert application code to use KV
3. Redeploy

## Performance Considerations

### D1 vs KV

**D1 Advantages**:
- Relational queries (JOINs for maintainers)
- Transactional integrity
- Better for complex queries
- No key prefix management

**KV Advantages**:
- Faster single-key lookups
- Global edge distribution
- Better for auth tokens

**Our Approach**:
- D1 for application data (users, links, themes)
- KV for auth tokens (high-frequency lookups)

### Analytics Query Performance

With multi-maintainer system:

**Scenario**: User has 100 links
1. Query D1 for slugs: ~10ms
2. Build `slug IN (...)` query: instant
3. Query R2 SQL: depends on data volume

**Optimization**: Cache slug list in KV with 5-min TTL (future enhancement)

## Security Considerations

### Theme Safety
- CSS variables prevent XSS (no raw user CSS in v1)
- Additional CSS field exists but could be sanitized later
- Default themes are system-controlled

### Permission Model
- All database access through typed functions
- Foreign key constraints enforce referential integrity
- No direct SQL in routes (all via db.ts functions)

### Multi-Maintainer Security
- Must be registered user to be added as maintainer
- Creator automatically becomes maintainer (no orphan links)
- Cascade deletes handle cleanup (user deleted → maintainer records deleted)

## Migration Timeline

| Phase | Status | Duration |
|-------|--------|----------|
| Planning & Design | ✅ Complete | 1 hour |
| D1 Setup & Migrations | ✅ Complete | 30 mins |
| TypeScript Types | ✅ Complete | 15 mins |
| Data Access Layer | ✅ Complete | 1.5 hours |
| Core Files Update | ✅ Complete | 1 hour |
| Dashboard Refactor | 🔄 In Progress | 2-3 hours |
| Theme Management UI | ⏳ Pending | 1-2 hours |
| Pipeline v6 Setup | ⏳ Pending | 30 mins |
| Testing | ⏳ Pending | 1 hour |
| **Total** | **67% Complete** | **~10-11 hours** |

## Key Decisions Made

1. **Clean slate**: Delete all existing data (it's test data)
2. **AUTH_TOKENS stays in KV**: Fast token lookups are critical
3. **Equal permissions**: All maintainers can do everything (no roles)
4. **Theme-only customization**: No raw CSS in v1 (security)
5. **Slug-based analytics**: Cleaner than owner_email filtering
6. **Pipeline v6**: Breaking change acceptable (fresh start)

## Next Steps

1. **Immediate**: Complete dashboard.ts refactor
2. **Then**: Create Pipeline v6 resources
3. **Then**: Add theme management UI
4. **Then**: Testing and deployment
5. **Finally**: Delete old KV namespaces (after validation)

## Questions & Answers

**Q: Why keep AUTH_TOKENS in KV?**  
A: Auth token lookups are high-frequency operations. KV is faster for single-key lookups and globally distributed.

**Q: Can maintainers remove each other?**  
A: Yes - all maintainers have equal permissions. This is intentional for simplicity.

**Q: What happens if all maintainers are removed?**  
A: Database foreign key constraints prevent removing the last maintainer (would cascade delete the link).

**Q: Can users see other users' private themes?**  
A: No - `getUserThemes()` only returns public themes OR themes created by that user.

**Q: What happens to old v5 pipeline data?**  
A: It remains queryable in `default.click_events_v5`. We're not deleting historical data.

---

## Resources

- **D1 Database ID**: `40b9890c-3dea-4165-aa87-a58355de955e`
- **Migration Files**: `migrations/000*.sql`
- **Data Access Layer**: `src/utils/db.ts`
- **Progress Log**: `truth-window/08-d1-migration-progress.md`
- **Wrangler Docs**: https://developers.cloudflare.com/d1/
