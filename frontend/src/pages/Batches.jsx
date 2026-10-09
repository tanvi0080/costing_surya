import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt } from '../calc'

export default function Batches({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const load = () => api.list('Costing Batch', ['name', 'product', 'product_name', 'batch_date', 'total_cost_per_piece']).then(setRows)
  useEffect(() => { load() }, [])
  const shown = (rows || []).filter((r) => `${r.name} ${r.product} ${r.product_name}`.toLowerCase().includes(q.toLowerCase()))
  async function del(e, r) {
    e.stopPropagation()
    if (confirm(`Delete ${r.name}?`)) { await api.delDoc('Costing Batch', r.name); load() }
  }

  return (
    <>
      <div className="bar">
        <h2>Batches</h2>
        <input className="search" placeholder="Search product or batch" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => onOpen('new')}>+ Add new batch</button>
      </div>
      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows && !shown.length && <p className="muted">No batches yet. Add one to cost a product.</p>}
        {shown.length > 0 && (
          <table className="tbl">
            <thead><tr><th>ID</th><th>Product</th><th>Date</th><th className="r">Cost / piece</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.name} onClick={() => onOpen(r.name)}>
                  <td>{r.name}</td><td>{r.product} — {r.product_name}</td><td>{r.batch_date}</td>
                  <td className="r"><b>{fmt(r.total_cost_per_piece)}</b></td>
                  <td className="r nowrap">
                    <button className="btn ghost sm">Edit</button>{' '}
                    <button className="btn ghost sm danger" onClick={(e) => del(e, r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
