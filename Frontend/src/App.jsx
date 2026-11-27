import { useState } from 'react'
import './KitchenApp.css'

function Only({ roles, children }) {
  const { user } = useAuth()
  return roles.includes(user.role)
    ? children
    : <Navigate to="/dashboard" replace />
}

function App() {
  const [activeStatus, setActiveStatus] = useState('sent')
  const selectedStatus = statuses.find((status) => status.id === activeStatus)

  return (
    <div className="kitchen-shell">
      <aside className="kitchen-sidebar">
        <div className="kitchen-brand">
          <span className="brand-mark" aria-hidden="true">CM</span>
          <span className="brand-copy">
            <strong>Cafe Munaco</strong>
            <span>Kitchen</span>
          </span>
        </div>

        <p className="sidebar-label">WORKSPACE</p>
        <div className="sidebar-link sidebar-link-active" aria-current="page">
          <span className="sidebar-link-icon" aria-hidden="true">K</span>
          <span>Kitchen board</span>
        </div>

        <div className="sidebar-connection">
          <span className="connection-dot" aria-hidden="true" />
          <span>
            <strong>Order feed</strong>
            <small>Not connected</small>
          </span>
        </div>
      </aside>

      <div className="kitchen-main">
        <header className="kitchen-topbar">
          <span className="topbar-context">OPERATIONS <span>/</span> KITCHEN</span>
          <span className="connection-pill">
            <span className="connection-dot" aria-hidden="true" />
            Order service unavailable
          </span>
        </header>

        <main className="kitchen-content">
          <section className="kitchen-heading">
            <div>
              <p className="eyebrow">KITCHEN DISPLAY</p>
              <h1>Kitchen board</h1>
              <p className="heading-description">Track incoming orders and preparation progress.</p>
            </div>
            <span className="board-date">Live order feed</span>
          </section>

          <section className="kitchen-stats" aria-label="Order summary">
            {summaryCards.map((card) => (
              <article className="summary-card" key={card.label}>
                <span className={`summary-icon ${card.tone}`} aria-hidden="true">{card.icon}</span>
                <div>
                  <p>{card.label}</p>
                  <strong>--</strong>
                  <small>Waiting for order data</small>
                </div>
              </article>
            ))}
          </section>

          <section className="queue-panel" aria-labelledby="queue-title">
            <div className="queue-heading">
              <div>
                <h2 id="queue-title">Order queue</h2>
                <p>Orders are grouped by their current kitchen status.</p>
              </div>
              <span className="queue-count">-- orders</span>
            </div>

            <div className="queue-tabs" role="tablist" aria-label="Order status">
              {statuses.map((status) => (
                <button
                  className={`queue-tab${activeStatus === status.id ? ' queue-tab-active' : ''}`}
                  key={status.id}
                  type="button"
                  role="tab"
                  aria-selected={activeStatus === status.id}
                  onClick={() => setActiveStatus(status.id)}
                >
                  {status.label}
                  <span>--</span>
                </button>
              ))}
            </div>

            <div className="queue-empty" role="tabpanel">
              <div className="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="18" />
                  <circle cx="24" cy="24" r="12" />
                  <path d="M17 24h14M24 17v14" />
                </svg>
              </div>
              <h3>{selectedStatus.emptyTitle}</h3>
              <p>{selectedStatus.emptyDescription}</p>
              <span className="empty-status">
                <span className="connection-dot" aria-hidden="true" />
                The backend order API is not connected yet
              </span>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

const statuses = [
  {
    id: 'sent',
    label: 'Incoming',
    emptyTitle: 'Incoming orders will appear here',
    emptyDescription: 'This lane will show new orders as soon as the cashier sends them.',
  },
  {
    id: 'preparing',
    label: 'Preparing',
    emptyTitle: 'Orders being prepared will appear here',
    emptyDescription: 'Move incoming orders into preparation to see them in this lane.',
  },
  {
    id: 'ready',
    label: 'Ready',
    emptyTitle: 'Ready orders will appear here',
    emptyDescription: 'Orders marked ready by the kitchen will show up in this lane.',
  },
]

const summaryCards = [
  { label: 'Incoming', icon: '01', tone: 'tone-orange' },
  { label: 'Preparing', icon: '02', tone: 'tone-blue' },
  { label: 'Ready to serve', icon: '03', tone: 'tone-green' },
  { label: 'Served today', icon: '04', tone: 'tone-purple' },
]

export default App
