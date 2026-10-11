import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PHONE_FORMAT, phoneInput, isValidPhone, checkFullName } from './validators';

/**
 * Форма регистрации: ФИО, email, телефон, пароль и повтор пароля.
 * Проверяются обязательность полей, формат email, телефона и реальность имени.
 */
function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', repeat: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  // Обновить поле формы регистрации
  const setField = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  // Ввод телефона с автоматической маской +7 (999) 123-45-67
  const setPhone = (e) => setForm({ ...form, phone: phoneInput(e.target.value, form.phone) });

  // Проверка всех полей формы; возвращает true, если ошибок нет
  function validate() {
    const errs = {};
    const nameError = checkFullName(form.full_name);
    if (nameError) errs.full_name = nameError;
    if (!form.email.trim()) errs.email = 'Введите email';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Некорректный email';
    if (!form.phone.trim()) errs.phone = 'Введите телефон';
    else if (!isValidPhone(form.phone)) errs.phone = `Телефон должен быть в формате ${PHONE_FORMAT}`;
    if (form.password.length < 6) errs.password = 'Пароль — минимум 6 символов';
    if (form.repeat !== form.password) errs.repeat = 'Пароли не совпадают';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Отправка формы регистрации
  async function handleSubmit(ev) {
    ev.preventDefault();
    setServerError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await register(form.email.trim(), form.full_name.trim(), form.phone.trim(), form.password);
      navigate('/dashboard');
    } catch (e) {
      setServerError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <h1>Регистрация</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label>Имя и фамилия</label>
        <input value={form.full_name} onChange={setField('full_name')} placeholder="Иван Петров" />
        {errors.full_name && <p className="error">{errors.full_name}</p>}

        <label>Email</label>
        <input type="email" value={form.email} onChange={setField('email')} />
        {errors.email && <p className="error">{errors.email}</p>}

        <label>Телефон</label>
        <input type="tel" inputMode="tel" maxLength={18} value={form.phone} onChange={setPhone} placeholder={PHONE_FORMAT} />
        <p className="muted">Формат: {PHONE_FORMAT}</p>
        {errors.phone && <p className="error">{errors.phone}</p>}

        <label>Пароль</label>
        <input type="password" value={form.password} onChange={setField('password')} />
        {errors.password && <p className="error">{errors.password}</p>}

        <label>Повторите пароль</label>
        <input type="password" value={form.repeat} onChange={setField('repeat')} />
        {errors.repeat && <p className="error">{errors.repeat}</p>}

        {serverError && <p className="error">{serverError}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Регистрация...' : 'Зарегистрироваться'}</button>
      </form>
      <p className="muted">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </div>
  );
}

export default Register;