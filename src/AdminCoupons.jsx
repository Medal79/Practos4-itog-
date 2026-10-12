import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';
import { usePersistentState } from './usePersistentState';

const EMPTY = { code: '', name: '', discount_percent: '' };

// Проверка полей купона перед отправкой на сервер (те же правила, что и на сервере)
function checkCoupon(c) {
  const code = String(c.code || '').trim().toUpperCase();
  const name = String(c.name || '').trim();
  const percent = Number(c.discount_percent);
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) throw new Error('Код: 2–20 символов, латинские буквы, цифры, - и _');
  if (!name) throw new Error('Введите название купона');
  if (name.length > 50) throw new Error('Название — не более 50 символов');
  if (c.discount_percent === '' || !Number.isInteger(percent) || percent < 1 || percent > 99) {
    throw new Error('Скидка — целое число от 1 до 99');
  }
  return { code, name, discount_percent: percent };
}

/**
 * Админка: купоны на скидку. Создание, изменение и удаление;
 * купон можно назначить на кейс в разделе «Кейсы и скидки».
 */
function AdminCoupons() {
  const { token } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [edits, setEdits] = useState({});
  const [newCoupon, setNewCoupon] = usePersistentState('draft:admin-new-coupon', EMPTY);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { message, error, run } = useNotice();

  // Загрузить список купонов
  async function load() {
    const data = await api('/coupons', { token });
    setCoupons(data);
  }

  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Текущее значение поля: сначала правка в форме, затем данные с сервера
  function value(coupon, field) {
    return edits[coupon.id]?.[field] ?? coupon[field];
  }

  // Запомнить правку поля до нажатия «Сохранить»
  function setField(coupon, field, val) {
    setEdits((prev) => ({ ...prev, [coupon.id]: { ...(prev[coupon.id] || {}), [field]: val } }));
  }

  // Отменить несохранённые правки купона
  function resetEdit(coupon) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[coupon.id];
      return next;
    });
  }

  // Создать купон
  function addCoupon(ev) {
    ev.preventDefault();
    run(async () => {
      const body = checkCoupon(newCoupon);
      await api('/coupons', { method: 'POST', token, body });
      setNewCoupon(EMPTY);
      await load();
    }, 'Купон создан');
  }

  // Сохранить изменения купона
  function saveCoupon(coupon) {
    run(async () => {
      const body = checkCoupon({
        code: value(coupon, 'code'),
        name: value(coupon, 'name'),
        discount_percent: value(coupon, 'discount_percent'),
      });
      await api(`/coupons/${coupon.id}`, { method: 'PATCH', token, body });
      resetEdit(coupon);
      await load();
    }, 'Купон сохранён — скидка обновлена у всех пользователей и кейсов с этим купоном');
  }

  // Удалить купон
  function deleteCoupon(coupon) {
    if (!window.confirm(`Удалить купон ${coupon.code}? Он будет снят у пользователей и кейсов.`)) return;
    run(async () => {
      await api(`/coupons/${coupon.id}`, { method: 'DELETE', token });
      resetEdit(coupon);
      await load();
    }, 'Купон удалён');
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = coupons.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(needle));

  return (
    <div>
      <h1>Купоны</h1>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <h2>Новый купон</h2>
      <form className="form" onSubmit={addCoupon}>
        <input
          placeholder="Код (SALE30)"
          value={newCoupon.code}
          onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
        />
        <input
          placeholder="Название"
          value={newCoupon.name}
          onChange={(e) => setNewCoupon({ ...newCoupon, name: e.target.value })}
        />
        <input
          type="number"
          min="1"
          max="99"
          placeholder="%"
          value={newCoupon.discount_percent}
          onChange={(e) => setNewCoupon({ ...newCoupon, discount_percent: e.target.value })}
        />
        <button type="submit">Создать</button>
      </form>

      <h2>Список купонов</h2>
      <input
        className="wide"
        placeholder="Поиск по коду или названию"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="table">
        <thead>
          <tr>
            <th>Код</th>
            <th>Название</th>
            <th>Скидка, % (макс. 99)</th>
            <th>Пользователей</th>
            <th>Кейсов</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td>
                <input value={value(c, 'code')} onChange={(e) => setField(c, 'code', e.target.value)} />
              </td>
              <td>
                <input value={value(c, 'name')} onChange={(e) => setField(c, 'name', e.target.value)} />
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={value(c, 'discount_percent')}
                  onChange={(e) => setField(c, 'discount_percent', e.target.value)}
                />
              </td>
              <td>{c.users_count}</td>
              <td>{c.cases_count}</td>
              <td className="actions">
                <button onClick={() => saveCoupon(c)} disabled={!edits[c.id]}>Сохранить</button>
                <button onClick={() => resetEdit(c)} disabled={!edits[c.id]}>Отмена</button>
                <button onClick={() => deleteCoupon(c)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p>Купонов не найдено</p>}
    </div>
  );
}

export default AdminCoupons;