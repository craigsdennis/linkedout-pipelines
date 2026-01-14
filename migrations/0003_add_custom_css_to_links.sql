-- Add custom CSS column to outies table for per-outie styling
-- This allows users to customize theme styling per outie
-- Maintainers can edit custom CSS as it's part of the outie data

ALTER TABLE outies ADD COLUMN custom_css TEXT DEFAULT NULL;

-- Add comment for clarity
-- custom_css stores CSS that overrides/extends the base theme
-- Format: Raw CSS text (variables, selectors, properties)
-- Example: ":root { --primary-color: #ff0000; } h1 { font-size: 3em; }"
