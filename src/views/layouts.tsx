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
    <style>
      body {
        max-width: 800px;
        margin: 40px auto;
        padding: 0 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      h1, h2 {
        color: #333;
      }
      a {
        color: #0066cc;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      button, .btn {
        padding: 10px 20px;
        background: #0066cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        text-decoration: none;
        display: inline-block;
      }
      button:hover, .btn:hover {
        background: #0052a3;
        text-decoration: none;
      }
      input[type="text"], input[type="email"], textarea {
        width: 100%;
        padding: 12px;
        margin: 10px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
        font-size: 16px;
      }
      .message {
        padding: 15px;
        margin: 15px 0;
        border-radius: 4px;
      }
      .success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }
      .error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
      }
      .warning {
        background: #fff3cd;
        color: #856404;
        border: 1px solid #ffc107;
      }
      ${props.styles || ''}
    </style>
  </head>
  <body>
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
}) => {
  return html`<!DOCTYPE html>
<html>
  <head>
    <title>${props.title} - LinkedOut</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      .nav a:hover {
        text-decoration: underline;
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
        border: none;
        cursor: pointer;
      }
      .btn:hover {
        background: #0052a3;
        text-decoration: none;
      }
      .btn-secondary {
        background: #666;
      }
      .btn-secondary:hover {
        background: #555;
      }
      .btn-danger {
        background: #dc3545;
      }
      .btn-danger:hover {
        background: #c82333;
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
    </style>
  </head>
  <body>
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
    <style>
      body {
        max-width: 400px;
        margin: 100px auto;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      }
      h1 {
        text-align: center;
      }
      input {
        width: 100%;
        padding: 12px;
        margin: 10px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
        font-size: 16px;
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
      a {
        color: #0066cc;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
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
    ${props.children}
  </body>
</html>`;
};
