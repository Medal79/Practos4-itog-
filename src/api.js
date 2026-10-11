const API_URL = 'http://localhost:3001/api';

/**
 * Единая функция запросов к серверному API. Подставляет токен, разбирает JSON и
 * при ошибке бросает Error с понятным текстом (и полем status — HTTP-код).
 */
export async function api(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Сервер временно недоступен — ведутся технические работы. Попробуйте позже.');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Ошибка запроса');
    err.status = res.status;
    throw err;
  }
  return data;
}