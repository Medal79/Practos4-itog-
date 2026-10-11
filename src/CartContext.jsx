import { createContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

export const CartContext = createContext();

/**
 * Корзина хранится НА СЕРВЕРЕ (в БД) и привязана к пользователю:
 * при выходе и повторном входе товары остаются, чужую корзину увидеть нельзя.
 */
export function CartProvider({ children }) {
  const { token } = useAuth();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Загрузить корзину текущего пользователя с сервера
  const load = useCallback(async () => {
    if (!token) {
      setCart([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api('/cart', { token });
      setCart(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Добавить кейс в корзину (если уже есть — количество +1)
  async function addToCart(caseId) {
    await api('/cart', { method: 'POST', token, body: { case_id: caseId } });
    await load();
  }

  // Изменить количество на +1 / -1 (меньше 1 не бывает)
  async function changeQuantity(caseId, delta) {
    await api(`/cart/${caseId}`, { method: 'PATCH', token, body: { delta } });
    await load();
  }

  // Удалить кейс из корзины
  async function removeFromCart(caseId) {
    await api(`/cart/${caseId}`, { method: 'DELETE', token });
    await load();
  }

  return (
    <CartContext.Provider value={{ cart, loading, error, reload: load, addToCart, changeQuantity, removeFromCart }}>
      {children}
    </CartContext.Provider>
  );
}