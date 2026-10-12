import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './AuthContext';
import { CartProvider } from './CartContext';
import PublicLayout from './PublicLayout';
import AdminLayout from './AdminLayout';
import Home from './Home';
import CasePage from './CasePage';
import Cart from './Cart';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';
import Profile from './Profile';
import OpenOrder from './OpenOrder';
import AdminCases from './AdminCases';
import AdminItems from './AdminItems';
import AdminCategories from './AdminCategories';
import AdminCoupons from './AdminCoupons';
import AdminOrders from './AdminOrders';
import AdminReviews from './AdminReviews';
import AdminUsers from './AdminUsers';

// При переходе на другую страницу возвращаем прокрутку в начало (иначе новая страница открывается «посередине»)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Страница для несуществующих адресов
function NotFound() {
  return (
    <div className="empty">
      <h1>Страница не найдена</h1>
      <p className="muted">Такого адреса на сайте нет.</p>
      <Link to="/">Перейти в каталог</Link>
    </div>
  );
}

/**
 * Корень приложения: провайдеры темы, авторизации и корзины + все маршруты сайта.
 * Раздел /admin защищён внутри AdminLayout.
 */
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="case/:id" element={<CasePage />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="forgot-password" element={<ForgotPassword />} />

                <Route path="cart" element={<Cart />} />
                <Route path="dashboard" element={<Profile />} />
                <Route path="open/:orderId" element={<OpenOrder />} />

                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="cases" replace />} />
                  <Route path="cases" element={<AdminCases />} />
                  <Route path="items" element={<AdminItems />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="reviews" element={<AdminReviews />} />
                  <Route path="users" element={<AdminUsers />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;