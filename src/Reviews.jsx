import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { formatDate } from './dates';
import { containsProfanity } from './profanity';

// Максимальная длина комментария (так же ограничивает сервер)
const MAX_COMMENT = 500;

// Звёздочки по оценке: «★★★★☆»
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Отзывы о кейсе: список всех отзывов (оценка + комментарий) и форма добавления.
 * Оставлять отзыв могут только авторизованные пользователи, и только ОДИН отзыв от пользователя на каждый кейс,
 * но свой отзыв можно изменить (если его не удалил администратор).
 * Пустые отзывы и мат не принимаются (проверяет и форма, и сервер).
 * Если администратор удалил отзыв, вместо текста показывается пометка о нарушении политики.
 */
function Reviews({ caseId, onChange }) {
  const { user, token } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  // Собственный отзыв текущего пользователя на ЭТОТ кейс (на один кейс — один отзыв), null — если его нет
  const [myReview, setMyReview] = useState(null);
  // Открыта ли форма изменения своего отзыва
  const [editing, setEditing] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!token || isAdmin) {
      setMyReview(null);
      return;
    }
    let ignore = false;
    api(`/reviews/mine?case_id=${caseId}`, { token })
      .then((data) => !ignore && setMyReview(data.review || null))
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [token, isAdmin, caseId, reload]);

  // При переходе на другой кейс сбрасываем форму
  useEffect(() => {
    setEditing(false);
    setComment('');
    setRating(5);
    setFormError('');
  }, [caseId]);

  // Загрузка отзывов по кейсу (автор подтягивается JOIN-запросом на сервере)
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    api(`/cases/${caseId}/reviews`)
      .then((data) => !ignore && setReviews(data))
      .catch((e) => !ignore && setError(e.message))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [caseId, reload]);

  // Открыть форму изменения: подставляем текущую оценку и текст отзыва
  function startEdit() {
    setRating(myReview.rating);
    setComment(myReview.comment || '');
    setFormError('');
    setEditing(true);
  }

  // Закрыть форму изменения без сохранения
  function cancelEdit() {
    setEditing(false);
    setComment('');
    setRating(5);
    setFormError('');
  }

  // Отправка отзыва с проверкой формы: новый отзыв (POST) или изменение своего (PUT)
  async function handleSubmit(ev) {
    ev.preventDefault();
    setFormError('');
    const text = comment.replace(/\s+/g, ' ').trim();
    if (!text) {
      setFormError('Отзыв не может быть пустым');
      return;
    }
    if (text.length < 3 || (text.match(/\p{L}/gu) || []).length < 3) {
      setFormError('Напишите осмысленный отзыв (минимум 3 буквы)');
      return;
    }
    if (containsProfanity(text)) {
      setFormError('Мат и бранные слова запрещены, в том числе со звёздочками и другими символами');
      return;
    }
    setSending(true);
    try {
      await api(`/cases/${caseId}/reviews`, {
        method: myReview ? 'PUT' : 'POST',
        token,
        body: { rating: Number(rating), comment },
      });
      setComment('');
      setEditing(false);
      setReload((n) => n + 1);
      if (onChange) onChange();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSending(false);
    }
  }

  // Форма показывается, если отзыва ещё нет или пользователь нажал «Изменить»
  const showForm = user && !isAdmin && (!myReview || editing);

  return (
    <section className="reviews">
      <h2>Отзывы</h2>

      {isAdmin ? (
        <p className="muted">Администратор не оставляет отзывы — только модерирует их.</p>
      ) : user && myReview && myReview.deleted_by_admin ? (
        <p className="muted">Ваш отзыв на этот кейс удалён администратором, изменить его нельзя.</p>
      ) : user && myReview && !editing ? (
        <div>
          <p className="muted">Вы уже оставили отзыв на этот кейс. На один кейс можно написать только один отзыв, но его можно изменить.</p>
          <button type="button" onClick={startEdit}>Изменить мой отзыв</button>
        </div>
      ) : showForm ? (
        <form className="review-form" onSubmit={handleSubmit} noValidate>
          <label>Оценка</label>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} — {stars(n)}</option>
            ))}
          </select>
          <label>Комментарий</label>
          <textarea
            rows="3"
            maxLength={MAX_COMMENT}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="counter muted">{comment.length} / {MAX_COMMENT}</div>
          {formError && <p className="error">{formError}</p>}
          <button type="submit" disabled={sending}>
            {sending ? 'Отправка...' : myReview ? 'Сохранить изменения' : 'Оставить отзыв'}
          </button>
          {myReview && (
            <button type="button" onClick={cancelEdit} disabled={sending}>Отмена</button>
          )}
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Войдите</Link>, чтобы оставить отзыв
        </p>
      )}

      {loading && <p>Загрузка отзывов...</p>}
      {error && (
        <div className="error">
          <p>Ошибка: {error}</p>
          <button onClick={() => setReload((n) => n + 1)}>Попробовать снова</button>
        </div>
      )}
      {!loading && !error && reviews.length === 0 && <p className="muted">Отзывов пока нет — будьте первым</p>}
      {reviews.map((r) => (
        <div className="review" key={r.id}>
          <div className="review-head">
            <b>{r.full_name}</b>
            {!r.deleted_by_admin && <span className="stars">{stars(r.rating)}</span>}
            <span className="muted">{formatDate(r.created_at)}</span>
          </div>
          {r.deleted_by_admin ? (
            <p className="review-removed">Отзыв удалён администратором за нарушение политики сайта.</p>
          ) : (
            <p>{r.comment}</p>
          )}
        </div>
      ))}
    </section>
  );
}

export default Reviews;