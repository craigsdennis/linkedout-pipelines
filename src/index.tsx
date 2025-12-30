import { Hono } from "hono";
import { marked } from "marked";
import { stripIndents } from "common-tags";
import { jsxRenderer } from "hono/jsx-renderer";
import { getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import type { ClickEvent, Link } from "./types";
import {
  verifyToken,
  getUser,
  createAuthToken,
  isUserAuthorized,
  createUser,
} from "./utils/auth";

type Variables = {
  userEmail: string;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Helper to extract Cloudflare request metadata
function getCfProperties(request: Request): Partial<ClickEvent> {
  const cf = (request as any).cf;
  if (!cf) return {};
  
  return {
    country: cf.country || undefined,
    city: cf.city || undefined,
    region: cf.region || cf.regionCode || undefined,
    colo: cf.colo || undefined,
    latitude: cf.latitude || undefined,
    longitude: cf.longitude || undefined,
    timezone: cf.timezone || undefined,
  };
}

// Middleware to check authentication
const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, "auth_token");
  if (!token) {
    return c.redirect("/login");
  }

  const email = await verifyToken(token);
  if (!email) {
    return c.redirect("/login");
  }

  c.set("userEmail", email);
  await next();
};

// Public link viewing page with tracking
app.get(
  "/out/*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <title>LinkedOut</title>
          <script src="/track.js" defer></script>
          <style>
            {`
              body {
                max-width: 800px;
                margin: 40px auto;
                padding: 0 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              a {
                color: #0066cc;
                text-decoration: none;
              }
              a:hover {
                text-decoration: underline;
              }
            `}
          </style>
        </head>
        <body>
          <div>{children}</div>
        </body>
      </html>
    );
  })
);

app.get("/out/:slug", async (c) => {
  const { slug } = c.req.param();

  // Get link from KV
  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("<h1>404 - Link not found</h1>", 404);
  }

  const link: Link = JSON.parse(linkStr);
  const html = await marked(link.content);

  // Generate QR code for this page
  const qrTrackUrl = `${new URL(c.req.url).origin}/q/${slug}`;
  const qrSvg = await QRCode.toString(qrTrackUrl, {
    type: 'svg',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  // Track page view
  const pageViewEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: c.req.url,
    out: null,
    slug: link.slug,
    owner_email: link.owner_email,
    user_agent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    event_type: "page_view",
    ...getCfProperties(c.req.raw),
  };

  // Write to pipeline (await to ensure delivery)
  console.log("Sending page_view event:", JSON.stringify(pageViewEvent));
  try {
    await c.env.CLICK_STREAM.send([pageViewEvent]);
    console.log("page_view event sent successfully");
  } catch (err) {
    console.error("Failed to send page_view event:", err);
    console.error("Event was:", JSON.stringify(pageViewEvent));
  }

  return c.render(
    <>
      <article dangerouslySetInnerHTML={{ __html: html }} />
      {link.custom_css && <style>{link.custom_css}</style>}
      <div id="qr-modal" class="qr-modal" onclick="if(event.target === this) hideQR()">
        <button class="qr-modal-close" onclick="hideQR()">×</button>
        <div class="qr-modal-content">
          <h2>Share this page</h2>
          <div id="qr-code-container" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p style="font-size: 14px; color: #666; word-break: break-all; margin: 20px 0;">
            {c.req.url}
          </p>
          <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn" onclick="downloadQR()">Download PNG</button>
            <button class="btn btn-secondary" onclick="hideQR()">Close (Q or ESC)</button>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .qr-modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        .qr-modal.show {
          display: flex;
        }
        .qr-modal-content {
          background: white;
          padding: 40px;
          border-radius: 8px;
          text-align: center;
          max-width: 500px;
        }
        #qr-code-container {
          margin: 20px 0;
          display: flex;
          justify-content: center;
        }
        #qr-code-container svg {
          max-width: 100%;
          height: auto;
        }
        .qr-modal-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: white;
          border: none;
          font-size: 24px;
          cursor: pointer;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          line-height: 40px;
        }
        .btn {
          padding: 10px 20px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        .btn:hover {
          background: #0052a3;
        }
        .btn-secondary {
          background: #666;
        }
        .btn-secondary:hover {
          background: #555;
        }
        @media print {
          body > *:not(#qr-modal) {
            display: none !important;
          }
          #qr-modal {
            display: flex !important;
            background: white !important;
            position: static !important;
          }
          .qr-modal-close, .btn {
            display: none !important;
          }
        }
      ` }} />
      <script dangerouslySetInnerHTML={{ __html: `
        function showQR() {
          document.getElementById('qr-modal').classList.add('show');
        }
        function hideQR() {
          document.getElementById('qr-modal').classList.remove('show');
        }
        function downloadQR() {
          const svg = document.querySelector('#qr-code-container svg');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const svgData = new XMLSerializer().serializeToString(svg);
          const img = new Image();
          canvas.width = 400;
          canvas.height = 400;
          img.onload = function() {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 400, 400);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function(blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'qr-${slug}.png';
              a.click();
              URL.revokeObjectURL(url);
            });
          };
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }
        document.addEventListener('keydown', function(e) {
          if (e.key === 'q' || e.key === 'Q') {
            const modal = document.getElementById('qr-modal');
            if (modal.classList.contains('show')) {
              hideQR();
            } else {
              showQR();
            }
          }
          if (e.key === 'Escape') {
            hideQR();
          }
        });
      ` }} />
    </>
  );
});

// API endpoint for tracking clicks
app.post("/api/track", async (c) => {
  const payload = await c.req.json<{
    url: string;
    out: string | null;
  }>();

  // Extract slug from URL
  const url = new URL(payload.url);
  const match = url.pathname.match(/^\/out\/([^/]+)/);
  if (!match) {
    return c.body(null, 204);
  }

  const slug = match[1];
  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.body(null, 204);
  }

  const link: Link = JSON.parse(linkStr);

  const clickEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: payload.url,
    out: payload.out,
    slug: link.slug,
    owner_email: link.owner_email,
    user_agent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    event_type: "click",
    ...getCfProperties(c.req.raw),
  };

  // Write to pipeline
  await c.env.CLICK_STREAM.send([clickEvent]);

  return c.body(null, 204);
});

// Home page
app.get("/", async (c) => {
  const token = getCookie(c, "auth_token");
  let email: string | null = null;

  if (token) {
    email = await verifyToken(token);
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>LinkedOut - Share Links, Track Clicks</title>
        <style>
          body {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
          }
          .hero {
            text-align: center;
            padding: 60px 0;
          }
          .cta {
            display: inline-block;
            padding: 12px 24px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 10px;
          }
          .cta:hover {
            background: #0052a3;
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <h1>LinkedOut</h1>
          <p>Share links after talks and track engagement with Cloudflare's Data Stack</p>
          ${
            email
              ? `<p>Logged in as: ${email}</p>
                 <a href="/dashboard" class="cta">Go to Dashboard</a>
                 <a href="/logout" class="cta">Logout</a>`
              : `<a href="/login" class="cta">Login</a>`
          }
        </div>
      </body>
    </html>
  `);
});

// Login page
app.get("/login", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login - LinkedOut</title>
        <style>
          body {
            max-width: 400px;
            margin: 100px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          form {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 8px;
          }
          input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          }
          button {
            width: 100%;
            padding: 12px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
          }
          button:hover {
            background: #0052a3;
          }
          .message {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .success {
            background: #d4edda;
            color: #155724;
          }
          .error {
            background: #f8d7da;
            color: #721c24;
          }
        </style>
      </head>
      <body>
        <h1>Login to LinkedOut</h1>
        <form method="POST" action="/auth/request-magic-link">
          <p>Enter your email to receive a magic link:</p>
          <input type="email" name="email" placeholder="your@email.com" required />
          <button type="submit">Send Magic Link</button>
        </form>
        <p style="text-align: center; color: #666; font-size: 14px;">
          No password needed! We'll email you a secure login link.
        </p>
      </body>
    </html>
  `);
});

// Logout
app.get("/logout", async (c) => {
  const token = getCookie(c, "auth_token");
  if (token) {
    await c.env.AUTH_TOKENS.delete(token);
  }
  setCookie(c, "auth_token", "", { maxAge: 0 });
  return c.redirect("/");
});

// Request magic link
app.post("/auth/request-magic-link", async (c) => {
  const formData = await c.req.formData();
  const email = formData.get("email") as string;

  if (!email) {
    return c.html("Email is required", 400);
  }

  // Check if user is authorized
  const authorized = await isUserAuthorized(email);
  if (!authorized) {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; max-width: 400px; margin: 100px auto; padding: 20px;">
          <h2>Access Denied</h2>
          <p>Your email (${email}) is not authorized to use LinkedOut.</p>
          <p>Please contact an administrator to request access.</p>
          <a href="/">Back to home</a>
        </body>
      </html>
    `, 403);
  }

  // Create auth token
  const token = await createAuthToken(email);
  const magicLink = `${new URL(c.req.url).origin}/auth/verify?token=${token}`;

  // TODO: Send email with magic link
  // For now, just display it (for development)
  return c.html(`
    <!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 100px auto; padding: 20px;">
        <h2>Magic Link Sent!</h2>
        <p>Click the link below to login:</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
        <p style="color: #666; font-size: 14px;">
          In production, this would be sent to your email: ${email}
        </p>
        <p style="color: #666; font-size: 14px;">
          This link expires in 24 hours.
        </p>
      </body>
    </html>
  `);
});

// Verify magic link
app.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html("Invalid token", 400);
  }

  const email = await verifyToken(token);
  if (!email) {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; max-width: 400px; margin: 100px auto; padding: 20px;">
          <h2>Invalid or Expired Link</h2>
          <p>This magic link is invalid or has expired.</p>
          <a href="/login">Request a new link</a>
        </body>
      </html>
    `, 401);
  }

  // Set cookie
  setCookie(c, "auth_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return c.redirect("/dashboard");
});

// Dashboard (protected)
app.get("/dashboard", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  // Get user's links
  const linksList = await c.env.LINKS.list({ prefix: "link:" });
  const userLinks: Link[] = [];
  for (const key of linksList.keys) {
    const linkStr = await c.env.LINKS.get(key.name);
    if (linkStr) {
      const link: Link = JSON.parse(linkStr);
      if (link.owner_email === email) {
        userLinks.push(link);
      }
    }
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dashboard - LinkedOut</title>
        <style>
          body {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #eee;
          }
          .nav a {
            margin-left: 20px;
            color: #0066cc;
            text-decoration: none;
          }
          .card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .btn {
            display: inline-block;
            padding: 10px 20px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 4px;
          }
          .btn:hover {
            background: #0052a3;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Dashboard</h1>
          <div class="nav">
            <span>Logged in as: ${email}</span>
            ${user?.is_admin ? '<a href="/admin">Admin</a>' : ''}
            <a href="/logout">Logout</a>
          </div>
        </div>
        
        <div class="card">
          <h2>Your Links</h2>
          ${userLinks.length === 0 ? `
            <p>You haven't created any link pages yet.</p>
            <a href="/links/create" class="btn">Create Your First Link</a>
          ` : `
            <table>
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${userLinks.map(link => `
                  <tr>
                    <td><a href="/out/${link.slug}" target="_blank">${link.slug}</a></td>
                    <td>${new Date(link.created_at).toLocaleDateString()}</td>
                    <td>
                      <a href="/links/view/${link.slug}" class="btn" style="padding: 5px 10px; font-size: 14px;">Manage</a>
                      <a href="/analytics?slug=${link.slug}" class="btn" style="padding: 5px 10px; font-size: 14px;">Analytics</a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="margin-top: 20px;">
              <a href="/links/create" class="btn">Create New Link</a>
            </div>
          `}
        </div>

        <div class="card">
          <h2>Analytics</h2>
          <p>View click tracking and engagement data across all your links.</p>
          <a href="/analytics" class="btn">View All Analytics</a>
        </div>
      </body>
    </html>
  `);
});

// Admin panel (protected, admin only)
app.get("/admin", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  if (!user?.is_admin) {
    return c.html("<h1>403 - Access Denied</h1><p>Admin access required.</p>", 403);
  }

  // Get all users
  const usersList = await c.env.USERS.list({ prefix: "user:" });
  const users: any[] = [];
  for (const key of usersList.keys) {
    const userStr = await c.env.USERS.get(key.name);
    if (userStr) {
      users.push(JSON.parse(userStr));
    }
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Admin Panel - LinkedOut</title>
        <style>
          body {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #eee;
          }
          .card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #eee;
          }
          th {
            background: #f5f5f5;
            font-weight: 600;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            background: #e3f2fd;
            color: #1976d2;
          }
          .badge.admin {
            background: #fce4ec;
            color: #c2185b;
          }
          form {
            display: flex;
            gap: 10px;
          }
          input[type="email"] {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          button {
            padding: 10px 20px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background: #0052a3;
          }
          .nav a {
            color: #0066cc;
            text-decoration: none;
            margin-left: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Admin Panel</h1>
          <div class="nav">
            <a href="/dashboard">Dashboard</a>
            <a href="/logout">Logout</a>
          </div>
        </div>

        <div class="card">
          <h2>Add New User</h2>
          <form method="POST" action="/admin/add-user">
            <input type="email" name="email" placeholder="user@example.com" required />
            <label>
              <input type="checkbox" name="is_admin" value="true" />
              Admin
            </label>
            <button type="submit">Add User</button>
          </form>
        </div>

        <div class="card">
          <h2>Authorized Users</h2>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>${u.email}</td>
                  <td>
                    ${u.is_admin ? '<span class="badge admin">Admin</span>' : '<span class="badge">User</span>'}
                  </td>
                  <td>${new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <form method="POST" action="/admin/delete-user" style="display: inline;">
                      <input type="hidden" name="email" value="${u.email}" />
                      <button type="submit" onclick="return confirm('Remove user ${u.email}?')">Remove</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `);
});

// Add user (admin only)
app.post("/admin/add-user", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  if (!user?.is_admin) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const newEmail = formData.get("email") as string;
  const isAdmin = formData.get("is_admin") === "true";

  if (!newEmail) {
    return c.html("Email required", 400);
  }

  // Check if user already exists
  const existing = await getUser(newEmail);
  if (existing) {
    return c.html("User already exists", 400);
  }

  await createUser(newEmail, isAdmin);
  return c.redirect("/admin");
});

// Delete user (admin only)
app.post("/admin/delete-user", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  if (!user?.is_admin) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const deleteEmail = formData.get("email") as string;

  if (!deleteEmail) {
    return c.html("Email required", 400);
  }

  // Don't allow deleting yourself
  if (deleteEmail === email) {
    return c.html("Cannot delete your own account", 400);
  }

  await c.env.USERS.delete(`user:${deleteEmail}`);
  return c.redirect("/admin");
});

// Create link page
app.get("/links/create", authMiddleware, async (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Create Link - LinkedOut</title>
        <style>
          body {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }
          form {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 8px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input, textarea {
            width: 100%;
            padding: 10px;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            font-family: inherit;
          }
          textarea {
            min-height: 300px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          }
          button {
            padding: 12px 24px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
          }
          button:hover {
            background: #0052a3;
          }
          .help {
            font-size: 14px;
            color: #666;
            margin-top: -15px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Create New Link Page</h1>
          <a href="/dashboard">Back to Dashboard</a>
        </div>

        <form method="POST" action="/links/create">
          <label for="slug">URL Slug</label>
          <input 
            type="text" 
            id="slug" 
            name="slug" 
            placeholder="my-talk-2025" 
            pattern="[a-z0-9-]+"
            required 
          />
          <p class="help">Only lowercase letters, numbers, and hyphens. Example: my-conference-talk</p>

          <label for="content">Content (Markdown)</label>
          <textarea 
            id="content" 
            name="content" 
            required
            placeholder="# My Talk Title

Here are the links from my talk:

- [First Link](https://example.com)
- [Second Link](https://example.com/page)
- [Third Link](https://example.com/another)"
          ></textarea>
          <p class="help">Supports Markdown formatting. Add your links, headings, and text.</p>

          <button type="submit">Create Link Page</button>
        </form>
      </body>
    </html>
  `);
});

// Create link handler
app.post("/links/create", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const formData = await c.req.formData();
  const slug = formData.get("slug") as string;
  const content = formData.get("content") as string;

  if (!slug || !content) {
    return c.html("Slug and content are required", 400);
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.html("Invalid slug format. Use only lowercase letters, numbers, and hyphens.", 400);
  }

  // Check if slug already exists
  const existing = await c.env.LINKS.get(`link:${slug}`);
  if (existing) {
    return c.html("This slug is already taken. Please choose another.", 400);
  }

  const link: Link = {
    slug,
    content,
    owner_email: email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await c.env.LINKS.put(`link:${slug}`, JSON.stringify(link));

  return c.redirect(`/links/view/${slug}`);
});

// View/edit link
app.get("/links/view/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  // Check ownership
  if (link.owner_email !== email) {
    return c.html("Access denied", 403);
  }

  const linkUrl = `${new URL(c.req.url).origin}/out/${slug}`;
  const qrTrackUrl = `${new URL(c.req.url).origin}/q/${slug}`;
  
  // Generate QR code as SVG for the modal
  const qrSvg = await QRCode.toString(qrTrackUrl, {
    type: 'svg',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Link: ${slug} - LinkedOut</title>
        <style>
          body {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }
          .card {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .link-url {
            font-size: 18px;
            color: #0066cc;
            word-break: break-all;
            margin: 10px 0;
          }
          .actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
          }
          .btn {
            padding: 10px 20px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
          }
          .btn:hover {
            background: #0052a3;
          }
          .btn-secondary {
            background: #666;
          }
          .btn-secondary:hover {
            background: #555;
          }
          .qr-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            justify-content: center;
            align-items: center;
          }
          .qr-modal.show {
            display: flex;
          }
          .qr-modal-content {
            background: white;
            padding: 40px;
            border-radius: 8px;
            text-align: center;
            max-width: 500px;
          }
          .qr-modal-content #qr-code-container {
            margin: 20px 0;
            display: flex;
            justify-content: center;
          }
          .qr-modal-content #qr-code-container svg {
            max-width: 100%;
            height: auto;
          }
          .qr-modal-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            line-height: 40px;
          }
          .hotkey-hint {
            font-size: 12px;
            color: #666;
            margin-left: 5px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Link Page: ${slug}</h1>
          <a href="/dashboard">Back to Dashboard</a>
        </div>

        <div class="card">
          <h3>Public URL</h3>
          <div class="link-url">
            <a href="${linkUrl}" target="_blank">${linkUrl}</a>
          </div>
          <div class="actions">
            <button class="btn" onclick="navigator.clipboard.writeText('${linkUrl}')">Copy Link</button>
            <button class="btn" onclick="showQR()">View QR Code <span class="hotkey-hint">(Q)</span></button>
            <a href="/analytics?slug=${slug}" class="btn">View Analytics</a>
          </div>
        </div>

        <!-- QR Code Modal -->
        <div id="qr-modal" class="qr-modal" onclick="if(event.target === this) hideQR()">
          <button class="qr-modal-close" onclick="hideQR()">×</button>
          <div class="qr-modal-content">
            <h2>QR Code: ${slug}</h2>
            <div id="qr-code-container">
              ${qrSvg}
            </div>
            <p style="font-size: 14px; color: #666; word-break: break-all;">
              ${qrTrackUrl}
            </p>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
              <button class="btn" onclick="downloadQR()">Download PNG</button>
              <button class="btn" onclick="window.print()">Print</button>
              <button class="btn btn-secondary" onclick="hideQR()">Close (Q or ESC)</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Details</h3>
          <p><strong>Created:</strong> ${new Date(link.created_at).toLocaleString()}</p>
          <p><strong>Last Updated:</strong> ${new Date(link.updated_at).toLocaleString()}</p>
          <p><strong>Owner:</strong> ${link.owner_email}</p>
        </div>

        <div class="card">
          <h3>Actions</h3>
          <div class="actions">
            <a href="/links/edit/${slug}" class="btn">Edit Content</a>
            <form method="POST" action="/links/delete/${slug}" style="display: inline;">
              <button type="submit" class="btn btn-secondary" onclick="return confirm('Delete this link page?')">Delete</button>
            </form>
          </div>
        </div>

        <script>
          function showQR() {
            document.getElementById('qr-modal').classList.add('show');
          }

          function hideQR() {
            document.getElementById('qr-modal').classList.remove('show');
          }

          function downloadQR() {
            // Convert SVG to PNG for download
            const svg = document.querySelector('#qr-code-container svg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const svgData = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            
            canvas.width = 400;
            canvas.height = 400;
            
            img.onload = function() {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, 400, 400);
              ctx.drawImage(img, 0, 0);
              
              canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'qr-${slug}.png';
                a.click();
                URL.revokeObjectURL(url);
              });
            };
            
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
          }

          // Hotkey support
          document.addEventListener('keydown', function(e) {
            // Q key to toggle QR modal
            if (e.key === 'q' || e.key === 'Q') {
              const modal = document.getElementById('qr-modal');
              if (modal.classList.contains('show')) {
                hideQR();
              } else {
                showQR();
              }
            }
            // ESC key to close modal
            if (e.key === 'Escape') {
              hideQR();
            }
          });

          // Print media query for QR code
          const style = document.createElement('style');
          style.textContent = \`
            @media print {
              body > *:not(#qr-modal) {
                display: none !important;
              }
              #qr-modal {
                display: flex !important;
                background: white !important;
                position: static !important;
              }
              .qr-modal-close, .btn {
                display: none !important;
              }
            }
          \`;
          document.head.appendChild(style);
        </script>
      </body>
    </html>
  `);
});

// Edit link
app.get("/links/edit/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  if (link.owner_email !== email) {
    return c.html("Access denied", 403);
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Edit ${slug} - LinkedOut</title>
        <style>
          body {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          form {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 8px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
          }
          textarea {
            width: 100%;
            padding: 10px;
            margin-bottom: 20px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            min-height: 300px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          }
          button {
            padding: 12px 24px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <h1>Edit: ${slug}</h1>
        <form method="POST" action="/links/edit/${slug}">
          <label for="content">Content (Markdown)</label>
          <textarea id="content" name="content" required>${link.content}</textarea>
          <button type="submit">Save Changes</button>
          <a href="/links/view/${slug}" style="margin-left: 10px;">Cancel</a>
        </form>
      </body>
    </html>
  `);
});

// Edit link handler
app.post("/links/edit/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  if (link.owner_email !== email) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const content = formData.get("content") as string;

  if (!content) {
    return c.html("Content is required", 400);
  }

  link.content = content;
  link.updated_at = new Date().toISOString();

  await c.env.LINKS.put(`link:${slug}`, JSON.stringify(link));

  return c.redirect(`/links/view/${slug}`);
});

// Delete link handler
app.post("/links/delete/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  if (link.owner_email !== email) {
    return c.html("Access denied", 403);
  }

  await c.env.LINKS.delete(`link:${slug}`);

  return c.redirect("/dashboard");
});

// QR Code page
app.get("/qr/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  if (link.owner_email !== email) {
    return c.html("Access denied", 403);
  }

  const linkUrl = `${new URL(c.req.url).origin}/out/${slug}`;
  // Use trackable QR URL that will record QR scans separately
  const qrTrackUrl = `${new URL(c.req.url).origin}/q/${slug}`;
  
  // Generate QR code as SVG string
  const qrSvg = await QRCode.toString(qrTrackUrl, {
    type: 'svg',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Code: ${slug} - LinkedOut</title>
        <style>
          body {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            text-align: center;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }
          .qr-container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin: 20px 0;
          }
          .qr-container #qr-code-display {
            display: flex;
            justify-content: center;
          }
          .qr-container #qr-code-display svg {
            max-width: 100%;
            height: auto;
          }
          .actions {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
          }
          .btn {
            padding: 10px 20px;
            background: #0066cc;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
          }
          .btn:hover {
            background: #0052a3;
          }
          .link-url {
            font-size: 14px;
            color: #666;
            word-break: break-all;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>QR Code for: ${slug}</h1>
          <a href="/links/view/${slug}">Back to Link</a>
        </div>

        <div class="qr-container">
          <div id="qr-code-display">
            ${qrSvg}
          </div>
          <div class="link-url">${linkUrl}</div>
        </div>

        <div class="actions">
          <button class="btn" onclick="downloadQRCode()">Download QR Code</button>
          <button class="btn" onclick="window.print()">Print QR Code</button>
        </div>

        <p style="color: #666; font-size: 14px; margin-top: 40px;">
          QR code scans are tracked separately from regular clicks in your analytics.
        </p>

        <style>
          @media print {
            body > *:not(.qr-container) {
              display: none;
            }
            .qr-container {
              box-shadow: none;
            }
          }
        </style>

        <script>
          function downloadQRCode() {
            const svg = document.querySelector('#qr-code-display svg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const svgData = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            
            canvas.width = 400;
            canvas.height = 400;
            
            img.onload = function() {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, 400, 400);
              ctx.drawImage(img, 0, 0);
              
              canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'qr-${slug}.png';
                a.click();
                URL.revokeObjectURL(url);
              });
            };
            
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
          }
        </script>
      </body>
    </html>
  `);
});

// QR code scan redirect (tracks as qr_scan)
app.get("/q/:slug", async (c) => {
  const { slug } = c.req.param();

  const linkStr = await c.env.LINKS.get(`link:${slug}`);
  if (!linkStr) {
    return c.html("Link not found", 404);
  }

  const link: Link = JSON.parse(linkStr);

  // Track QR scan
  const qrScanEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: c.req.url,
    out: null,
    slug: link.slug,
    owner_email: link.owner_email,
    user_agent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    event_type: "qr_scan",
    ...getCfProperties(c.req.raw),
  };

  // Write to pipeline (await to ensure delivery)
  console.log("Sending qr_scan event:", JSON.stringify(qrScanEvent));
  try {
    await c.env.CLICK_STREAM.send([qrScanEvent]);
    console.log("qr_scan event sent successfully");
  } catch (err) {
    console.error("Failed to send qr_scan event:", err);
    console.error("Event was:", JSON.stringify(qrScanEvent));
  }

  // Redirect to the actual link page
  return c.redirect(`/out/${slug}`);
});

// Debug endpoint - test pipeline send
app.get("/debug/pipeline", async (c) => {
  try {
    const testEvent: ClickEvent = {
      timestamp: new Date().toISOString(),
      event_type: "page_view",
      slug: "debug-test",
      owner_email: "debug@test.com",
      url: "https://test.com/debug",
      out: null,
      ...getCfProperties(c.req.raw),
    };

    console.log("Sending test event to pipeline:", testEvent);
    await c.env.CLICK_STREAM.send([testEvent]);
    console.log("Test event sent successfully");

    return c.json({
      success: true,
      message: "Event sent to pipeline",
      event: testEvent,
      streamId: "07a866c79b6a4ec9ae4d41bba2c93cd8",
    });
  } catch (error) {
    console.error("Error sending to pipeline:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});

// Debug endpoint - test R2 SQL query directly
app.get("/debug/r2sql", async (c) => {
  try {
    const testQuery = `SELECT COUNT(*) FROM default.click_events_v3`;
    
    const response = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: testQuery }),
      }
    );

    const data = await response.json();
    
    return c.json({
      status: response.status,
      ok: response.ok,
      query: testQuery,
      response: data,
      hasToken: !!c.env.R2_API_TOKEN,
      hasAccountId: !!c.env.ACCOUNT_ID,
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});

// Analytics dashboard
// Error handling: Logs detailed errors to console and shows user-friendly messages
// Validates env vars, checks HTTP response status, and checks for R2 SQL errors in response
app.get("/analytics", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const slugFilter = c.req.query("slug");

  // Query R2 SQL for analytics data
  // Pipeline with schema definition creates proper Iceberg columns
  let stats = {
    totalViews: 0,
    totalClicks: 0,
    totalQrScans: 0,
    clickThroughRate: "0%",
  };
  let recentEvents: any[] = [];
  let hasData = false;
  let errorMessage: string | null = null;

  try {
    // Debug: Log user info
    console.log("Analytics page accessed by:", email, "with slug filter:", slugFilter || "none");
    
    // Validate required environment variables
    if (!c.env.R2_API_TOKEN) {
      console.error("R2_API_TOKEN not configured - cannot query analytics");
      throw new Error("Analytics not configured");
    }
    
    if (!c.env.ACCOUNT_ID) {
      console.error("ACCOUNT_ID not configured - cannot query analytics");
      throw new Error("Analytics not configured");
    }

    // Build WHERE clause based on filter
    // Note: Can't use string interpolation directly in WHERE due to SQL injection
    // For demo purposes, using it here but production should use parameterized queries
    const whereConditions = [`owner_email = '${email}'`];
    if (slugFilter) {
      whereConditions.push(`slug = '${slugFilter}'`);
    }
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Query for aggregate stats
    // Note: R2 SQL doesn't support AS aliases, so we access count(*) directly
    const statsQuery = `
      SELECT 
        event_type,
        COUNT(*)
      FROM default.click_events_v3
      ${whereClause}
      GROUP BY event_type
    `;

    const statsResponse = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: statsQuery }),
      }
    );

    if (statsResponse.ok) {
      const statsData = await statsResponse.json() as {
        result?: { rows?: Array<Record<string, any>> },
        errors?: Array<any>
      };
      // Debug logging
      console.log("Stats query response:", JSON.stringify(statsData));
      console.log("Stats query was:", statsQuery);
      
      // Check for query errors
      if (statsData.errors && statsData.errors.length > 0) {
        console.error("R2 SQL stats query errors:", JSON.stringify(statsData.errors));
        console.error("Query was:", statsQuery);
      }
      
      const rows = statsData.result?.rows;
      if (rows && rows.length > 0) {
        hasData = true;
        console.log("hasData set to true, rows length:", rows.length);
        rows.forEach((row: any) => {
          // R2 SQL returns count(*) without alias support
          const count = row['count(*)'] || 0;
          if (row.event_type === "page_view") stats.totalViews = count;
          if (row.event_type === "click") stats.totalClicks = count;
          if (row.event_type === "qr_scan") stats.totalQrScans = count;
        });

        // Calculate CTR
        if (stats.totalViews > 0) {
          const ctr = ((stats.totalClicks / stats.totalViews) * 100).toFixed(1);
          stats.clickThroughRate = `${ctr}%`;
        }
      }
    } else {
      const errorText = await statsResponse.text();
      console.error("R2 SQL stats query failed:", statsResponse.status, errorText);
      console.error("Query was:", statsQuery);
    }

    // Query for recent events
    // Note: R2 SQL only allows ORDER BY on partition key columns (__ingest_ts)
    const eventsQuery = `
      SELECT 
        timestamp,
        event_type,
        slug,
        out,
        user_agent
      FROM default.click_events_v3
      ${whereClause}
      ORDER BY __ingest_ts DESC
      LIMIT 20
    `;

    const eventsResponse = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: eventsQuery }),
      }
    );

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json() as {
        result?: { rows?: Array<Record<string, any>> },
        errors?: Array<any>
      };
      
      // Debug logging
      console.log("Events query response:", JSON.stringify(eventsData));
      console.log("Events query was:", eventsQuery);
      
      // Check for query errors
      if (eventsData.errors && eventsData.errors.length > 0) {
        console.error("R2 SQL events query errors:", JSON.stringify(eventsData.errors));
        console.error("Query was:", eventsQuery);
      }
      
      const rows = eventsData.result?.rows;
      if (rows && rows.length > 0) {
        recentEvents = rows;
        console.log("recentEvents set, length:", rows.length);
      }
    } else {
      const errorText = await eventsResponse.text();
      console.error("R2 SQL events query failed:", eventsResponse.status, errorText);
      console.error("Query was:", eventsQuery);
    }
  } catch (error) {
    console.error("Error querying R2 SQL - exception thrown:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    errorMessage = error instanceof Error ? error.message : "Unknown error querying analytics";
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Analytics - LinkedOut</title>
        <style>
          body {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #eee;
          }
          .card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
          }
          .stat {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
          }
          .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: #0066cc;
          }
          .stat-label {
            font-size: 14px;
            color: #666;
            margin-top: 5px;
          }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #eee;
          }
          th {
            background: #f5f5f5;
            font-weight: 600;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            background: #e3f2fd;
            color: #1976d2;
          }
          .badge.click { background: #e8f5e9; color: #2e7d32; }
          .badge.qr { background: #fce4ec; color: #c2185b; }
          .badge.view { background: #f3e5f5; color: #7b1fa2; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Analytics Dashboard</h1>
          <div>
            <a href="/dashboard" style="margin-right: 20px;">Back to Dashboard</a>
            <span>Logged in as: ${email}</span>
          </div>
        </div>

        ${errorMessage ? `
          <div class="warning" style="background: #ffebee; border-color: #f44336;">
            <strong>❌ Error Loading Analytics:</strong> ${errorMessage}
            <p>Check the Worker logs for more details. Common issues:</p>
            <ul>
              <li>R2_API_TOKEN secret not configured</li>
              <li>ACCOUNT_ID environment variable missing</li>
              <li>R2 SQL API rate limits or network issues</li>
              <li>SQL query syntax errors (check console logs)</li>
            </ul>
          </div>
        ` : !hasData ? `
          <div class="warning">
            <strong>⚠️ No Data Yet:</strong> The pipeline is configured but hasn't collected any events yet.
            <p>To generate data:</p>
            <ul>
              <li>Create a link page from your dashboard</li>
              <li>Visit the link page (/out/your-slug)</li>
              <li>Click on some links in the page</li>
              <li>Wait a few minutes for data to be batched and written to R2</li>
            </ul>
            <p><em>Note: Pipelines batch data every 5 minutes (300 seconds) by default.</em></p>
          </div>
        ` : ''}

        ${slugFilter ? `
          <div class="card">
            <h2>Analytics for: ${slugFilter}</h2>
            <p>Filtering data for this link page only.</p>
          </div>
        ` : `
          <div class="card">
            <h2>All Your Links</h2>
            <p>Showing aggregate data across all your link pages.</p>
          </div>
        `}

        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">${stats.totalViews}</div>
            <div class="stat-label">Total Page Views</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.totalClicks}</div>
            <div class="stat-label">Total Clicks</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.totalQrScans}</div>
            <div class="stat-label">QR Code Scans</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.clickThroughRate}</div>
            <div class="stat-label">Click-Through Rate</div>
          </div>
        </div>

        <div class="card">
          <h3>Recent Events</h3>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Link Slug</th>
                <th>Destination URL</th>
                <th>User Agent</th>
              </tr>
            </thead>
            <tbody>
              ${recentEvents.length === 0 ? `
                <tr>
                  <td colspan="5" style="text-align: center; color: #999; padding: 40px;">
                    No events yet - create a link and visit it to see data here
                  </td>
                </tr>
              ` : recentEvents.map(event => `
                <tr>
                  <td>${new Date(event.timestamp).toLocaleString()}</td>
                  <td>
                    <span class="badge ${event.event_type === 'click' ? 'click' : event.event_type === 'qr_scan' ? 'qr' : 'view'}">
                      ${event.event_type}
                    </span>
                  </td>
                  <td>${event.slug}</td>
                  <td>${event.out ? `<a href="${event.out}" target="_blank">${event.out.substring(0, 50)}...</a>` : '-'}</td>
                  <td style="font-size: 11px; color: #666;">${event.user_agent ? event.user_agent.substring(0, 40) + '...' : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Example R2 SQL Query</h3>
          <p>Once the pipeline is configured, data will be queryable with SQL like this:</p>
          <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow-x: auto;"><code>SELECT 
  event_type,
  COUNT(*) as count,
  DATE(timestamp) as date
FROM click_events
WHERE owner_email = '${email}'
  ${slugFilter ? `AND slug = '${slugFilter}'` : ''}
GROUP BY event_type, date
ORDER BY date DESC
LIMIT 30</code></pre>
        </div>
      </body>
    </html>
  `);
});

// Catch-all for static assets and 404 - MUST BE LAST
app.get("*", async (c) => {
  // Check if this is a static asset request
  if (c.req.path.startsWith("/track.js") || c.req.path.match(/\.(css|js|png|jpg|gif|ico)$/)) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  // Fall through to 404
  return c.html("<h1>404 - Page not found</h1>", 404);
});

export default app;
