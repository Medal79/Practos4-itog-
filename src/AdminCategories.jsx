import { useState, useEffect } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useNotice } from './useNotice';
import { usePersistentState } from './usePersistentState';

// Убирает лишние пробелы в названии
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// Ключ для сравнения названий: без регистра, пробелов и разницы е/ё
const key = (s) => clean(s).toLowerCase().replace(/ё/g, 'е');
// Нейтральная категория: в неё переходят кейсы удалённых категорий (её саму удалять и переименовывать нельзя)
const NEUTRAL_CATEGORY = 'Без категории';
// Служебная ли категория «Без категории» (сравнение без учёта регистра и «е/ё»)
const isNeutral = (name) => key(name) === key(NEUTRAL_CATEGORY);

/**
 * Админка: категории. Администратор создаёт, переименовывает и удаляет категории;
 * новые категории сразу появляются в фильтрах каталога.
 */
function AdminCategories() {
  const { token } = useAuth();
  const [categories, setCategories] = useState([]);
  const [edits, setEdits] = useState({});
  const [newName, setNewName] = usePersistentState('draft:admin-new-category', '');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { message, error, run } = useNotice();

  // Загрузить список категорий с сервера
  async function load() {
    const data = await api('/categories');
    setCategories(data);
  }

  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Проверка названия: не пустое, до 50 символов, без дублей
  function validate(name, exceptId) {
    const value = clean(name);
    if (!value) throw new Error('Введите название категории');
    if (value.length > 50) throw new Error('Название — не более 50 символов');
    if (categories.some((c) => c.id !== exceptId && key(c.name) === key(value))) {
      throw new Error(`Категория «${value}» уже существует (регистр и пробелы не учитываются)`);
    }
    return value;
  }

  // Создать категорию
  function addCategory(ev) {
    ev.preventDefault();
    run(async () => {
      const name = validate(newName, null);
      await api('/categories', { method: 'POST', token, body: { name } });
      setNewName('');
      await load();
    }, 'Категория добавлена — она уже появилась в каталоге');
  }

  // Переименовать категорию
  function saveCategory(category) {
    run(async () => {
      const name = validate(edits[category.id], category.id);
      await api(`/categories/${category.id}`, { method: 'PATCH', token, body: { name } });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[category.id];
        return next;
      });
      await load();
    }, 'Категория переименована');
  }

  // Удалить категорию (её кейсы переходят в нейтральную категорию «Без категории»)
  function deleteCategory(category) {
    if (!window.confirm(`Удалить категорию «${category.name}»? Её кейсы будут перенесены в категорию «${NEUTRAL_CATEGORY}».`)) return;
    run(async () => {
      await api(`/categories/${category.id}`, { method: 'DELETE', token });
      await load();
    }, `Категория удалена (кейсы, если они были, перенесены в «${NEUTRAL_CATEGORY}»)`);
  }

  if (loading) return <p>Загрузка...</p>;
  if (loadError) return <p className="error">Ошибка: {loadError}</p>;

  const needle = search.trim().toLowerCase();
  const filtered = categories.filter((c) => c.name.toLowerCase().includes(needle));
  const duplicateHint =
    clean(newName) && categories.some((c) => key(c.name) === key(newName))
      ? 'Такая категория уже есть'
      : '';

  return (
    <div>
      <h1>Категории</h1>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Ошибка: {error}</p>}

      <h2>Новая категория</h2>
      <form className="form" onSubmit={addCategory}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название категории" />
        <button type="submit" disabled={Boolean(duplicateHint)}>Добавить</button>
      </form>
      {duplicateHint && <p className="error">{duplicateHint}</p>}

      <h2>Список категорий</h2>
      <input
        className="wide"
        placeholder="Поиск по названию"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table className="table">
        <thead>
          <tr>
            <th>Название</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td>
                <input
                  readOnly={isNeutral(c.name)}
                  title={isNeutral(c.name) ? 'Служебная категория: исчезнет сама, когда в ней не останется кейсов' : ''}
                  value={edits[c.id] ?? c.name}
                  onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })}
                />
              </td>
              <td className="actions">
                <button
                  onClick={() => saveCategory(c)}
                  disabled={edits[c.id] === undefined || clean(edits[c.id]) === c.name}
                >
                  Сохранить
                </button>
                <button onClick={() => deleteCategory(c)} disabled={isNeutral(c.name)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p>Категорий не найдено</p>}
    </div>
  );
}

export default AdminCategories;