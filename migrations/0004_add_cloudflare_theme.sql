-- Add Cloudflare Developer theme inspired by developers.cloudflare.com
-- Clean, professional design with Cloudflare's signature orange accent

INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (
  'cloudflare',
  'Cloudflare',
  'Clean and professional theme inspired by Cloudflare Developers',
  json('{
    "--primary-color": "#f38020",
    "--secondary-color": "#0051c3",
    "--background": "#ffffff",
    "--text-color": "#1f2937",
    "--text-muted": "#6b7280",
    "--link-color": "#0051c3",
    "--link-hover": "#f38020",
    "--border-color": "#e5e7eb",
    "--code-background": "#f3f4f6",
    "--heading-color": "#111827"
  }'),
  '/* Cloudflare Developer Theme */

/* Typography */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background: var(--background);
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

h1, h2, h3, h4, h5, h6 {
  color: var(--heading-color);
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 {
  font-size: 2.5em;
  margin-top: 0;
  padding-bottom: 0.3em;
  border-bottom: 2px solid var(--primary-color);
}

h2 {
  font-size: 2em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid var(--border-color);
}

h3 { font-size: 1.5em; }
h4 { font-size: 1.25em; }

/* Links */
a {
  color: var(--link-color);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s ease;
}

a:hover {
  color: var(--link-hover);
  border-bottom-color: var(--link-hover);
}

/* Code blocks */
code {
  background: var(--code-background);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  color: var(--secondary-color);
}

pre {
  background: var(--code-background);
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  border-left: 3px solid var(--primary-color);
}

pre code {
  background: none;
  padding: 0;
  color: var(--text-color);
}

/* Lists */
ul, ol {
  padding-left: 2em;
  margin: 1em 0;
}

li {
  margin: 0.5em 0;
}

/* Blockquotes */
blockquote {
  border-left: 4px solid var(--primary-color);
  margin: 1.5em 0;
  padding: 0.5em 1em;
  background: var(--code-background);
  color: var(--text-muted);
  font-style: italic;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 2px solid var(--border-color);
  margin: 2em 0;
}

/* Images */
img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 1em 0;
}

/* Tables */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5em 0;
}

th, td {
  border: 1px solid var(--border-color);
  padding: 12px;
  text-align: left;
}

th {
  background: var(--code-background);
  font-weight: 600;
  color: var(--heading-color);
}

tr:nth-child(even) {
  background: #fafafa;
}

/* Paragraphs */
p {
  margin: 1em 0;
  line-height: 1.7;
}

/* Strong emphasis */
strong {
  font-weight: 600;
  color: var(--heading-color);
}

/* Accent bar for visual interest */
article::before {
  content: "";
  display: block;
  width: 60px;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
  margin-bottom: 2em;
  border-radius: 2px;
}',
  NULL,
  1,
  datetime('now')
);
