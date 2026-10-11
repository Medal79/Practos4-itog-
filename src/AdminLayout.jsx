import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import ServerError from './ServerError';

const SECTIONS = [
  { to: '/admin/cases', label: 'Кейсы и скидки' },
  { to: '/admin/items', label: 'Предметы кейсов' },
  { to: '/admin/categories', label: 'Категории' },
  { to: '/admin/coupons', label: 'Купоны' },
  { to: '/admin/orders', label: 'Заказы' },
  { to: '/admin/reviews', label: 'Отзывы' },
  { to: '/admin/users', label: 'Пользователи' },
];

// Сообщение «Доступ запрещён» для гостей и обычных пользователей, открывших /admin
function AccessDenied({ guest }) {
  return (
    <div className="empty">
      <h1>Доступ запрещён</h1>
      <p className="error">У вас нет прав для просмотра этой страницы. Раздел доступен только администратору.</p>
      <p>
        {guest && <><Link to="/login">Войти</Link> · </>}
        <Link to="/">Перейти в каталог</Link>
      </p>
    </div>
  );
}

/**
 * Каркас админ-панели: боковое меню разделов + содержимое выбранного раздела.
 * Пускает только администратора, остальным показывает «Доступ запрещён».
 */
function AdminLayout() {
  const { user, loading, authError, retryAuth } = useAuth();

  if (loading) return <p>Загрузка...</p>;
  // Сервер лежит — это не «нет прав», а ошибка сервера
  if (authError) return <ServerError message={authError} onRetry={retryAuth} />;
  if (!user) return <AccessDenied guest />;
  if (user.role !== 'admin') return <AccessDenied />;

  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        <h3>Админ-панель</h3>
        {SECTIONS.map((s) => (
          <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {s.label}
          </NavLink>
        ))}
      </aside>
      <section className="admin-content">
        <Outlet />
      </section>
    </div>
  );
}

export default AdminLayout;