import { httpError, isBlank } from '../utils/http.js'
import { findMenuItemsByIds } from '../models/orderModel.js'
import { assertMenuOrderStock } from './orderInventoryService.js'
import { pool } from '../config/db.js'

export const ORDER_STATUSES = [
  'pending',
  'sent',
  'preparing',
  'ready',
  'served',
  'cancelled',
]

export const ORDER_TYPES = [
  'dine_in',
  'takeout',
  'reservation',
  'buffet',
  'birthday',
  'special_event',
  'advance_order',
]

export const KITCHEN_VISIBLE_STATUSES = [
  'sent',
  'preparing',
  'ready',
  'served',
]

const NEEDS_SCHEDULE = [
  'reservation',
  'buffet',
  'birthday',
  'special_event',
  'advance_order',
]

const TRANSITIONS = {
  kitchen: {
    sent: 'preparing',
    preparing: 'ready',
  },
  cashier: {
    ready: 'served',
  },
}

export function isKitchenVisibleStatus(status) {
  return KITCHEN_VISIBLE_STATUSES.includes(status)
}

export function getAllowedOrderTransition(role, currentStatus) {
  return TRANSITIONS[role]?.[currentStatus]
}

export function stripOrderPrices(order, role) {
  if (role !== 'kitchen') return order

  const {
    total,
    payment_status,
    payment_method,
    paid_at,
    ...rest
  } = order

  if (rest.items) {
    rest.items = rest.items.map(({ unit_price, ...item }) => item)
  }

  return rest
}

// [WBS 1.1.1] Validate order fields, menu prices, stock, and scheduled times.
export async function validateOrder(
  body,
  preservedUnavailable = new Map(),
  db = pool,
) {
  const customer_name = String(body.customer_name || '').trim()

  if (!customer_name) {
    throw httpError(400, 'Enter the customer name.')
  }

  const order_type = body.order_type

  if (!ORDER_TYPES.includes(order_type)) {
    throw httpError(400, 'Choose an order type.')
  }

  let scheduled_at = null

  if (NEEDS_SCHEDULE.includes(order_type)) {
    if (isBlank(body.scheduled_at)) {
      throw httpError(
        400,
        'Set the date and time for this reservation, event or advance order.',
      )
    }

    const raw = String(body.scheduled_at)
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw)

    if (!match) {
      throw httpError(400, 'Enter a valid scheduled date and time.')
    }

    const [year, month, day, hour, minute] =
      match.slice(1).map(Number)

    const scheduledDate = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
    )

    if (
      scheduledDate.getFullYear() !== year ||
      scheduledDate.getMonth() !== month - 1 ||
      scheduledDate.getDate() !== day ||
      scheduledDate.getHours() !== hour ||
      scheduledDate.getMinutes() !== minute
    ) {
      throw httpError(400, 'Enter a valid scheduled date and time.')
    }

    if (scheduledDate <= new Date()) {
      throw httpError(
        400,
        'Scheduled date and time must be in the future.',
      )
    }

    scheduled_at = raw.replace('T', ' ')
  }

  const guests = isBlank(body.guests)
    ? null
    : Number(body.guests)

  if (
    guests !== null &&
    (
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 500
    )
  ) {
    throw httpError(
      400,
      'Number of guests must be a whole number from 1 to 500.',
    )
  }

  const lines = Array.isArray(body.items) ? body.items : []

  if (!lines.length) {
    throw httpError(400, 'Add at least one item to the order.')
  }

  const ids = lines.map((line) =>
    Number(line.menu_item_id),
  )

  const menu = await findMenuItemsByIds(ids, db)
  const menuById = new Map(
    menu.map((item) => [item.id, item]),
  )

  const items = lines.map((line) => {
    const menuItem = menuById.get(
      Number(line.menu_item_id),
    )

    const quantity = Number(line.quantity)
    const notes = isBlank(line.notes)
      ? null
      : String(line.notes).trim().slice(0, 255)

    if (!menuItem) {
      const preserved = preservedUnavailable.get(
        `row:${Number(line.existing_item_id)}`,
      )

      if (
        !preserved ||
        preserved.menu_item_id !== null ||
        preserved.quantity !== quantity ||
        (preserved.notes || null) !== notes
      ) {
        throw httpError(
          400,
          'One of the items is not on the menu. Remove it or replace it before saving.',
        )
      }

      return preserved
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      throw httpError(
        400,
        `Quantity for ${menuItem.name} must be a whole number from 1 to 999.`,
      )
    }

    if (!menuItem.is_available) {
      const preserved = preservedUnavailable.get(menuItem.id)

      if (
        !preserved ||
        preserved.quantity !== quantity ||
        (preserved.notes || null) !== notes
      ) {
        throw httpError(
          400,
          `${menuItem.name} is no longer available. Remove it or replace it before saving.`,
        )
      }

      return {
        ...preserved,
        menu_item_id: menuItem.id,
      }
    }

    if (!menuItem.has_recipe) {
      throw httpError(
        409,
        `${menuItem.name} has no inventory recipe yet. Ask an owner to finish its recipe before ordering.`,
      )
    }

    return {
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      quantity,
      unit_price: menuItem.price,
      notes,
    }
  })

  await assertMenuOrderStock(items, db)

  return {
    header: {
      customer_name,
      order_type,
      table_no: isBlank(body.table_no)
        ? null
        : String(body.table_no).trim().slice(0, 30),
      guests,
      scheduled_at,
      special_requests: isBlank(body.special_requests)
        ? null
        : String(body.special_requests).trim(),
    },
    items,
    total: items.reduce(
      (sum, item) =>
        sum +
        item.quantity *
        item.unit_price,
      0,
    ),
  }
}
