if (req.query.status) {
  const list = String(req.query.status)
    .split(',')
    .filter((status) => ORDER_STATUSES.includes(status))

  if (list.length) {
    where.push('o.status IN (?)')
    params.push(list)
  }
}

if (req.user.role === 'kitchen') {
  where.push('o.status IN (?)')
  params.push(KITCHEN_VISIBLE_STATUSES)
}

// After retrieving orders:
if (req.query.items === '1') {
  const itemMap = await loadOrderItems(orders.map((order) => order.id))
  orders.forEach((order) => {
    order.items = itemMap.get(order.id) || []
  })
}

res.json(orders.map((order) => stripOrderPrices(order, req.user.role)))