import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { api } from './api';
import { useNotice } from './useNotice';
import { statusLabel } from './statuses';
import { rarityColor } from './rarity';
import { formatDate, formatDateTime } from './dates';
import Img from './Img';
import ServerError from './ServerError';
import { PHONE_FORMAT, phoneInput, isValidPhone, checkFullName } from './validators';

// Число с пробелами между разрядами: 12 500
const fmt = (n) => Number(n).toLocaleString('ru-RU');

/**
 * Личный кабинет (только для авторизованных): личные данные, смена логина и пароля,
 * история заказов с датой, адресом и статусом, инвентарь. У администратора заказов и адреса нет.
 */
function Profile() {
  const { user, token, loading, setUser, authError, retryAuth } = useAuth();
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [reload, setReload] = useState(0);
  const [info, setInfo] = useState({ full_name: '', phone: '', default_address: '' });
  const [newLogin, setNewLogin] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const infoNotice = useNotice();
  const loginNotice = useNotice();
  const passNotice = useNotice();

  useEffect(() => {
    if (user) {
      setInfo({ full_name: user.full_name, phone: user.phone || '', default_address: user.default_address || '' });
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.role === 'admin') {
      setDataLoading(false);
      return;
    }
    let ignore = false;
    setDataLoading(true);
    setDataError('');
    Promise.all([api('/orders', { token }), api('/inventory', { token })])
      .then(([o, inv]) => {
        if (ignore) return;
        setOrders(o);
        setInventory(inv);
      })
      .catch((e) => !ignore && setDataError(e.message))
      .finally(() => !ignore && setDataLoading(false));
    return () => {
      ignore = true;
    };
  }, [user?.id, token, reload]);

  if (loading) return <p>Загрузка...</p>;
  if (authError) return <ServerError message={authError} onRetry={retryAuth} />;
  if (!user) return <Navigate to="/login" />;

  const isAdmin = user.role === 'admin';
  const initials = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const totalSpent = Math.round(orders.reduce((sum, o) => sum + o.total, 0) * 100) / 100;
  const inventoryValue = Math.round(inventory.reduce((sum, i) => sum + i.value_price, 0) * 100) / 100;

  // Сохранить ФИО, телефон и адрес по умолчанию
  function saveInfo(ev) {
    ev.preventDefault();
    infoNotice.run(async () => {
      const nameError = checkFullName(info.full_name);
      if (nameError) throw new Error(nameError);
      if (!isValidPhone(info.phone)) throw new Error(`Телефон должен быть в формате ${PHONE_FORMAT}`);
      const body = { full_name: info.full_name, phone: info.phone };
      if (!isAdmin) body.default_address = info.default_address;
      const updated = await api('/profile', { method: 'PATCH', token, body });
      setUser(updated);
    }, 'Данные сохранены');
  }

  // Сменить логин (email) — нужен текущий пароль
  function saveLogin(ev) {
    ev.preventDefault();
    loginNotice.run(async () => {
      const value = newLogin.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error('Некорректный логин (email)');
      if (value === user.email) throw new Error('Новый логин совпадает с текущим');
      if (!loginPassword) throw new Error('Введите текущий пароль');
      const updated = await api('/profile/login', {
        method: 'PATCH',
        token,
        body: { email: value, current_password: loginPassword },
      });
      setUser(updated);
      setNewLogin('');
      setLoginPassword('');
    }, 'Логин изменён — теперь входите с новым email');
  }

  // Сменить пароль — нужен текущий пароль
  function savePassword(ev) {
    ev.preventDefault();
    passNotice.run(async () => {
      if (!currentPassword) throw new Error('Введите текущий пароль');
      if (newPassword.length < 6) throw new Error('Новый пароль — минимум 6 символов');
      if (newPassword === currentPassword) throw new Error('Новый пароль должен отличаться от текущего');
      await api('/profile/password', {
        method: 'POST',
        token,
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
    }, 'Пароль изменён');
  }

  // Обновить поле формы личных данных
  const setInfoField = (field) => (e) => setInfo({ ...info, [field]: e.target.value });
  // Ввод телефона с автоматической маской +7 (999) 123-45-67
  const setInfoPhone = (e) => setInfo({ ...info, phone: phoneInput(e.target.value, info.phone) });

  return (
    <div className="profile">
      <div className="profile-head">
        <div className="avatar">{initials || '?'}</div>
        <div className="profile-info">
          <h1>{user.full_name}</h1>
          <p className="muted">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
          <div className="badges">
            <span className="pill">{isAdmin ? 'Администратор' : 'Пользователь'}</span>
            {!isAdmin && (user.coupon ? (
              <span className="pill pill-accent">{user.coupon.name} · −{user.coupon.discount_percent}% · на один заказ</span>
            ) : (
              <span className="pill">Без персональной скидки</span>
            ))}
          </div>
        </div>
        {!isAdmin && (
          <div className="stats">
            <div className="stat"><b>{orders.length}</b><span className="muted">заказов</span></div>
            <div className="stat"><b>{fmt(totalSpent)} руб.</b><span className="muted">потрачено</span></div>
            <div className="stat"><b>{inventory.length}</b><span className="muted">предметов</span></div>
          </div>
        )}
      </div>

      <div className="profile-grid">
        <section className="pcard">
          <h2>Личная информация</h2>
          <form onSubmit={saveInfo} noValidate>
            <label>Имя и фамилия</label>
            <input value={info.full_name} onChange={setInfoField('full_name')} placeholder="Иван Петров" />
            <label>Телефон</label>
            <input type="tel" inputMode="tel" maxLength={18} value={info.phone} onChange={setInfoPhone} placeholder={PHONE_FORMAT} />
            <p className="muted">Формат: {PHONE_FORMAT}</p>
            {!isAdmin && (
              <>
                <label>Адрес по умолчанию (Steam-аккаунт)</label>
                <input value={info.default_address} onChange={setInfoField('default_address')} placeholder="Подставляется при оформлении заказа" />
              </>
            )}
            <button type="submit">Сохранить</button>
          </form>
          {infoNotice.message && <p className="ok">{infoNotice.message}</p>}
          {infoNotice.error && <p className="error">{infoNotice.error}</p>}
        </section>

        <section className="pcard">
          <h2>Сменить логин (email)</h2>
          <form onSubmit={saveLogin} noValidate>
            <input type="email" placeholder="Новый логин (email)" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
            <input type="password" placeholder="Текущий пароль" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            <button type="submit">Изменить логин</button>
          </form>
          {loginNotice.message && <p className="ok">{loginNotice.message}</p>}
          {loginNotice.error && <p className="error">{loginNotice.error}</p>}
        </section>

        <section className="pcard">
          <h2>Сменить пароль</h2>
          <form onSubmit={savePassword} noValidate>
            <input type="password" placeholder="Текущий пароль" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <input type="password" placeholder="Новый пароль" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button type="submit">Изменить пароль</button>
          </form>
          {passNotice.message && <p className="ok">{passNotice.message}</p>}
          {passNotice.error && <p className="error">{passNotice.error}</p>}
        </section>
      </div>

      {!isAdmin && (
        <>
          {dataLoading && <p>Загрузка заказов...</p>}
          {dataError && (
            <div className="error">
              <p>Ошибка: {dataError}</p>
              <button onClick={() => setReload((n) => n + 1)}>Попробовать снова</button>
            </div>
          )}

          <h2 className="section-title">Мои заказы</h2>
          {!dataLoading && !dataError && orders.length === 0 && (
            <p className="muted">Заказов пока нет. <Link to="/">Перейти в каталог</Link></p>
          )}
          {orders.map((o) => (
            <div className="order" key={o.id}>
              <div className="order-head">
                <b>Заказ №{o.id}</b>
                <span className="pill">{statusLabel(o.status)}</span>
                <span className="muted">{formatDateTime(o.created_at)}</span>
              </div>
              <ul>
                {o.items.map((i, idx) => (
                  <li key={idx}>
                    <span className="grow">{i.case_name}</span>
                    <span className="qty muted">{i.quantity} шт.</span>
                    <span className="amount">{fmt(i.unit_price * i.quantity)} руб.</span>
                  </li>
                ))}
              </ul>
              <div className="order-foot">
                <span>Адрес получения: <b>{o.steam_account}</b></span>
                <span>Желаемая дата: <b>{formatDate(o.desired_date)}</b></span>
                <span>Сумма: <b>{fmt(o.total)} руб.</b></span>
              </div>
              <p><Link to={`/open/${o.id}`}>Открыть кейсы этого заказа →</Link></p>
            </div>
          ))}

          <h2 className="section-title">Мой инвентарь</h2>
          {!dataLoading && !dataError && inventory.length === 0 && (
            <p className="muted">Предметов пока нет — откройте первый кейс</p>
          )}
          {inventory.length > 0 && (
            <>
              <p className="muted">Предметов: {inventory.length} · общая стоимость ≈ {fmt(inventoryValue)} руб.</p>
              <div className="inv-grid">
                {inventory.map((it) => (
                  <div className="inv-item" key={it.id} style={{ borderBottomColor: rarityColor(it.rarity) }}>
                    <Img className="inv-img" src={it.image_url} alt={it.name} fallback="🔫" />
                    <b>{it.name}</b>
                    <span style={{ color: rarityColor(it.rarity) }}>{it.rarity}</span>
                    <span className="muted">из: {it.case_name}</span>
                    <span className="muted">≈ {fmt(it.value_price)} руб.</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Profile;