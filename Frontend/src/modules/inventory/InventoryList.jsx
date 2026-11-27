import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFetch } from '../../hooks.js'
import { api, qs } from '../../services/api.js'
import { Empty, ErrorBox, Loading, PageHeader, StatCard, StockBadge } from '../../components/ui.jsx'
import { INVENTORY_CATEGORIES, dateTime, qty } from '../../utils.js'
import Icon from '../../components/Icon.jsx'
import ActionMenu from '../../components/ActionMenu.jsx'
import ItemForm from './ItemForm.jsx'

// =====================================================
// WBS 3.1.1 - IMPLEMENT INVENTORY ITEM MANAGEMENT
// View, Add, Update, and Delete Inventory Items
// =====================================================

export default function InventoryList({ readOnly, embedded = false }) {
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [fresh, setFresh] = useState(false)
  const [low, setLow] = useState(() => params.get('low') === '1')
  const [overviewFilter, setOverviewFilter] = useState(() => params.get('low') === '1' ? 'low' : '')
  const [showAddItem, setShowAddItem] = useState(false)
  const [actionError, setActionError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const { data, error, loading, reload } = useFetch(`/inventory${qs({
    q,
    category,
    fresh: readOnly ? (overviewFilter === 'fresh' ? '1' : '') : (fresh ? '1' : ''),
    low: readOnly ? (overviewFilter === 'low' ? '1' : '') : (low ? '1' : ''),
  })}`, { poll: 30000 })

  // WBS 3.1.1 - Delete inventory item
  async function removeItem(item) {
    if (!window.confirm(`Delete "${item.name}" from inventory?`)) return
    setActionError('')
    setDeletingId(item.id)
    try {
      await api(`/inventory/${item.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  // Display inventory table and available item actions
  function renderTable(items) {
    return (
      <div className="table-wrap inventory-table-wrap">
        <table className={`inventory-table${readOnly ? ' read-only' : ''}`}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Fresh</th>
              <th>Category</th>
              <th className="num">On hand</th>
              <th className="num">Reorder at</th>
              <th>Status</th>
              <th>Updated</th>
              {!readOnly && <th className="inventory-actions-heading">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td data-label="Item">
                  <div className="inventory-item-cell">
                    <strong className="inventory-item-name">{i.name}</strong>
                    {Boolean(i.is_fresh) && <span className="tag inventory-fresh-mobile">Fresh</span>}
                  </div>
                </td>
                <td data-label="Fresh">
                  {Boolean(i.is_fresh) ? <span className="tag">Fresh</span> : <span className="muted">—</span>}
                </td>
                <td data-label="Category">
                  <span className="inventory-category">{i.category}</span>
                </td>
                <td className="num" data-label="On hand">
                  <span className="inventory-quantity">
                    <span className="inventory-quantity-value">{qty(i.quantity)}</span>
                    <span className="inventory-quantity-unit">{i.unit}</span>
                  </span>
                </td>
                <td className="num" data-label="Reorder at">
                  <span className="inventory-quantity">
                    <span className="inventory-quantity-value">{qty(i.reorder_level)}</span>
                    <span className="inventory-quantity-unit">{i.unit}</span>
                  </span>
                </td>
                <td data-label="Status">
                  <StockBadge status={i.stock_status} />
                </td>
                <td className="inventory-updated" data-label="Updated">
                  {dateTime(i.updated_at)}
                </td>

                {!readOnly && (
                  <td className="inventory-actions-cell" data-label="Actions">
                    <div className="inventory-row-actions">
                      <ActionMenu
                        label={`More actions for ${i.name}`}
                        title="More actions"
                        className="inventory-more"
                        triggerClassName="icon-button"
                        menuClassName="inventory-action-menu"
                        trigger={<Icon name="moreVertical" size={19} />}
                      >
                        <Link className="inventory-action-option" to={`/stock-management?tab=in&item=${i.id}`}>
                          <Icon name="download" size={16} /> Stock In
                        </Link>

                        <Link className="inventory-action-option" to={`/stock-management?tab=out&item=${i.id}`}>
                          <Icon name="upload" size={16} /> Stock Out
                        </Link>

                        {/* WBS 3.1.1 - Update inventory item */}
                        <Link className="inventory-action-option" to={`/inventory/${i.id}/edit`}>
                          <Icon name="edit" size={16} /> Edit
                        </Link>

                        {/* WBS 3.1.1 - Delete inventory item */}
                        <button
                          type="button"
                          className="inventory-action-option danger"
                          disabled={deletingId === i.id}
                          onClick={() => removeItem(i)}
                        >
                          <Icon name="trash" size={16} />
                          {deletingId === i.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </ActionMenu>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      {!embedded && (
        <PageHeader
          title={readOnly ? 'Inventory Overview' : 'Inventory Management'}
          subtitle={readOnly ? 'Current quantities and availability. View only.' : undefined}
        >
          {/* WBS 3.1.1 - Add new inventory item */}
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => setShowAddItem(true)}>
              Add new item
            </button>
          )}
        </PageHeader>
      )}

      
</>
  )
}
