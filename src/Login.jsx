import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Форма входа: email и пароль. Поля проверяются перед отправкой,
 * ошибки (в том числе неверный пароль) показываются под формой.
 */
function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  // Проверка обязательных полей и формата email
  function validate() {
    const errs = {};
    if (!email.trim()) errs.email = 'Введите email';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Некорректный email';
    if (!password) errs.password = 'Введите пароль';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Отправка формы; админа ведём в админ-панель, пользователя — в личный кабинет
  async function handleSubmit(ev) {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (e) {
      setServerError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <h1>Вход</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {errors.email && <p className="error">{errors.email}</p>}

        <label>Пароль</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {errors.password && <p className="error">{errors.password}</p>}

        {serverError && <p className="error">{serverError}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</button>
      </form>
      <p className="muted">
        <Link to="/forgot-password">Забыли пароль?</Link>
      </p>
      <p className="muted">
        Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
      </p>
    </div>
  );
}

export default Login;