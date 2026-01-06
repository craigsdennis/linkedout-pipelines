import { getCookie } from "hono/cookie";
import type { ClickEvent, Theme } from "../types";

// Helper to extract Cloudflare request metadata
export function getCfProperties(request: Request): Partial<ClickEvent> {
  const cf = (request as any).cf;
  if (!cf) return {};
  
  return {
    country: cf.country || undefined,
    city: cf.city || undefined,
    region: cf.region || cf.regionCode || undefined,
    colo: cf.colo || undefined,
    latitude: cf.latitude || undefined,
    longitude: cf.longitude || undefined,
    timezone: cf.timezone || undefined,
  };
}

// Helper to get visitor ID from cookie
export function getVisitorId(c: any): string | undefined {
  return getCookie(c, "_lo_vid");
}

/**
 * Generate CSS from theme variables and custom overrides
 * @param theme - The base theme object (with css_variables and additional_css)
 * @param customCSS - Optional per-link custom CSS
 * @returns Combined CSS string ready to inject into <style> tag
 */
export function generateThemeCSS(
  theme: Theme | null,
  customCSS: string | null = null
): string {
  let css = '';

  // 1. Add theme CSS variables as :root
  if (theme?.css_variables) {
    const cssVars = Object.entries(theme.css_variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
    
    css += `:root {\n${cssVars}\n}\n\n`;
  }

  // 2. Add theme's additional CSS
  if (theme?.additional_css) {
    css += `/* Theme: ${theme.name} */\n${theme.additional_css}\n\n`;
  }

  // 3. Add per-link custom CSS (overrides theme)
  if (customCSS) {
    css += `/* Custom Link Styles */\n${customCSS}`;
  }

  return css;
}

/**
 * Get the raw CSS representation of a theme (for copying to custom CSS textarea)
 * @param theme - The theme object
 * @returns CSS string with variables and additional styles
 */
export function getThemeSourceCSS(theme: Theme): string {
  let css = '';

  // CSS variables
  if (theme.css_variables) {
    const cssVars = Object.entries(theme.css_variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
    
    css += `/* CSS Variables from ${theme.name} theme */\n:root {\n${cssVars}\n}\n\n`;
  }

  // Additional CSS
  if (theme.additional_css) {
    css += `/* Additional Styles */\n${theme.additional_css}`;
  }

  return css;
}
