
import { Empty, ErrorBox, Loading, PageHeader } from '../../components/ui.jsx'
import { dateTime, qty } from '../../utils.js'



      {/* [WBS 3.2.2] Display stock movement history. */}
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No stock changes in this period.</Empty> : (
        <div className="table-wrap">
          <table className="stock-history-table">
            <thead><tr><th>When</th><th>Item</th><th>Change</th><th className="num">Quantity</th><th className="num">Balance after</th><th>Reason or supplier</th><th>Recorded by</th></tr></thead>
            <tbody>
              {data?.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{dateTime(m.created_at)}</td>
                  <td><strong>{m.item_name}</strong></td>
                  <td><span className={`badge move-${m.movement_type}`}>{m.movement_type === 'in' ? 'Stock in' : 'Stock out'}</span></td>
                  <td className="num">{m.movement_type === 'in' ? '+' : '−'}{qty(m.quantity)} {m.unit}</td>
                  <td className="num">{qty(m.balance_after)} {m.unit}</td>
                  <td>{m.supplier || m.reason || '–'}{m.note && <div className="note">{m.note}</div>}</td>
                  <td className="muted">{m.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    