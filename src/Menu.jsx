import { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { CartContext } from './CartContext';
import { useTheme } from './ThemeContext';

// Название информационной системы
export const BRAND = 'MusorDrop';

/**
 * Главное меню: навигация, счётчик корзины, кнопка выхода и переключатель темы.
 * Активная ссылка подсвечивается (NavLink).
 */
function Menu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { cart } = useContext(CartContext);
  const { theme, toggleTheme } = useTheme();
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const isAdmin = user?.role === 'admin';

  // CSS-класс активной ссылки меню
  const linkClass = ({ isActive }) => (isActive ? 'active' : '');

  // Выход из аккаунта и переход на главную
  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="menu">
      <span className="brand">{BRAND}</span>
      <NavLink to="/" end className={linkClass}>Каталог</NavLink>
      {!isAdmin && <NavLink to="/cart" className={linkClass}>Корзина ({count})</NavLink>}
      {user ? (
        <>
          <NavLink to="/dashboard" className={linkClass}>{user.full_name}</NavLink>
          {isAdmin && <NavLink to="/admin" className={linkClass}>Админ-панель</NavLink>}
          <button onClick={handleLogout}>Выйти</button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={linkClass}>Войти</NavLink>
          <NavLink to="/register" className={linkClass}>Регистрация</NavLink>
        </>
      )}
      <button onClick={toggleTheme}>Переключить тему ({theme})</button>
    </nav>
  );
}

export default Menu;
