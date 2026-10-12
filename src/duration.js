// Время по-русски: 45 мин, 2 ч 30 мин, 1 сут. 4 ч (в сутках 1440 минут)
export function formatDuration(totalMinutes) {
  const m = Math.round(Number(totalMinutes) || 0);
  if (m <= 0) return '0 мин';
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const minutes = m % 60;
  const parts = [];
  if (days) parts.push(`${days} сут.`);
  if (hours) parts.push(`${hours} ч`);
  if (minutes) parts.push(`${minutes} мин`);
  return parts.join(' ');
}