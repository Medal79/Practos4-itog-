import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';

const EMPTY = { code: '', name: '', description: '', price: '', duration_days: '7', category_id: '' };

// Проверка полей кейса перед отправкой на сервер
function checkCase(c, withCode) {
  if (withCode && !String(c.code).trim()) throw new Error('Укажите код кейса');
  if (!String(c.name).trim()) throw new Error('Укажите название кейса');
  const price = Number(c.price);
  if (c.price === '' || !Number.isFinite(price) || price <= 0) throw new Error('Цена должна быть больше 0 — кейс нельзя продавать бесплатно');
  if (price < 1) throw new Error('Минимальная цена кейса — 1 руб.');
  const days = Number(c.duration_days);
  if (!Number.isInteger(days) || days < 1) throw new Error('Длительность — целое число дней от 1');
}

/**
 * Админка: кейсы. Создание, изменение и удаление кейсов,
 * а также назначение общей скидки (купона) на конкретный кейс.
 */
function AdminCases() {
  const { token } = useAuth();
  const [cases, setCases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [edits, setEdits] = useState({});
  const [newCase, setNewCase] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { message, error, run } = useNotice();

  // Загрузить кейсы, категории и купоны одним набором запросов
  async function load() {
    const [c, cat, cp] = await Promise.all([api('/cases'), api('/categories'), api('/coupons', { token })]);
    setCases(c);
    setCategories(cat);
    setCoupons(cp);
  }

  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Текущее значение поля: несохранённая правка из формы или данные с сервера
  const value = (c, field) => edits[c.id]?.[field] ?? c[field] ?? '';
  // Запомнить правку поля кейса до нажатия «Сохранить»
  const setField = (c, field, val) =>
    setEdits((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [field]: val } }));
  // Отменить несохранённые правки кейса
  const resetEdit = (c) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });

  // Создать кейс
  function addCase(ev) {
    ev.preventDefault();
    run(async () => {
      checkCase(newCase, true);
      await api('/cases', { method: 'POST', token, body: newCase });
      setNewCase(EMPTY);
      await load();
    }, 'Кейс создан — теперь добавьте в него предметы (раздел «Предметы кейсов»)');
  }

  // Сохранить изменения кейса
  function saveCase(c) {
    run(async () => {
      const body = {
        name: value(c, 'name'),
        description: value(c, 'description'),
        price: value(c, 'price'),
        duration_days: value(c, 'duration_days'),
        image_url: value(c, 'image_url'),
        category_id: value(c, 'category_id'),
      };
      checkCase(body, false);
      await api(`/cases/${c.id}`, { method: 'PATCH', token, body });
      resetEdit(c);
      await load();
    }, 'Кейс сохранён');
  }

  // Назначить / снять скидку (купон) на кейс
  function setCoupon(c, val) {
    const couponId = val ? Number(val) : null;
    run(async () => {
      await api(`/cases/${c.id}/coupon`, { method: 'PATCH', token, body: { coupon_id: couponId } });
      await load();
    }, 'Скидка кейса обновлена');
  }

  // Удалить кейс (с подтверждением)
  function deleteCase(c) {
    if (!window.confirm(`Удалить кейс «${c.name}»? Его предметы тоже будут удалены.`)) return;
    run(async () => {
      await api(`/cases/${c.id}`, { method: 'DELETE', token });
      resetEdit(c);
      await load();
    }, 'Кейс удалён');
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = cases.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(needle));
  const discounted = cases.filter((c) => c.discount_percent > 0).length;
  // Обновить поле формы нового кейса
  const setNew = (field) => (e) => setNewCase({ ...newCase, [field]: e.target.value });

  return (
    <div>
      <h1>Кейсы и скидки</h1>
      <p className="muted">Со скидкой: {discounted} из {cases.length}</p>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <h2>Новый кейс</h2>
      <form className="form" onSubmit={addCase} noValidate>
        <input placeholder="Код (CASE-005)" value={newCase.code} onChange={setNew('code')} />
        <input placeholder="Название" value={newCase.name} onChange={setNew('name')} />
        <input placeholder="Описание" value={newCase.description} onChange={setNew('description')} />
        <input type="number" min="1" placeholder="Цена" value={newCase.price} onChange={setNew('price')} />
        <input type="number" min="1" placeholder="Длительность, дн." value={newCase.duration_days} onChange={setNew('duration_days')} />
        <select value={newCase.category_id} onChange={setNew('category_id')}>
          <option value="">Без категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit">Создать</button>
      </form>

      <h2>Список кейсов</h2>
      <input className="wide" placeholder="Поиск по коду или названию" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Название</th>
              <th>Описание</th>
              <th>Цена</th>
              <th>Дней</th>
              <th>Категория</th>
              <th>Купон на кейс</th>
              <th>Скидка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td><input value={value(c, 'name')} onChange={(e) => setField(c, 'name', e.target.value)} /></td>
                <td><input value={value(c, 'description')} onChange={(e) => setField(c, 'description', e.target.value)} /></td>
                <td><input type="number" min="1" value={value(c, 'price')} onChange={(e) => setField(c, 'price', e.target.value)} /></td>
                <td><input type="number" min="1" value={value(c, 'duration_days')} onChange={(e) => setField(c, 'duration_days', e.target.value)} /></td>
                <td>
                  <select value={value(c, 'category_id')} onChange={(e) => setField(c, 'category_id', e.target.value)}>
                    <option value="">Без категории</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={c.coupon_id ?? ''} onChange={(e) => setCoupon(c, e.target.value)}>
                    <option value="">Без скидки</option>
                    {coupons.map((cp) => (
                      <option key={cp.id} value={cp.id}>{cp.code} −{cp.discount_percent}%</option>
                    ))}
                  </select>
                </td>
                <td>{c.discount_percent}%</td>
                <td className="actions">
                  <button onClick={() => saveCase(c)} disabled={!edits[c.id]}>Сохранить</button>
                  <button onClick={() => resetEdit(c)} disabled={!edits[c.id]}>Отмена</button>
                  <button onClick={() => deleteCase(c)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p>Кейсов не найдено</p>}
    </div>
  );
}

export default AdminCases;
