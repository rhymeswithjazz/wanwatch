"use client";

import { useEffect } from 'react';

export function ThemeVariantInitializer() {
  useEffect(() => {
    // Fetch and apply user's theme variant preference
    const applyThemeVariant = async () => {
      try {
        const response = await fetch('/api/settings/theme');
        if (response.ok) {
          const data = await response.json();
          const themeVariant = data.themeVariant || 'default';
          document.documentElement.setAttribute('data-theme', themeVariant);
        }
      } catch (error) {
        console.error('Error fetching theme variant:', error);
        // Default to 'default' theme on error
        document.documentElement.setAttribute('data-theme', 'default');
      }
    };

    applyThemeVariant();
  }, []);

  return null;
}
