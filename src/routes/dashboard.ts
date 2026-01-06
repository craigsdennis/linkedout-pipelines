import { Hono } from "hono";
import { html, raw } from "hono/html";
import { marked } from "marked";
import QRCode from "qrcode";
import type { ClickEvent } from "../types";
import { getUser, createUser } from "../utils/auth";
import { getCfProperties, getVisitorId, generateThemeCSS } from "../utils/helpers";
import { authMiddleware } from "../middleware/auth";
import { BaseLayout, DashboardLayout } from "../views/layouts";
import {
  getUserLinks,
  getLinkFromDB,
  getLinkWithMaintainers,
  createLinkInDB,
  updateLinkInDB,
  deleteLinkFromDB,
  canUserAccessLink,
  addMaintainerToDB,
  removeMaintainerFromDB,
  getLinkMaintainers,
  getUserAccessibleSlugs,
  getAllUsersFromDB,
  deleteUserFromDB,
  getPublicThemesFromDB,
  getThemeFromDB,
} from "../utils/db";

type Variables = {
  userEmail: string;
};

const dashboard = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Dashboard - user's links overview
dashboard.get("/dashboard", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);

  // Get user's accessible links from D1
  const userLinks = await getUserLinks(c.env.DB, email);

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
                    <div style="flex: 1;">
                      ${link.title ? html`
                        <strong style="font-size: 16px;">${link.title}</strong>
                        <br />
                        <span style="color: #666; font-family: monospace; font-size: 14px;">/out/${link.slug}</span>
                      ` : html`
                        <strong style="font-size: 16px;">${link.slug}</strong>
                        <br />
                        <span style="color: #999; font-style: italic; font-size: 14px;">No title set</span>
                      `}
                      <br />
                      <small style="color: #999;">Created: ${new Date(link.created_at).toLocaleDateString()}</small>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                      <a href="/out/${link.slug}" target="_blank" class="btn" style="padding: 8px 12px; font-size: 14px;">View</a>
                      <a href="/links/view/${link.slug}" class="btn" style="padding: 8px 12px; font-size: 14px;">Manage</a>
                      <a href="/qr/${link.slug}" target="_blank" class="btn" style="padding: 8px 12px; font-size: 14px;">QR Code</a>
                      <a href="/analytics?slug=${link.slug}" class="btn" style="padding: 8px 12px; font-size: 14px; background: #f5f5f5; color: #333;" title="View analytics for this page">
                        📊 Analytics
                      </a>
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
dashboard.get("/admin", authMiddleware, async (c) => {
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

  // Get all users from D1
  const users = await getAllUsersFromDB(c.env.DB);

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
dashboard.post("/admin/add-user", authMiddleware, async (c) => {
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
dashboard.post("/admin/delete-user", authMiddleware, async (c) => {
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

  // Check if user is the sole maintainer of any links
  const linksWhereOnlyMaintainer = await c.env.DB
    .prepare(`
      SELECT DISTINCT lm.link_slug
      FROM link_maintainers lm
      WHERE lm.user_email = ?
      AND (
        SELECT COUNT(DISTINCT user_email) 
        FROM link_maintainers 
        WHERE link_slug = lm.link_slug
      ) = 1
    `)
    .bind(deleteEmail)
    .all();

  if (linksWhereOnlyMaintainer.results && linksWhereOnlyMaintainer.results.length > 0) {
    const orphanedLinks = linksWhereOnlyMaintainer.results.map((r: any) => r.link_slug).join(", ");
    return c.html(
      `Cannot delete user ${deleteEmail}. They are the only maintainer of these links: ${orphanedLinks}. 
      Please add another maintainer or delete the links first. <a href="/admin">Back to Admin</a>`,
      400
    );
  }

  await deleteUserFromDB(c.env.DB, deleteEmail);
  return c.redirect("/admin");
});

// Create link page
dashboard.get("/links/create", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const user = await getUser(email);
  
  // Get available themes
  const themes = await getPublicThemesFromDB(c.env.DB);

  return c.html(
    DashboardLayout({
      title: "Create Link Page",
      email: email,
      isAdmin: user?.is_admin,
      children: html`
        <script id="themes-data" type="application/json">
          ${raw(JSON.stringify(themes))}
        </script>

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

          <label for="title" style="display: block; margin-bottom: 5px; font-weight: 500;">Page Title (Optional)</label>
          <input 
            type="text" 
            id="title" 
            name="title" 
            placeholder="My Conference Talk 2025"
          />
          <p style="font-size: 14px; color: #666; margin-top: -15px; margin-bottom: 20px;">
            A friendly title for your link page (used in analytics)
          </p>

          <label for="theme_id" style="display: block; margin-bottom: 5px; font-weight: 500;">Theme</label>
          <select id="theme_id" name="theme_id" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px;">
            ${themes.map(theme => html`
              <option value="${theme.id}" ${theme.id === 'default' ? 'selected' : ''}>
                ${theme.name} ${theme.description ? `- ${theme.description}` : ''}
              </option>
            `)}
          </select>
          <p style="font-size: 14px; color: #666; margin-top: -15px; margin-bottom: 20px;">
            Choose a visual theme for your link page
          </p>

          <!-- Custom Styling Section -->
          <div id="customization-section" style="margin-top: 20px; padding: 20px; background: white; border-radius: 8px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <label style="display: block; margin: 0; font-weight: 600; font-size: 16px;">
                🎨 Custom Styling (Optional)
              </label>
              <button 
                type="button" 
                id="customize-btn"
                style="padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
              >
                Customize Selected Theme
              </button>
            </div>
            
            <div id="custom-css-container" style="display: none;">
              <textarea 
                id="custom_css" 
                name="custom_css"
                style="min-height: 250px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; line-height: 1.5; width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="/* Click 'Customize Selected Theme' to copy the theme's CSS here */

/* You can override theme variables: */
:root {
  --primary-color: #ff0000;
  --background: #ffffff;
}

/* Or add your own styles: */
h1 {
  font-size: 3em;
  text-align: center;
}"
              ></textarea>
              <p style="font-size: 13px; color: #666; margin-top: 10px;">
                💡 <strong>Tip:</strong> Start with a base theme, then click "Customize" to copy its CSS as a starting point. Your changes will override the base theme.
              </p>
            </div>
          </div>

          <label for="content" style="display: block; margin-bottom: 5px; font-weight: 500; margin-top: 20px;">Content (Markdown)</label>
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

          <!-- Live Preview Section -->
          <div style="margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 style="margin: 0; font-size: 18px;">👁️ Live Preview</h3>
              <button 
                type="button" 
                id="toggle-preview-btn"
                style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
              >
                Show Preview
              </button>
            </div>
            
            <div id="live-preview-container" style="display: none; border: 2px solid #0066cc; border-radius: 8px; padding: 20px; background: white; max-height: 600px; overflow-y: auto;">
              <article id="preview-content" style="max-width: 800px; margin: 0 auto;">
                <!-- Rendered markdown will appear here -->
              </article>
              <style id="preview-styles">
                /* Combined CSS will appear here */
              </style>
            </div>
            <p style="font-size: 13px; color: #666; margin-top: 10px;">
              💡 Preview updates automatically as you type in the content or CSS fields (500ms debounce)
            </p>
          </div>

          <button type="submit" style="margin-top: 20px;">Create Link Page</button>
        </form>
      `,
      scripts: ['/theme-customizer.js']
    })
  );
});

// Create link handler
dashboard.post("/links/create", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const formData = await c.req.formData();
  const slug = formData.get("slug") as string;
  const title = (formData.get("title") as string) || null;
  const content = formData.get("content") as string;
  const theme_id = (formData.get("theme_id") as string) || "default";
  const custom_css = (formData.get("custom_css") as string) || null;

  if (!slug || !content) {
    return c.html("Slug and content are required", 400);
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.html("Invalid slug format. Use only lowercase letters, numbers, and hyphens.", 400);
  }

  // Check if slug already exists
  const existing = await getLinkFromDB(c.env.DB, slug);
  if (existing) {
    return c.html("This slug is already taken. Please choose another.", 400);
  }

  // Create link in D1 (also adds creator as maintainer)
  await createLinkInDB(
    c.env.DB,
    {
      slug,
      title,
      content,
      theme_id,
      custom_css,
      created_by: email,
    },
    email // maintainer email
  );

  return c.redirect(`/links/view/${slug}`);
});

// View/edit link
dashboard.get("/links/view/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const linkWithMaintainers = await getLinkWithMaintainers(c.env.DB, slug);
  if (!linkWithMaintainers) {
    return c.html("Link not found", 404);
  }

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
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

  // Get theme info
  const theme = await getThemeFromDB(c.env.DB, linkWithMaintainers.theme_id);

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
          <p><strong>Created:</strong> ${new Date(linkWithMaintainers.created_at).toLocaleString()}</p>
          <p><strong>Last Updated:</strong> ${new Date(linkWithMaintainers.updated_at).toLocaleString()}</p>
          <p><strong>Creator:</strong> ${linkWithMaintainers.created_by}</p>
          <p><strong>Theme:</strong> ${theme?.name || 'default'}</p>
        </div>

        <div class="card">
          <h3>Maintainers (${linkWithMaintainers.maintainers.length})</h3>
          <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
            Maintainers can edit, delete, and manage this link page
          </p>
          <ul style="list-style: none; padding: 0;">
            ${linkWithMaintainers.maintainers.map(maintainerEmail => html`
              <li style="padding: 10px; margin: 5px 0; background: #f5f5f5; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>${maintainerEmail}</span>
                ${linkWithMaintainers.maintainers.length > 1 ? html`
                  <form method="POST" action="/links/${slug}/remove-maintainer" style="display: inline;">
                    <input type="hidden" name="email" value="${maintainerEmail}" />
                    <button type="submit" class="btn btn-secondary" style="padding: 5px 10px; font-size: 13px;" onclick="return confirm('Remove ${maintainerEmail} as maintainer?')">Remove</button>
                  </form>
                ` : html`
                  <span style="color: #999; font-size: 13px;">(Last maintainer)</span>
                `}
              </li>
            `)}
          </ul>
          
          <form method="POST" action="/links/${slug}/add-maintainer" style="margin-top: 20px; display: flex; gap: 10px;">
            <input type="email" name="email" placeholder="user@example.com" required style="flex: 1;" />
            <button type="submit">Add Maintainer</button>
          </form>
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

// Add maintainer
dashboard.post("/links/:slug/add-maintainer", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const newMaintainerEmail = formData.get("email") as string;

  if (!newMaintainerEmail) {
    return c.html("Email required", 400);
  }

  // Check if user exists
  const newUser = await getUser(newMaintainerEmail);
  if (!newUser) {
    return c.html("User not found. They must be registered first.", 400);
  }

  // Check if already a maintainer
  const existingMaintainer = await canUserAccessLink(c.env.DB, slug, newMaintainerEmail);
  if (existingMaintainer) {
    return c.html("User is already a maintainer", 400);
  }

  await addMaintainerToDB(c.env.DB, slug, newMaintainerEmail, email);
  return c.redirect(`/links/view/${slug}`);
});

// Remove maintainer
dashboard.post("/links/:slug/remove-maintainer", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const removeMaintainerEmail = formData.get("email") as string;

  if (!removeMaintainerEmail) {
    return c.html("Email required", 400);
  }

  // Check if this is the last maintainer
  const maintainers = await getLinkMaintainers(c.env.DB, slug);
  if (maintainers.length <= 1) {
    return c.html("Cannot remove the last maintainer", 400);
  }

  await removeMaintainerFromDB(c.env.DB, slug, removeMaintainerEmail);
  return c.redirect(`/links/view/${slug}`);
});

// Edit link
dashboard.get("/links/edit/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("Link not found", 404);
  }

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
    return c.html("Access denied", 403);
  }

  const user = await getUser(email);
  const themes = await getPublicThemesFromDB(c.env.DB);

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
        input[type="text"],
        select {
          width: 100%;
          padding: 10px;
          margin-bottom: 20px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
          font-size: 16px;
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
        <script id="themes-data" type="application/json">
          ${raw(JSON.stringify(themes))}
        </script>

        <h2>Edit: ${slug}</h2>
        <form method="POST" action="/links/edit/${slug}">
          <label for="title">Page Title (Optional)</label>
          <input type="text" id="title" name="title" value="${link.title || ''}" placeholder="Enter a title for your link page">
          
          <label for="theme_id">Theme</label>
          <select id="theme_id" name="theme_id">
            ${themes.map(theme => html`
              <option value="${theme.id}" ${theme.id === link.theme_id ? 'selected' : ''}>
                ${theme.name} ${theme.description ? `- ${theme.description}` : ''}
              </option>
            `)}
          </select>

          <!-- Custom Styling Section -->
          <div id="customization-section" style="margin-top: 20px; padding: 20px; background: #f9f9f9; border-radius: 8px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <label style="display: block; margin: 0; font-weight: 600; font-size: 16px;">
                🎨 Custom Styling (Optional)
              </label>
              <button 
                type="button" 
                id="customize-btn"
                style="padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
              >
                ${link.custom_css ? 'Reset to Selected Theme' : 'Customize Selected Theme'}
              </button>
            </div>
            
            <div id="custom-css-container" style="display: ${link.custom_css ? 'block' : 'none'};">
              <textarea 
                id="custom_css" 
                name="custom_css"
                style="min-height: 250px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 13px; line-height: 1.5; width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="/* Add custom CSS here */"
              >${link.custom_css || ''}</textarea>
              <p style="font-size: 13px; color: #666; margin-top: 10px;">
                💡 <strong>Tip:</strong> Your custom CSS is saved with this link. All maintainers can see and edit it.
              </p>
            </div>
          </div>
          
          <label for="content" style="margin-top: 20px;">Content (Markdown)</label>
          <textarea id="content" name="content" required>${link.content}</textarea>

          <!-- Live Preview Section -->
          <div style="margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 style="margin: 0; font-size: 18px;">👁️ Live Preview</h3>
              <button 
                type="button" 
                id="toggle-preview-btn"
                style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;"
              >
                Show Preview
              </button>
            </div>
            
            <div id="live-preview-container" style="display: none; border: 2px solid #0066cc; border-radius: 8px; padding: 20px; background: white; max-height: 600px; overflow-y: auto;">
              <article id="preview-content" style="max-width: 800px; margin: 0 auto;">
                <!-- Rendered markdown will appear here -->
              </article>
              <style id="preview-styles">
                /* Combined CSS will appear here */
              </style>
            </div>
            <p style="font-size: 13px; color: #666; margin-top: 10px;">
              💡 Preview updates automatically as you type
            </p>
          </div>
          
          <button type="submit" style="margin-top: 20px;">Save Changes</button>
          <a href="/links/view/${slug}" style="margin-left: 10px;">Cancel</a>
        </form>
      `,
      scripts: ['/theme-customizer.js']
    })
  );
});

// Edit link handler
dashboard.post("/links/edit/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("Link not found", 404);
  }

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
    return c.html("Access denied", 403);
  }

  const formData = await c.req.formData();
  const content = formData.get("content") as string;
  const title = (formData.get("title") as string) || null;
  const theme_id = formData.get("theme_id") as string;
  const custom_css = (formData.get("custom_css") as string) || null;

  if (!content) {
    return c.html("Content is required", 400);
  }

  await updateLinkInDB(c.env.DB, slug, {
    content,
    title,
    theme_id,
    custom_css,
  });

  return c.redirect(`/links/view/${slug}`);
});

// Delete link handler
dashboard.post("/links/delete/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("Link not found", 404);
  }

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
    return c.html("Access denied", 403);
  }

  await deleteLinkFromDB(c.env.DB, slug);

  return c.redirect("/dashboard");
});

// QR Code page
dashboard.get("/qr/:slug", authMiddleware, async (c) => {
  const { slug } = c.req.param();
  const email = c.get("userEmail");

  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("Link not found", 404);
  }

  // Check if user has access
  const hasAccess = await canUserAccessLink(c.env.DB, slug, email);
  if (!hasAccess) {
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
dashboard.get("/q/:slug", async (c) => {
  const { slug } = c.req.param();

  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("Link not found", 404);
  }

  // Track QR scan (NO owner_email in v6)
  const qrScanEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: c.req.url,
    out: null,
    slug: link.slug,
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

// Analytics dashboard  
dashboard.get("/analytics", authMiddleware, async (c) => {
  const email = c.get("userEmail");
  const slugFilter = c.req.query("slug");

  // Query R2 SQL for analytics data
  let stats = {
    totalViews: 0,
    totalClicks: 0,
    totalQrScans: 0,
    clickThroughRate: "0%",
  };
  let recentEvents: any[] = [];
  let destinationBreakdown: Array<{ out: string; click_count: number }> = [];
  let linkTextBreakdown: Array<{ link_text: string; out: string; click_count: number }> = [];
  let slugBreakdown: Array<{ slug: string; title: string | null; click_count: number }> = [];
  let hasData = false;
  let errorMessage: string | null = null;

  try {
    // Validate required environment variables
    if (!c.env.R2_API_TOKEN) {
      console.error("R2_API_TOKEN not configured - cannot query analytics");
      throw new Error("Analytics not configured");
    }
    
    if (!c.env.ACCOUNT_ID) {
      console.error("ACCOUNT_ID not configured - cannot query analytics");
      throw new Error("Analytics not configured");
    }

    // Build WHERE clause based on slug filter or user's accessible slugs
    let whereClause: string;
    
    if (slugFilter) {
      // Single slug filter - check if user has access
      const hasAccess = await canUserAccessLink(c.env.DB, slugFilter, email);
      if (!hasAccess) {
        throw new Error("Access denied to this link");
      }
      whereClause = `WHERE slug = '${slugFilter}'`;
    } else {
      // All user's slugs - get from D1
      const userSlugs = await getUserAccessibleSlugs(c.env.DB, email);
      console.log("User accessible slugs:", userSlugs);
      
      if (userSlugs.length === 0) {
        // No links yet - return empty results
        whereClause = "WHERE slug = 'nonexistent'"; // Will return no results
      } else {
        // Build slug OR clause (R2 SQL doesn't support IN clause)
        const slugConditions = userSlugs.map(s => `slug = '${s}'`).join(' OR ');
        whereClause = `WHERE (${slugConditions})`;
      }
    }

    console.log("Analytics WHERE clause:", whereClause);

    // Query for aggregate stats (using v5 table for now - will update to v6)
    const statsQuery = `
      SELECT 
        event_type,
        COUNT(*)
      FROM default.click_events_v6
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
      console.log("Stats query response:", JSON.stringify(statsData));
      
      if (statsData.errors && statsData.errors.length > 0) {
        console.error("R2 SQL stats query errors:", JSON.stringify(statsData.errors));
      }
      
      const rows = statsData.result?.rows;
      if (rows && rows.length > 0) {
        hasData = true;
        rows.forEach((row: any) => {
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
    }

    // Query for recent events
    const eventsQuery = `
      SELECT 
        timestamp,
        event_type,
        slug,
        out,
        link_text,
        user_agent
      FROM default.click_events_v6
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
      
      const rows = eventsData.result?.rows;
      if (rows && rows.length > 0) {
        recentEvents = rows;
      }
    }

    // Query for destination URL breakdown (clicks only)
    const destinationQuery = `
      SELECT 
        out,
        COUNT(*)
      FROM default.click_events_v6
      ${whereClause}
        AND event_type = 'click'
        AND out IS NOT NULL
      GROUP BY out
      LIMIT 100
    `;

    const destinationResponse = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: destinationQuery }),
      }
    );

    if (destinationResponse.ok) {
      const destinationData = await destinationResponse.json() as {
        result?: { rows?: Array<Record<string, any>> },
        errors?: Array<any>
      };
      
      const rows = destinationData.result?.rows;
      if (rows && rows.length > 0) {
        destinationBreakdown = rows
          .map((row: any) => ({
            out: row.out,
            click_count: row['count(*)'] || row.click_count || 0
          }))
          .sort((a, b) => b.click_count - a.click_count)
          .slice(0, 20);
      }
    }

    // Query for link text breakdown
    const linkTextQuery = `
      SELECT 
        link_text,
        out,
        COUNT(*)
      FROM default.click_events_v6
      ${whereClause}
        AND event_type = 'click'
        AND link_text IS NOT NULL
        AND out IS NOT NULL
      GROUP BY link_text, out
      LIMIT 100
    `;

    const linkTextResponse = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: linkTextQuery }),
      }
    );

    if (linkTextResponse.ok) {
      const linkTextData = await linkTextResponse.json() as {
        result?: { rows?: Array<Record<string, any>> },
        errors?: Array<any>
      };
      
      const rows = linkTextData.result?.rows;
      if (rows && rows.length > 0) {
        linkTextBreakdown = rows
          .map((row: any) => ({
            link_text: row.link_text,
            out: row.out,
            click_count: row['count(*)'] || row.click_count || 0
          }))
          .sort((a, b) => b.click_count - a.click_count)
          .slice(0, 20);
      }
    }

    // Query for slug breakdown (only when not filtering by slug)
    if (!slugFilter) {
      const slugQuery = `
        SELECT 
          slug,
          COUNT(*)
        FROM default.click_events_v6
        ${whereClause}
          AND event_type = 'click'
        GROUP BY slug
        LIMIT 100
      `;

      const slugResponse = await fetch(
        `https://api.sql.cloudflarestorage.com/api/v1/accounts/${c.env.ACCOUNT_ID}/r2-sql/query/linkedout-data-catalog`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.env.R2_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: slugQuery }),
        }
      );

      if (slugResponse.ok) {
        const slugData = await slugResponse.json() as {
          result?: { rows?: Array<Record<string, any>> },
          errors?: Array<any>
        };
        
        const rows = slugData.result?.rows;
        if (rows && rows.length > 0) {
          // Fetch link titles from D1 for each slug
          const slugsWithTitles = await Promise.all(
            rows.map(async (row: any) => {
              const link = await getLinkFromDB(c.env.DB, row.slug);
              return {
                slug: row.slug,
                title: link?.title || null,
                click_count: row['count(*)'] || 0
              };
            })
          );
          
          slugBreakdown = slugsWithTitles
            .sort((a, b) => b.click_count - a.click_count)
            .slice(0, 20);
        }
      }
    }
  } catch (error) {
    console.error("Error querying R2 SQL - exception thrown:", error);
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
            <p>Check the Worker logs for more details.</p>
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
            <a href="/analytics" class="btn btn-secondary">View All Links</a>
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

        ${!slugFilter && slugBreakdown.length > 0 ? html`
          <div class="card">
            <h3>Clicks by Link Page</h3>
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Slug</th>
                  <th style="text-align: right;">Clicks</th>
                  <th style="text-align: center;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${slugBreakdown.map(item => html`
                  <tr>
                    <td>
                      ${item.title ? html`
                        <strong>${item.title}</strong>
                      ` : html`
                        <span style="color: #999; font-style: italic;">Untitled</span>
                      `}
                    </td>
                    <td>
                      <a href="/out/${item.slug}" target="_blank" style="color: #0066cc; font-family: monospace; font-size: 0.9em;">
                        /out/${item.slug}
                      </a>
                    </td>
                    <td style="text-align: right; font-weight: 600;">${item.click_count}</td>
                    <td style="text-align: center;">
                      <a href="/analytics?slug=${item.slug}" style="display: inline-block; padding: 6px 12px; background: #f5f5f5; color: #333; text-decoration: none; border-radius: 4px; font-size: 13px; border: 1px solid #ddd;">
                        📊 Filter
                      </a>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        ` : html``}

        ${destinationBreakdown.length > 0 ? html`
          <div class="card">
            <h3>Top Clicked Links</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              Most popular destination URLs from your link pages
            </p>
            <table>
              <thead>
                <tr>
                  <th>Destination URL</th>
                  <th style="text-align: right;">Clicks</th>
                </tr>
              </thead>
              <tbody>
                ${destinationBreakdown.map(item => html`
                  <tr>
                    <td>
                      <a href="${item.out}" target="_blank" style="color: #0066cc;">
                        ${item.out.length > 60 ? item.out.substring(0, 60) + '...' : item.out}
                      </a>
                    </td>
                    <td style="text-align: right; font-weight: 600;">${item.click_count}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        ` : html``}

        ${linkTextBreakdown.length > 0 ? html`
          <div class="card">
            <h3>Most Clicked Link Text</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              Which link text gets the most engagement
            </p>
            <table>
              <thead>
                <tr>
                  <th>Link Text</th>
                  <th>Destination</th>
                  <th style="text-align: right;">Clicks</th>
                </tr>
              </thead>
              <tbody>
                ${linkTextBreakdown.map(item => html`
                  <tr>
                    <td style="font-weight: 500;">${item.link_text}</td>
                    <td>
                      <a href="${item.out}" target="_blank" style="color: #0066cc; font-size: 13px;">
                        ${item.out.length > 40 ? item.out.substring(0, 40) + '...' : item.out}
                      </a>
                    </td>
                    <td style="text-align: right; font-weight: 600;">${item.click_count}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        ` : html``}

        ${slugFilter ? html`
          <div class="card">
            <h3>Recent Events</h3>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Link Text</th>
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
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${event.link_text || '-'}
                    </td>
                    <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${event.out ? html`<a href="${event.out}" target="_blank" style="color: #0066cc;">${event.out.length > 40 ? event.out.substring(0, 40) + '...' : event.out}</a>` : '-'}
                    </td>
                    <td style="font-size: 11px; color: #666; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${event.user_agent ? (event.user_agent.length > 30 ? event.user_agent.substring(0, 30) + '...' : event.user_agent) : '-'}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        ` : html``}

      `
    })
  );
});

// Live preview API endpoint
dashboard.post("/api/preview", authMiddleware, async (c) => {
  try {
    const { markdown, theme_id, custom_css } = await c.req.json();

    // Get theme
    const theme = await getThemeFromDB(c.env.DB, theme_id);

    // Render markdown to HTML
    const htmlContent = await marked(markdown || '# Preview\n\nStart typing to see your content...');

    // Generate combined CSS
    const css = generateThemeCSS(theme, custom_css);

    return c.json({ html: htmlContent, css });
  } catch (err) {
    console.error('Preview error:', err);
    return c.json({ error: 'Preview failed' }, 500);
  }
});

export default dashboard;
