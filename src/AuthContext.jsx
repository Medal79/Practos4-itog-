import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext();
// Хук доступа к данным авторизации: { user, token, loading, authError, retryAuth, login, register, logout, setUser }
export const useAuth = () => useContext(AuthContext);

/**
 * Провайдер авторизации. Токен хранится в localStorage, поэтому вход сохраняется
 * при обновлении страницы и в новых вкладках; пользователя подгружаем с сервера (GET /me).
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  // Последние известные данные пользователя хранятся локально: если сервер лёг и /me не отвечает,
  // человек остаётся «вошедшим» (в меню его имя), а страницы показывают ошибку сервера.
  const [user, setUserState] = useState(() => {
    if (!localStorage.getItem('token')) return null;
    try {
      return JSON.parse(localStorage.getItem('user_cache')) || null;
    } catch {
      return null;
    }
  });
  const setUser = useCallback((value) => {
    setUserState(value);
    if (value) localStorage.setItem('user_cache', JSON.stringify(value));
    else localStorage.removeItem('user_cache');
  }, []);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));
  // Текст ошибки, если сервер недоступен и данные пользователя загрузить не удалось
  const [authError, setAuthError] = useState('');
  // Счётчик для кнопки «Попробовать снова»
  const [attemptKey, setAttemptKey] = useState(0);

  const retryAuth = useCallback(() => setAttemptKey((n) => n + 1), []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setAuthError('');
  }, [setUser]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    let timer = null;
    setLoading(true);
    setAuthError('');

    // Загружает данные пользователя (GET /me); если сервер недоступен — повторяет попытку и запоминает ошибку
    async function check(attempt) {
      try {
        const data = await api('/me', { token });
        if (ignore) return;
        if (data && data.id) {
          setUser(data);
          setAuthError('');
        } else {
          logout();
        }
        setLoading(false);
      } catch (e) {
        if (ignore) return;
        if (e.status === 401) {
          logout();
          setLoading(false);
          return;
        }
        if (attempt < 3) {
          timer = setTimeout(() => check(attempt + 1), attempt * 1000);
          return;
        }
        // Сервер так и не ответил: запоминаем ошибку, чтобы страницы показали её,
        // а не делали вид, что пользователь не вошёл
        setAuthError(e.message);
        setLoading(false);
      }
    }

    check(1);
    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, logout, attemptKey, setUser]);

  useEffect(() => {
    // Синхронизация входа между вкладками: токен изменился в другой вкладке — обновляем у себя
    function onStorage(e) {
      if (e.key === 'token' || e.key === null) setToken(localStorage.getItem('token'));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Вход: сохраняем токен и данные пользователя
  async function login(email, password) {
    const data = await api('/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  }

  // Регистрация: после успеха пользователь сразу входит в аккаунт
  async function register(email, full_name, phone, password) {
    const data = await api('/register', { method: 'POST', body: { email, full_name, phone, password } });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setToken(data.token);
    return data.user;
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, authError, retryAuth, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}