import { Hono } from "hono";
import { marked } from "marked";
import { jsxRenderer } from "hono/jsx-renderer";
import { getCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { waitUntil } from "cloudflare:workers";
import QRCode from "qrcode";
import type { ClickEvent } from "./types";
import { verifyToken } from "./utils/auth";
import { getCfProperties, getVisitorId, generateThemeCSS } from "./utils/helpers";
import { getLinkFromDB, getThemeFromDB } from "./utils/db";
import { BaseLayout } from "./views/layouts";
import tracking from "./routes/tracking";
import auth from "./routes/auth";
import dashboard from "./routes/dashboard";


type Variables = {
  userEmail: string;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Mount route modules
app.route("/", tracking);
app.route("/", auth);
app.route("/", dashboard);


// Public link viewing page with tracking
app.get(
  "/out/*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <title>LinkedOut</title>
          <link rel="icon" type="image/png" href="/favicon.png" />
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

  // Get link from D1
  const link = await getLinkFromDB(c.env.DB, slug);
  if (!link) {
    return c.html("<h1>404 - Link not found</h1>", 404);
  }

  // Get theme
  const theme = await getThemeFromDB(c.env.DB, link.theme_id);
  const contentHtml = await marked(link.content);

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

  // Generate theme CSS from variables + custom CSS
  const themeStyles = generateThemeCSS(theme, link.custom_css);
  
  // Track page view asynchronously (don't block response)
  const pageViewEvent: ClickEvent = {
    timestamp: new Date().toISOString(),
    url: c.req.url,
    out: null,
    slug: link.slug,
    visitor_id: getVisitorId(c),
    user_agent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    event_type: "page_view",
    ...getCfProperties(c.req.raw),
  };

  waitUntil((async () => {
    console.log("Sending page_view event:", JSON.stringify(pageViewEvent));
    try {
      await c.env.CLICK_STREAM.send([pageViewEvent]);
      console.log("page_view event sent successfully");
    } catch (err) {
      console.error("Failed to send page_view event:", err);
      console.error("Event was:", JSON.stringify(pageViewEvent));
    }
  })());

  // Prepare Open Graph metadata
  const pageTitle = link.title || slug;
  const pageUrl = c.req.url;
  const faviconUrl = `${new URL(c.req.url).origin}/favicon.png`;
  // Extract plain text description from markdown (first 200 chars)
  const plainText = link.content
    .replace(/[#*_`\[\]()]/g, '') // Remove markdown formatting
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim()
    .substring(0, 200);
  const pageDescription = plainText + (plainText.length >= 200 ? '...' : '');

  // Build full HTML with OG tags
  const fullHtml = html`<!DOCTYPE html>
<html>
  <head>
    <title>${pageTitle} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${pageDescription}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${pageDescription}">
    <meta property="og:image" content="${faviconUrl}">
    <meta property="og:image:width" content="1024">
    <meta property="og:image:height" content="1024">
    <meta property="og:site_name" content="LinkedOut">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:url" content="${pageUrl}">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${pageDescription}">
    <meta name="twitter:image" content="${faviconUrl}">
    
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles.css">
    <script src="/track.js" defer></script>
    <script src="/qr.js" defer></script>
    ${themeStyles ? html`<style>${raw(themeStyles)}</style>` : ''}
  </head>
  <body class="base-layout">
    <article>${raw(contentHtml)}</article>
    <script>window.qrSlug = '${slug}';</script>
    <div id="qr-modal" class="qr-modal" onclick="if(event.target === this) hideQR()">
      <button class="qr-modal-close" onclick="hideQR()">×</button>
      <div class="qr-modal-content">
        <h2>Share this page</h2>
        <div id="qr-code-container">${raw(qrSvg)}</div>
        <p style="font-size: 14px; color: #666; word-break: break-all; margin: 20px 0;">
          ${pageUrl}
        </p>
        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          <button class="btn" onclick="downloadQRCode()">Download PNG</button>
          <button class="btn btn-secondary" onclick="hideQR()">Close (Q or ESC)</button>
        </div>
      </div>
    </div>
  </body>
</html>`;

  return c.html(fullHtml);
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
    const testQuery = `SELECT COUNT(*) FROM default.click_events_v5`;
    
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
