const { containsProfanity } = require('./profanity');

const KEYBOARD_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// Есть ли в слове 4 подряд идущие клавиши одного ряда клавиатуры («фыва», «qwer»)
function looksLikeKeyboardMash(word) {
  const w = word.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const chunk = row.slice(i, i + 4);
      if (w.includes(chunk) || w.includes([...chunk].reverse().join(''))) return true;
    }
  }
  return false;
}

// Сочетания букв, которых нет в настоящих русских именах («фы», «ыф», «вф» — это «мусор» с клавиатуры)
const IMPOSSIBLE_PAIRS = /(?:фы|ыф|фв|вф|ыа|аы|ыо|оы|ыы|ыи|иы|ыу|уы|ыэ|эы|ыю|юы|ыя|яы|ыь|ьы|ьь|ъь|ьъ)/;

/**
 * Эвристика «случайные буквы» для слов длиннее 4 букв:
 *  - слово начинается с «ы», «ь» или «ъ» (русских имён на эти буквы не бывает);
 *  - в слове есть невозможное сочетание букв (IMPOSSIBLE_PAIRS);
 *  - в слове (6+ букв) не больше 3 разных букв;
 *  - слово — один и тот же короткий блок, повторённый несколько раз («фывфыв», «тататата»).
 * Ряды клавиатуры целиком не проверяем: «Орлова» или «Павлова» набираются средним рядом, но это настоящие фамилии.
 */
function looksRandomName(lower) {
  if (lower.length < 5) return false;
  if (/^[ыьъ]/.test(lower)) return true;
  if (IMPOSSIBLE_PAIRS.test(lower)) return true;
  if (lower.length >= 6 && new Set(lower).size <= 3) return true;
  if (lower.length >= 6 && /^(.{2,3})\1+$/.test(lower)) return true;
  return false;
}

// Приводит слово к виду «Иван» или «Анна-Мария»: первая буква заглавная
function capitalizeWord(word) {
  return word
    .toLowerCase()
    .split(/([-'])/)
    .map((part) => (part === '-' || part === "'" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

// Проверка ФИО: 2–4 слова, только буквы, без мата и «случайных букв»; возвращает { value } или { error }
function validateFullName(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return { error: 'Укажите настоящие имя и фамилию (например: Иван Петров)' };
  }
  const fixed = [];
  for (const word of words) {
    if (!/^[А-Яа-яЁёA-Za-z]+(?:[-'][А-Яа-яЁёA-Za-z]+)*$/.test(word)) {
      return { error: 'В имени допустимы только буквы, дефис и апостроф' };
    }
    const plain = word.replace(/[-']/g, '');
    const hasCyr = /[А-Яа-яЁё]/.test(plain);
    const hasLat = /[A-Za-z]/.test(plain);
    if (hasCyr && hasLat) return { error: 'Не смешивайте русские и латинские буквы в одном слове' };
    if (plain.length < 2 || plain.length > 30) return { error: 'Каждое слово в имени — от 2 до 30 букв' };
    const lower = plain.toLowerCase();
    if (!/[аеёиоуыэюяaeiouy]/.test(lower)) return { error: 'Укажите настоящее имя — в нём должны быть гласные буквы' };
    if (new Set(lower).size === 1) return { error: 'Укажите настоящее имя, а не набор одинаковых букв' };
    if (/(.)\1\1/.test(lower)) return { error: 'Укажите настоящее имя — буквы не могут повторяться три раза подряд' };
    if (/[бвгджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxz]{5,}/.test(lower)) {
      return { error: 'Похоже, имя введено случайными буквами. Укажите настоящее имя' };
    }
    if (looksLikeKeyboardMash(lower)) return { error: 'Похоже, имя введено случайными буквами. Укажите настоящее имя' };
    if (looksRandomName(lower)) return { error: 'Похоже, имя введено случайными буквами. Укажите настоящее имя' };
    if (/хуй|пизд|бляд|ебан/.test(lower)) return { error: 'Имя содержит недопустимые слова' };
    fixed.push(capitalizeWord(word));
  }
  const result = fixed.join(' ');
  if (containsProfanity(result)) return { error: 'Имя содержит недопустимые слова' };
  return { value: result };
}

// Приводит телефон к виду +7 (999) 123-45-67 или возвращает null, если номер некорректен
function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length !== 11 || digits[0] !== '7' || !/[3489]/.test(digits[1])) return null;
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

// Проверка отзыва: не пустой, минимум 3 буквы, до 500 символов, без мата; возвращает { value } или { error }
function validateReviewComment(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'Отзыв не может быть пустым' };
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (text.length < 3 || letters < 3) return { error: 'Напишите осмысленный отзыв (минимум 3 буквы)' };
  if (text.length > 500) return { error: 'Отзыв — не длиннее 500 символов' };
  if (/(.)\1{5,}/u.test(text)) return { error: 'Отзыв не должен состоять из повторяющихся символов' };
  if (containsProfanity(text)) return { error: 'В отзывах нельзя использовать нецензурные выражения' };
  return { value: text };
}

module.exports = { containsProfanity, validateFullName, normalizePhone, validateReviewComment };

