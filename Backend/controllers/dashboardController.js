if (role === 'kitchen') {
  return res.json({
    stats: {
      incoming: await one("SELECT COUNT(*) FROM orders WHERE status = 'sent'"),
      preparing: await one("SELECT COUNT(*) FROM orders WHERE status = 'preparing'"),
      ready: await one("SELECT COUNT(*) FROM orders WHERE status = 'ready'"),
      served_today: await one(
        "SELECT COUNT(*) FROM orders WHERE status = 'served' AND DATE(served_at) = CURDATE()",
      ),
    },
    waiting: await many(
      `SELECT id, order_no, customer_name, order_type, table_no, sent_at, special_requests
       FROM orders
       WHERE status = 'sent'
       ORDER BY sent_at
       LIMIT 6`,
    ),
  })
}