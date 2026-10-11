// Статусы заказа и их русские названия
export const STATUS_LABELS = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  processing: 'В обработке',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};

// Название статуса по его коду
export const statusLabel = (status) => STATUS_LABELS[status] || status;