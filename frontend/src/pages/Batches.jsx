import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt, fmtDate, fmtQty, n } from '../calc'

export default function Batches({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const load = () =>
    api.list('Costing Batch', [
      'name',
      'product',
      'product_name',
      'batch_date',
      'output_qty',
      'total_cost_per_piece',
      'total_batch_amount',
      'purchase_entry',
    ]).then(setRows)
  useEffect(() => { load() }, [])
  const shown = (rows || []).filter((r) =>
    `${r.name} ${r.product} ${r.product_name} ${r.purchase_entry || ''}`.toLowerCase().includes(q.toLowerCase())
  )
  async function del(e, r) {
    e.stopPropagation()
    if (confirm(`Delete ${r.name}?`)) { await api.delDoc('Costing Batch', r.name); load() }
  }

  return (
    <>
      <div className="bar">
        <h2>Batches</h2>
        <input className="search" placeholder="Search product, batch, or purchase ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => onOpen('new')}>+ Add new batch</button>
      </div>
      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows && !shown.length && <p className="muted">No batches yet. Add one to cost a product.</p>}
        {shown.length > 0 && (
          <table className="tbl static">
            <thead>
              <tr>
                <th>ID</th>
                <th>Finished Good</th>
                <th>Date</th>
                <th className="r">Pieces</th>
                <th className="r">Per Piece Price</th>
                <th className="r">Total Amount</th>
                <th>Purchase Entry</th>
                <th className="r actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const qty = n(r.output_qty) || 1
                const cost = n(r.total_cost_per_piece)
                const total = n(r.total_batch_amount) || qty * cost
                return (
                  <tr key={r.name} onClick={() => onOpen(r.name)}>
                    <td className="cell-id">{r.name}</td>
                    <td><b>{r.product_name || r.product}</b></td>
                    <td>{fmtDate(r.batch_date)}</td>
                    <td className="r"><b>{fmtQty(qty)}</b> pcs</td>
                    <td className="r">₹{fmt(cost)}</td>
                    <td className="r total-amt-cell"><b>₹{fmt(total)}</b></td>
                    <td>
                      {r.purchase_entry ? (
                        <span className="badge badge-success">✓ {r.purchase_entry}</span>
                      ) : (
                        <span className="badge badge-subtle">Not generated</span>
                      )}
                    </td>
                    <td className="r nowrap">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn-edit btn-icon sm"
                          title="Edit batch"
                          aria-label="Edit batch"
                          onClick={(e) => { e.stopPropagation(); onOpen(r.name) }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button
                          type="button"
                          className="btn btn-delete btn-icon sm"
                          title="Delete batch"
                          aria-label="Delete batch"
                          onClick={(e) => del(e, r)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
