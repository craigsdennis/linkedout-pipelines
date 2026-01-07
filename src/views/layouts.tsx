import { html } from "hono/html";

// Base HTML layout
export const BaseLayout = (props: { 
  title: string; 
  children: any; 
  styles?: string;
}) => {
  return html`<!DOCTYPE html>
<html>
  <head>
    <title>${props.title} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles.css">
    ${props.styles ? html`<style>${props.styles}</style>` : ''}
  </head>
  <body class="base-layout">
    ${props.children}
    <footer class="site-footer">
      <p class="footer-line">Built with 🧡 using <a href="https://developers.cloudflare.com/pipelines/" target="_blank" rel="noopener">Cloudflare Pipelines</a></p>
      <p class="footer-line"><a href="https://github.com/craigsdennis" target="_blank" rel="noopener">👀 the code</a></p>
    </footer>
  </body>
</html>`;
};

// Dashboard layout with nav
export const DashboardLayout = (props: { 
  title: string; 
  email: string;
  userName?: string;
  isAdmin?: boolean;
  children: any;
  styles?: string;
  scripts?: string[];
}) => {
  const displayName = props.userName || props.email.split('@')[0];
  return html`<!DOCTYPE html>
<html>
  <head>
    <title>${props.title} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles.css">
    ${props.styles ? html`<style>${props.styles}</style>` : ''}
  </head>
  <body class="dashboard-layout">
    <div class="header">
      <h1>${props.title}</h1>
      <div class="nav">
        <span>Welcome, ${displayName}</span>
        <a href="/dashboard">Dashboard</a>
        <a href="/dashboard/analytics">Analytics</a>
        ${props.isAdmin ? html`<a href="/dashboard/admin">Admin</a>` : ''}
        <a href="/logout">Logout</a>
      </div>
    </div>
    ${props.children}
    ${props.scripts?.map(src => html`<script src="${src}"></script>`)}
    <footer class="site-footer">
      <p class="footer-line">Built with 🧡 using <a href="https://developers.cloudflare.com/pipelines/" target="_blank" rel="noopener">Cloudflare Pipelines</a></p>
      <p class="footer-line"><a href="https://github.com/craigsdennis" target="_blank" rel="noopener">👀 the code</a></p>
    </footer>
  </body>
</html>`;
};

// Simple centered layout for auth pages
export const AuthLayout = (props: { 
  title: string; 
  children: any; 
}) => {
  return html`<!DOCTYPE html>
<html>
  <head>
    <title>${props.title} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="auth-layout">
    ${props.children}
    <footer class="site-footer">
      <p class="footer-line">Built with 🧡 using <a href="https://developers.cloudflare.com/pipelines/" target="_blank" rel="noopener">Cloudflare Pipelines</a></p>
      <p class="footer-line"><a href="https://github.com/craigsdennis" target="_blank" rel="noopener">👀 the code</a></p>
    </footer>
  </body>
</html>`;
};
