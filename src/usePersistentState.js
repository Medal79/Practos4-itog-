import { useState, useEffect } from 'react';

// Как useState, но значение хранится в sessionStorage: переживает перезагрузку страницы (F5)
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // хранилище недоступно — просто работаем без сохранения
    }
  }, [key, value]);

  return [value, setValue];
}