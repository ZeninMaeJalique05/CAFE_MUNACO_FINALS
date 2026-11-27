// [WBS 4.1.1] Display the owner overview dashboard.
if (role === 'owner') {
  return res.json({
    stats: {
      today_sales: await one(
        "SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'served' AND DATE(served_at) = CURDATE()"
      ),
      today_orders: await one(
        "SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'cancelled'"
      ),
      active_orders: await one(
        "SELECT COUNT(*) FROM orders WHERE status IN ('sent','preparing','ready')"
      ),
      low_stock: await one(
        `SELECT COUNT(*) FROM inventory_items WHERE ${LOW}`
      ),
      active_staff: await one(
        "SELECT COUNT(*) FROM users WHERE is_active = 1 AND role <> 'owner'"
      ),
    },
    order_status: await many(
      "SELECT status, COUNT(*) AS count FROM orders WHERE DATE(created_at) = CURDATE() GROUP BY status"
    ),
    low_items: await many(
      `SELECT id, name, unit, quantity, reorder_level
       FROM inventory_items
       WHERE ${LOW}
       ORDER BY quantity / NULLIF(reorder_level, 0)
       LIMIT 5`
    ),
    activity: await many(
      `SELECT a.id, a.action, a.details, a.created_at, u.full_name, u.role
       FROM activity_log a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`
    ),
  })
}

// [WBS] Display the kitchen dashboard.
if (role === 'kitchen') {
  return res.json({
    stats: {
      incoming: await one(
        "SELECT COUNT(*) FROM orders WHERE status = 'sent'"
      ),
      preparing: await one(
        "SELECT COUNT(*) FROM orders WHERE status = 'preparing'"
      ),
      ready: await one(
        "SELECT COUNT(*) FROM orders WHERE status = 'ready'"
      ),
      served_today: await one(
        "SELECT COUNT(*) FROM orders WHERE status = 'served' AND DATE(served_at) = CURDATE()"
      ),
    },
    waiting: await many(
      `SELECT id, order_no, customer_name, order_type, table_no, sent_at, special_requests
       FROM orders
       WHERE status = 'sent'
       ORDER BY sent_at
       LIMIT 6`
    ),
  })
}