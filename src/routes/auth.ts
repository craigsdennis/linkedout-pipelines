import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifyToken, createAuthToken, isUserAuthorized } from "../utils/auth";

type Variables = {
  userEmail: string;
};

const auth = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Login page
auth.get("/login", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login - LinkedOut</title>
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
auth.get("/logout", async (c) => {
  const token = getCookie(c, "auth_token");
  if (token) {
    await c.env.AUTH_TOKENS.delete(token);
  }
  setCookie(c, "auth_token", "", { maxAge: 0 });
  return c.redirect("/");
});

// Request magic link
auth.post("/auth/request-magic-link", async (c) => {
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
auth.get("/auth/verify", async (c) => {
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

export default auth;
