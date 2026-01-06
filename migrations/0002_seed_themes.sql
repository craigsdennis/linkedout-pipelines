-- Seed default themes for LinkedOut
-- 6 pre-built themes available to all users

-- Default Light Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'default',
  'Default Light',
  'Clean and minimal light theme with blue accents',
  '{"--primary-color":"#0066cc","--background":"#ffffff","--text-color":"#333333","--link-color":"#0066cc","--link-hover-color":"#0052a3","--font-family":"system-ui, -apple-system, sans-serif","--max-width":"800px","--border-radius":"8px","--spacing":"1rem","--secondary-background":"#f5f5f5"}',
  NULL,
  NULL,
  1,
  datetime('now')
);

-- Dark Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'dark',
  'Dark Mode',
  'Easy on the eyes dark theme with purple accents',
  '{"--primary-color":"#9d4edd","--background":"#1a1a2e","--text-color":"#eaeaea","--link-color":"#bb86fc","--link-hover-color":"#9d4edd","--font-family":"system-ui, -apple-system, sans-serif","--max-width":"800px","--border-radius":"8px","--spacing":"1rem","--secondary-background":"#16213e"}',
  'body { background: var(--background); color: var(--text-color); } a { color: var(--link-color); }',
  NULL,
  1,
  datetime('now')
);

-- Minimal Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'minimal',
  'Minimal Typography',
  'Typography-focused minimal design with serif fonts',
  '{"--primary-color":"#2c3e50","--background":"#fefefe","--text-color":"#2c3e50","--link-color":"#2c3e50","--link-hover-color":"#34495e","--font-family":"Georgia, Cambria, serif","--max-width":"680px","--border-radius":"2px","--spacing":"1.5rem","--secondary-background":"#f9f9f9"}',
  'h1, h2, h3 { font-weight: 300; letter-spacing: -0.02em; } a { text-decoration: underline; text-underline-offset: 3px; }',
  NULL,
  1,
  datetime('now')
);

-- Colorful Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'colorful',
  'Colorful Gradient',
  'Vibrant gradient backgrounds with bold colors',
  '{"--primary-color":"#ff6b6b","--background":"#ffffff","--text-color":"#2d3436","--link-color":"#fd79a8","--link-hover-color":"#e17055","--font-family":"system-ui, -apple-system, sans-serif","--max-width":"900px","--border-radius":"16px","--spacing":"1.25rem","--secondary-background":"linear-gradient(135deg, #667eea 0%, #764ba2 100%)"}',
  'article { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 3rem; border-radius: var(--border-radius); color: white; } article a { color: white; font-weight: 600; text-decoration: underline; }',
  NULL,
  1,
  datetime('now')
);

-- Conference Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'conference',
  'Conference Professional',
  'Professional theme perfect for conference talks and presentations',
  '{"--primary-color":"#1e3a8a","--background":"#ffffff","--text-color":"#1f2937","--link-color":"#2563eb","--link-hover-color":"#1e40af","--font-family":"Inter, system-ui, sans-serif","--max-width":"960px","--border-radius":"12px","--spacing":"1.5rem","--secondary-background":"#f3f4f6"}',
  'h1 { color: var(--primary-color); font-size: 2.5em; margin-bottom: 0.5em; } h2 { border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5em; margin-top: 2em; } a { font-weight: 500; padding: 0.5em 1em; background: var(--secondary-background); border-radius: 6px; display: inline-block; margin: 0.25em 0; text-decoration: none; transition: all 0.2s; } a:hover { background: var(--primary-color); color: white; }',
  NULL,
  1,
  datetime('now')
);

-- Retro Theme
INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at)
VALUES (
  'retro',
  'Retro 90s',
  'Nostalgic 90s web design with bright colors and fun styling',
  '{"--primary-color":"#ff00ff","--background":"#00ffff","--text-color":"#000000","--link-color":"#0000ff","--link-hover-color":"#ff00ff","--font-family":"Comic Sans MS, cursive, sans-serif","--max-width":"800px","--border-radius":"0px","--spacing":"1rem","--secondary-background":"#ffff00"}',
  'body { background: var(--background); } article { background: var(--secondary-background); border: 5px solid #000000; padding: 2rem; } h1 { text-decoration: underline; color: var(--primary-color); text-shadow: 2px 2px 0px #000000; } a { color: var(--link-color); font-weight: bold; text-decoration: underline; } a:hover { background: var(--primary-color); color: white; }',
  NULL,
  1,
  datetime('now')
);
