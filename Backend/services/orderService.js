const TRANSITIONS = {
  kitchen: { sent: 'preparing', preparing: 'ready' },
  cashier: { ready: 'served' },
}

export function getAllowedOrderTransition(role, currentStatus) {
  return TRANSITIONS[role]?.[currentStatus]
}