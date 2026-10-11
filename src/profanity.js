// Клиентская копия фильтра из backend/profanity.js. На сервере проверка остаётся обязательной.
const TO_RU = {
  a:'а',b:'в',c:'с',d:'д',e:'е',g:'г',h:'н',i:'и',j:'й',k:'к',l:'л',m:'м',o:'о',p:'р',s:'с',t:'т',u:'и',v:'в',x:'х',y:'у',
  0:'о',1:'и',3:'з',4:'ч',5:'с',6:'б',7:'т',8:'в','@':'а','$':'с','!':'и','|':'и',
};
const TO_EN = {
  а:'a',в:'b',с:'c',е:'e',к:'k',м:'m',н:'h',о:'o',р:'p',т:'t',у:'y',х:'x',
  0:'o',1:'i',3:'e',4:'a',5:'s',7:'t','@':'a','$':'s','!':'i','|':'i',
};
const RU_PREFIX = '(?:недо|пере|про|при|под|раз|рас|воз|вы|на|по|за|от|об|до|ис|из|не|ни|с|у|в|о)*';
const RU_ROOTS = [
  'ху[йеяюи]', 'хул[ие]$', 'п[ие]зд', 'пи[сз]д',
  'еб(?:ат|ал|ан|аш|ис|ит|ло|ли|ну|ут|уч|у|е|и|л|а|ы|я)',
  'бля(?:д|т|$)', 'бле(?:ть|дь|ат)', 'сук(?:а|и|е|у|ой|ам|ами|ин)$',
  'суч(?:к|ар|он)', 'муд(?:ак|ил|озв)', 'г[ао]ндон',
  'пид(?:ор|ар|р|орас)', 'педик(?!юр)', 'шлюх', 'шалав',
  'залуп', 'манд(?:а|е|у|ой|ы)$', 'дроч', 'говн',
  'ублюд', 'долб[ао]еб', 'жоп', 'дерьм', 'сра(?:ть|л|н|к)',
  'засран', 'обосра', 'просра', 'оху', 'аху',
  'мраз', 'сволоч', 'твар[ьи]', 'гнид', 'подон', 'скотин',
  'дура(?:к|ц|ч|ш)', 'дебил', 'идиот', 'кретин', 'туп(?:иц|ой|ая|ые|ое|ого|ому)',
  'урод', 'придур', 'тупорыл', 'падл', 'гадин', 'мерзав', 'херн', 'пздц$', 'лошар', 'лох(?:и|а|у|е|ом)?$', 'чмо(?:$|[аеио])',
].map((pattern) => new RegExp(`^${RU_PREFIX}(?:${pattern})`, 'u'));
const EN_ROOTS = [
  /^(?:mother)?fuck/, /^(?:fuk|fck)/, /^shit/, /^bullshit/, /^bitch/, /^cunt/,
  /^nigg(?:er|a)/, /^asshole/, /^bastard/, /^whore/, /^slut/, /^dick(?:$|head|s$)/,
  /^pussy/, /^retard/, /^dumbass/, /^(?:wtf|stfu)$/, /^damn(?:$|ed$)/, /^crap$/, /^idiot/, /^moron/,
  /^(?:na|po|za)?(?:huy|hui|huj|khuy|xuy|xyi)/, /^huinya/, /^suka/,
  /^cyka/, /^blya/, /^blja/, /^pizd/, /^pidor/, /^pidar/,
  /^eb(?:at|al|an|ash|lo|nut)/, /^yob/, /^mudak/,
  /^dolbaeb/, /^govno/, /^zhopa/, /^shlyuh/,
];
// Словоформы нужны только для распознавания скрытых звёздочками букв.
const MASK_WORDS = `
  хуй хуя хую хуе хуи хуйню хуйня хуйней хуев хуево хуевый хуевина хуер
  хуйло хуила хуесос хуесосы хуеть хуел хуели хуеет хуячить хуярить хуярил хуячит хули хуле
  нахуй нахуя похуй охуел охуела охуели охуеть охуенный
  ахуел ахуеть ахуела ахуели ахуенно
  пизда пизды пизду пизде пиздой пиздец пиздато пиздатый пиздеть
  пиздит пиздил пиздили пиздюк пизданул распиздяй
  блядь блять блядский блядина бляди блядство бля блеать
  ебать ебался ебалась ебаться ебал ебала ебали ебет ебешь ебут
  ебаный ебаная ебаные ебанутый ебанутая ебанули ебанул
  ебучий ебучая ебучее ебашить ебашит ебашил ебло ебли ебись
  заебал заебала заебало заебали заебись заебаться
  выебал выебать уебан уебок уебал уебать наебал наебать
  сука суки суку суке сукой сучка сучки сучара сучонок сукин
  мудак мудаки мудака мудаком мудила мудозвон
  гандон гондон гандоны пидор пидора пидоры пидорас пидар пидр педик
  шлюха шлюхи шлюху шалава шалавы залупа залупу залупой манда
  дрочить дрочит дрочил дрочка дрочер дрочун
  говно говна говнюк говнище говняный говенный
  ублюдок ублюдки долбоеб долбаеб долбоебы
  жопа жопу жопе жопой жопный дерьмо дерьмовый
  срать срал сраный сраная засранец засранка обосрал просрал
  мразь мрази мразота сволочь сволочи тварь твари гнида гниды
  подонок подонки скотина скотины дурак дураки дурацкий дурачина
  дебил дебилы дебильный идиот идиоты идиотка кретин кретины
  тупой тупая тупица тупые урод уроды уродина лошара лох лохи лохом
  чмо чмошник херня падла придурок мерзавец гадина тупорылый пздц
  fuck fucking fucked fucker motherfucker shit shitty bullshit bitch bitches
  cunt nigga nigger asshole bastard whore slut dick dickhead pussy retard
  dumbass damn crap idiot moron fuk fck
  huy hui huj huinya nahuy nahui pohuy pohui khuy xuy
  suka cyka blyat blyad blya bljat pizda pizdec pizdets pidor pidar pidr
  ebat ebal eban ebash yobany mudak dolbaeb govno zhopa shlyuha
`.trim().split(/\s+/u);
const PREFIXES = ['на','по','за','вы','у','от','об','при','про','под','пере','не','раз'];
const SUFFIXES = ['а','у','е','ы','и','ой','ом','ам','ами','ах','ого','ому','ый','ая','ые','ое','ить','ать','ет','ют','ил','или','ила','ся','сь'];

// Приводит текст к единому виду: нижний регистр, «ё» → «е», без невидимых символов
function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
    .replace(/[\u0300-\u036f\u200b-\u200f\u2060-\u206f\ufeff]/g, '');
}
// Заменяет в слове похожие символы по таблице (латиница ↔ кириллица, цифры и знаки вместо букв)
function transliterate(word, alphabet) {
  return [...word].map((letter) => alphabet[letter] ?? letter).join('');
}
// Слово со звёздочками («ху*ня»): подходит ли оно под известное матерное слово при пропущенных буквах
function matchesMask(word) {
  if (!word.includes('*')) return false;
  const parts = word.replace(/\*+/g, '*').split('*');
  const visible = parts.join('').replace(/[^\p{L}\p{N}]/gu, '');
  if (visible.length < 2 || word.length > 80 || parts.length > 7) return false;
  // Экранирует спецсимволы, чтобы часть слова можно было безопасно подставить в регулярное выражение
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + parts.map(escape).join('[\\p{L}\\p{N}]{0,12}') + '$', 'u');
  for (const base of MASK_WORDS) {
    if (regex.test(base)) return true;
    if (base.length < 4) continue;
    for (const suffix of SUFFIXES) if (regex.test(base + suffix)) return true;
    for (const prefix of PREFIXES) if (regex.test(prefix + base)) return true;
  }
  return false;
}
// Обычные слова, внешне похожие на корень «еб» с приставкой: «себе», «себя», «себестоимость», «веб»
const SAFE_WORD = /^(?:(?:у|в|о|на|за|по|от|из|с|со|до|об|во|ко|к|при|про|под|без|над|для)?(?:себе|себя)|веб(?:$|[аеиуыо]))/u;

// Проверка одного слова: корни мата, латинский мат, растянутые буквы и слова с масками
function isBlockedWord(token) {
  if (SAFE_WORD.test(token)) return false;
  const ru = transliterate(token, TO_RU);
  const en = transliterate(token, TO_EN);
  if (!token.includes('*')) {
    // Повторы букв ("хууууй", "бляяять") не позволяют обойти фильтр.
    const collapsed = ru.replace(/(.)\1{2,}/gu, '$1');
    if (RU_ROOTS.some((rule) => rule.test(ru) || rule.test(collapsed))) return true;
    if (/[a-z]/u.test(token) && EN_ROOTS.some((rule) => rule.test(en))) return true;
  }
  return matchesMask(ru) || matchesMask(en);
}
// Главная проверка: true, если в тексте есть мат — в том числе со звёздочками, разорванный пробелами или записанный латиницей
function containsProfanity(value) {
  // Сокращения «т.е.», «т.д.», «т.п.», «т.к.», «т.н.», «т.ч.» — не слова с замаскированной буквой
  const text = normalize(value)
    .replace(/(^|[^\p{L}\p{N}])т\.\s?[еднкпч](?![\p{L}\p{N}])\.?/gu, '$1 ')
    .replace(/([\p{L}\p{N}])[\p{S}\p{P}]+(?=[\p{L}\p{N}])/gu, '$1*');
  const chunks = text.match(/[\p{L}\p{N}@!$|*#?._~\-]+/gu) || [];
  // Распознаём и маски, отделённые пробелами: «ху * ня».
  for (let i = 1; i < chunks.length - 1; i++) {
    if (/^[*#?._~\-]+$/.test(chunks[i]) &&
        isBlockedWord(chunks[i - 1] + '*' + chunks[i + 1])) return true;
  }
  // Разрывы слова пробелами («ху йня», «су ка») не помогают его опубликовать.
  for (let i = 0; i < chunks.length - 1; i++) {
    const left = chunks[i];
    const right = chunks[i + 1];
    if (left.length <= 3 && right.length <= 5 &&
        /^[\p{L}]+$/u.test(left + right) && isBlockedWord(left + right)) return true;
  }
  let singles = '';
  // Проверяет накопленные одиночные символы («х у й») как одно слово и сбрасывает буфер
  function flush() {
    const blocked = singles.length >= 2 && isBlockedWord(singles);
    singles = '';
    return blocked;
  }
  for (const chunk of chunks) {
    const word = chunk.replace(/[._~#?*\-]+/g, '*');
    if (isBlockedWord(word)) return true;
    if (/^(?:[\p{L}\p{N}@!$|]|\*)$/u.test(word)) {
      singles += word;
    } else if (word.includes('*') && singles.length && singles.length <= 4) {
      if (isBlockedWord(singles + word)) return true;
      if (flush()) return true;
    } else if (flush()) {
      return true;
    }
  }
  return flush();
}
export { containsProfanity };
