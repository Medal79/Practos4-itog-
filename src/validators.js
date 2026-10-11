import { containsProfanity } from './profanity';

// Клиентские валидаторы форм (регистрация и личный кабинет).
// Серверная проверка дублируется в backend/validators.js.

// Формат телефона, который показываем пользователю
export const PHONE_FORMAT = '+7 (999) 123-45-67';

/**
 * Маска ввода телефона: оставляет только цифры и подставляет их в шаблон
 * +7 (XXX) XXX-XX-XX. prev нужен, чтобы Backspace мог стереть "хвост" маски.
 */
export function phoneInput(value, prev = '') {
  let digits = String(value || '').replace(/\D/g, '');
  // Пользователь стирает символы маски — убираем и последнюю цифру
  if (value.length < prev.length && digits.length === String(prev).replace(/\D/g, '').length) {
    digits = digits.slice(0, -1);
  }
  if (!digits) return '';
  if (digits[0] === '8' || digits[0] === '7') digits = digits.slice(1);
  digits = digits.slice(0, 10);

  let out = '+7';
  if (digits.length > 0) out += ' (' + digits.slice(0, 3);
  if (digits.length >= 3) out += ')';
  if (digits.length > 3) out += ' ' + digits.slice(3, 6);
  if (digits.length > 6) out += '-' + digits.slice(6, 8);
  if (digits.length > 8) out += '-' + digits.slice(8, 10);
  return out;
}

// Телефон корректен, если он полностью заполнен по маске (код региона начинается с 3, 4, 8 или 9 — как на сервере)
export function isValidPhone(value) {
  return /^\+7 \([3489]\d{2}\) \d{3}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

// Ряды клавиатуры: 4 подряд идущие клавиши («фыва», «qwer») — это «мусор», а не имя
const KEYBOARD_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// Есть ли в слове 4 подряд идущие клавиши одного ряда клавиатуры («фыва», «qwer»)
function looksLikeKeyboardMash(word) {
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const chunk = row.slice(i, i + 4);
      if (word.includes(chunk) || word.includes([...chunk].reverse().join(''))) return true;
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

/**
 * Проверка ФИО. Возвращает текст ошибки или пустую строку, если всё в порядке.
 */
export function checkFullName(value) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return 'Укажите настоящие имя и фамилию (например: Иван Петров)';
  }
  for (const word of words) {
    if (!/^[А-Яа-яЁёA-Za-z]+(?:[-'][А-Яа-яЁёA-Za-z]+)*$/.test(word)) {
      return 'В имени допустимы только буквы, дефис и апостроф';
    }
    const plain = word.replace(/[-']/g, '');
    if (/[А-Яа-яЁё]/.test(plain) && /[A-Za-z]/.test(plain)) {
      return 'Не смешивайте русские и латинские буквы в одном слове';
    }
    if (plain.length < 2 || plain.length > 30) return 'Каждое слово в имени — от 2 до 30 букв';
    const lower = plain.toLowerCase();
    if (!/[аеёиоуыэюяaeiouy]/.test(lower)) return 'Укажите настоящее имя — в нём должны быть гласные буквы';
    if (new Set(lower).size === 1) return 'Укажите настоящее имя, а не набор одинаковых букв';
    if (/(.)\1\1/.test(lower)) return 'Буквы в имени не могут повторяться три раза подряд';
    if (/[бвгджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxz]{5,}/.test(lower)) return 'Похоже, имя введено случайными буквами. Укажите настоящее имя';
    if (looksLikeKeyboardMash(lower)) return 'Похоже, имя введено случайными буквами. Укажите настоящее имя';
    if (looksRandomName(lower)) return 'Похоже, имя введено случайными буквами. Укажите настоящее имя';
  }
  if (containsProfanity(words.join(' '))) return 'Имя содержит недопустимые слова';
  return '';
}
