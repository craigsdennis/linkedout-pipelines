import { Hono } from "hono";
import { marked } from "marked";
import { stripIndents } from "common-tags";
import { jsxRenderer } from "hono/jsx-renderer";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get(
  "/out/*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <title>LinkedOut</title>
          <script src="/track.js" defer></script>
        </head>
        <body>
          <div>{children}</div>
        </body>
      </html>
    );
  })
);

app.get("/out/:slug", async (c) => {
  const slug = c.req.param();
  // TODO: Inject custom CSS
  // TODO: Pull from KV
  const value = stripIndents`# A markdown example
  
  This is the [first link](https://google.com).

  - And this is the [second](https://yahoo.com)
  - [Thirdly](https://third.ly)
  `;
  const html = await marked(value);
  return c.render(<article dangerouslySetInnerHTML={{ __html: html }} />);
});

app.post("/api/track", async(c) => {
  const payload = await c.req.json();
  // TODO verify
  console.log({payload});
  return c.body(null, 204);
});

export default app;
