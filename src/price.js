// Лимиты корзины (те же значения проверяет сервер)
export const MAX_PER_ITEM = 10;
export const MAX_CART_LINES = 20;

// Округление до копеек (2 знака после запятой)
const round = (n) => Math.round(n * 100) / 100;

// Цена кейса с учётом скидки: берётся большая из скидки на кейс и личного купона
export function getPrice(item, user) {
  const itemPercent = item.discount_percent || 0;
  const couponPercent = user?.coupon?.discount_percent || 0;
  const percent = Math.max(itemPercent, couponPercent);
  const final = Math.round(item.price * (100 - percent)) / 100;
  return { percent, final, old: item.price, byCoupon: couponPercent > itemPercent };
}

// Итоги корзины: строки, сумма до скидки, скидка и итого
export function getReceipt(items, user) {
  const lines = items.map((item) => {
    const { percent, final, byCoupon } = getPrice(item, user);
    return {
      id: item.id,
      name: item.name,
      image_url: item.image_url,
      duration_days: item.duration_days,
      quantity: item.quantity,
      price: item.price,
      percent,
      byCoupon,
      finalPrice: final,
      original: round(item.price * item.quantity),
      amount: Math.round(final * item.quantity * 100) / 100,
    };
  });
  const total = round(lines.reduce((sum, l) => sum + l.amount, 0));
  const originalTotal = round(lines.reduce((sum, l) => sum + l.original, 0));
  return { items: lines, originalTotal, discountTotal: round(originalTotal - total), total };
}