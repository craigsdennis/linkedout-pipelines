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
    <link rel="stylesheet" href="/styles.css">
    ${props.styles ? html`<style>${props.styles}</style>` : ''}
  </head>
  <body class="base-layout">
    ${props.children}
  </body>
</html>`;
};

// Dashboard layout with nav
export const DashboardLayout = (props: { 
  title: string; 
  email: string;
  isAdmin?: boolean;
  children: any;
  styles?: string;
  scripts?: string[];
}) => {
  return html`<!DOCTYPE html>
<html>
  <head>
    <title>${props.title} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/styles.css">
    ${props.styles ? html`<style>${props.styles}</style>` : ''}
  </head>
  <body class="dashboard-layout">
    <div class="header">
      <h1>${props.title}</h1>
      <div class="nav">
        <span>Logged in as: ${props.email}</span>
        <a href="/dashboard">Dashboard</a>
        <a href="/analytics">Analytics</a>
        ${props.isAdmin ? html`<a href="/admin">Admin</a>` : ''}
        <a href="/logout">Logout</a>
      </div>
    </div>
    ${props.children}
    ${props.scripts?.map(src => html`<script src="${src}"></script>`)}
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
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="auth-layout">
    ${props.children}
  </body>
</html>`;
};
