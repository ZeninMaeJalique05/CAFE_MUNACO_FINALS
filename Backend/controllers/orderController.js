import { Router } from 'express';
import { getRouteHandlerChain } from '../../../controllers/routeHandlers.js';
import { pool } from '../../../config/db.js';
import { requireRole } from '../../../middleware/auth.js';
import { wrap } from '../../../utils/http.js';
import {
  ORDER_STATUSES,
  KITCHEN_VISIBLE_STATUSES,
  loadOrderItems,
  stripOrderPrices,
} from '../services/orderService.js';

const router = Router();

const rows = async (sql, params = []) =>
  (await pool.query(sql, params))[0];

// [WBS] Retrieve orders based on user role and filters.
router.get(
  '/',
  requireRole('cashier', 'kitchen', 'owner'),
  wrap(async (req, res) => {
    const where = [];
    const params = [];

    // Filter orders by requested status.
    if (req.query.status) {
      const list = String(req.query.status)
        .split(',')
        .filter((status) => ORDER_STATUSES.includes(status));

      if (list.length) {
        where.push('o.status IN (?)');
        params.push(list);
      }
    }

    // Kitchen users can only see kitchen-visible orders.
    if (req.user.role === 'kitchen') {
      where.push('o.status IN (?)');
      params.push(KITCHEN_VISIBLE_STATUSES);
    }

    const whereClause = where.length
      ? `WHERE ${where.join(' AND ')}`
      : '';

    // Retrieve orders.
    const orders = await rows(
      `SELECT o.*
       FROM orders o
       ${whereClause}
       ORDER BY o.created_at DESC`,
      params,
    );

    // Include order items when requested.
    if (req.query.items === '1') {
      const itemMap = await loadOrderItems(
        orders.map((order) => order.id)
      );

      orders.forEach((order) => {
        order.items = itemMap.get(order.id) || [];
      });
    }

    // Remove prices according to the user's role.
    res.json(
      orders.map((order) =>
        stripOrderPrices(order, req.user.role)
      )
    );
  }),
);

export default router;

export function getOrdersHandlerChain(method, path) {
  return getRouteHandlerChain(router, method, path);
}
