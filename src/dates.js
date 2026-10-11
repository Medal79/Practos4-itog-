// Сегодняшняя дата в формате ГГГГ-ММ-ДД (по местному времени) — для поля type="date"
export function todayString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Дата по-русски: 11.10.2026
export const formatDate = (value) => new Date(value).toLocaleDateString('ru-RU');
// Дата и время по-русски: 11.10.2026, 14:30:00
export const formatDateTime = (value) => new Date(value).toLocaleString('ru-RU');
