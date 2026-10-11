import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { CartContext } from './CartContext';
import { useAuth } from './AuthContext';
import CaseCard from './CaseCard';
import Img from './Img';

/**
 * Главная страница — каталог кейсов.
 * Слева aside с чекбоксами категорий, цена, «только со скидкой»; сверху поиск и сортировка.
 * Все фильтры уходят на сервер одним запросом GET /cases?...
 */
function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToCart } = useContext(CartContext);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [q, setQ] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState('');
  const [sale, setSale] = useState(false);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [cartError, setCartError] = useState('');
  // Живые подсказки поиска (как в DNS): показываются сразу при вводе, без кнопки «Найти»
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchRef = useRef(null);

  // Собираем строку параметров запроса из выбранных фильтров
  const params = new URLSearchParams();
  if (selected.length) params.set('categories', selected.join(','));
  if (q.trim()) params.set('q', q.trim());
  if (min !== '') params.set('min', min);
  if (max !== '') params.set('max', max);
  if (sort) params.set('sort', sort);
  if (sale) params.set('sale', '1');
  const query = params.toString();

  // Категории для aside (новые категории, добавленные админом, появляются здесь автоматически)
  useEffect(() => {
    api('/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message));
  }, [reload]);

  // Загрузка кейсов; небольшая задержка, чтобы не слать запрос на каждую набранную букву
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      api(`/cases?${query}`)
        .then((data) => !ignore && setCases(Array.isArray(data) ? data : []))
        .catch((e) => !ignore && setError(e.message))
        .finally(() => !ignore && setLoading(false));
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, reload]);

  // Подсказки: запрос к серверу через 200 мс после последнего символа
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setSuggestions([]);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      api(`/cases/suggest?q=${encodeURIComponent(text)}`)
        .then((data) => !ignore && setSuggestions(Array.isArray(data) ? data : []))
        .catch(() => !ignore && setSuggestions([]));
    }, 200);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [q]);

  // Закрывать выпадающий список при клике вне поиска
  useEffect(() => {
    // Закрывает выпадающие подсказки поиска при клике вне поля
    function onClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSuggestOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Отметить / снять категорию
  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Сбросить поиск и все фильтры
  function resetAll() {
    setSelected([]);
    setQ('');
    setMin('');
    setMax('');
    setSort('');
    setSale(false);
  }

  // Добавить кейс в корзину (только для авторизованных — корзина хранится на сервере)
  async function handleAdd(item) {
    setNotice('');
    setCartError('');
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await addToCart(item.id);
      setNotice(`«${item.name}» добавлен в корзину`);
    } catch (e) {
      setCartError(e.message);
    }
  }

  const hasFilters = query !== '';
  const priceRangeInvalid = min !== '' && max !== '' && Number(min) > Number(max);
  const isAdmin = user?.role === 'admin';

  return (
    <div className="layout">
      <aside>
        <h3>Категории</h3>
        {categories.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}

        <h3>Цена, руб.</h3>
        <div className="row">
          <input type="number" min="0" placeholder="от" value={min} onChange={(e) => setMin(e.target.value)} />
          <input type="number" min="0" placeholder="до" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>

        <label className="check">
          <input type="checkbox" checked={sale} onChange={(e) => setSale(e.target.checked)} />
          Только со скидкой
        </label>

        {hasFilters && <button onClick={resetAll}>Сбросить всё</button>}
      </aside>

      <main>
        <h1>Каталог кейсов</h1>

        <div className="toolbar">
          <div className="search-box grow" ref={searchRef}>
            <input
              className="wide"
              placeholder="Поиск кейса по названию"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'Enter') setSuggestOpen(false);
              }}
              autoComplete="off"
            />
            {suggestOpen && q.trim() && suggestions.length > 0 && (
              <ul className="suggest">
                {suggestions.map((s) => {
                  const percent = s.discount_percent || 0;
                  const price = Math.round(s.price * (100 - percent)) / 100;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="suggest-item"
                        onClick={() => {
                          setSuggestOpen(false);
                          navigate(`/case/${s.id}`);
                        }}
                      >
                        <Img className="suggest-img" src={s.image_url} alt={s.name} />
                        <span className="grow">{s.name}</span>
                        <b>{price} руб.</b>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Без сортировки</option>
            <option value="price_asc">Сначала дешёвые</option>
            <option value="price_desc">Сначала дорогие</option>
            <option value="name">По названию</option>
          </select>
        </div>

        {notice && <p className="ok">{notice}</p>}
        {cartError && <p className="error">Ошибка: {cartError}</p>}

        {loading && <p>Загрузка кейсов...</p>}
        {error && (
          <div className="error">
            <p>Ошибка: {error}</p>
            <button onClick={() => setReload((n) => n + 1)}>Попробовать снова</button>
          </div>
        )}
        {!loading && !error && cases.length === 0 && (
          <div className="empty">
            <p>
              <b>
                {q.trim()
                  ? `По запросу «${q.trim()}» ничего не найдено`
                  : hasFilters
                    ? 'По выбранным фильтрам ничего не найдено'
                    : 'Кейсов пока нет'}
              </b>
            </p>
            {priceRangeInvalid && <p className="error">Минимальная цена больше максимальной</p>}
            {hasFilters && (
              <>
                <p className="muted">Проверьте написание, попробуйте другой запрос или ослабьте фильтры</p>
                <button onClick={resetAll}>Сбросить поиск и фильтры</button>
              </>
            )}
          </div>
        )}
        {!loading && !error && cases.length > 0 && (
          <div className="grid">
            {cases.map((c) => (
              <CaseCard key={c.id} item={c} onAdd={isAdmin ? undefined : () => handleAdd(c)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default Home;