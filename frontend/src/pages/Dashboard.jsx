import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt } from '../calc'

export default function Dashboard({ onNav, onOpen }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    (async () => {
      const [batches, purchases, products, processes, uoms] = await Promise.all([
        api.list('Costing Batch', ['name', 'product_name', 'batch_date', 'total_cost_per_piece']),
        api.list('Purchase Entry', ['name', 'item_name', 'qty', 'uom_name', 'rate', 'amount']),
        api.list('Costing Item', ['name']), api.list('Process', ['name']), api.list('Costing UOM', ['name']),
      ])
      setD({ batches, purchases, products, processes, uoms })
    })().catch(() => setD({ batches: [], purchases: [], products: [], processes: [], uoms: [] }))
  }, [])
  if (!d) return <p className="muted">Loading…</p>

  const stats = [['Batches', d.batches.length, 'batches'], ['Products', d.products.length, 'products'], ['Processes', d.processes.length, 'processes'],
    ['Purchases', d.purchases.length, 'purchases'], ['UoM', d.uoms.length, 'uoms']]
  const avg = d.batches.length ? d.batches.reduce((s, b) => s + (b.total_cost_per_piece || 0), 0) / d.batches.length : 0

  return (
    <>
      <div className="bar"><h2>Dashboard</h2></div>
      <div className="stats">
        {stats.map(([l, v, p]) => <button key={l} className="card stat" onClick={() => onNav(p)}><span>{l}</span><b>{v}</b></button>)}
        <div className="card stat gold"><span>Average cost / piece</span><b>{fmt(avg)}</b></div>
      </div>
      <div className="two">
        <section className="card">
          <h3>Recent batches</h3>
          <table className="tbl"><tbody>
            {d.batches.slice(0, 6).map((b) => (
              <tr key={b.name} onClick={() => onOpen(b.name)}><td>{b.name}</td><td>{b.product_name}</td><td className="r"><b>{fmt(b.total_cost_per_piece)}</b></td></tr>
            ))}
            {!d.batches.length && <tr><td className="muted">No batches yet.</td></tr>}
          </tbody></table>
        </section>
        <section className="card">
          <h3>Latest purchases</h3>
          <table className="tbl static"><tbody>
            {d.purchases.slice(0, 6).map((p) => (
              <tr key={p.name}><td>{p.item_name}</td><td className="r">{p.qty} {p.uom_name}</td><td className="r">{fmt(p.amount)}</td></tr>
            ))}
            {!d.purchases.length && <tr><td className="muted">No purchases yet.</td></tr>}
          </tbody></table>
        </section>
      </div>
    </>
  )
}
