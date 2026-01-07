/**
 * D1 Database Access Layer for LinkedOut
 * All database queries are centralized here
 */

import { env } from "cloudflare:workers";
import type { User, Link, LinkWithMaintainers, LinkMaintainer, Theme } from "../types";

// ==================== USER OPERATIONS ====================

export async function getUser(email: string
): Promise<User | null> {
  const result = await env.DB
    .prepare("SELECT email, is_admin, created_at FROM users WHERE email = ?")
    .bind(email)
    .first<{
      email: string;
      is_admin: number;
      created_at: string;
    }>();

  if (!result) return null;

  return {
    email: result.email,
    is_admin: result.is_admin === 1,
    created_at: result.created_at,
  };
}

export async function createUser(email: string,
  isAdmin: boolean
): Promise<User> {
  const user: User = {
    email,
    is_admin: isAdmin,
    created_at: new Date().toISOString(),
  };

  await env.DB
    .prepare(
      "INSERT INTO users (email, is_admin, created_at) VALUES (?, ?, ?)"
    )
    .bind(user.email, isAdmin ? 1 : 0, user.created_at)
    .run();

  return user;
}

export async function deleteUser(email: string
): Promise<void> {
  await env.DB.prepare("DELETE FROM users WHERE email = ?").bind(email).run();
}

export async function getAllUsers(): Promise<User[]> {
  const result = await env.DB
    .prepare("SELECT email, is_admin, created_at FROM users ORDER BY created_at DESC")
    .all<{
      email: string;
      is_admin: number;
      created_at: string;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    email: row.email,
    is_admin: row.is_admin === 1,
    created_at: row.created_at,
  }));
}

// ==================== LINK OPERATIONS ====================

export async function getLink(slug: string
): Promise<Link | null> {
  const result = await env.DB
    .prepare(
      "SELECT slug, title, content, theme_id, created_by, created_at, updated_at, custom_css FROM links WHERE slug = ?"
    )
    .bind(slug)
    .first<{
      slug: string;
      title: string | null;
      content: string;
      theme_id: string;
      created_by: string;
      created_at: string;
      updated_at: string;
      custom_css: string | null;
    }>();

  if (!result) return null;

  return {
    slug: result.slug,
    title: result.title,
    content: result.content,
    theme_id: result.theme_id,
    created_by: result.created_by,
    created_at: result.created_at,
    updated_at: result.updated_at,
    custom_css: result.custom_css,
  };
}

export async function getLinkWithMaintainers(slug: string
): Promise<LinkWithMaintainers | null> {
  const link = await getLink(slug);
  if (!link) return null;

  const maintainers = await getLinkMaintainers(slug);

  return {
    ...link,
    maintainers: maintainers.map((m) => m.user_email),
  };
}

export async function createLink(link: Omit<Link, "created_at" | "updated_at">,
  maintainerEmail: string
): Promise<Link> {
  const now = new Date().toISOString();
  const fullLink: Link = {
    ...link,
    created_at: now,
    updated_at: now,
  };

  // Insert link
  await env.DB
    .prepare(
      "INSERT INTO links (slug, title, content, theme_id, created_by, created_at, updated_at, custom_css) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      fullLink.slug,
      fullLink.title,
      fullLink.content,
      fullLink.theme_id,
      fullLink.created_by,
      fullLink.created_at,
      fullLink.updated_at,
      fullLink.custom_css
    )
    .run();

  // Add creator as first maintainer
  await addMaintainer(fullLink.slug, maintainerEmail, maintainerEmail);

  return fullLink;
}

export async function updateLink(slug: string,
  updates: Partial<Pick<Link, "title" | "content" | "theme_id" | "custom_css">>
): Promise<void> {
  const now = new Date().toISOString();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    setClauses.push("content = ?");
    values.push(updates.content);
  }
  if (updates.theme_id !== undefined) {
    setClauses.push("theme_id = ?");
    values.push(updates.theme_id);
  }
  if (updates.custom_css !== undefined) {
    setClauses.push("custom_css = ?");
    values.push(updates.custom_css);
  }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = ?");
  values.push(now);
  values.push(slug);

  await env.DB
    .prepare(
      `UPDATE links SET ${setClauses.join(", ")} WHERE slug = ?`
    )
    .bind(...values)
    .run();
}

export async function deleteLink(slug: string
): Promise<void> {
  await env.DB.prepare("DELETE FROM links WHERE slug = ?").bind(slug).run();
}

export async function getUserLinks(email: string
): Promise<Link[]> {
  const result = await env.DB
    .prepare(
      `SELECT DISTINCT l.slug, l.title, l.content, l.theme_id, l.created_by, l.created_at, l.updated_at, l.custom_css
       FROM links l
       INNER JOIN link_maintainers lm ON l.slug = lm.link_slug
       WHERE lm.user_email = ?
       ORDER BY l.created_at DESC`
    )
    .bind(email)
    .all<{
      slug: string;
      title: string | null;
      content: string;
      theme_id: string;
      created_by: string;
      created_at: string;
      updated_at: string;
      custom_css: string | null;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    slug: row.slug,
    title: row.title,
    content: row.content,
    theme_id: row.theme_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    custom_css: row.custom_css,
  }));
}

// ==================== MAINTAINER OPERATIONS ====================

export async function canUserAccessLink(slug: string,
  email: string
): Promise<boolean> {
  const result = await env.DB
    .prepare(
      "SELECT 1 FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
    )
    .bind(slug, email)
    .first();

  return result !== null;
}

export async function addMaintainer(slug: string,
  email: string,
  addedBy: string
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB
    .prepare(
      "INSERT INTO link_maintainers (link_slug, user_email, added_at, added_by) VALUES (?, ?, ?, ?)"
    )
    .bind(slug, email, now, addedBy)
    .run();
}

export async function removeMaintainer(slug: string,
  email: string
): Promise<void> {
  await env.DB
    .prepare(
      "DELETE FROM link_maintainers WHERE link_slug = ? AND user_email = ?"
    )
    .bind(slug, email)
    .run();
}

export async function getLinkMaintainers(slug: string
): Promise<LinkMaintainer[]> {
  const result = await env.DB
    .prepare(
      "SELECT link_slug, user_email, added_at, added_by FROM link_maintainers WHERE link_slug = ? ORDER BY added_at ASC"
    )
    .bind(slug)
    .all<{
      link_slug: string;
      user_email: string;
      added_at: string;
      added_by: string | null;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    link_slug: row.link_slug,
    user_email: row.user_email,
    added_at: row.added_at,
    added_by: row.added_by,
  }));
}

export async function getUserAccessibleSlugs(email: string
): Promise<string[]> {
  const result = await env.DB
    .prepare(
      "SELECT link_slug FROM link_maintainers WHERE user_email = ? ORDER BY added_at DESC"
    )
    .bind(email)
    .all<{ link_slug: string }>();

  if (!result.results) return [];

  return result.results.map((row) => row.link_slug);
}

// ==================== THEME OPERATIONS ====================

export async function getTheme(themeId: string
): Promise<Theme | null> {
  const result = await env.DB
    .prepare(
      "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE id = ?"
    )
    .bind(themeId)
    .first<{
      id: string;
      name: string;
      description: string | null;
      css_variables: string;
      additional_css: string | null;
      created_by: string | null;
      is_public: number;
      created_at: string;
    }>();

  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    css_variables: JSON.parse(result.css_variables),
    additional_css: result.additional_css,
    created_by: result.created_by,
    is_public: result.is_public === 1,
    created_at: result.created_at,
  };
}

export async function getAllThemes(): Promise<Theme[]> {
  const result = await env.DB
    .prepare(
      "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes ORDER BY name ASC"
    )
    .all<{
      id: string;
      name: string;
      description: string | null;
      css_variables: string;
      additional_css: string | null;
      created_by: string | null;
      is_public: number;
      created_at: string;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    css_variables: JSON.parse(row.css_variables),
    additional_css: row.additional_css,
    created_by: row.created_by,
    is_public: row.is_public === 1,
    created_at: row.created_at,
  }));
}

export async function getPublicThemes(): Promise<Theme[]> {
  const result = await env.DB
    .prepare(
      "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE is_public = 1 ORDER BY name ASC"
    )
    .all<{
      id: string;
      name: string;
      description: string | null;
      css_variables: string;
      additional_css: string | null;
      created_by: string | null;
      is_public: number;
      created_at: string;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    css_variables: JSON.parse(row.css_variables),
    additional_css: row.additional_css,
    created_by: row.created_by,
    is_public: row.is_public === 1,
    created_at: row.created_at,
  }));
}

export async function getUserThemes(email: string
): Promise<Theme[]> {
  const result = await env.DB
    .prepare(
      "SELECT id, name, description, css_variables, additional_css, created_by, is_public, created_at FROM themes WHERE created_by = ? OR is_public = 1 ORDER BY name ASC"
    )
    .bind(email)
    .all<{
      id: string;
      name: string;
      description: string | null;
      css_variables: string;
      additional_css: string | null;
      created_by: string | null;
      is_public: number;
      created_at: string;
    }>();

  if (!result.results) return [];

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    css_variables: JSON.parse(row.css_variables),
    additional_css: row.additional_css,
    created_by: row.created_by,
    is_public: row.is_public === 1,
    created_at: row.created_at,
  }));
}

export async function createTheme(theme: Omit<Theme, "created_at">
): Promise<Theme> {
  const now = new Date().toISOString();
  const fullTheme: Theme = {
    ...theme,
    created_at: now,
  };

  await env.DB
    .prepare(
      "INSERT INTO themes (id, name, description, css_variables, additional_css, created_by, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      fullTheme.id,
      fullTheme.name,
      fullTheme.description,
      JSON.stringify(fullTheme.css_variables),
      fullTheme.additional_css,
      fullTheme.created_by,
      fullTheme.is_public ? 1 : 0,
      fullTheme.created_at
    )
    .run();

  return fullTheme;
}

export async function updateTheme(themeId: string,
  updates: Partial<Omit<Theme, "id" | "created_at" | "created_by">>
): Promise<void> {
  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    setClauses.push("name = ?");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push("description = ?");
    values.push(updates.description);
  }
  if (updates.css_variables !== undefined) {
    setClauses.push("css_variables = ?");
    values.push(JSON.stringify(updates.css_variables));
  }
  if (updates.additional_css !== undefined) {
    setClauses.push("additional_css = ?");
    values.push(updates.additional_css);
  }
  if (updates.is_public !== undefined) {
    setClauses.push("is_public = ?");
    values.push(updates.is_public ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  values.push(themeId);

  await env.DB
    .prepare(`UPDATE themes SET ${setClauses.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteThemeFromDB(themeId: string
): Promise<void> {
  await env.DB.prepare("DELETE FROM themes WHERE id = ?").bind(themeId).run();
}
