import { Router } from 'express';
import { getRouteHandlerChain } from '../../../controllers/routeHandlers.js';
import { pool } from '../../../config/db.js';
import { requireRole } from '../../../middleware/auth.js';
import { wrap, httpError, isBlank } from '../../../utils/http.js';
import { logActivity } from '../../../services/activityService.js';


const router = Router();


const num = (v, label) => {
  const n = Number(v);
  if (isBlank(v) || !Number.isFinite(n) || n < 0) throw httpError(400, `${label} must be a number, zero or higher.`);
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
};

const status = (item) => (item.quantity <= 0 ? 'out' : item.quantity <= item.reorder_level ? 'low' : 'ok');

// [WBS 3.1.1] Implement inventory item create, update, and delete.
// ---------------------------------------------------------------- list  (?q= ?category= ?fresh=1 ?low=1)
router.get(
  '/',
  requireRole(...READERS),
  wrap(async (req, res) => {
    const where = [];
    const params = [];
    if (req.query.q) {
      where.push('name LIKE ?');
      params.push(`%${req.query.q}%`);
    }
    if (CATEGORIES.includes(req.query.category)) {
      where.push('category = ?');
      params.push(req.query.category);
    }
    if (req.query.fresh === '1') where.push('is_fresh = 1');
    if (req.query.low === '1') where.push('quantity <= reorder_level');

    const [rows] = await pool.query(
      `SELECT * FROM inventory_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`,
      params
    );
    res.json(rows.map((r) => ({ ...r, stock_status: status(r) })));
  })
);




// [WBS 3.1.1] Implement inventory item create, update, and delete.
// ---------------------------------------------------------------- add item (inventory)
router.post(
  '/',
  requireRole('inventory'),
  wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) throw httpError(400, 'Enter the item name.');
    if (!CATEGORIES.includes(b.category)) throw httpError(400, 'Choose a category.');
    if (isBlank(b.unit)) throw httpError(400, 'Choose a unit.');
    const quantity = isBlank(b.quantity) ? 0 : num(b.quantity, 'Starting quantity');
    const reorder_level = isBlank(b.reorder_level) ? 0 : num(b.reorder_level, 'Reorder level');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [dup] = await conn.query('SELECT id FROM inventory_items WHERE name = ?', [name]);
      if (dup.length) throw httpError(409, `"${name}" is already in the inventory list.`);
      const [result] = await conn.query(
        'INSERT INTO inventory_items (name, category, unit, quantity, reorder_level, is_fresh) VALUES (?, ?, ?, ?, ?, ?)',
        [name, b.category, String(b.unit).trim(), quantity, reorder_level, b.is_fresh ? 1 : 0]
      );
      if (quantity > 0) {
        await conn.query(
          "INSERT INTO stock_movements (item_id, movement_type, quantity, balance_after, reason, created_by) VALUES (?, 'in', ?, ?, 'Opening stock', ?)",
          [result.insertId, quantity, quantity, req.user.id]
        );
      }
      await logActivity(req.user.id, 'Item added', `${name} added to inventory`, conn);
      await conn.commit();
      res.status(201).json({ id: result.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// [WBS 3.1.1] Implement inventory item create, update, and delete.
// ---------------------------------------------------------------- edit details (inventory). Quantity changes go through stock in/out.
router.put(
  '/:id',
  requireRole('inventory'),
  wrap(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) throw httpError(400, 'Enter the item name.');
    if (!CATEGORIES.includes(b.category)) throw httpError(400, 'Choose a category.');
    if (isBlank(b.unit)) throw httpError(400, 'Choose a unit.');
    const reorder_level = num(b.reorder_level, 'Reorder level');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[existing]] = await conn.query('SELECT id, unit FROM inventory_items WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!existing) throw httpError(404, 'Item not found.');
      if (String(b.unit).trim() !== existing.unit) {
        const [[assigned]] = await conn.query(
          'SELECT menu_item_id FROM menu_item_ingredients WHERE ingredient_id = ? LIMIT 1 FOR UPDATE',
          [req.params.id]
        );
        if (assigned) throw httpError(409, 'This ingredient is used in menu recipes. Remove it from those recipes before changing its unit.');
        const [[snapshotted]] = await conn.query(
          'SELECT order_item_id FROM order_item_ingredients WHERE ingredient_id = ? LIMIT 1 FOR UPDATE',
          [req.params.id],
        );
        if (snapshotted) throw httpError(409, 'This ingredient unit is part of order recipe history and cannot be changed.');
      }
      const [dup] = await conn.query('SELECT id FROM inventory_items WHERE name = ? AND id <> ?', [name, req.params.id]);
      if (dup.length) throw httpError(409, `"${name}" is already in the inventory list.`);
      await conn.query(
        'UPDATE inventory_items SET name = ?, category = ?, unit = ?, reorder_level = ?, is_fresh = ? WHERE id = ?',
        [name, b.category, String(b.unit).trim(), reorder_level, b.is_fresh ? 1 : 0, req.params.id]
      );
      await logActivity(req.user.id, 'Item edited', `${name} details updated`, conn);
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// [WBS 3.1.1] Implement inventory item create, update, and delete.
// ---------------------------------------------------------------- delete item (inventory)
router.delete(
  '/:id',
  requireRole('inventory'),
  wrap(async (req, res) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[existing]] = await conn.query(
        'SELECT id, name FROM inventory_items WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      if (!existing) throw httpError(404, 'Item not found.');

      const [[recipeUse]] = await conn.query(
        `SELECT COUNT(*) AS count
         FROM menu_item_ingredients
         WHERE ingredient_id = ?`,
        [req.params.id]
      );
      if (recipeUse.count > 0) {
        throw httpError(409, `"${existing.name}" is used in menu recipes. Remove it from those recipes before deleting it.`);
      }

      const [[orderRecipeUse]] = await conn.query(
        'SELECT COUNT(*) AS count FROM order_item_ingredients WHERE ingredient_id = ?',
        [req.params.id],
      );
      if (orderRecipeUse.count > 0) {
        throw httpError(409, `"${existing.name}" is part of order recipe history and cannot be deleted.`);
      }

      const [[stockUse]] = await conn.query(
        'SELECT COUNT(*) AS count FROM stock_movements WHERE item_id = ?',
        [req.params.id]
      );
      if (stockUse.count > 0) {
        throw httpError(409, `"${existing.name}" has stock history. It cannot be deleted so that history is preserved.`);
      }

      await conn.query('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
      await logActivity(req.user.id, 'Item deleted', `${existing.name} deleted from inventory`, conn);
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);



router.post('/:id/stock-in', requireRole('inventory'), wrap((req, res) => moveStock(req, res, 'in')));
router.post('/:id/stock-out', requireRole('inventory'), wrap((req, res) => moveStock(req, res, 'out')));

export default router;

export function getInventoryHandlerChain(method, path) {
  return getRouteHandlerChain(router, method, path);
}