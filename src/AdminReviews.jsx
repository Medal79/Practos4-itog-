import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';
import { formatDateTime } from './dates';

// Звёздочки по оценке: «★★★★☆»
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Админка: модерация отзывов. Администратор видит все отзывы ко всем кейсам
 * и может удалить неподходящий (спам, оскорбления). Удаление мягкое: у пользователей на месте
 * отзыва появляется пометка «удалён администратором за нарушение политики».
 */
function AdminReviews() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { message, error, run } = useNotice();

  // Загрузить все отзывы для модерации
  async function load() {
    setReviews(await api('/admin/reviews', { token }));
  }

  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Удалить отзыв
  function deleteReview(r) {
    if (!window.confirm(`Удалить отзыв пользователя ${r.full_name} о кейсе «${r.case_name}»? Пользователи увидят пометку об удалении за нарушение политики.`)) return;
    run(async () => {
      await api(`/reviews/${r.id}`, { method: 'DELETE', token });
      await load();
    }, 'Отзыв удалён: пользователи увидят пометку о нарушении политики');
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = reviews.filter(
    (r) =>
      (!ratingFilter || r.rating === Number(ratingFilter)) &&
      `${r.full_name} ${r.email} ${r.case_name} ${r.comment}`.toLowerCase().includes(needle)
  );

  return (
    <div>
      <h1>Отзывы</h1>
      <p className="muted">Всего отзывов: {reviews.length}</p>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <div className="toolbar">
        <input
          className="grow"
          placeholder="Поиск по кейсу, автору или тексту"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
          <option value="">Любая оценка</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n} — {stars(n)}</option>
          ))}
        </select>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Кейс</th>
              <th>Автор</th>
              <th>Оценка</th>
              <th>Комментарий</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.case_name}</td>
                <td>
                  {r.full_name}
                  <div className="muted">{r.email}</div>
                </td>
                <td><span className="stars">{stars(r.rating)}</span></td>
                <td className="review-text">
                  {r.comment}
                  {r.deleted_by_admin && <div className="review-removed">Удалён за нарушение политики</div>}
                </td>
                <td>{formatDateTime(r.created_at)}</td>
                <td className="actions">
                  {!r.deleted_by_admin && <button onClick={() => deleteReview(r)}>Удалить</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p>Отзывов не найдено</p>}
    </div>
  );
}

export default AdminReviews;
