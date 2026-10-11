import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';
import { RARITIES, rarityColor } from './rarity';
import Img from './Img';

const EMPTY = { name: '', image_url: '', rarity: 'Ширпотреб', drop_chance: '', value_price: '' };

// Проверка полей предмета перед отправкой на сервер (те же правила, что и на сервере)
function checkItem(it) {
  if (!String(it.name || '').trim()) throw new Error('Укажите название предмета');
  const chance = Number(it.drop_chance);
  if (it.drop_chance === '' || !Number.isFinite(chance) || chance <= 0 || chance > 100) {
    throw new Error('Шанс выпадения — число больше 0 и не больше 100');
  }
  if (it.value_price !== '' && (!Number.isFinite(Number(it.value_price)) || Number(it.value_price) < 0)) {
    throw new Error('Стоимость предмета — число не меньше 0');
  }
}

/**
 * Админка: предметы внутри кейса. Администратор выбирает кейс и добавляет, меняет или удаляет
 * предметы, задавая редкость, шанс выпадения (%) и стоимость. Именно по этим шансам сервер
 * выбирает выигрыш при открытии кейса.
 */
function AdminItems() {
  const { token } = useAuth();
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [items, setItems] = useState([]);
  const [edits, setEdits] = useState({});
  const [newItem, setNewItem] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [version, setVersion] = useState(0);
  const { message, error, run } = useNotice();

  // Список кейсов для выпадающего списка; сразу выбираем первый
  useEffect(() => {
    api('/cases')
      .then((list) => {
        setCases(list);
        if (list.length) setCaseId(String(list[0].id));
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Предметы выбранного кейса (перезагружаются при смене кейса и после каждого изменения)
  useEffect(() => {
    if (!caseId) {
      setItems([]);
      return;
    }
    let ignore = false;
    setItemsLoading(true);
    setItemsError('');
    api(`/cases/${caseId}`)
      .then((data) => !ignore && setItems(data.items))
      .catch((e) => !ignore && setItemsError(e.message))
      .finally(() => !ignore && setItemsLoading(false));
    return () => {
      ignore = true;
    };
  }, [caseId, version]);

  // Перезагрузить список предметов выбранного кейса
  const reloadItems = () => setVersion((n) => n + 1);
  // Текущее значение поля: несохранённая правка из формы или данные с сервера
  const value = (it, field) => edits[it.id]?.[field] ?? it[field] ?? '';
  // Запомнить правку поля предмета до нажатия «Сохранить»
  const setField = (it, field, val) =>
    setEdits((prev) => ({ ...prev, [it.id]: { ...(prev[it.id] || {}), [field]: val } }));
  // Отменить несохранённые правки предмета
  const resetEdit = (it) =>
    setEdits((prev) => {
      const next = { ...prev };
      delete next[it.id];
      return next;
    });

  // Выбор другого кейса: сбрасываем несохранённые правки и загружаем его предметы
  function changeCase(e) {
    setCaseId(e.target.value);
    setEdits({});
    setNewItem(EMPTY);
  }

  // Добавить предмет в выбранный кейс
  function addItem(ev) {
    ev.preventDefault();
    run(async () => {
      checkItem(newItem);
      await api(`/cases/${caseId}/items`, { method: 'POST', token, body: newItem });
      setNewItem(EMPTY);
      reloadItems();
    }, 'Предмет добавлен');
  }

  // Сохранить изменения предмета
  function saveItem(it) {
    run(async () => {
      const body = {
        name: value(it, 'name'),
        image_url: value(it, 'image_url'),
        rarity: value(it, 'rarity'),
        drop_chance: value(it, 'drop_chance'),
        value_price: value(it, 'value_price'),
      };
      checkItem(body);
      await api(`/case-items/${it.id}`, { method: 'PATCH', token, body });
      resetEdit(it);
      reloadItems();
    }, 'Предмет сохранён');
  }

  // Удалить предмет из кейса (с подтверждением)
  function deleteItem(it) {
    if (!window.confirm(`Удалить предмет «${it.name}» из кейса?`)) return;
    run(async () => {
      await api(`/case-items/${it.id}`, { method: 'DELETE', token });
      resetEdit(it);
      reloadItems();
    }, 'Предмет удалён');
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;
  if (cases.length === 0) return <p className="muted">Сначала создайте кейс в разделе «Кейсы и скидки»</p>;

  // Обновить поле формы нового предмета
  const setNew = (field) => (e) => setNewItem({ ...newItem, [field]: e.target.value });
  const totalChance = Math.round(items.reduce((s, i) => s + i.drop_chance, 0) * 100) / 100;
  // Варианты редкости для списка: стандартные + текущее значение, если оно нестандартное
  const rarityOptions = (current) => (RARITIES.includes(current) || !current ? RARITIES : [...RARITIES, current]);

  return (
    <div>
      <h1>Предметы кейсов</h1>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <label>Кейс</label>
      <select className="wide" value={caseId} onChange={changeCase}>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
        ))}
      </select>

      <h2>Новый предмет</h2>
      <form className="form" onSubmit={addItem} noValidate>
        <input placeholder="Название предмета" value={newItem.name} onChange={setNew('name')} />
        <input placeholder="Ссылка на картинку" value={newItem.image_url} onChange={setNew('image_url')} />
        <select value={newItem.rarity} onChange={setNew('rarity')}>
          {RARITIES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input type="number" min="0" step="0.01" placeholder="Шанс, %" value={newItem.drop_chance} onChange={setNew('drop_chance')} />
        <input type="number" min="0" placeholder="Стоимость, руб." value={newItem.value_price} onChange={setNew('value_price')} />
        <button type="submit">Добавить</button>
      </form>

      <h2>Содержимое кейса</h2>
      {itemsLoading && <p>Загрузка предметов...</p>}
      {itemsError && (
        <div className="error">
          <p>Ошибка: {itemsError}</p>
          <button onClick={reloadItems}>Попробовать снова</button>
        </div>
      )}
      {!itemsLoading && !itemsError && items.length === 0 && (
        <p className="muted">В кейсе пока нет предметов — заказ с таким кейсом оформить нельзя</p>
      )}
      {items.length > 0 && (
        <>
          <p className={totalChance === 100 ? 'ok' : 'muted'}>
            Сумма шансов: {totalChance}%
            {totalChance !== 100 && ' — лучше довести до 100%; при другой сумме сервер считает шансы пропорционально'}
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Название</th>
                  <th>Картинка (ссылка)</th>
                  <th>Редкость</th>
                  <th>Шанс, %</th>
                  <th>Стоимость, руб.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <Img className="thumb" src={value(it, 'image_url')} alt={it.name} fallback="🔫" />
                    </td>
                    <td><input value={value(it, 'name')} onChange={(e) => setField(it, 'name', e.target.value)} /></td>
                    <td><input value={value(it, 'image_url')} onChange={(e) => setField(it, 'image_url', e.target.value)} /></td>
                    <td>
                      <select
                        value={value(it, 'rarity')}
                        style={{ color: rarityColor(value(it, 'rarity')) }}
                        onChange={(e) => setField(it, 'rarity', e.target.value)}
                      >
                        {rarityOptions(value(it, 'rarity')).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0" step="0.01" value={value(it, 'drop_chance')} onChange={(e) => setField(it, 'drop_chance', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" min="0" value={value(it, 'value_price')} onChange={(e) => setField(it, 'value_price', e.target.value)} />
                    </td>
                    <td className="actions">
                      <button onClick={() => saveItem(it)} disabled={!edits[it.id]}>Сохранить</button>
                      <button onClick={() => resetEdit(it)} disabled={!edits[it.id]}>Отмена</button>
                      <button onClick={() => deleteItem(it)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminItems;
