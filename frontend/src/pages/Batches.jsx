import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt, fmtDate } from '../calc'

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
            <thead>
              <tr>
                <th>ID</th>
                <th>Product</th>
                <th>Date</th>
                <th className="r">Cost / piece</th>
                <th className="r actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.name} onClick={() => onOpen(r.name)}>
                  <td className="cell-id">{r.name}</td>
                  <td>{r.product} — {r.product_name}</td>
                  <td>{fmtDate(r.batch_date)}</td>
                  <td className="r"><b>{fmt(r.total_cost_per_piece)}</b></td>
                  <td className="r nowrap">
                    <button type="button" className="btn btn-edit sm" onClick={(e) => { e.stopPropagation(); onOpen(r.name) }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn btn-delete sm" onClick={(e) => del(e, r)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Delete
                    </button>
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
