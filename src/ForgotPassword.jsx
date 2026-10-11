import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';

const RESEND_SECONDS = 60;

/**
 * Восстановление пароля в два шага: 1) email -> на почту приходит новый 6-значный код;
 * 2) код + новый пароль. Повторно код можно запросить через 60 секунд.
 */
function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  // Запросить код сброса на email (каждый раз генерируется новый)
  async function sendCode() {
    setServerError('');
    setInfo('');
    const value = email.trim().toLowerCase();
    if (!value) {
      setErrors({ email: 'Введите email' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setErrors({ email: 'Некорректный email' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await api('/password/forgot', { method: 'POST', body: { email: value } });
      setInfo(res.message);
      setStep(2);
      setCode('');
      setTimer(RESEND_SECONDS);
    } catch (e) {
      setServerError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Отправка формы первого шага
  function handleSendSubmit(ev) {
    ev.preventDefault();
    sendCode();
  }

  // Проверка формы и смена пароля по коду из письма
  async function handleResetSubmit(ev) {
    ev.preventDefault();
    setServerError('');
    const errs = {};
    if (!/^\d{6}$/.test(code.trim())) errs.code = 'Введите код из письма — 6 цифр';
    if (password.length < 6) errs.password = 'Пароль — минимум 6 символов';
    if (repeat !== password) errs.repeat = 'Пароли не совпадают';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api('/password/reset', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), code: code.trim(), new_password: password },
      });
      setDone(true);
    } catch (e) {
      setServerError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth">
        <h1>Пароль изменён</h1>
        <p className="ok">Теперь вы можете войти с новым паролем.</p>
        <p><Link to="/login">Перейти ко входу</Link></p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="auth">
        <h1>Восстановление пароля</h1>
        <p className="muted">Укажите email — мы отправим на него код для сброса пароля.</p>
        <form onSubmit={handleSendSubmit} noValidate>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <p className="error">{errors.email}</p>}
          {serverError && <p className="error">{serverError}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Отправка...' : 'Отправить код'}</button>
        </form>
        <p className="muted"><Link to="/login">← Вернуться ко входу</Link></p>
      </div>
    );
  }

  return (
    <div className="auth">
      <h1>Новый пароль</h1>
      {info && <p className="ok">{info}</p>}
      <form onSubmit={handleResetSubmit} noValidate>
        <label>Код из письма</label>
        <input
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
        />
        {errors.code && <p className="error">{errors.code}</p>}

        <label>Новый пароль</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {errors.password && <p className="error">{errors.password}</p>}

        <label>Повторите пароль</label>
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        {errors.repeat && <p className="error">{errors.repeat}</p>}

        {serverError && <p className="error">{serverError}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Сменить пароль'}</button>
      </form>
      <p className="muted">
        Код действует 15 минут. Каждый раз высылается новый код, старый перестаёт работать.
      </p>
      <button type="button" disabled={timer > 0 || loading} onClick={sendCode}>
        {timer > 0 ? `Отправить код повторно через ${timer} с` : 'Отправить код повторно'}
      </button>
      <p className="muted"><Link to="/login">← Вернуться ко входу</Link></p>
    </div>
  );
}

export default ForgotPassword;