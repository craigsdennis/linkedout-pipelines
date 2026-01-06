import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { verifyToken, createAuthToken, isUserAuthorized, getUser, createUser } from "../utils/auth";
import { AuthLayout, BaseLayout } from "../views/layouts";

type Variables = {
  userEmail: string;
};

const auth = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Login page
auth.get("/login", (c) => {
  return c.html(
    AuthLayout({
      title: "Login",
      children: html`
        <h1>Login to LinkedOut</h1>
        <form method="POST" action="/auth/request-magic-link">
          <p>Enter your email to receive a magic link:</p>
          <input type="email" name="email" placeholder="your@email.com" required />
          <button type="submit">Send Magic Link</button>
        </form>
        <p style="text-align: center; color: #666; font-size: 14px;">
          No password needed! We'll email you a secure login link.
        </p>
      `
    })
  );
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
    return c.html(
      AuthLayout({
        title: "Access Denied",
        children: html`
          <h2>Access Denied</h2>
          <p>Your email (${email}) is not authorized to use LinkedOut.</p>
          <p>Please contact an administrator to request access.</p>
          <a href="/">Back to home</a>
        `
      }), 403
    );
  }

  // Create auth token
  const token = await createAuthToken(email);
  const magicLink = `${new URL(c.req.url).origin}/auth/verify?token=${token}`;

  // TODO: Send email with magic link
  // For now, just display it (for development)
  return c.html(
    BaseLayout({
      title: "Magic Link Sent",
      children: html`
        <h2>Magic Link Sent!</h2>
        <p>Click the link below to login:</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
        <p style="color: #666; font-size: 14px;">
          In production, this would be sent to your email: ${email}
        </p>
        <p style="color: #666; font-size: 14px;">
          This link expires in 24 hours.
        </p>
      `
    })
  );
});

// Verify magic link
auth.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html("Invalid token", 400);
  }

  const email = await verifyToken(token);
  if (!email) {
    return c.html(
      AuthLayout({
        title: "Invalid Link",
        children: html`
          <h2>Invalid or Expired Link</h2>
          <p>This magic link is invalid or has expired.</p>
          <a href="/login">Request a new link</a>
        `
      }), 401
    );
  }

  // Ensure user exists in D1 database (create if first login)
  let user = await getUser(email);
  if (!user) {
    console.log(`Creating new user in D1: ${email}`);
    user = await createUser(email, false); // Not admin by default
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
