import { useContext, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CartContext } from './CartContext';
import { useAuth } from './AuthContext';
import { api } from './api';
import { getReceipt, MAX_PER_ITEM, MAX_CART_LINES } from './price';
import { todayString } from './dates';
import Img from './Img';
import ServerError from './ServerError';

// Число с пробелами и «руб.»: 12 500 руб.
const money = (n) => `${n.toLocaleString('ru-RU')} руб.`;

/**
 * Корзина (данные берутся с сервера, у каждого пользователя своя) и оформление заказа.
 * При оформлении пользователь указывает адрес получения (Steam-аккаунт) и желаемую дату передачи;
 * дата не может быть раньше сегодняшней (проверяется и тут, и на сервере).
 */
function Cart() {
  const navigate = useNavigate();
  const { cart, loading, error, reload, changeQuantity, removeFromCart } = useContext(CartContext);
  const { user, token, loading: authLoading, authError, retryAuth } = useAuth();
  const [steam, setSteam] = useState(null);
  const [date, setDate] = useState('');
  const [method, setMethod] = useState('card');
  const [actionError, setActionError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [sending, setSending] = useState(false);

  if (authLoading) return <p>Загрузка...</p>;
  if (authError) return <ServerError message={authError} onRetry={retryAuth} />;
  if (user?.role === 'admin') return <Navigate to="/admin" />;

  if (!user) {
    return (
      <div className="cart-empty">
        <h2>Корзина</h2>
        <p>Корзина хранится в вашем аккаунте. <Link to="/login">Войдите</Link>, чтобы пользоваться ею.</p>
      </div>
    );
  }

  const receipt = getReceipt(cart, user);
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  // Если пользователь ещё ничего не вводил — подставляем адрес по умолчанию из профиля
  const steamValue = steam ?? user.default_address ?? '';

  // Выполнить действие над корзиной и показать ошибку, если сервер её вернул
  async function run(action) {
    setActionError('');
    try {
      await action();
    } catch (e) {
      setActionError(e.message);
    }
  }

  // Проверка формы оформления заказа
  function validate() {
    const errs = {};
    if (steamValue.trim().length < 3) errs.steam = 'Укажите адрес получения — Steam-аккаунт (минимум 3 символа)';
    if (!date) errs.date = 'Укажите желаемую дату передачи';
    else if (date < todayString()) errs.date = 'Дата передачи не может быть раньше сегодняшней';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Оформление заказа: сервер сам берёт товары из корзины пользователя
  async function checkout(ev) {
    ev.preventDefault();
    setActionError('');
    if (!validate()) return;
    setSending(true);
    try {
      const res = await api('/orders', {
        method: 'POST',
        token,
        body: { steam_account: steamValue.trim(), desired_date: date, method },
      });
      await reload();
      navigate(`/open/${res.order_id}`);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cart-page">
      <div className="cart-title">
        <h2>Корзина</h2>
        {count > 0 && <span className="pill">{count} шт.</span>}
      </div>
      <p className="muted">Лимиты: не больше {MAX_PER_ITEM} шт. одного кейса и {MAX_CART_LINES} разных кейсов в корзине.</p>

      {user.coupon && (
        <p className="coupon-note">
          Ваш купон «{user.coupon.name}» ({user.coupon.code}): −{user.coupon.discount_percent}% — применяется,
          если выгоднее скидки на сам кейс
        </p>
      )}

      {loading && <p>Загрузка корзины...</p>}
      {error && (
        <div className="error">
          <p>Ошибка: {error}</p>
          <button onClick={reload}>Попробовать снова</button>
        </div>
      )}
      {actionError && <p className="error">Ошибка: {actionError}</p>}

      {!loading && !error && cart.length === 0 && (
        <div className="cart-empty">
          <p><b>Корзина пуста</b></p>
          <p className="muted">Добавьте кейсы из каталога</p>
          <Link to="/">Перейти в каталог</Link>
        </div>
      )}

      {!error && cart.length > 0 && (
        <div className="cart-layout">
          <div className="cart-main">
            {receipt.items.map((l) => (
              <div className="cart-item" key={l.id}>
                <Img className="cart-thumb" src={l.image_url} alt={l.name} />
                <div className="cart-info">
                  <Link to={`/case/${l.id}`} className="cart-name">{l.name}</Link>
                  <div className="muted">Длительность: {l.duration_days} дн.</div>
                  <div className="cart-price">
                    {l.percent > 0 && <s className="muted">{money(l.price)}</s>}
                    <b>{money(l.finalPrice)}</b>
                    {l.percent > 0 && (
                      <span className="pill pill-accent">−{l.percent}%{l.byCoupon ? ' ваш купон' : ''}</span>
                    )}
                  </div>
                </div>
                <div className="stepper">
                  <button onClick={() => run(() => changeQuantity(l.id, -1))} disabled={l.quantity <= 1} aria-label="Меньше">−</button>
                  <span>{l.quantity}</span>
                  <button
                    onClick={() => run(() => changeQuantity(l.id, 1))}
                    disabled={l.quantity >= MAX_PER_ITEM}
                    title={l.quantity >= MAX_PER_ITEM ? `Не больше ${MAX_PER_ITEM} шт. одного кейса` : ''}
                    aria-label="Больше"
                  >+</button>
                </div>
                <div className="cart-sum">{money(l.amount)}</div>
                <button className="remove" onClick={() => run(() => removeFromCart(l.id))}>Удалить</button>
              </div>
            ))}
          </div>

          <aside className="summary">
            <h3>Оформление заказа</h3>
            <div className="summary-line">
              <span className="muted">Сумма до скидки</span>
              <span>{money(receipt.originalTotal)}</span>
            </div>
            <div className="summary-line">
              <span className="muted">Скидка</span>
              <span>−{money(receipt.discountTotal)}</span>
            </div>
            <div className="summary-line summary-total">
              <span>Итого</span>
              <span>{money(receipt.total)}</span>
            </div>

            <form onSubmit={checkout} noValidate>
              <label>Адрес получения (Steam-аккаунт / trade-ссылка)</label>
              <input value={steamValue} onChange={(e) => setSteam(e.target.value)} placeholder="Ваш Steam-аккаунт" />
              {formErrors.steam && <p className="error">{formErrors.steam}</p>}

              <label>Желаемая дата передачи</label>
              <input type="date" value={date} min={todayString()} onChange={(e) => setDate(e.target.value)} />
              {formErrors.date && <p className="error">{formErrors.date}</p>}

              <label>Способ оплаты</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="card">Банковская карта</option>
                <option value="sbp">СБП</option>
              </select>

              <button type="submit" className="primary" disabled={sending}>
                {sending ? 'Оформление...' : `Оформить заказ на ${money(receipt.total)}`}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Cart;
