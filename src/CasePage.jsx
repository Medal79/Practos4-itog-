import { useState, useEffect, useContext } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { CartContext } from './CartContext';
import { useAuth } from './AuthContext';
import { getPrice } from './price';
import { rarityColor } from './rarity';
import { formatDuration } from './duration';
import Img from './Img';
import Reviews from './Reviews';

/**
 * Страница кейса: описание, цена, содержимое (все предметы с шансами выпадения) и отзывы.
 */
function CasePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart } = useContext(CartContext);
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const [cartError, setCartError] = useState('');
  const [reload, setReload] = useState(0);

  // Загрузка кейса вместе с предметами (JOIN на сервере)
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    setAdded(false);
    api(`/cases/${id}`)
      .then((data) => !ignore && setItem(data))
      .catch((e) => !ignore && setError(e.message))
      .finally(() => !ignore && setLoading(false));
    return () => {
      ignore = true;
    };
  }, [id, reload]);

  // Тихо обновить кейс (например, средний рейтинг после нового отзыва), без экрана загрузки
  function refreshItem() {
    api(`/cases/${id}`)
      .then(setItem)
      .catch(() => {});
  }

  // Добавить кейс в корзину; гостя отправляем на страницу входа
  async function handleAdd() {
    setCartError('');
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await addToCart(item.id);
      setAdded(true);
    } catch (e) {
      setCartError(e.message);
    }
  }

  if (loading) return <p>Загрузка кейса...</p>;

  if (error) {
    return (
      <div>
        <p className="error">Ошибка: {error}</p>
        <button onClick={() => setReload((n) => n + 1)}>Попробовать снова</button>
        <p><Link to="/">← В каталог</Link></p>
      </div>
    );
  }

  const { percent, final, old, byCoupon } = getPrice(item, user);
  const isAdmin = user?.role === 'admin';

  return (
    <div>
      <p><Link to="/">← В каталог</Link></p>
      <div className="product-page">
        <Img className="product-image" src={item.image_url} alt={item.name} />
        <div className="product-info">
          <h1>{item.name}</h1>
          <p>Категория: {item.category_name || 'без категории'}</p>
          <p>{item.description}</p>
          <p className="duration">Время выполнения одного кейса: {formatDuration(item.duration_minutes)}</p>
          <p className={item.stock > 0 ? 'muted' : 'error'}>{item.stock > 0 ? `В наличии: ${item.stock} шт.` : 'Нет в наличии'}</p>
          {item.reviews_count > 0 && <p>Рейтинг: ★ {item.avg_rating} ({item.reviews_count} отз.)</p>}
          <p className="price">
            {percent > 0 && <s className="muted">{old} руб. </s>}
            <b>{final} руб.</b>
            {percent > 0 && <span className="muted"> (скидка {percent}%{byCoupon ? ', ваш купон' : ''})</span>}
          </p>
          {!isAdmin && <button onClick={handleAdd} disabled={item.stock <= 0}>{item.stock > 0 ? 'В корзину' : 'Нет в наличии'}</button>}
          {cartError && <p className="error">Ошибка: {cartError}</p>}
          {added && (
            <p>
              <span className="ok">Кейс добавлен в корзину </span>
              <button onClick={() => navigate('/cart')}>Перейти в корзину</button>
            </p>
          )}
        </div>
      </div>

      <h2>Что может выпасть</h2>
      {item.items.length === 0 && <p className="muted">В кейсе пока нет предметов</p>}
      <div className="loot-grid">
        {item.items.map((it) => (
          <div className="loot" key={it.id} style={{ borderColor: rarityColor(it.rarity) }}>
            <Img className="loot-img" src={it.image_url} alt={it.name} fallback="🔫" />
            <b>{it.name}</b>
            <span style={{ color: rarityColor(it.rarity) }}>{it.rarity}</span>
            <span className="muted">Шанс: {it.drop_chance}%</span>
            <span className="muted">≈ {it.value_price} руб.</span>
          </div>
        ))}
      </div>

      <Reviews caseId={item.id} onChange={refreshItem} />
    </div>
  );
}

export default CasePage;