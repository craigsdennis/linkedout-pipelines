/**
 * Seed script to create or promote an admin user in D1
 * 
 * Usage (local):
 *   npx wrangler d1 execute linkedout-db --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)')"
 * 
 * Usage (remote/production):
 *   npx wrangler d1 execute linkedout-db --remote --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)')"
 * 
 * Or to promote an existing user:
 *   npx wrangler d1 execute linkedout-db --remote --command "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com'"
 */

const adminEmail = process.argv[2];

if (!adminEmail) {
  console.log(`
⚠️  No email provided.

USAGE:
  npm run seed-admin your@email.com

Or run directly:

  # Create new admin (local):
  npx wrangler d1 execute linkedout-db --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"

  # Create new admin (production):
  npx wrangler d1 execute linkedout-db --remote --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('your@email.com', 1, datetime('now'))"

  # Promote existing user to admin (production):
  npx wrangler d1 execute linkedout-db --remote --command "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com'"

VERIFY:
  npx wrangler d1 execute linkedout-db --remote --command "SELECT email, is_admin FROM users WHERE is_admin = 1"
`);
  process.exit(1);
}

console.log(`
To make ${adminEmail} an admin, run ONE of these commands:

LOCAL (development):
  npx wrangler d1 execute linkedout-db --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('${adminEmail}', 1, datetime('now'))"

REMOTE (production):
  npx wrangler d1 execute linkedout-db --remote --command "INSERT OR REPLACE INTO users (email, is_admin, created_at) VALUES ('${adminEmail}', 1, datetime('now'))"

Or if user exists, just promote them:
  npx wrangler d1 execute linkedout-db --remote --command "UPDATE users SET is_admin = 1 WHERE email = '${adminEmail}'"

Verify it worked:
  npx wrangler d1 execute linkedout-db --remote --command "SELECT email, is_admin FROM users WHERE email = '${adminEmail}'"
`);
