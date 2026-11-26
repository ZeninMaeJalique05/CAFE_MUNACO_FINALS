export const KITCHEN_VISIBLE_STATUSES = ['sent', 'preparing', 'ready', 'served'];

export function isKitchenVisibleStatus(status) {
  return KITCHEN_VISIBLE_STATUSES.includes(status);
}

export function stripOrderPrices(order, role) {
  if (role !== 'kitchen') return order;
  const { total, payment_status, payment_method, paid_at, ...rest } = order;
  if (rest.items) {
    rest.items = rest.items.map(({ unit_price, ...item }) => item);
  }
  return rest;
}