import { useState, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import Roulette from './Roulette';
import ServerError from './ServerError';

/**
 * Страница открытия кейсов заказа: для каждого купленного кейса — своя рулетка.
 * Выпавшие предметы уже лежат в инвентаре пользователя (их выбрал сервер).
 */
function OpenOrder() {
  const { orderId } = useParams();
  const { user, token, loading: authLoading, authError, retryAuth } = useAuth();
  const [openings, setOpenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [openedIds, setOpenedIds] = useState([]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    setLoading(true);
    setError('');
    api(`/orders/${orderId}/openings`, { token })
      .then((data) => {
        if (ignore) return;
        setOpenings(data);
        // Кейсы, открытые раньше (до перезагрузки страницы), считаем открытыми
        setOpenedIds(data.filter((o) => o.opened).map((o) => o.id));
      })
      .catch((e) => !ignore && setError(e.message))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [orderId, token, reload]);

  if (authLoading) return <p>Загрузка...</p>;
  if (authError) return <ServerError message={authError} onRetry={retryAuth} />;
  if (!user) return <Navigate to="/login" />;

  // Запоминаем, какие кейсы уже открыты, чтобы показать итог
  function handleOpened(opening) {
    setOpenedIds((prev) => (prev.includes(opening.id) ? prev : [...prev, opening.id]));
  }

  const allOpened = openings.length > 0 && openedIds.length === openings.length;
  const totalValue = openings.reduce((sum, o) => sum + o.won.value_price, 0);

  return (
    <div>
      <h1>Открытие кейсов — заказ №{orderId}</h1>
      {loading && <p>Загрузка...</p>}
      {error && (
        <div className="error">
          <p>Ошибка: {error}</p>
          <button onClick={() => setReload((n) => n + 1)}>Попробовать снова</button>
          <p><Link to="/dashboard">← В личный кабинет</Link></p>
        </div>
      )}
      {!loading && !error && openings.length === 0 && <p className="muted">В этом заказе нет кейсов для открытия</p>}
      {openings.map((o) => (
        <Roulette key={o.id} opening={o} onOpened={handleOpened} />
      ))}
      {allOpened && (
        <div className="open-total">
          <p>
            Все кейсы открыты! Общая стоимость выпавших предметов: <b>{totalValue.toLocaleString('ru-RU')} руб.</b>
          </p>
          <Link to="/dashboard">Смотреть предметы в личном кабинете →</Link>
        </div>
      )}
    </div>
  );
}

export default OpenOrder;
