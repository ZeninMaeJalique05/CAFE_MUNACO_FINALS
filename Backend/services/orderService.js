export const ORDER_STATUSES = ['pending', 'sent', 'preparing', 'ready', 'served', 'cancelled']
export const KITCHEN_VISIBLE_STATUSES = ['sent', 'preparing', 'ready', 'served']
const TRANSITIONS = {
  kitchen: { sent: 'preparing', preparing: 'ready' },
  cashier: { ready: 'served' },
}

export function getAllowedOrderTransition(role, currentStatus) {
  return TRANSITIONS[role]?.[currentStatus]
}