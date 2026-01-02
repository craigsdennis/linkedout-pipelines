import { Hono } from "hono";
import { marked } from "marked";
import { jsxRenderer } from "hono/jsx-renderer";
import { getCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import QRCode from "qrcode";
import type { ClickEvent, Link } from "./types";
import {
  verifyToken,
  getUser,
  createUser,
} from "./utils/auth";
import { getCfProperties, getVisitorId } from "./utils/helpers";
import { authMiddleware } from "./middleware/auth";
import { BaseLayout, DashboardLayout } from "./views/layouts";
import tracking from "./routes/tracking";
import auth from "./routes/auth";

type Variables = {
  userEmail: string;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Mount route modules
app.route("/", tracking);
app.route("/", auth);

// Public link viewing page with tracking
app.get(
  "/out/*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <title>LinkedOut</title>
          <link rel="stylesheet" href="/styles.css" />
          <script src="/track.js" defer></script>
          <script src="/qr.js" defer></script>
        </head>
        <body class="base-layout">
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
    visitor_id: getVisitorId(c),
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
      <script dangerouslySetInnerHTML={{ __html: `window.qrSlug = '${slug}';` }} />
      <div id="qr-modal" class="qr-modal" onclick="if(event.target === this) hideQR()">
        <button class="qr-modal-close" onclick="hideQR()">×</button>
        <div class="qr-modal-content">
          <h2>Share this page</h2>
          <div id="qr-code-container" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p style="font-size: 14px; color: #666; word-break: break-all; margin: 20px 0;">
            {c.req.url}
          </p>
          <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn" onclick="downloadQRCode()">Download PNG</button>
            <button class="btn btn-secondary" onclick="hideQR()">Close (Q or ESC)</button>
          </div>
        </div>
      </div>
    </>
  );
});

// Home page
app.get("/", async (c) => {
  const token = getCookie(c, "auth_token");
  let email: string | null = null;

  if (token) {
    email = await verifyToken(token);
  }

  return c.html(
    BaseLayout({
      title: "Share Links, Track Clicks",
      styles: `
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
          text-decoration: none;
        }
      `,
      children: html`
        <div class="hero">
          <h1>LinkedOut</h1>
          <p>Share your links after talks and track every click with analytics</p>
          ${email 
            ? html`<a href="/dashboard" class="cta">Go to Dashboard</a>`
            : html`<a href="/login" class="cta">Get Started</a>`
          }
        </div>
      `
    })
  );
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

  return c.html(
    DashboardLayout({
      title: "Dashboard",
      email: email,
      isAdmin: user?.is_admin,
      children: html`
        <div class="card">
          <h2>Your Link Pages</h2>
          <a href="/links/create" class="btn">Create New Link Page</a>
          
          ${userLinks.length === 0 
            ? html`<p>No link pages yet. Create your first one!</p>`
            : html`
              <ul style="list-style: none; padding: 0;">
                ${userLinks.map(link => html`
                  <li style="padding: 15px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong>${link.slug}</strong>
                      <br />
                      <small>Created: ${new Date(link.created_at).toLocaleDateString()}</small>
                    </div>
                    <div>
                      <a href="/out/${link.slug}" target="_blank" style="margin-left: 10px;">View</a>
                      <a href="/links/view/${link.slug}" style="margin-left: 10px;">Manage</a>
                      <a href="/qr/${link.slug}" target="_blank" style="margin-left: 10px;">QR Code</a>
                    </div>
                  </li>
                `)}
              </ul>
            `
          }
        </div>
      `
    })
  );
});

// Admin panel (protected, admin only)
app.get("/admin", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  if (!user?.is_admin) {
    return c.html(
      BaseLayout({
        title: "Access Denied",
        children: html`
          <h1>403 - Access Denied</h1>
          <p>Admin access required.</p>
          <a href="/dashboard">Back to Dashboard</a>
        `
      }), 403
    );
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

  return c.html(
    DashboardLayout({
      title: "Admin Panel",
      email: email,
      isAdmin: true,
      children: html`
        <div class="card">
          <h2>Add New User</h2>
          <form method="POST" action="/admin/add-user" style="display: flex; gap: 10px;">
            <input type="email" name="email" placeholder="user@example.com" required style="flex: 1;" />
            <label>
              <input type="checkbox" name="is_admin" value="true" />
              Admin
            </label>
            <button type="submit">Add User</button>
          </form>
        </div>

        <div class="card">
          <h2>All Users</h2>
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
              ${users.map(u => html`
                <tr>
                  <td>${u.email}</td>
                  <td>
                    ${u.is_admin 
                      ? html`<span style="background: #fce4ec; color: #c2185b; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Admin</span>` 
                      : html`<span style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 12px;">User</span>`
                    }
                  </td>
                  <td>${new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <form method="POST" action="/admin/delete-user" style="display: inline;">
                      <input type="hidden" name="email" value="${u.email}" />
                      <button type="submit" class="btn-danger" style="padding: 5px 10px; font-size: 14px;">Delete</button>
                    </form>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `
    })
  );
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
  const email = c.get("userEmail");
  const user = await getUser(email);

  return c.html(
    DashboardLayout({
      title: "Create Link Page",
      email: email,
      isAdmin: user?.is_admin,
      children: html`
        <form method="POST" action="/links/create" style="background: #f5f5f5; padding: 30px; border-radius: 8px;">
          <label for="slug" style="display: block; margin-bottom: 5px; font-weight: 500;">URL Slug</label>
          <input 
            type="text" 
            id="slug" 
            name="slug" 
            placeholder="my-talk-2025" 
            pattern="[a-z0-9-]+"
            required 
          />
          <p style="font-size: 14px; color: #666; margin-top: -15px; margin-bottom: 20px;">
            Only lowercase letters, numbers, and hyphens. Example: my-conference-talk
          </p>

          <label for="content" style="display: block; margin-bottom: 5px; font-weight: 500;">Content (Markdown)</label>
          <textarea 
            id="content" 
            name="content" 
            required
            style="min-height: 300px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;"
            placeholder="# My Talk Title

Here are the links from my talk:

- [First Link](https://example.com)
- [Second Link](https://example.com/page)
- [Third Link](https://example.com/another)"
          ></textarea>
          <p style="font-size: 14px; color: #666; margin-top: -15px; margin-bottom: 20px;">
            Supports Markdown formatting. Add your links, headings, and text.
          </p>

          <button type="submit">Create Link Page</button>
        </form>
      `
    })
  );
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

  const user = await getUser(email);
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

  return c.html(
    DashboardLayout({
      title: `Link: ${slug}`,
      email: email,
      isAdmin: user?.is_admin,
      scripts: ['/qr.js'],
      children: html`
        <script>window.qrSlug = '${slug}';</script>
        <h2>Link Page: ${slug}</h2>

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
              ${raw(qrSvg)}
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
      `
    })
  );
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

  const user = await getUser(email);

  return c.html(
    DashboardLayout({
      title: `Edit: ${slug}`,
      email: email,
      isAdmin: user?.is_admin,
      styles: `
        form {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 30px;
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
      `,
      children: html`
        <h2>Edit: ${slug}</h2>
        <form method="POST" action="/links/edit/${slug}">
          <label for="content">Content (Markdown)</label>
          <textarea id="content" name="content" required>${link.content}</textarea>
          <button type="submit">Save Changes</button>
          <a href="/links/view/${slug}" style="margin-left: 10px;">Cancel</a>
        </form>
      `
    })
  );
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

  const user = await getUser(email);
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

  return c.html(
    DashboardLayout({
      title: `QR Code: ${slug}`,
      email: email,
      isAdmin: user?.is_admin,
      scripts: ['/qr.js'],
      children: html`
        <script>window.qrSlug = '${slug}';</script>
        <h2>QR Code for: ${slug}</h2>

        <div class="qr-container">
          <div id="qr-code-display">
            ${raw(qrSvg)}
          </div>
          <div class="link-url">${linkUrl}</div>
        </div>

        <div class="actions">
          <button class="btn" onclick="downloadQRCode()">Download QR Code</button>
          <button class="btn" onclick="window.print()">Print QR Code</button>
          <a href="/links/view/${slug}" class="btn btn-secondary">Back to Link</a>
        </div>

        <p class="info-text">
          QR code scans are tracked separately from regular clicks in your analytics.
        </p>
      `
    })
  );
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
    visitor_id: getVisitorId(c),
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
    const testQuery = `SELECT COUNT(*) FROM default.click_events_v4`;
    
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
      FROM default.click_events_v4
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
      FROM default.click_events_v4
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

  const user = await getUser(email);

  return c.html(
    DashboardLayout({
      title: "Analytics Dashboard",
      email: email,
      isAdmin: user?.is_admin,
      styles: `
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
      `,
      children: html`
        ${errorMessage ? html`
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
        ` : !hasData ? html`
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
        ` : html``}

        ${slugFilter ? html`
          <div class="card">
            <h2>Analytics for: ${slugFilter}</h2>
            <p>Filtering data for this link page only.</p>
          </div>
        ` : html`
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
              ${recentEvents.length === 0 ? html`
                <tr>
                  <td colspan="5" style="text-align: center; color: #999; padding: 40px;">
                    No events yet - create a link and visit it to see data here
                  </td>
                </tr>
              ` : recentEvents.map(event => html`
                <tr>
                  <td>${new Date(event.timestamp).toLocaleString()}</td>
                  <td>
                    <span class="badge ${event.event_type === 'click' ? 'click' : event.event_type === 'qr_scan' ? 'qr' : 'view'}">
                      ${event.event_type}
                    </span>
                  </td>
                  <td>${event.slug}</td>
                  <td>${event.out ? html`<a href="${event.out}" target="_blank">${event.out.substring(0, 50)}...</a>` : '-'}</td>
                  <td style="font-size: 11px; color: #666;">${event.user_agent ? event.user_agent.substring(0, 40) + '...' : '-'}</td>
                </tr>
              `)}
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
      `
    })
  );
});

// Catch-all for static assets and 404 - MUST BE LAST
app.get("*", async (c) => {
  // Check if this is a static asset request
  if (c.req.path.startsWith("/track.js") || c.req.path.match(/\.(css|js|png|jpg|gif|ico)$/)) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  // Fall through to 404
  return c.html(
    BaseLayout({
      title: "404 - Not Found",
      children: html`
        <h1>404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">Go to Homepage</a>
      `
    }),
    404
  );
});

export default app;
