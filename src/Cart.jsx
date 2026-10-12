import { useContext, useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CartContext } from './CartContext';
import { useAuth } from './AuthContext';
import { api } from './api';
import { getReceipt, MAX_CART_LINES, MAX_ITEM_QUANTITY } from './price';
import { todayString } from './dates';
import Img from './Img';
import ServerError from './ServerError';

// Как часто (мс) в фоне проверять, что сервер жив, пока открыта страница корзины
const CHECK_INTERVAL = 5000;

/**
 * Число с пробелами и «руб.»: 12500 -> «12 500 руб.»
 */
const money = (n) => `${n.toLocaleString('ru-RU')} руб.`;

/**
 * Корзина (данные берутся с сервера, у каждого пользователя своя) и оформление заказа.
 * При оформлении пользователь указывает адрес получения (Steam-аккаунт) и желаемую дату передачи;
 * дата не может быть раньше сегодняшней (проверяется и тут, и на сервере).
 *
 * Если сервер недоступен — вместо товаров показывается блок с ошибкой и кнопкой «Попробовать снова».
 */
function Cart() {
  const navigate = useNavigate();
  const { cart, loading, error, reload, changeQuantity, removeFromCart } = useContext(CartContext);
  const { user, token, setUser, loading: authLoading, authError, retryAuth } = useAuth();
  const [steam, setSteam] = useState(null);          // введённый адрес (null — пользователь ещё не вводил)
  const [date, setDate] = useState('');              // желаемая дата передачи
  const [method, setMethod] = useState('card');      // способ оплаты
  const [actionError, setActionError] = useState(''); // ошибка действия (+, −, удалить, оформить)
  const [formErrors, setFormErrors] = useState({});  // ошибки валидации формы
  const [sending, setSending] = useState(false);     // идёт ли отправка заказа

  /**
   * Перезапрашиваем корзину при каждом открытии страницы.
   * Раньше корзина грузилась один раз при входе и дальше жила в памяти,
   * поэтому при упавшем сервере страница показывала старые данные без ошибки.
   * (Хуки должны вызываться ДО любых return, поэтому эффекты стоят здесь.)
   */
  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Пока страница открыта — раз в несколько секунд тихо проверяем сервер.
   * Если он упал, в контексте появится error и пользователь увидит ошибку,
   * если вернулся — ошибка исчезнет сама и корзина покажется снова.
   */
  useEffect(() => {
    const timer = setInterval(() => reload({ silent: true }), CHECK_INTERVAL);
    return () => clearInterval(timer); // при уходе со страницы таймер останавливаем
  }, [reload]);

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

  const receipt = getReceipt(cart, user);                 // расчёт сумм, скидок и времени
  const count = cart.reduce((sum, i) => sum + i.quantity, 0); // общее число штук в корзине
  // Если пользователь ещё ничего не вводил — подставляем адрес по умолчанию из профиля
  const steamValue = steam ?? user.default_address ?? '';

  /**
   * Выполнить действие над корзиной (+, −, удалить) и показать ошибку, если сервер её вернул.
   * Если ошибка сетевая (status 0 — сервер лёг), дополнительно перезагружаем корзину:
   * так в контексте появится error и вместо списка товаров покажется блок с ошибкой.
   */
  async function run(action) {
    setActionError('');
    try {
      await action();
    } catch (e) {
      setActionError(e.message);
      if (e.status === 0) reload();
    }
  }

  /**
   * Проверка формы оформления заказа: адрес минимум 3 символа,
   * дата обязательна и не раньше сегодняшней.
   * Возвращает true, если ошибок нет.
   */
  function validate() {
    const errs = {};
    if (steamValue.trim().length < 3) errs.steam = 'Укажите адрес получения — Steam-аккаунт (минимум 3 символа)';
    if (!date) errs.date = 'Укажите желаемую дату передачи';
    else if (date < todayString()) errs.date = 'Дата передачи не может быть раньше сегодняшней';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /**
   * Оформление заказа: сервер сам берёт товары из корзины пользователя (POST /orders).
   * После успеха обновляем данные пользователя (личный купон снимается), перезагружаем
   * корзину и переходим на страницу открытия заказа.
   */
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
      // Личный купон после заказа снимается на сервере — подтягиваем свежие данные пользователя
      try {
        const me = await api('/me', { token });
        if (me && me.id) setUser(me);
      } catch {
        // если /me не ответил, заказ всё равно оформлен — просто идём дальше
      }
      await reload();
      navigate(`/open/${res.order_id}`);
    } catch (e) {
      setActionError(e.message);
      if (e.status === 0) reload(); // сервер лёг — покажем ошибку вместо корзины
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
      <p className="muted">Количество одного кейса — не больше {MAX_ITEM_QUANTITY} шт. и не больше, чем есть в наличии; разных кейсов в корзине — не больше {MAX_CART_LINES}.</p>

      {user.coupon && (
        <p className="coupon-note">
          Ваш купон «{user.coupon.name}» ({user.coupon.code}): −{user.coupon.discount_percent}% — применяется,
          если выгоднее скидки на сам кейс
        </p>
      )}

      {loading && <p>Загрузка корзины...</p>}

      {/* Ошибка сервера: вместо корзины показываем сообщение и кнопку повтора */}
      {error && (
        <div className="error">
          <h3>Сервер недоступен</h3>
          <p>Ошибка: {error}</p>
          <button onClick={() => reload()}>Попробовать снова</button>
        </div>
      )}
      {actionError && !error && <p className="error">Ошибка: {actionError}</p>}

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
                  <div className="muted">В наличии: {l.stock} шт.</div>
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
                    disabled={l.quantity >= Math.min(l.stock, MAX_ITEM_QUANTITY)}
                    title={
                      l.quantity >= l.stock
                        ? `В наличии осталось только ${l.stock} шт.`
                        : l.quantity >= MAX_ITEM_QUANTITY
                          ? `Одного кейса можно взять не больше ${MAX_ITEM_QUANTITY} шт.`
                          : ''
                    }
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