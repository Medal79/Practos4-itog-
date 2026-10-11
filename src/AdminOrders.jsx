import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';
import { STATUS_LABELS, statusLabel } from './statuses';
import { formatDate, formatDateTime } from './dates';

// Число с пробелами между разрядами: 12 500
const fmt = (n) => Number(n).toLocaleString('ru-RU');

/**
 * Админка: все заказы пользователей. Администратор видит, кто что купил, и меняет статус заказа.
 * Удалять заказы (чеки) нельзя, а оплаченный заказ нельзя вернуть в статус «Ожидает оплаты».
 */
function AdminOrders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { message, error, run } = useNotice();

  // Загрузить все заказы пользователей
  async function load() {
    setOrders(await api('/admin/orders', { token }));
  }

  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Сменить статус заказа
  function setStatus(order, status) {
    run(async () => {
      await api(`/orders/${order.id}/status`, { method: 'PATCH', token, body: { status } });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    }, `Статус заказа №${order.id} изменён на «${statusLabel(status)}»`);
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
      (!statusFilter || o.status === statusFilter) &&
      `${o.id} ${o.email} ${o.full_name} ${o.steam_account}`.toLowerCase().includes(needle)
  );
  const revenue = Math.round(orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0) * 100) / 100;

  return (
    <div>
      <h1>Заказы</h1>
      <p className="muted">Всего заказов: {orders.length} · выручка без отменённых: {fmt(revenue)} руб.</p>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <div className="toolbar">
        <input
          className="grow"
          placeholder="Поиск по номеру, email, имени или Steam-аккаунту"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>№</th>
              <th>Покупатель</th>
              <th>Steam-аккаунт</th>
              <th>Желаемая дата</th>
              <th>Оформлен</th>
              <th>Кейсов</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>
                  {o.full_name}
                  <div className="muted">{o.email}</div>
                </td>
                <td>{o.steam_account}</td>
                <td>{formatDate(o.desired_date)}</td>
                <td>{formatDateTime(o.created_at)}</td>
                <td>{o.total_quantity}</td>
                <td>{fmt(o.total)} руб.</td>
                <td>
                  <select value={o.status} onChange={(e) => setStatus(o, e.target.value)}>
                    {Object.entries(STATUS_LABELS)
                      // Если заказ уже оплачен, «Ожидает оплаты» выбрать нельзя
                      .filter(([value]) => !(value === 'pending' && o.status !== 'pending'))
                      .map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p>Заказов не найдено</p>}
    </div>
  );
}

export default AdminOrders;
