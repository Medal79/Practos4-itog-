import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

/**
 * Админка: пользователи (ТОЛЬКО ПРОСМОТР).
 * Администратор не может ни менять данные пользователей, ни удалять их,
 * ни выдавать им купоны — страница нужна лишь для поиска и просмотра.
 */
function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api('/users', { token })
      .then(setUsers)
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = users.filter((u) => `${u.email} ${u.full_name}`.toLowerCase().includes(needle));

  return (
    <div>
      <h1>Пользователи</h1>
      <p className="muted">Раздел только для просмотра: данные пользователей администратор менять и удалять не может.</p>

      <input
        className="wide"
        placeholder="Поиск по email или имени"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Купон</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.full_name}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.role === 'admin' ? 'Администратор' : 'Пользователь'}</td>
                <td>{u.coupon_code ? `${u.coupon_code} −${u.coupon_percent}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p>Пользователей не найдено</p>}
    </div>
  );
}

export default AdminUsers;
