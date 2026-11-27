import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api.js'
import { useFetch } from '../../hooks.js'
import { ErrorBox, Loading, PageHeader } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import {
  HAS_TABLE,
  NEEDS_SCHEDULE,
  ORDER_TYPES,
  peso,
  qty,
  toLocalInput,
} from '../../utils.js'

const BLANK = {
  customer_name: '',
  order_type: 'dine_in',
  table_no: '',
  guests: '',
  scheduled_at: '',
  special_requests: '',
}

export default function NewOrder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: menu, error: menuError } = useFetch('/menu', { poll: 10000 })

  const [form, setForm] = useState(BLANK)
  const [cart, setCart] = useState({})
  const [savedItems, setSavedItems] = useState([])
  const [category, setCategory] = useState('')
  const [menuSearch, setMenuSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [ready, setReady] = useState(!id)

  useEffect(() => {
    if (!id) return

    api(`/orders/${id}`)
      .then((order) => {
        if (order.status !== 'pending' || order.payment_status !== 'unpaid') {
          setError('Only unpaid pending orders can be edited.')
          setLocked(true)
          setReady(true)
          return
        }

        const items = Array.isArray(order.items) ? order.items : []

        setForm({
          customer_name: order.customer_name || '',
          order_type: order.order_type || 'dine_in',
          table_no: order.table_no || '',
          guests: order.guests || '',
          scheduled_at: toLocalInput(order.scheduled_at),
          special_requests: order.special_requests || '',
        })
        setSavedItems(items)
        setCart(
          Object.fromEntries(
            items.map((item) => [
              item.menu_item_id === null ? `deleted-${item.id}` : item.menu_item_id,
              { qty: item.quantity, notes: item.notes || '' },
            ]),
          ),
        )
        setReady(true)
      })
      .catch((e) => {
        setError(e.message)
        setReady(true)
      })
  }, [id])

  const categories = useMemo(
    () => [...new Set((menu || []).map((item) => item.category).filter(Boolean))],
    [menu],
  )

  const shown = (menu || []).filter((item) => {
    const query = menuSearch.trim().toLowerCase()
    const matchesSearch = !query || `${item.name} ${item.category}`.toLowerCase().includes(query)
    return (!category || item.category === category) && matchesSearch
  })

  const lines = Object.keys(cart)
    .map((key) => {
      if (key.startsWith('deleted-')) {
        const saved = savedItems.find((item) => `deleted-${item.id}` === key)
        return saved
          ? {
              id: key,
              existingItemId: saved.id,
              name: saved.item_name,
              price: Number(saved.unit_price),
              archived: true,
            }
          : null
      }

      const item = (menu || []).find((menuItem) => menuItem.id === Number(key))
      if (!item) return null

      const saved = savedItems.find((savedItem) => savedItem.menu_item_id === item.id)
      const canOrder =
        Boolean(item.is_available) &&
        Boolean(item.has_recipe) &&
        Boolean(item.inventory_available)

      return canOrder
        ? { ...item, price: Number(item.price) }
        : {
            ...item,
            ...(saved
              ? { name: saved.item_name, price: Number(saved.unit_price) }
              : { price: Number(item.price) }),
            retainedUnavailable: true,
            stockUnavailable: Boolean(item.has_recipe) && !Boolean(item.inventory_available),
          }
    })
    .filter(Boolean)

  const subtotal = lines.reduce(
    (sum, item) => sum + item.price * cart[item.id].qty,
    0,
  )
  const total = subtotal
  const minScheduledAt = toLocalInput(new Date())

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const add = (item) => {
    const canOrder =
      Boolean(item.is_available) &&
      Boolean(item.has_recipe) &&
      Boolean(item.inventory_available)

    if (!canOrder) {
      setError(`${item.name} is unavailable and cannot be added.`)
      return
    }

    if ((cart[item.id]?.qty || 0) >= 999) {
      setError('An item quantity cannot exceed 999.')
      return
    }

    setError('')
    setCart((current) => ({
      ...current,
      [item.id]: {
        qty: (current[item.id]?.qty || 0) + 1,
        notes: current[item.id]?.notes || '',
      },
    }))
  }

  const change = (item, delta) => {
    if (delta > 0 && (cart[item.id]?.qty || 0) >= 999) {
      setError('An item quantity cannot exceed 999.')
      return
    }

    setCart((current) => {
      const next = { ...current }
      const quantity = (next[item.id]?.qty || 0) + delta

      if (quantity <= 0) {
        delete next[item.id]
      } else {
        next[item.id] = { ...next[item.id], qty: quantity }
      }

      return next
    })
  }

  const removeLine = (lineId) => {
    setCart((current) => {
      const next = { ...current }
      delete next[lineId]
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (locked || busy) return

    if (!form.customer_name.trim()) {
      setError('Enter the customer name.')
      return
    }

    if (!lines.length) {
      setError('Add at least one item to the order.')
      return
    }

    if (lines.some((item) => item.stockUnavailable)) {
      setError('Remove items with insufficient ingredient stock before saving.')
      return
    }

    if (NEEDS_SCHEDULE.includes(form.order_type)) {
      if (!form.scheduled_at) {
        setError('Enter a date and time for this scheduled order.')
        return
      }

      if (new Date(form.scheduled_at) <= new Date()) {
        setError('The scheduled date and time must be in the future.')
        return
      }
    }

    setBusy(true)

    try {
      const body = {
        ...form,
        items: lines.map((item) => ({
          menu_item_id: item.archived ? null : item.id,
          existing_item_id: item.existingItemId,
          quantity: cart[item.id].qty,
          notes: cart[item.id].notes,
        })),
      }

      if (id) {
        await api(`/orders/${id}`, { method: 'PUT', body })
      } else {
        await api('/orders', { method: 'POST', body })
      }

      navigate('/orders')
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (!menu && !menuError) return <Loading />
  if (!ready && !error) return <Loading />

  return (
    <>
      <PageHeader
        title={id ? 'Edit Order' : 'New Order'}
        subtitle={id ? 'Only unpaid pending orders can be edited.' : undefined}
      />
      <ErrorBox message={error || menuError} />

      <form className="order-layout" onSubmit={submit}>
        <div>
          <section className="panel form">
            <h2>Customer</h2>

            <div className="form-row">
              <label>
                Customer name
                <input
                  value={form.customer_name}
                  onChange={setField('customer_name')}
                  disabled={locked}
                  required
                />
              </label>

              <label>
                Order type
                <select
                  value={form.order_type}
                  onChange={setField('order_type')}
                  disabled={locked}
                >
                  {Object.entries(ORDER_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              {HAS_TABLE.includes(form.order_type) && (
                <label>
                  Table or area
                  <input
                    value={form.table_no}
                    onChange={setField('table_no')}
                    placeholder="T4, Garden 1, Hall"
                    disabled={locked}
                  />
                </label>
              )}

              {HAS_TABLE.includes(form.order_type) && (
                <label>
                  Guests
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={form.guests}
                    onChange={setField('guests')}
                    disabled={locked}
                  />
                </label>
              )}

              {NEEDS_SCHEDULE.includes(form.order_type) && (
                <label>
                  Date and time
                  <input
                    type="datetime-local"
                    min={minScheduledAt}
                    value={form.scheduled_at}
                    onChange={setField('scheduled_at')}
                    disabled={locked}
                    required
                  />
                </label>
              )}
            </div>

            <label>
              Special requests for the kitchen
              <textarea
                rows="2"
                value={form.special_requests}
                onChange={setField('special_requests')}
                placeholder="Allergies, celebration notes, serving time"
                disabled={locked}
              />
            </label>
          </section>

          <section className="panel">
            <h2>Menu</h2>

            <div className="menu-search">
              <span className="menu-search-icon" aria-hidden="true">
                <Icon name="search" size={24} />
              </span>
              <input
                type="search"
                className="search"
                placeholder="Search menu"
                aria-label="Search menu"
                value={menuSearch}
                onChange={(event) => setMenuSearch(event.target.value)}
                disabled={locked}
              />
            </div>

            <div className="chips">
              <button
                type="button"
                className={!category ? 'chip on' : 'chip'}
                onClick={() => setCategory('')}
                disabled={locked}
              >
                All
              </button>
              {categories.map((itemCategory) => (
                <button
                  type="button"
                  key={itemCategory}
                  className={category === itemCategory ? 'chip on' : 'chip'}
                  onClick={() => setCategory(itemCategory)}
                  disabled={locked}
                >
                  {itemCategory}
                </button>
              ))}
            </div>

            <div className="menu-grid">
              {shown.map((item) => {
                const canOrder =
                  Boolean(item.is_available) &&
                  Boolean(item.has_recipe) &&
                  Boolean(item.inventory_available)

                const unavailableMessage = !item.has_recipe
                  ? 'Recipe required'
                  : !item.inventory_available
                    ? item.has_out_of_stock_ingredient
                      ? 'Unavailable – Ingredient out of stock.'
                      : 'Unavailable – Insufficient ingredient stock.'
                    : 'Unavailable'

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`menu-item${canOrder ? '' : ' unavailable'}`}
                    disabled={!canOrder || locked}
                    onClick={() => add(item)}
                    aria-label={
                      canOrder
                        ? `Add ${item.name}`
                        : `${item.name} ${unavailableMessage.toLowerCase()}`
                    }
                  >
                    <span>{item.name}</span>
                    <strong>{peso(item.price)}</strong>
                    {!canOrder && <em className="menu-unavailable">{unavailableMessage}</em>}
                    {cart[item.id] && <em className="in-cart">{qty(cart[item.id].qty)}</em>}
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="panel cart">
          <h2>Order summary</h2>

          {lines.length === 0 ? (
            <p className="empty">Tap a menu item to add it.</p>
          ) : (
            <ul className="cart-lines">
              {lines.map((item) => (
                <li key={item.id}>
                  <div className="cart-row">
                    <span className="cart-item-name">
                      {item.name}
                      {(item.retainedUnavailable || item.archived) && (
                        <span className="muted"> (unavailable)</span>
                      )}
                      {item.stockUnavailable && (
                        <span className="menu-unavailable">
                          {item.has_out_of_stock_ingredient
                            ? 'Unavailable – Ingredient out of stock.'
                            : 'Unavailable – Insufficient ingredient stock.'}
                        </span>
                      )}
                    </span>

                    <div className="cart-quantity">
                      {!item.retainedUnavailable && !item.archived && (
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => change(item, -1)}
                          disabled={locked}
                          aria-label={`Remove one ${item.name}`}
                        >
                          −
                        </button>
                      )}

                      <span>{qty(cart[item.id].qty)}</span>

                      {item.retainedUnavailable || item.archived ? (
                        <button
                          type="button"
                          className="remove-unavailable"
                          onClick={() => removeLine(item.id)}
                          disabled={locked}
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => change(item, 1)}
                          disabled={locked}
                          aria-label={`Add one ${item.name}`}
                        >
                          +
                        </button>
                      )}
                    </div>

                    <strong className="cart-line-total">
                      {peso(item.price * cart[item.id].qty)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="cart-total">
            <span>Subtotal</span>
            <strong>{peso(subtotal)}</strong>
          </div>
          <div className="cart-total">
            <span>Total</span>
            <strong>{peso(total)}</strong>
          </div>

          <button
            type="submit"
            className="btn btn-primary wide"
            disabled={busy || locked}
          >
            {busy ? 'Saving...' : id ? 'Save changes' : 'Save order'}
          </button>
        </aside>
      </form>
    </>
  )
}