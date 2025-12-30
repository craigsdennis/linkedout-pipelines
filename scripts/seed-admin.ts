/**
 * Seed script to create the first admin user
 * 
 * Usage:
 * npx wrangler kv key put --binding USERS "user:your@email.com" '{"email":"your@email.com","created_at":"2025-12-29T00:00:00.000Z","is_admin":true}' --preview false
 */

// This is just a template. Run the command above with your actual email.
console.log(`
To create an admin user, run:

npx wrangler kv key put --binding USERS "user:YOUR_EMAIL_HERE" '{"email":"YOUR_EMAIL_HERE","created_at":"${new Date().toISOString()}","is_admin":true}' --preview false

Example:
npx wrangler kv key put --binding USERS "user:craig@example.com" '{"email":"craig@example.com","created_at":"${new Date().toISOString()}","is_admin":true}' --preview false
`);
