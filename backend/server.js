const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { sendResetCode } = require('./mailer');
const { validateFullName, normalizePhone, validateReviewComment } = require('./validators');
const { containsProfanity } = require('./profanity');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';

const MAX_CART_LINES = 20;
const DAY_MINUTES = 1440;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RESET_TTL_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;
const RESET_COOLDOWN_SECONDS = 60;
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

// Загруженные администратором картинки доступны по адресу /uploads/имя-файла
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => console.log('Подключение к PostgreSQL установлено'));
pool.on('error', (err) => console.error('Ошибка подключения к PostgreSQL:', err));

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'completed', 'cancelled'];

// Хеширует пароль: случайная соль + scrypt, в БД хранится строка «соль:хеш»
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Проверяет пароль по сохранённому «соль:хеш» (сравнение за постоянное время)
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// Создаёт подписанный токен входа: данные + HMAC-подпись + срок действия
function signToken(payload) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// Проверяет подпись и срок токена; возвращает данные или null, если токен недействителен
function readToken(token) {
  const [data, sig] = (token || '').split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// Middleware: требует токен входа и кладёт id пользователя в req.userId
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const payload = readToken(token);
  if (!payload) return res.status(401).json({ error: 'Необходима авторизация' });
  req.userId = payload.id;
  next();
}

// Middleware: пропускает только администратора (роль проверяется в БД при каждом запросе)
async function adminOnly(req, res, next) {
  try {
    const r = await pool.query(
      'SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND r.name = $2',
      [req.userId, 'admin']
    );
    if (r.rows.length === 0) return res.status(403).json({ error: 'Доступ только для администратора' });
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// Обёртка для async-маршрутов: любую ошибку превращает в ответ 500, а не в падение сервера
function wrap(fn) {
  return (req, res) =>
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Ошибка сервера' });
    });
}

// Приводит значение к положительному целому id или возвращает null
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Убирает лишние пробелы и обрезает строку до max символов
function cleanText(value, max) {
  const v = String(value || '').replace(/\s+/g, ' ').trim();
  return max ? v.slice(0, max) : v;
}

// Проверяем ввод на сервере: запрет действует и при запросе напрямую к API.
const BLOCKED_WORDS_ERROR = 'Мат и бранные слова запрещены, в том числе со звёздочками и другими символами';
// true, если хотя бы одно из значений содержит мат
function hasBlockedWords(...values) {
  return values.some((value) => containsProfanity(value));
}

// Дата в формате ГГГГ-ММ-ДД (по местному времени сервера)
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Хеш кода сброса пароля: в БД хранится только хеш, а не сам код
function hashResetCode(userId, code) {
  return crypto.createHmac('sha256', SECRET).update(`${userId}:${code}`).digest('hex');
}

// Данные пользователя для /me: профиль, роль и личный купон (JOIN users, roles, coupons)
async function getUser(id) {
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.default_address, r.name AS role,
            c.id AS coupon_id, c.code AS coupon_code, c.name AS coupon_name, c.discount_percent AS coupon_percent
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN coupons c ON c.id = u.coupon_id
     WHERE u.id = $1`,
    [id]
  );
  const u = r.rows[0];
  if (!u) return null;
  const isAdmin = u.role === 'admin';
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone || '',
    default_address: isAdmin ? '' : u.default_address || '',
    role: u.role,
    coupon: !isAdmin && u.coupon_id
      ? { id: u.coupon_id, code: u.coupon_code, name: u.coupon_name, discount_percent: u.coupon_percent }
      : null,
  };
}

// Проверяет, является ли пользователь администратором
async function isAdminUser(id) {
  const r = await pool.query(
    'SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND r.name = $2',
    [id, 'admin']
  );
  return r.rows.length > 0;
}

// Случайный выбор предмета с учётом шансов выпадения (криптографически случайное число)
function pickWeighted(items) {
  const total = items.reduce((s, i) => s + Number(i.drop_chance), 0);
  let roll = (crypto.randomInt(0, 1000000000) / 1000000000) * total;
  for (const item of items) {
    roll -= Number(item.drop_chance);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

const CASE_SELECT = `
  SELECT ca.id, ca.code, ca.name, ca.description, ca.price::float AS price, ca.image_url,
         ca.duration_days, ca.duration_minutes, ca.stock, ca.category_id, cat.name AS category_name, ca.coupon_id,
         COALESCE(cp.discount_percent, 0) AS discount_percent,
         COALESCE(rv.avg_rating, 0)::float AS avg_rating, COALESCE(rv.cnt, 0)::int AS reviews_count
  FROM cases ca
  LEFT JOIN categories cat ON cat.id = ca.category_id
  LEFT JOIN coupons cp ON cp.id = ca.coupon_id
  LEFT JOIN (
    SELECT case_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS cnt
    FROM reviews WHERE deleted_by_admin = FALSE GROUP BY case_id
  ) rv ON rv.case_id = ca.id`;

// Проверка, что сервер работает
app.get('/api/test', (req, res) => {
  res.json({ message: 'API работает!', timestamp: new Date() });
});

// Вход: проверка email и пароля, в ответ — токен и данные пользователя
app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Укажите email и пароль' });
  const r = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
  const row = r.rows[0];
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  res.json({ token: signToken({ id: row.id }), user: await getUser(row.id) });
}));

// Регистрация: проверка email, ФИО, телефона и пароля; создаёт пользователя с ролью «user»
app.post('/api/register', wrap(async (req, res) => {
  const { email, full_name, phone, password } = req.body || {};
  const login = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(login) || login.length > 100) {
    return res.status(400).json({ error: 'Некорректный email' });
  }
  const name = validateFullName(full_name);
  if (name.error) return res.status(400).json({ error: name.error });
  const phoneClean = normalizePhone(phone);
  if (!phoneClean) return res.status(400).json({ error: 'Телефон должен быть в формате +7 (999) 123-45-67' });
  if (String(password || '').length < 6 || String(password).length > 100) {
    return res.status(400).json({ error: 'Пароль — от 6 до 100 символов' });
  }
  try {
    const r = await pool.query(
      // Приветственный купон WELCOME (если админ его создал) действует только на ПЕРВЫЙ заказ:
      // после оформления заказа он автоматически снимается с пользователя.
      `INSERT INTO users (email, password_hash, full_name, phone, role_id, coupon_id)
       VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'user'),
               (SELECT id FROM coupons WHERE code = 'WELCOME')) RETURNING id`,
      [login, hashPassword(String(password)), name.value, phoneClean]
    );
    res.status(201).json({ token: signToken({ id: r.rows[0].id }), user: await getUser(r.rows[0].id) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    throw err;
  }
}));

// Забыли пароль: каждый раз создаёт НОВЫЙ 6-значный код, гасит старые и отправляет письмо.
// Ответ одинаковый для любого email; повторный запрос — не чаще раза в минуту
app.post('/api/password/forgot', wrap(async (req, res) => {
  const login = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(login) || login.length > 100) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }
  const generic = { ok: true, message: 'Если такой email зарегистрирован, на него отправлен код для сброса пароля' };
  const u = await pool.query('SELECT id FROM users WHERE email = $1', [login]);
  if (u.rows.length === 0) return res.json(generic);
  const userId = u.rows[0].id;

  const last = await pool.query(
    'SELECT created_at FROM password_resets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  if (last.rows.length && Date.now() - new Date(last.rows[0].created_at).getTime() < RESET_COOLDOWN_SECONDS * 1000) {
    return res.json(generic);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query('UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE', [userId]);
  await pool.query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [userId, hashResetCode(userId, code), String(RESET_TTL_MINUTES)]
  );
  try {
    await sendResetCode(login, code, RESET_TTL_MINUTES);
  } catch (err) {
    console.error('Не удалось отправить письмо:', err.message);
  }
  res.json(generic);
}));

// Сброс пароля по коду из письма: проверяет код и срок действия, затем ставит новый пароль
app.post('/api/password/reset', wrap(async (req, res) => {
  const { email, code, new_password } = req.body || {};
  const login = String(email || '').trim().toLowerCase();
  const codeClean = String(code || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(login)) return res.status(400).json({ error: 'Введите корректный email' });
  if (!/^\d{6}$/.test(codeClean)) return res.status(400).json({ error: 'Код состоит из 6 цифр' });
  if (String(new_password || '').length < 6 || String(new_password).length > 100) {
    return res.status(400).json({ error: 'Новый пароль — от 6 до 100 символов' });
  }
  const invalid = { error: 'Код неверный или срок его действия истёк' };
  const u = await pool.query('SELECT id FROM users WHERE email = $1', [login]);
  if (u.rows.length === 0) return res.status(400).json(invalid);
  const userId = u.rows[0].id;

  const r = await pool.query(
    `SELECT id, code_hash, attempts FROM password_resets
     WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return res.status(400).json(invalid);
  if (row.attempts >= RESET_MAX_ATTEMPTS) {
    await pool.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [row.id]);
    return res.status(400).json({ error: 'Слишком много неверных попыток. Запросите новый код' });
  }

  const expected = Buffer.from(row.code_hash, 'hex');
  const actual = Buffer.from(hashResetCode(userId, codeClean), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    await pool.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return res.status(400).json(invalid);
  }

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(String(new_password)), userId]);
  await pool.query('UPDATE password_resets SET used = TRUE WHERE user_id = $1', [userId]);
  res.json({ ok: true });
}));

// Текущий пользователь по токену
app.get('/api/me', auth, wrap(async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  res.json(user);
}));

// Изменение своих данных: ФИО, телефон, адрес по умолчанию
app.patch('/api/profile', auth, wrap(async (req, res) => {
  const body = req.body || {};
  const current = await getUser(req.userId);
  if (!current) return res.status(401).json({ error: 'Пользователь не найден' });
  const name = validateFullName(body.full_name);
  if (name.error) return res.status(400).json({ error: name.error });
  const phone = normalizePhone(body.phone);
  if (!phone) return res.status(400).json({ error: 'Телефон должен быть в формате +7 (999) 123-45-67' });
  const address = current.role === 'admin' ? '' : cleanText(body.default_address, 200);
  if (hasBlockedWords(address)) return res.status(400).json({ error: BLOCKED_WORDS_ERROR });
  await pool.query('UPDATE users SET full_name = $1, phone = $2, default_address = $3 WHERE id = $4', [
    name.value, phone, address, req.userId,
  ]);
  res.json(await getUser(req.userId));
}));

// Смена email (логина): нужен текущий пароль
app.patch('/api/profile/login', auth, wrap(async (req, res) => {
  const { email, current_password } = req.body || {};
  const login = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(login) || login.length > 100) return res.status(400).json({ error: 'Некорректный логин (email)' });
  if (!current_password) return res.status(400).json({ error: 'Введите текущий пароль' });
  const r = await pool.query('SELECT email, password_hash FROM users WHERE id = $1', [req.userId]);
  if (!r.rows[0] || !verifyPassword(String(current_password), r.rows[0].password_hash)) {
    return res.status(400).json({ error: 'Текущий пароль указан неверно' });
  }
  try {
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [login, req.userId]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Этот логин уже занят' });
    throw err;
  }
  res.json(await getUser(req.userId));
}));

// Смена пароля: нужен текущий пароль, новый — не короче 6 символов
app.post('/api/profile/password', auth, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Заполните оба поля' });
  if (String(new_password).length < 6 || String(new_password).length > 100) {
    return res.status(400).json({ error: 'Новый пароль — от 6 до 100 символов' });
  }
  const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!r.rows[0] || !verifyPassword(String(current_password), r.rows[0].password_hash)) {
    return res.status(400).json({ error: 'Текущий пароль указан неверно' });
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(String(new_password)), req.userId]);
  res.json({ ok: true });
}));

// Список категорий (доступен всем)
app.get('/api/categories', wrap(async (req, res) => {
  await removeEmptyNeutralCategory();
  const r = await pool.query('SELECT id, name FROM categories ORDER BY name');
  res.json(r.rows);
}));

// Админ: создать категорию
app.post('/api/categories', auth, adminOnly, wrap(async (req, res) => {
  const name = cleanText((req.body || {}).name, 50);
  if (!name) return res.status(400).json({ error: 'Введите название категории' });
  if (hasBlockedWords(name)) return res.status(400).json({ error: BLOCKED_WORDS_ERROR });
  try {
    const r = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING id, name', [name]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такая категория уже есть' });
    throw err;
  }
}));

// Админ: переименовать категорию
app.patch('/api/categories/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const name = cleanText((req.body || {}).name, 50);
  if (!id) return res.status(404).json({ error: 'Категория не найдена' });
  if (!name) return res.status(400).json({ error: 'Введите название категории' });
  if (hasBlockedWords(name)) return res.status(400).json({ error: BLOCKED_WORDS_ERROR });
  const before = await pool.query('SELECT name FROM categories WHERE id = $1', [id]);
  if (before.rows.length && isNeutral(before.rows[0].name) && !isNeutral(name)) {
    return res.status(400).json({ error: `Категорию «${NEUTRAL_CATEGORY}» переименовать нельзя` });
  }
  try {
    const r = await pool.query('UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name', [name, id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Категория не найдена' });
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такая категория уже есть' });
    throw err;
  }
}));

// Нейтральная категория: сюда переходят кейсы удалённой категории
const NEUTRAL_CATEGORY = 'Без категории';
// Служебная ли категория «Без категории» (сравнение без учёта регистра)
const isNeutral = (name) => String(name || '').trim().toLowerCase() === NEUTRAL_CATEGORY.toLowerCase();

// Если в «Без категории» не осталось кейсов — она удаляется сама
async function removeEmptyNeutralCategory() {
  try {
    await pool.query(
      `DELETE FROM categories
       WHERE LOWER(name) = LOWER($1)
         AND NOT EXISTS (SELECT 1 FROM cases WHERE cases.category_id = categories.id)`,
      [NEUTRAL_CATEGORY]
    );
  } catch (err) {
    console.error('Не удалось убрать пустую категорию:', err.message);
  }
}

// Админ: удалить категорию; её кейсы переносятся в «Без категории» (всё в одной транзакции)
app.delete('/api/categories/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Категория не найдена' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT id, name FROM categories WHERE id = $1 FOR UPDATE', [id]);
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    if (isNeutral(cur.rows[0].name)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Категорию «${NEUTRAL_CATEGORY}» удалить нельзя — в неё переходят кейсы удалённых категорий` });
    }

    // Переносим кейсы в нейтральную категорию (создаём её, только если в удаляемой категории есть кейсы)
    const count = await client.query('SELECT COUNT(*)::int AS n FROM cases WHERE category_id = $1', [id]);
    let movedCount = 0;
    if (count.rows[0].n > 0) {
      let neutral = await client.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1', [NEUTRAL_CATEGORY]);
      if (neutral.rows.length === 0) {
        neutral = await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [NEUTRAL_CATEGORY]);
      }
      const moved = await client.query('UPDATE cases SET category_id = $1 WHERE category_id = $2', [neutral.rows[0].id, id]);
      movedCount = moved.rowCount;
    }
    await client.query('DELETE FROM categories WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ ok: true, moved: movedCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// Проверяет поля купона (код, название, процент скидки); возвращает очищенные данные или { error }
function parseCoupon(body) {
  const code = cleanText(body.code, 20).toUpperCase();
  const name = cleanText(body.name, 50);
  const percent = Number(body.discount_percent);
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return { error: 'Код: 2–20 символов, латинские буквы, цифры, - и _' };
  if (!name) return { error: 'Введите название купона' };
  if (hasBlockedWords(code, name)) return { error: BLOCKED_WORDS_ERROR };
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) return { error: 'Скидка — целое число от 1 до 99' };
  return { code, name, percent };
}

// Админ: список купонов с числом пользователей, у которых купон есть
app.get('/api/coupons', auth, adminOnly, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT c.id, c.code, c.name, c.discount_percent,
            (SELECT COUNT(*) FROM users u WHERE u.coupon_id = c.id)::int AS users_count,
            (SELECT COUNT(*) FROM cases ca WHERE ca.coupon_id = c.id)::int AS cases_count
     FROM coupons c ORDER BY c.discount_percent, c.id`
  );
  res.json(r.rows);
}));

// Админ: создать купон
app.post('/api/coupons', auth, adminOnly, wrap(async (req, res) => {
  const c = parseCoupon(req.body || {});
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const r = await pool.query('INSERT INTO coupons (code, name, discount_percent) VALUES ($1,$2,$3) RETURNING id', [c.code, c.name, c.percent]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Купон с таким кодом уже есть' });
    throw err;
  }
}));

// Админ: изменить купон
app.patch('/api/coupons/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Купон не найден' });
  const c = parseCoupon(req.body || {});
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const r = await pool.query(
      'UPDATE coupons SET code = $1, name = $2, discount_percent = $3 WHERE id = $4 RETURNING id',
      [c.code, c.name, c.percent, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Купон не найден' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Купон с таким кодом уже есть' });
    throw err;
  }
}));

// Админ: удалить купон
app.delete('/api/coupons/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Купон не найден' });
  const r = await pool.query('DELETE FROM coupons WHERE id = $1', [id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'Купон не найден' });
  res.json({ ok: true });
}));

// Админ: назначить кейсу скидочный купон или снять его
app.patch('/api/cases/:id/coupon', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Кейс не найден' });
  const raw = (req.body || {}).coupon_id;
  const couponId = raw === null || raw === undefined ? null : toId(raw);
  if (raw !== null && raw !== undefined && !couponId) return res.status(400).json({ error: 'Такого купона не существует' });
  try {
    const r = await pool.query('UPDATE cases SET coupon_id = $1 WHERE id = $2 RETURNING id', [couponId, id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Кейс не найден' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Такого купона не существует' });
    throw err;
  }
}));

// Админ: список пользователей (только просмотр); роль и купон подтягиваются JOIN-ами
app.get('/api/users', auth, adminOnly, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.phone, r.name AS role,
            c.code AS coupon_code, c.discount_percent AS coupon_percent
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN coupons c ON c.id = u.coupon_id
     ORDER BY u.id`
  );
  res.json(r.rows);
}));

// Подсказки живого поиска: несколько подходящих кейсов по части названия
app.get('/api/cases/suggest', wrap(async (req, res) => {
  const q = cleanText(req.query.q, 100);
  if (!q) return res.json([]);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const r = await pool.query(
    `SELECT ca.id, ca.name, ca.price::float AS price, ca.image_url,
            COALESCE(cp.discount_percent, 0) AS discount_percent
     FROM cases ca
     LEFT JOIN coupons cp ON cp.id = ca.coupon_id
     WHERE ca.name ILIKE $1
     ORDER BY (ca.name ILIKE $2) DESC, ca.name ASC
     LIMIT 6`,
    [like, `${q.replace(/[\\%_]/g, '\\$&')}%`]
  );
  res.json(r.rows);
}));

// Каталог кейсов с поиском и фильтрами (категории, цена); категория и купон подтягиваются JOIN-ами
app.get('/api/cases', wrap(async (req, res) => {
  const where = [];
  const params = [];

  const ids = String(req.query.categories || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length) {
    params.push(ids);
    where.push(`ca.category_id = ANY($${params.length}::int[])`);
  }

  const q = cleanText(req.query.q, 100);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`ca.name ILIKE $${params.length}`);
  }

  const min = req.query.min;
  if (min !== undefined && min !== '' && Number.isFinite(Number(min))) {
    params.push(Number(min));
    where.push(`ca.price >= $${params.length}`);
  }
  const max = req.query.max;
  if (max !== undefined && max !== '' && Number.isFinite(Number(max))) {
    params.push(Number(max));
    where.push(`ca.price <= $${params.length}`);
  }
  if (req.query.sale === '1') where.push('COALESCE(cp.discount_percent, 0) > 0');

  const sorts = { price_asc: 'ca.price ASC, ca.id', price_desc: 'ca.price DESC, ca.id', name: 'ca.name ASC, ca.id' };
  const order = Object.prototype.hasOwnProperty.call(sorts, req.query.sort) ? sorts[req.query.sort] : 'ca.id';

  const sql = `${CASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  const r = await pool.query(sql, params);
  res.json(r.rows);
}));

// Данные одного кейса для его страницы
app.get('/api/cases/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Кейс не найден' });
  const r = await pool.query(`${CASE_SELECT} WHERE ca.id = $1`, [id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'Кейс не найден' });
  const items = await pool.query(
    `SELECT id, name, image_url, rarity, drop_chance::float AS drop_chance, value_price::float AS value_price
     FROM case_items WHERE case_id = $1 ORDER BY drop_chance DESC, id`,
    [id]
  );
  res.json({ ...r.rows[0], items: items.rows });
}));

// Проверяет поля кейса (название, цена больше 0, время, склад и др.); возвращает данные или { error }
function parseCase(b) {
  const name = cleanText(b.name, 100);
  const price = Number(b.price);
  const minutes = b.duration_minutes === undefined || b.duration_minutes === '' ? 60 : Number(b.duration_minutes);
  const stock = b.stock === undefined || b.stock === '' ? 100 : Number(b.stock);
  if (!name) return { error: 'Укажите название кейса' };
  if (hasBlockedWords(name, b.description)) return { error: BLOCKED_WORDS_ERROR };
  if (!Number.isFinite(price) || price <= 0) return { error: 'Цена должна быть больше 0' };
  if (price < 1) return { error: 'Минимальная цена кейса — 1 руб.' };
  if (price > 9999999999) return { error: 'Некорректная цена' };
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > DAY_MINUTES) return { error: 'Время одного кейса — целое число минут от 1 до 1440 (сутки)' };
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return { error: 'Количество на складе — целое число от 0' };
  return {
    name,
    price,
    minutes,
    stock,
    days: Math.max(1, Math.ceil(minutes / DAY_MINUTES)),
    description: cleanText(b.description, 1000),
    image_url: cleanText(b.image_url, 200),
    category_id: toId(b.category_id),
  };
}

// Админ: создать кейс
app.post('/api/cases', auth, adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const code = cleanText(b.code, 20);
  if (!code) return res.status(400).json({ error: 'Укажите код кейса' });
  if (hasBlockedWords(code)) return res.status(400).json({ error: BLOCKED_WORDS_ERROR });
  const c = parseCase(b);
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const r = await pool.query(
      `INSERT INTO cases (code, name, description, price, image_url, duration_days, duration_minutes, stock, category_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [code, c.name, c.description, c.price, c.image_url, c.days, c.minutes, c.stock, c.category_id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Кейс с таким кодом уже есть' });
    if (err.code === '23503') return res.status(400).json({ error: 'Такой категории не существует' });
    throw err;
  }
}));

// Админ: изменить кейс
app.patch('/api/cases/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Кейс не найден' });
  const c = parseCase(req.body || {});
  if (c.error) return res.status(400).json({ error: c.error });
  try {
    const r = await pool.query(
      `UPDATE cases SET name = $1, description = $2, price = $3, image_url = $4, duration_days = $5,
              duration_minutes = $6, stock = $7, category_id = $8
       WHERE id = $9 RETURNING id`,
      [c.name, c.description, c.price, c.image_url, c.days, c.minutes, c.stock, c.category_id, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Кейс не найден' });
    await removeEmptyNeutralCategory();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Такой категории не существует' });
    throw err;
  }
}));

// Админ: удалить кейс (если он уже есть в заказах — вернёт понятную ошибку)
app.delete('/api/cases/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Кейс не найден' });
  try {
    const r = await pool.query('DELETE FROM cases WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Кейс не найден' });
    await removeEmptyNeutralCategory();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Кейс уже есть в оформленных заказах — удалить его нельзя, чтобы не потерять историю' });
    }
    throw err;
  }
}));

// Проверяет поля предмета кейса (название, шанс выпадения, цена); возвращает данные или { error }
function parseItem(b) {
  const name = cleanText(b.name, 100);
  const chance = Number(b.drop_chance);
  const value = b.value_price === undefined || b.value_price === '' ? 0 : Number(b.value_price);
  if (!name) return { error: 'Укажите название предмета' };
  if (hasBlockedWords(name, b.rarity)) return { error: BLOCKED_WORDS_ERROR };
  if (!Number.isFinite(chance) || chance <= 0 || chance > 100) return { error: 'Шанс выпадения — число больше 0 и не больше 100' };
  if (!Number.isFinite(value) || value < 0) return { error: 'Некорректная стоимость предмета' };
  return {
    name,
    chance,
    value,
    image_url: cleanText(b.image_url, 200),
    rarity: cleanText(b.rarity, 20) || 'Ширпотреб',
  };
}

// Админ: добавить предмет в кейс
app.post('/api/cases/:id/items', auth, adminOnly, wrap(async (req, res) => {
  const caseId = toId(req.params.id);
  if (!caseId) return res.status(404).json({ error: 'Кейс не найден' });
  const it = parseItem(req.body || {});
  if (it.error) return res.status(400).json({ error: it.error });
  try {
    const r = await pool.query(
      `INSERT INTO case_items (case_id, name, image_url, rarity, drop_chance, value_price)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [caseId, it.name, it.image_url, it.rarity, it.chance, it.value]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'Кейс не найден' });
    throw err;
  }
}));

// Админ: изменить предмет кейса
app.patch('/api/case-items/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Предмет не найден' });
  const it = parseItem(req.body || {});
  if (it.error) return res.status(400).json({ error: it.error });
  const r = await pool.query(
    `UPDATE case_items SET name = $1, image_url = $2, rarity = $3, drop_chance = $4, value_price = $5
     WHERE id = $6 RETURNING id`,
    [it.name, it.image_url, it.rarity, it.chance, it.value, id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Предмет не найден' });
  res.json({ ok: true });
}));

// Админ: удалить предмет кейса
app.delete('/api/case-items/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Предмет не найден' });
  try {
    const r = await pool.query('DELETE FROM case_items WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Предмет не найден' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Этот предмет уже выпадал пользователям — удалить его нельзя' });
    }
    throw err;
  }
}));

// Корзина текущего пользователя (хранится в БД, у каждого своя)
app.get('/api/cart', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT ci.case_id AS id, ci.quantity, ca.name, ca.image_url, ca.price::float AS price,
            ca.duration_days, ca.duration_minutes, ca.stock, cat.name AS category_name,
            COALESCE(cp.discount_percent, 0) AS discount_percent
     FROM cart_items ci
     JOIN cases ca ON ca.id = ci.case_id
     LEFT JOIN categories cat ON cat.id = ca.category_id
     LEFT JOIN coupons cp ON cp.id = ca.coupon_id
     WHERE ci.user_id = $1
     ORDER BY ci.id`,
    [req.userId]
  );
  res.json(r.rows);
}));

// Добавить кейс в корзину: количество одного кейса ограничено только складом, разных кейсов — MAX_CART_LINES; администратору нельзя
app.post('/api/cart', auth, wrap(async (req, res) => {
  const caseId = toId((req.body || {}).case_id);
  if (!caseId) return res.status(400).json({ error: 'Некорректный кейс' });
  if (await isAdminUser(req.userId)) return res.status(403).json({ error: 'Администратор не может пользоваться корзиной' });
  const found = await pool.query('SELECT price::float AS price, stock FROM cases WHERE id = $1', [caseId]);
  if (found.rows.length === 0) return res.status(404).json({ error: 'Кейс не найден' });
  if (!(found.rows[0].price > 0)) return res.status(400).json({ error: 'Этот кейс сейчас нельзя купить' });
  const stock = found.rows[0].stock;
  if (stock < 1) return res.status(400).json({ error: 'Этого кейса нет на складе' });

  const cur = await pool.query('SELECT quantity FROM cart_items WHERE user_id = $1 AND case_id = $2', [req.userId, caseId]);
  if (cur.rows.length) {
    if (cur.rows[0].quantity >= stock) {
      return res.status(400).json({ error: `На складе осталось только ${stock} шт. этого кейса` });
    }
  } else {
    const lines = await pool.query('SELECT COUNT(*)::int AS n FROM cart_items WHERE user_id = $1', [req.userId]);
    if (lines.rows[0].n >= MAX_CART_LINES) {
      return res.status(400).json({ error: `В корзине может быть не больше ${MAX_CART_LINES} разных кейсов` });
    }
  }
  await pool.query(
    `INSERT INTO cart_items (user_id, case_id, quantity) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, case_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + 1, $3)`,
    [req.userId, caseId, stock]
  );
  res.status(201).json({ ok: true });
}));

// Изменить количество кейса в корзине на +1 или −1 (больше, чем есть на складе, нельзя)
app.patch('/api/cart/:caseId', auth, wrap(async (req, res) => {
  const caseId = toId(req.params.caseId);
  const delta = Number((req.body || {}).delta);
  if (!caseId || ![1, -1].includes(delta)) return res.status(400).json({ error: 'Некорректный запрос' });
  if (delta === 1) {
    const cur = await pool.query(
      `SELECT ci.quantity, ca.stock FROM cart_items ci JOIN cases ca ON ca.id = ci.case_id
       WHERE ci.user_id = $1 AND ci.case_id = $2`,
      [req.userId, caseId]
    );
    if (cur.rows.length && cur.rows[0].quantity >= cur.rows[0].stock) {
      return res.status(400).json({ error: `На складе осталось только ${cur.rows[0].stock} шт. этого кейса` });
    }
    await pool.query(
      'UPDATE cart_items SET quantity = quantity + 1 WHERE user_id = $1 AND case_id = $2',
      [req.userId, caseId]
    );
  } else {
    await pool.query(
      'UPDATE cart_items SET quantity = GREATEST(1, quantity - 1) WHERE user_id = $1 AND case_id = $2',
      [req.userId, caseId]
    );
  }
  res.json({ ok: true });
}));

// Удалить кейс из корзины
app.delete('/api/cart/:caseId', auth, wrap(async (req, res) => {
  const caseId = toId(req.params.caseId);
  if (!caseId) return res.status(400).json({ error: 'Некорректный запрос' });
  await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND case_id = $2', [req.userId, caseId]);
  res.json({ ok: true });
}));

// Оформление заказа: проверка данных и даты, ОДИН заказ с общей суммой на всю корзину,
// запись об оплате и выпавшие предметы — всё в одной транзакции; затем корзина очищается
app.post('/api/orders', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const steamAccount = cleanText(b.steam_account, 100);
  const desiredDate = String(b.desired_date || '');
  const method = String(b.method || 'card');

  if (steamAccount.length < 3) return res.status(400).json({ error: 'Укажите Steam-аккаунт для передачи предметов (минимум 3 символа)' });
  if (hasBlockedWords(steamAccount)) return res.status(400).json({ error: BLOCKED_WORDS_ERROR });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return res.status(400).json({ error: 'Укажите корректную дату' });
  if (!['card', 'sbp'].includes(method)) return res.status(400).json({ error: 'Неизвестный способ оплаты' });

  const chosen = new Date(desiredDate + 'T00:00:00');
  if (Number.isNaN(chosen.getTime()) || toDateString(chosen) !== desiredDate) {
    return res.status(400).json({ error: 'Такой даты не существует' });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (chosen < today) return res.status(400).json({ error: 'Желаемая дата передачи не может быть раньше сегодняшней' });

  const user = await getUser(req.userId);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Администратор не может оформлять заказы' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRow = await client.query(
      `SELECT COALESCE(c.discount_percent, 0) AS coupon_percent, u.coupon_id
       FROM users u LEFT JOIN coupons c ON c.id = u.coupon_id
       WHERE u.id = $1 FOR UPDATE OF u`,
      [req.userId]
    );
    const couponPercent = userRow.rows[0] ? userRow.rows[0].coupon_percent : 0;

    const cartRes = await client.query(
      `SELECT ci.case_id, ci.quantity, ca.name, ca.stock, ca.duration_minutes, ca.price::float AS price,
              COALESCE(cp.discount_percent, 0) AS discount_percent
       FROM cart_items ci
       JOIN cases ca ON ca.id = ci.case_id
       LEFT JOIN coupons cp ON cp.id = ca.coupon_id
       WHERE ci.user_id = $1
       ORDER BY ci.id
       FOR UPDATE OF ci, ca`,
      [req.userId]
    );
    if (cartRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    const lines = [];
    let couponUsed = false;
    for (const line of cartRes.rows) {
      if (line.quantity < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Количество одного кейса — не меньше 1' });
      }
      if (line.quantity > line.stock) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: line.stock > 0
            ? `Кейса «${line.name}» на складе осталось только ${line.stock} шт. — уменьшите количество в корзине`
            : `Кейса «${line.name}» нет на складе — удалите его из корзины`,
        });
      }

      const percent = Math.max(line.discount_percent, couponPercent);
      if (couponPercent > 0 && couponPercent > line.discount_percent) couponUsed = true;
      const unitPrice = Math.round(line.price * (100 - percent)) / 100;
      if (!(unitPrice > 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Один из кейсов имеет нулевую цену — заказ оформить нельзя' });
      }
      lines.push({ ...line, unitPrice });
    }

    const order = await client.query(
      "INSERT INTO orders (user_id, steam_account, desired_date, status) VALUES ($1, $2, $3, 'paid') RETURNING id",
      [req.userId, steamAccount, desiredDate]
    );
    const orderId = order.rows[0].id;

    let total = 0;
    for (const line of lines) {
      total += Math.round(line.unitPrice * line.quantity * 100) / 100;

      await client.query('INSERT INTO order_items (order_id, case_id, quantity, unit_price) VALUES ($1,$2,$3,$4)', [
        orderId, line.case_id, line.quantity, line.unitPrice,
      ]);
      await client.query('UPDATE cases SET stock = stock - $2 WHERE id = $1', [line.case_id, line.quantity]);

      const itemsRes = await client.query(
        'SELECT id, drop_chance::float AS drop_chance FROM case_items WHERE case_id = $1',
        [line.case_id]
      );
      if (itemsRes.rows.length === 0) {
        const err = new Error('empty-case');
        err.code = 'EMPTY_CASE';
        throw err;
      }

      for (let i = 0; i < line.quantity; i++) {
        const won = pickWeighted(itemsRes.rows);
        await client.query('INSERT INTO inventory (user_id, case_item_id, order_id) VALUES ($1,$2,$3)', [
          req.userId, won.id, orderId,
        ]);
      }
    }

    total = Math.round(total * 100) / 100;
    await client.query('INSERT INTO payments (order_id, amount, method) VALUES ($1,$2,$3)', [orderId, total, method]);
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.userId]);
    // Личный (приветственный) купон одноразовый: он действует только на один заказ и снимается после оформления
    if (couponPercent > 0) await client.query('UPDATE users SET coupon_id = NULL WHERE id = $1', [req.userId]);

    await client.query('COMMIT');
    res.status(201).json({ order_id: orderId, total, coupon_used: couponUsed });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === 'EMPTY_CASE') {
      return res.status(409).json({ error: 'В одном из кейсов пока нет предметов — оформить заказ нельзя' });
    }
    throw err;
  } finally {
    client.release();
  }
}));

// Заказы текущего пользователя: номер, дата, адрес, статус, общая сумма
app.get('/api/orders', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT o.id, o.steam_account, o.desired_date::text AS desired_date, o.status, o.created_at,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0)::float AS total,
            COALESCE(SUM(oi.quantity), 0)::int AS total_quantity,
            COALESCE(
              json_agg(json_build_object('case_name', ca.name, 'quantity', oi.quantity, 'unit_price', oi.unit_price::float))
              FILTER (WHERE oi.id IS NOT NULL), '[]'::json
            ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN cases ca ON ca.id = oi.case_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.userId]
  );
  res.json(r.rows);
}));

// Кейсы заказа для открытия и их выпавшие предметы (доступно только владельцу заказа)
app.get('/api/orders/:id/openings', auth, wrap(async (req, res) => {
  const orderId = toId(req.params.id);
  if (!orderId) return res.status(404).json({ error: 'Заказ не найден' });
  const owner = await pool.query('SELECT 1 FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.userId]);
  if (owner.rows.length === 0) return res.status(404).json({ error: 'Заказ не найден' });

  const won = await pool.query(
    `SELECT inv.id, inv.opened, ci.name, ci.image_url, ci.rarity, ci.value_price::float AS value_price,
            ca.id AS case_id, ca.name AS case_name, ca.image_url AS case_image
     FROM inventory inv
     JOIN case_items ci ON ci.id = inv.case_item_id
     JOIN cases ca ON ca.id = ci.case_id
     WHERE inv.order_id = $1 AND inv.user_id = $2
     ORDER BY inv.id`,
    [orderId, req.userId]
  );

  const caseIds = [...new Set(won.rows.map((w) => w.case_id))];
  const poolRes = caseIds.length
    ? await pool.query(
        `SELECT case_id, name, image_url, rarity, drop_chance::float AS drop_chance
         FROM case_items WHERE case_id = ANY($1::int[]) ORDER BY id`,
        [caseIds]
      )
    : { rows: [] };

  const byCase = new Map();
  for (const p of poolRes.rows) {
    if (!byCase.has(p.case_id)) byCase.set(p.case_id, []);
    byCase.get(p.case_id).push({ name: p.name, image_url: p.image_url, rarity: p.rarity, drop_chance: p.drop_chance });
  }

  res.json(
    won.rows.map((w) => ({
      id: w.id,
      opened: w.opened,
      case_name: w.case_name,
      case_image: w.case_image,
      won: { name: w.name, image_url: w.image_url, rarity: w.rarity, value_price: w.value_price },
      pool: byCase.get(w.case_id) || [],
    }))
  );
}));

// Админ: все заказы пользователей
app.get('/api/admin/orders', auth, adminOnly, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT o.id, o.status, o.steam_account, o.desired_date::text AS desired_date, o.created_at,
            u.email, u.full_name,
            COALESCE(SUM(oi.unit_price * oi.quantity), 0)::float AS total,
            COALESCE(SUM(oi.quantity), 0)::int AS total_quantity,
            EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id) AS has_payment
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     GROUP BY o.id, u.email, u.full_name
     ORDER BY o.created_at DESC, o.id DESC`
  );
  res.json(r.rows);
}));

// Админ: смена статуса заказа; оплаченный заказ нельзя вернуть в «Ожидает оплаты»
app.patch('/api/orders/:id/status', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const status = String((req.body || {}).status || '');
  if (!id) return res.status(404).json({ error: 'Заказ не найден' });
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Неизвестный статус заказа' });
  const cur = await pool.query(
    'SELECT o.status, EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id) AS has_payment FROM orders o WHERE o.id = $1',
    [id]
  );
  if (cur.rows.length === 0) return res.status(404).json({ error: 'Заказ не найден' });
  const { status: current, has_payment: hasPayment } = cur.rows[0];
  if (status === 'pending' && (current !== 'pending' || hasPayment)) {
    return res.status(400).json({ error: 'Оплаченный заказ нельзя вернуть в статус «Ожидает оплаты»' });
  }
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  res.json({ ok: true });
}));

// Инвентарь текущего пользователя: открытые выпавшие предметы
app.get('/api/inventory', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT inv.id, inv.won_at, ci.name, ci.image_url, ci.rarity, ci.value_price::float AS value_price,
            ca.name AS case_name
     FROM inventory inv
     JOIN case_items ci ON ci.id = inv.case_item_id
     JOIN cases ca ON ca.id = ci.case_id
     WHERE inv.user_id = $1 AND inv.opened = TRUE
     ORDER BY inv.won_at DESC, inv.id DESC`,
    [req.userId]
  );
  res.json(r.rows);
}));

// Кейс открыт: только теперь выпавший предмет попадает в инвентарь пользователя
app.post('/api/inventory/:id/open', auth, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Предмет не найден' });
  const r = await pool.query(
    'UPDATE inventory SET opened = TRUE, won_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.userId]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Предмет не найден' });
  res.json({ ok: true });
}));

// Отзывы о кейсе; у удалённых админом комментарий скрыт, остаётся пометка об удалении
app.get('/api/cases/:id/reviews', wrap(async (req, res) => {
  const caseId = toId(req.params.id);
  if (!caseId) return res.status(404).json({ error: 'Кейс не найден' });
  const r = await pool.query(
    `SELECT r.id, r.rating, r.deleted_by_admin,
            CASE WHEN r.deleted_by_admin THEN NULL ELSE r.comment END AS comment,
            r.created_at, u.full_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.case_id = $1 ORDER BY r.created_at DESC, r.id DESC`,
    [caseId]
  );
  res.json(r.rows);
}));

// Оставить отзыв: один отзыв от пользователя на кейс, без пустого текста и мата
app.post('/api/cases/:id/reviews', auth, wrap(async (req, res) => {
  const caseId = toId(req.params.id);
  const rating = Number((req.body || {}).rating);
  if (!caseId) return res.status(404).json({ error: 'Кейс не найден' });
  if (await isAdminUser(req.userId)) return res.status(403).json({ error: 'Администратор не может оставлять отзывы' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка — число от 1 до 5' });
  const comment = validateReviewComment((req.body || {}).comment);
  if (comment.error) return res.status(400).json({ error: comment.error });
  try {
    const r = await pool.query(
      `INSERT INTO reviews (user_id, case_id, rating, comment)
       SELECT $1::int, $2::int, $3::int, $4::text
       WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE user_id = $1::int AND case_id = $2::int)
       RETURNING id`,
      [req.userId, caseId, rating, comment.value]
    );
    if (r.rows.length === 0) {
      return res.status(409).json({ error: 'Вы уже оставили отзыв на этот кейс. На один кейс можно написать только один отзыв' });
    }
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Вы уже оставили отзыв на этот кейс. На один кейс можно написать только один отзыв' });
    if (err.code === '23503') return res.status(404).json({ error: 'Кейс не найден' });
    throw err;
  }
}));

// Изменить свой отзыв на кейс: оценка и комментарий проверяются так же, как при создании
app.put('/api/cases/:id/reviews', auth, wrap(async (req, res) => {
  const caseId = toId(req.params.id);
  const rating = Number((req.body || {}).rating);
  if (!caseId) return res.status(404).json({ error: 'Кейс не найден' });
  if (await isAdminUser(req.userId)) return res.status(403).json({ error: 'Администратор не может изменять отзывы' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка — число от 1 до 5' });
  const comment = validateReviewComment((req.body || {}).comment);
  if (comment.error) return res.status(400).json({ error: comment.error });
  const r = await pool.query(
    `UPDATE reviews SET rating = $3::int, comment = $4::text
     WHERE user_id = $1::int AND case_id = $2::int AND deleted_by_admin = FALSE
     RETURNING id`,
    [req.userId, caseId, rating, comment.value]
  );
  if (r.rows.length === 0) {
    const ex = await pool.query(
      'SELECT deleted_by_admin FROM reviews WHERE user_id = $1 AND case_id = $2 LIMIT 1',
      [req.userId, caseId]
    );
    if (ex.rows.length > 0 && ex.rows[0].deleted_by_admin) {
      return res.status(403).json({ error: 'Отзыв удалён администратором, изменить его нельзя' });
    }
    return res.status(404).json({ error: 'Отзыв не найден' });
  }
  res.json({ ok: true });
}));

// Есть ли у текущего пользователя отзыв на конкретный кейс (?case_id=...): один отзыв на кейс
app.get('/api/reviews/mine', auth, wrap(async (req, res) => {
  const caseId = toId(req.query.case_id);
  if (!caseId) return res.status(400).json({ error: 'Укажите кейс' });
  const r = await pool.query(
    'SELECT id, rating, comment, deleted_by_admin FROM reviews WHERE user_id = $1 AND case_id = $2 LIMIT 1',
    [req.userId, caseId]
  );
  const row = r.rows[0];
  res.json({
    has_review: Boolean(row),
    case_id: caseId,
    review: row
      ? { id: row.id, rating: row.rating, comment: row.deleted_by_admin ? null : row.comment, deleted_by_admin: row.deleted_by_admin }
      : null,
  });
}));

// Админ: все отзывы для модерации
app.get('/api/admin/reviews', auth, adminOnly, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.deleted_by_admin, r.deleted_at,
            u.full_name, u.email, ca.name AS case_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN cases ca ON ca.id = r.case_id
     ORDER BY r.created_at DESC, r.id DESC`
  );
  res.json(r.rows);
}));

// Админ: удалить отзыв (мягко: пользователи увидят пометку о нарушении политики)
app.delete('/api/reviews/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'Отзыв не найден' });
  const r = await pool.query(
    'UPDATE reviews SET deleted_by_admin = TRUE, deleted_at = NOW() WHERE id = $1 AND deleted_by_admin = FALSE RETURNING id',
    [id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'Отзыв не найден или уже удалён' });
  res.json({ ok: true });
}));

// Админ: загрузка картинки (кейса или предмета). Файл приходит как data URL (base64), сохраняется в backend/uploads
app.post('/api/upload', auth, adminOnly, wrap(async (req, res) => {
  const data = String((req.body || {}).data || '');
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m) return res.status(400).json({ error: 'Загрузите изображение в формате PNG, JPG, WEBP или GIF' });
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: 'Размер картинки — не больше 5 МБ' });
  }
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${IMAGE_TYPES[m[1]]}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
  res.status(201).json({ url: `${req.protocol}://${req.get('host')}/uploads/${name}` });
}));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON в запросе' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой — не больше 5 МБ' });
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

// Автоматическая миграция: добавляем колонку inventory.opened, если её ещё нет.
// Старые записи считаем открытыми (DEFAULT TRUE при создании колонки), новые будут неоткрытыми.
async function ensureSchema() {
  try {
    await pool.query('ALTER TABLE inventory ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT TRUE');
    await pool.query('ALTER TABLE inventory ALTER COLUMN opened SET DEFAULT FALSE');
    await pool.query('ALTER TABLE cases ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60');
    await pool.query('ALTER TABLE cases ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 100');
    await pool.query('ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_quantity_range');
    console.log('Схема БД проверена (inventory.opened, cases.duration_minutes, cases.stock)');
  } catch (err) {
    console.error('Не удалось обновить схему БД:', err.message);
  }
}

ensureSchema().finally(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
  });
});