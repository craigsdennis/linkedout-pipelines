-- LinkedOut D1 Schema Migration
-- Creates all tables for users, links, themes, and maintainers

-- Users table
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Themes table (CSS customization)
CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  css_variables TEXT NOT NULL,  -- JSON string with CSS variable key-value pairs
  additional_css TEXT,          -- Optional raw CSS to append
  created_by TEXT,              -- NULL for system themes
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE SET NULL
);

-- Links table (previously in KV)
CREATE TABLE links (
  slug TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'default',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET DEFAULT,
  FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE
);

-- Link maintainers junction table (many-to-many)
CREATE TABLE link_maintainers (
  link_slug TEXT NOT NULL,
  user_email TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (link_slug, user_email),
  FOREIGN KEY (link_slug) REFERENCES links(slug) ON DELETE CASCADE,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(email) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_maintainers_user ON link_maintainers(user_email);
CREATE INDEX idx_maintainers_link ON link_maintainers(link_slug);
CREATE INDEX idx_links_theme ON links(theme_id);
CREATE INDEX idx_links_created_by ON links(created_by);
CREATE INDEX idx_themes_public ON themes(is_public);
CREATE INDEX idx_themes_created_by ON themes(created_by);
