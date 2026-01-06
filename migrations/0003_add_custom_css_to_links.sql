-- Add custom CSS column to links table for per-link styling
-- This allows users to customize theme styling per link
-- Maintainers can edit custom CSS as it's part of the link data

ALTER TABLE links ADD COLUMN custom_css TEXT DEFAULT NULL;

-- Add comment for clarity
-- custom_css stores CSS that overrides/extends the base theme
-- Format: Raw CSS text (variables, selectors, properties)
-- Example: ":root { --primary-color: #ff0000; } h1 { font-size: 3em; }"
