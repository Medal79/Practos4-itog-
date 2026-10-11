import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();
// Хук доступа к теме: { theme, toggleTheme }
export const useTheme = () => useContext(ThemeContext);

// Провайдер темы (светлая/тёмная); выбранная тема запоминается в localStorage
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Тема хранится в атрибуте data-theme у <html>, а цвета берутся из CSS-переменных (index.css)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Переключить тему светлая ↔ тёмная
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
