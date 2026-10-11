import { useState } from 'react';

/**
 * Хук для сообщений об успехе и ошибках (используется в личном кабинете и в админ-панели).
 *
 * Возвращает:
 *  - message — текст об успешном действии (зелёная плашка);
 *  - error   — текст ошибки (красная плашка);
 *  - run(action, okText) — выполняет асинхронное действие: сначала очищает старые сообщения,
 *    затем, если действие прошло без ошибок, показывает okText, а если выбросило ошибку — её текст.
 */
export function useNotice() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Выполнить действие и показать результат (успех или ошибку)
  async function run(action, okText) {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(okText);
    } catch (e) {
      setError(e.message);
    }
  }

  return { message, error, run };
}
