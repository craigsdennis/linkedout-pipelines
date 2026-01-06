# Admin User Setup

LinkedOut has open registration - anyone can create an account and links. However, certain administrative functions (like viewing all users and deleting spam accounts) require admin privileges.

## Creating the First Admin

Since everyone starts as a regular user, you need to manually promote someone to admin using the D1 database.

### Option 1: Using the Seed Script (Easiest)

```bash
npm run seed-admin your@email.com
```

This will show you the commands to run. Then execute the production command:

```bash
npx wrangler d1 execute linkedout-db --remote --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"
```

### Option 2: Promote an Existing User

If the user already exists (logged in at least once):

```bash
npx wrangler d1 execute linkedout-db --remote --command "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com'"
```

### Option 3: Direct SQL

```bash
# Local development database
npx wrangler d1 execute linkedout-db --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"

# Production database (add --remote)
npx wrangler d1 execute linkedout-db --remote --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"
```

## Verify Admin Status

```bash
npx wrangler d1 execute linkedout-db --remote --command "SELECT email, is_admin FROM users WHERE is_admin = 1"
```

## Admin Panel Access

Once you're an admin:
1. Log in to LinkedOut
2. Go to `/admin`
3. You can now:
   - View all users
   - Add new users manually
   - Promote users to admin
   - Delete users (useful for spam/abuse)

## Admin Features

### User Management
- **View All Users**: See everyone registered
- **Add User**: Manually create a user account (with optional admin promotion)
- **Delete User**: Remove spam/abusive users
- **Promote to Admin**: Give admin privileges to trusted users

### Link Access
- Admins have the same link permissions as regular users
- Admins cannot automatically access other users' links (by design)
- Use the maintainer system to collaborate on links

## Security Notes

- Admin privileges are stored in the `users` table (`is_admin` column)
- Admin status persists across sessions
- Only admins can access the `/admin` panel
- Regular users get 403 if they try to access admin routes
