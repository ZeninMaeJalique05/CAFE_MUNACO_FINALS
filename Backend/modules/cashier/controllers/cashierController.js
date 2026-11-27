import { Router } from 'express'
import { pool } from '../../../config/db.js'
import { requireRole } from '../../../middleware/auth.js'
import { wrap, httpError } from '../../../utils/http.js'
import { logActivity } from '../../../services/activityService.js'
import { replaceOrderItems } from '../../../models/orderModel.js'
import { validateOrder } from '../../../services/orderService.js'
import { snapshotOrderRecipe } from '../../../services/orderInventoryService.js'
import { getRouteHandlerChain } from '../../../controllers/routeHandlers.js'

const router = Router()

// [WBS 1.1.1] Create a cashier order.
router.post(
  '/',
  requireRole('cashier'),
  wrap(async (req, res) => {
    const sendNow = req.body?.send === true
    const paymentMethod = String(req.body?.payment_method || '')

    if (
      sendNow &&
      !['cash', 'card', 'e_wallet'].includes(paymentMethod)
    ) {
      throw httpError(
        400,
        'Choose a payment method before sending the order to the kitchen.',
      )
    }

    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const { header, items, total } = await validateOrder(
        req.body || {},
        new Map(),
        conn,
      )

      const [result] = await conn.query('INSERT INTO orders SET ?', [
        {
          ...header,
          order_no: `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          total,
          status: sendNow ? 'sent' : 'pending',
          sent_at: sendNow ? new Date() : null,
          payment_status: sendNow ? 'paid' : 'unpaid',
          payment_method: sendNow ? paymentMethod : null,
          paid_at: sendNow ? new Date() : null,
          created_by: req.user.id,
        },
      ])

      const id = result.insertId
      const orderNo = `MUN-${String(id).padStart(5, '0')}`

      await conn.query(
        'UPDATE orders SET order_no = ? WHERE id = ?',
        [orderNo, id],
      )

      await replaceOrderItems(conn, id, items)

      if (sendNow) {
        await snapshotOrderRecipe(conn, id)
      }

      await logActivity(
        req.user.id,
        sendNow ? 'Payment recorded' : 'Order created',
        sendNow
          ? `${orderNo} paid by ${paymentMethod.replace('_', '-')}`
          : `${orderNo} for ${header.customer_name} saved as draft`,
        conn,
      )

      if (sendNow) {
        await logActivity(
          req.user.id,
          'Order sent',
          `${orderNo} sent to kitchen`,
          conn,
        )
      }

      await conn.commit()

      res.status(201).json({
        id,
        order_no: orderNo,
      })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }),
)

// [WBS 1.1.1] Edit an unpaid pending cashier order.
router.put(
  '/:id',
  requireRole('cashier'),
  wrap(async (req, res) => {
    if (req.body?.send === true) {
      throw httpError(
        409,
        'Record payment from the order details before sending it to the kitchen.',
      )
    }

    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const [rows] = await conn.query(
        `SELECT id, order_no, status, payment_status
         FROM orders
         WHERE id = ?
         FOR UPDATE`,
        [req.params.id],
      )

      if (!rows.length) {
        throw httpError(404, 'Order not found.')
      }

      if (rows[0].status !== 'pending') {
        throw httpError(
          409,
          'This order was already sent to the kitchen, so it can no longer be edited.',
        )
      }

      if (rows[0].payment_status === 'paid') {
        throw httpError(
          409,
          'This order is paid and locked. Contact the owner if a correction is needed.',
        )
      }

      const [oldItems] = await conn.query(
        `SELECT id, menu_item_id, item_name, quantity, unit_price, notes
         FROM order_items
         WHERE order_id = ?`,
        [rows[0].id],
      )

      const preservedUnavailable = new Map()

      oldItems.forEach((item) => {
        if (item.menu_item_id !== null) {
          preservedUnavailable.set(item.menu_item_id, item)
        } else {
          preservedUnavailable.set(`row:${item.id}`, item)
        }
      })

      const { header, items, total } = await validateOrder(
        req.body || {},
        preservedUnavailable,
        conn,
      )

      await conn.query(
        'UPDATE orders SET ?, total = ?, status = ?, sent_at = ? WHERE id = ?',
        [
          header,
          total,
          'pending',
          null,
          rows[0].id,
        ],
      )

      await replaceOrderItems(conn, rows[0].id, items)

      await logActivity(
        req.user.id,
        'Order edited',
        `${rows[0].order_no} edited`,
        conn,
      )

      await conn.commit()

      res.json({
        id: rows[0].id,
        order_no: rows[0].order_no,
      })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }),
)

// [WBS 1.1.2] Record payment for an unpaid pending order.
router.post(
  '/:id/payment',
  requireRole('cashier'),
  wrap(async (req, res) => {
    const method = String(req.body?.method || '')

    if (!['cash', 'card', 'e_wallet'].includes(method)) {
      throw httpError(400, 'Choose cash, card, or GCash.')
    }

    const [result] = await pool.query(
      `UPDATE orders
       SET payment_status = 'paid',
           payment_method = ?,
           paid_at = NOW()
       WHERE id = ?
         AND status = 'pending'
         AND payment_status = 'unpaid'`,
      [method, req.params.id],
    )

    if (!result.affectedRows) {
      throw httpError(
        409,
        'Payment must be recorded once while the order is still a draft.',
      )
    }

    const [[order]] = await pool.query(
      'SELECT order_no FROM orders WHERE id = ?',
      [req.params.id],
    )

    await logActivity(
      req.user.id,
      'Payment recorded',
      `${order.order_no} paid by ${method.replace('_', '-')}`,
    )

    res.json({
      ok: true,
      payment_status: 'paid',
      payment_method: method,
    })
  }),
)

// [WBS 1.1.2] Send a paid pending order to the kitchen.
router.post(
  '/:id/send',
  requireRole('cashier'),
  wrap(async (req, res) => {
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const [[order]] = await conn.query(
        `SELECT id, order_no, status, payment_status
         FROM orders
         WHERE id = ?
         FOR UPDATE`,
        [req.params.id],
      )

      if (
        !order ||
        order.status !== 'pending' ||
        order.payment_status !== 'paid'
      ) {
        throw httpError(
          409,
          'Record payment before sending this order to the kitchen.',
        )
      }

      await snapshotOrderRecipe(conn, order.id)

      const [result] = await conn.query(
        `UPDATE orders
         SET status = 'sent', sent_at = NOW()
         WHERE id = ?
           AND status = 'pending'
           AND payment_status = 'paid'`,
        [order.id],
      )

      if (!result.affectedRows) {
        throw httpError(
          409,
          'This order changed before it could be sent. Refresh and try again.',
        )
      }

      await logActivity(
        req.user.id,
        'Order sent',
        `${order.order_no} sent to kitchen`,
        conn,
      )

      await conn.commit()

      res.json({ ok: true })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }),
)

export default router

export const createOrderHandlers = getRouteHandlerChain(router, 'post', '/')
export const editOrderHandlers = getRouteHandlerChain(router, 'put', '/:id')
export const recordPaymentHandlers = getRouteHandlerChain(
  router,
  'post',
  '/:id/payment',
)
export const sendOrderHandlers = getRouteHandlerChain(
  router,
  'post',
  '/:id/send',
)