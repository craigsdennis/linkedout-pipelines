import { waitUntil } from "cloudflare:workers";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { marked } from "marked";
import QRCode from "qrcode";
import auth from "./routes/auth";
import dashboard from "./routes/dashboard";
import tracking from "./routes/tracking";
import type { ClickEvent } from "./types";
import { getOutie, getTheme } from "./utils/db";
import {
	generateThemeCSS,
	getCfProperties,
	getVisitorId,
} from "./utils/helpers";
import { getMapData } from "./utils/map-data";
import { BaseLayout } from "./views/layouts";
import { LeafletMap } from "./views/leaflet-map";

type Variables = {
	userEmail: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount route modules
app.route("/", tracking);
app.route("/", auth);
app.route("/dashboard", dashboard);

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
	}),
);

app.get("/out/:slug", async (c) => {
	const { slug } = c.req.param();

	// Get outie from D1
	const link = await getOutie(slug);
	if (!link) {
		return c.html("<h1>404 - Outie not found</h1>", 404);
	}

	// Get theme
	const theme = await getTheme(link.theme_id);
	const contentHtml = await marked(link.content);

	// Generate QR code for this page
	const qrTrackUrl = `${new URL(c.req.url).origin}/q/${slug}`;
	const qrSvg = await QRCode.toString(qrTrackUrl, {
		type: "svg",
		width: 400,
		margin: 2,
		color: {
			dark: "#000000",
			light: "#ffffff",
		},
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

	waitUntil(
		(async () => {
			console.log("Sending page_view event:", JSON.stringify(pageViewEvent));
			try {
				await c.env.EVENT_STREAM.send([pageViewEvent]);
				console.log("page_view event sent successfully");
			} catch (err) {
				console.error("Failed to send page_view event:", err);
				console.error("Event was:", JSON.stringify(pageViewEvent));
			}
		})(),
	);

	// Prepare Open Graph metadata
	const pageTitle = link.title || slug;
	const pageUrl = c.req.url;
	const faviconUrl = `${new URL(c.req.url).origin}/favicon.png`;
	// Extract plain text description from markdown (first 200 chars)
	const plainText = link.content
		.replace(/[#*_`[\]()]/g, "") // Remove markdown formatting
		.replace(/\n+/g, " ") // Replace newlines with spaces
		.trim()
		.substring(0, 200);
	const pageDescription = plainText + (plainText.length >= 200 ? "..." : "");

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
    ${themeStyles ? html`<style>${raw(themeStyles)}</style>` : ""}
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

// QR code tracking redirect
app.get("/q/:slug", async (c) => {
	const { slug } = c.req.param();

	// Get outie from D1
	const link = await getOutie(slug);
	if (!link) {
		return c.html("<h1>404 - Outie not found</h1>", 404);
	}

	// Track QR scan asynchronously (don't block response)
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

	waitUntil(
		(async () => {
			console.log("Sending qr_scan event:", JSON.stringify(qrScanEvent));
			try {
				await c.env.CLICK_STREAM.send([qrScanEvent]);
				console.log("qr_scan event sent successfully");
			} catch (err) {
				console.error("Failed to send qr_scan event:", err);
				console.error("Event was:", JSON.stringify(qrScanEvent));
			}
		})(),
	);

	// Redirect to the actual outie page
	return c.redirect(`/out/${slug}`);
});

// Home page
app.get("/", async (c) => {
	// Check if user is authenticated via Cloudflare Access
	const jwtHeader = c.req.header("Cf-Access-Jwt-Assertion");
	let isAuthenticated = false;

	if (jwtHeader) {
		const { getUserFromAccessJWT } = await import("./utils/cloudflare-access");
		const userInfo = getUserFromAccessJWT(jwtHeader);
		isAuthenticated = !!userInfo;
	}

	// Get map data for public showcase
	let mapData;
	try {
		mapData = await getMapData();
	} catch (error) {
		console.error("Failed to load map data for homepage:", error);
		mapData = null;
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
        .showcase {
          max-width: 900px;
          margin: 40px auto;
        }
      `,
			children: html`
        <div class="hero">
          <h1>LinkedOut</h1>
          <p>Share your links after talks and track every click with analytics</p>
          ${
						isAuthenticated
							? html`<a href="/dashboard" class="cta">Go to Dashboard</a>`
							: html`<a href="/dashboard" class="cta">Get Started</a>`
					}
        </div>
        
        ${
					mapData && mapData.totalViews > 0
						? html`
          <div class="showcase card">
            ${LeafletMap({ mapData })}
          </div>
        `
						: ""
				}
      `,
		}),
	);
});

// Catch-all for static assets and 404
app.get("*", async (c) => {
	// Check if this is a static asset request
	if (
		c.req.path.startsWith("/track.js") ||
		c.req.path.match(/\.(css|js|png|jpg|gif|ico)$/)
	) {
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
      `,
		}),
		404,
	);
});

export default app;
