/**
 * Theme Customizer with Live Preview
 * Handles: copying theme CSS, toggling custom CSS, live preview updates
 */

// Cache DOM elements
let themeSelect, customCssTextarea, customCssContainer, customizeBtn;
let contentTextarea, previewContainer, previewContent, previewStyles, togglePreviewBtn;
let themesData = {}; // Will be populated from page data

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  themeSelect = document.getElementById('theme_id');
  customCssTextarea = document.getElementById('custom_css');
  customCssContainer = document.getElementById('custom-css-container');
  customizeBtn = document.getElementById('customize-btn');
  contentTextarea = document.getElementById('content');
  previewContainer = document.getElementById('live-preview-container');
  previewContent = document.getElementById('preview-content');
  previewStyles = document.getElementById('preview-styles');
  togglePreviewBtn = document.getElementById('toggle-preview-btn');

  // Fetch themes data (embedded in page)
  loadThemesData();

  // Event listeners
  if (customizeBtn) {
    customizeBtn.addEventListener('click', handleCustomizeTheme);
  }

  if (togglePreviewBtn) {
    togglePreviewBtn.addEventListener('click', togglePreview);
  }

  // Live preview updates
  if (contentTextarea) {
    contentTextarea.addEventListener('input', debounce(updatePreview, 500));
  }

  if (customCssTextarea) {
    customCssTextarea.addEventListener('input', debounce(updatePreview, 500));
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      // If custom CSS is visible, ask if they want to reset
      if (customCssContainer && customCssContainer.style.display === 'block' && customCssTextarea.value.trim()) {
        if (confirm('Changing the base theme will keep your custom CSS. Do you want to reset to the new theme\'s CSS?')) {
          handleCustomizeTheme();
        }
      }
      updatePreview();
    });
  }
});

/**
 * Load themes data from the page (embedded JSON)
 */
function loadThemesData() {
  const themesDataElement = document.getElementById('themes-data');
  if (themesDataElement) {
    try {
      const themesArray = JSON.parse(themesDataElement.textContent);
      themesData = themesArray.reduce((acc, theme) => {
        acc[theme.id] = theme;
        return acc;
      }, {});
    } catch (err) {
      console.error('Failed to parse themes data:', err);
    }
  }
}

/**
 * Copy selected theme's CSS to custom CSS textarea
 */
function handleCustomizeTheme() {
  const selectedThemeId = themeSelect.value;
  const theme = themesData[selectedThemeId];

  if (!theme) {
    alert('Theme not found. Please refresh the page.');
    return;
  }

  // Generate CSS from theme
  let css = `/* Customized from: ${theme.name} */\n\n`;

  // Add CSS variables
  if (theme.css_variables) {
    css += '/* CSS Variables */\n:root {\n';
    for (const [key, value] of Object.entries(theme.css_variables)) {
      css += `  ${key}: ${value};\n`;
    }
    css += '}\n\n';
  }

  // Add additional CSS
  if (theme.additional_css) {
    css += '/* Additional Styles */\n';
    css += theme.additional_css;
  }

  // Populate textarea
  customCssTextarea.value = css;

  // Show custom CSS container
  customCssContainer.style.display = 'block';
  
  // Update button text
  customizeBtn.textContent = 'Reset to Selected Theme';

  // Update preview
  updatePreview();
}

/**
 * Toggle preview visibility
 */
function togglePreview() {
  const isHidden = previewContainer.style.display === 'none';
  
  if (isHidden) {
    previewContainer.style.display = 'block';
    togglePreviewBtn.textContent = 'Hide Preview';
    updatePreview();
  } else {
    previewContainer.style.display = 'none';
    togglePreviewBtn.textContent = 'Show Preview';
  }
}

/**
 * Update live preview with current markdown + CSS
 */
async function updatePreview() {
  // Skip if preview is hidden
  if (!previewContainer || previewContainer.style.display === 'none') {
    return;
  }

  const markdown = contentTextarea.value;
  const customCss = customCssTextarea.value;
  const selectedThemeId = themeSelect.value;

  try {
    // Call API to render markdown + CSS
    const response = await fetch('/dashboard/api/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdown,
        theme_id: selectedThemeId,
        custom_css: customCss || null,
      }),
    });

    if (!response.ok) {
      throw new Error('Preview failed');
    }

    const data = await response.json();

    // Update preview content (rendered HTML)
    previewContent.innerHTML = data.html;

    // Update preview styles (combined CSS)
    previewStyles.textContent = data.css;

  } catch (err) {
    console.error('Preview error:', err);
    previewContent.innerHTML = '<p style="color: red;">Preview failed. Check your markdown or CSS syntax.</p>';
  }
}

/**
 * Debounce helper for input events
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
