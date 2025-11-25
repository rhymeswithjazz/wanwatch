"use client";

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

const THEME_STORAGE_KEY = 'wanwatch-theme-variant';

export function ThemeVariantInitializer() {
  const { status } = useSession();

  useEffect(() => {
    // Immediately apply cached theme from localStorage to prevent flash
    const cachedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (cachedTheme) {
      document.documentElement.setAttribute('data-theme', cachedTheme);
    }
  }, []);

  useEffect(() => {
    // Only fetch from API when authenticated
    if (status !== 'authenticated') {
      return;
    }

    const fetchAndApplyTheme = async () => {
      try {
        const response = await fetch('/api/settings/theme');
        if (response.ok) {
          const data = await response.json();
          const themeVariant = data.themeVariant || 'default';
          // Update localStorage cache
          localStorage.setItem(THEME_STORAGE_KEY, themeVariant);
          // Apply theme
          document.documentElement.setAttribute('data-theme', themeVariant);
        }
        // On 401 or other errors, keep the cached theme (don't reset)
      } catch (error) {
        console.error('Error fetching theme variant:', error);
        // Keep cached theme, don't reset to default
      }
    };

    fetchAndApplyTheme();
  }, [status]);

  return null;
}
