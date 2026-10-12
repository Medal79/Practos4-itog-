import { createContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

// Контекст корзины: через него компоненты получают cart, error и функции управления корзиной
export const CartContext = createContext();

/**
 * Провайдер корзины.
 * Корзина хранится НА СЕРВЕРЕ (в БД) и привязана к пользователю:
 * при выходе и повторном входе товары остаются, чужую корзину увидеть нельзя.
 *
 * ВАЖНО: если сервер недоступен, корзина НЕ показывает старые данные из памяти —
 * она очищается, а в error попадает текст ошибки (страница Cart.jsx покажет его пользователю).
 */
export function CartProvider({ children }) {
  const { token } = useAuth();
  const [cart, setCart] = useState([]);        // список товаров в корзине
  const [loading, setLoading] = useState(false); // идёт ли загрузка (для надписи «Загрузка корзины...»)
  const [error, setError] = useState('');      // текст ошибки сервера ('' — ошибки нет)

  /**
   * Загрузить корзину текущего пользователя с сервера (GET /cart).
   * silent = true — «тихая» перезагрузка в фоне: не показывает надпись «Загрузка...»,
   * чтобы страница не мигала (используется для периодической проверки сервера).
   * При успехе — сбрасывает ошибку (корзина сама «оживает», когда сервер вернулся).
   * При ошибке — очищает корзину и сохраняет текст ошибки.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    // Не вошли в аккаунт — корзины нет
    if (!token) {
      setCart([]);
      setError('');
      return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await api('/cart', { token });
      setCart(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      // Сервер лёг: убираем устаревшие данные и показываем ошибку
      setCart([]);
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  // Загружаем корзину при входе в аккаунт (и при смене пользователя)
  useEffect(() => {
    load();
  }, [load]);

  /**
   * Добавить кейс в корзину (POST /cart).
   * Если кейс уже есть — на сервере количество увеличится на 1.
   * Ошибку не глотаем: её покажет тот компонент, который вызвал функцию.
   */
  async function addToCart(caseId) {
    await api('/cart', { method: 'POST', token, body: { case_id: caseId } });
    await load();
  }

  /**
   * Изменить количество кейса на +1 / -1 (PATCH /cart/:id).
   * Меньше 1 количество не бывает — это проверяет сервер.
   */
  async function changeQuantity(caseId, delta) {
    await api(`/cart/${caseId}`, { method: 'PATCH', token, body: { delta } });
    await load();
  }

  /**
   * Удалить кейс из корзины (DELETE /cart/:id).
   */
  async function removeFromCart(caseId) {
    await api(`/cart/${caseId}`, { method: 'DELETE', token });
    await load();
  }

  return (
    <CartContext.Provider
      value={{ cart, loading, error, reload: load, addToCart, changeQuantity, removeFromCart }}
    >
      {children}
    </CartContext.Provider>
  );
}