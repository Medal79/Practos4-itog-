import { useState } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

const MAX_BYTES = 5 * 1024 * 1024;

// Читает файл как data URL (base64)
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

/**
 * Кнопка «Загрузить фото» для админки: отправляет выбранную картинку на сервер
 * и возвращает её адрес через onUploaded(url).
 */
function ImageUpload({ onUploaded }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Проверка файла и загрузка на сервер
  async function handleFile(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setError('Нужен файл PNG, JPG, WEBP или GIF');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Файл больше 5 МБ');
      return;
    }
    setBusy(true);
    try {
      const data = await readAsDataUrl(file);
      const res = await api('/upload', { method: 'POST', token, body: { data } });
      onUploaded(res.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="upload">
      <label className="upload-btn">
        {busy ? 'Загрузка...' : 'Загрузить фото'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} disabled={busy} hidden />
      </label>
      {error && <span className="error upload-error">{error}</span>}
    </span>
  );
}

export default ImageUpload;