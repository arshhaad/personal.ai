import { useState, useEffect, useMemo, useCallback } from 'react';
import { ThemeContext } from './ThemeContextDefinition';

export function ThemeProvider({ children }) {
  // Always default to 'dark' if nothing is saved
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved || 'dark';
    } catch {
      return 'dark';
    }
  });

  const [systemIsLight, setSystemIsLight] = useState(() => {
    try {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    } catch {
      return false;
    }
  });

  // Track system preference changes if needed
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e) => {
      setSystemIsLight(e.matches);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  // Derive resolved actual theme
  const actualTheme = useMemo(() => {
    if (theme === 'system') {
      return systemIsLight ? 'light' : 'dark';
    }
    return theme === 'light' ? 'light' : 'dark';
  }, [theme, systemIsLight]);

  // Keep DOM attribute and color-scheme synchronized
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', actualTheme);
    document.documentElement.style.colorScheme = actualTheme;
  }, [actualTheme]);

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch (e) {
      console.error('Failed to save theme in localStorage', e);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = actualTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [actualTheme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      actualTheme,
      isDark: actualTheme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme, actualTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
