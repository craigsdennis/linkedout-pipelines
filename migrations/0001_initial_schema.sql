-- LinkedOut D1 Schema Migration
-- Creates all tables for users, outies, themes, and maintainers

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

-- Outies table (shareable pages)
CREATE TABLE outies (
  slug TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'default',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  custom_css TEXT DEFAULT NULL,
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET DEFAULT,
  FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE
);

-- Outie maintainers junction table (many-to-many)
CREATE TABLE outie_maintainers (
  outie_slug TEXT NOT NULL,
  user_email TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (outie_slug, user_email),
  FOREIGN KEY (outie_slug) REFERENCES outies(slug) ON DELETE CASCADE,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(email) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_maintainers_user ON outie_maintainers(user_email);
CREATE INDEX idx_maintainers_outie ON outie_maintainers(outie_slug);
CREATE INDEX idx_outies_theme ON outies(theme_id);
CREATE INDEX idx_outies_created_by ON outies(created_by);
CREATE INDEX idx_themes_public ON themes(is_public);
CREATE INDEX idx_themes_created_by ON themes(created_by);
