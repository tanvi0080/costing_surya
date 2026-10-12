import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt, fmtDate, fmtQty, n } from '../calc'
import { useAppStore } from '../store/useAppStore'

export default function Crud({ cfg }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null) // null = closed dialog
  const [links, setLinks] = useState({})
  const [err, setErr] = useState('')
  const [dialogErr, setDialogErr] = useState('')
  const [q, setQ] = useState('')

  const registerModal = useAppStore((s) => s.registerModal)
  const unregisterModal = useAppStore((s) => s.unregisterModal)
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const fields = [...new Set(['name', ...cfg.cols.map((c) => c[0]), ...cfg.form.map((f) => f[0])])]
  const load = () => api.list(cfg.doctype, fields).then(setRows).catch((e) => setErr(e.message))

  useEffect(() => {
    setForm(null); setErr(''); setDialogErr(''); setQ(''); setRows(null); load()
    cfg.form.filter((f) => f[2] === 'link').forEach((f) =>
      api.list(f[3].doctype, ['name', f[3].label, ...(f[3].also ? [f[3].also] : [])]).then((r) => setLinks((l) => ({ ...l, [f[0]]: r }))))
  }, [cfg])

  useEffect(() => {
    if (form) {
      registerModal('crud_dialog', () => setForm(null))
      return () => unregisterModal('crud_dialog')
    }
  }, [form, registerModal, unregisterModal])

  const isNew = form && form.__islocal
  async function save() {
    setDialogErr('')
    try {
      const body = Object.fromEntries(cfg.form.map((f) => [f[0], form[f[0]] ?? '']))
      if (cfg.doctype === 'Costing Item' && body.uom) {
        const uomObj = (links.uom || []).find((x) => x.name === body.uom)
        if (uomObj) body.uom_name = uomObj.uom_name || uomObj.name
      }
      await api.saveDoc(cfg.doctype, isNew ? { ...body, __islocal: 1 } : { ...body, name: form.name })
      showSnackbar(`✓ Saved ${cfg.singular || cfg.title} successfully`, 'success')
      setForm(null); load()
    } catch (e) { setDialogErr(e.message) }
  }
  async function del(r) {
    if (!confirm(`Delete ${r.name}?`)) return
    try {
      await api.delDoc(cfg.doctype, r.name)
      showSnackbar(`✓ Deleted ${r.name}`, 'info')
      load()
    } catch (e) { setErr(e.message) }
  }

  const shown = (rows || []).filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const cell = (r, [k, , t]) => {
    if (t === 'qty') {
      if (k === 'used_qty' && (r.used_qty === undefined || r.used_qty === null)) {
        return fmtQty(Math.max(0, n(r.qty) - n(r.remaining_qty)))
      }
      return fmtQty(r[k])
    }
    if (t === 'num') return fmt(r[k])
    if (t === 'date' || k.includes('date')) return fmtDate(r[k])
    return r[k] ?? ''
  }

  const input = ([k, label, type, extra]) => {
    const v = form[k] ?? ''
    const on = (e) => setForm({ ...form, [k]: e.target.value })
    return (
      <div key={k}>
        <label>{label}</label>
        {type === 'link' ? (
          <select value={v} onChange={on}>
            <option value="">Select…</option>
            {(links[k] || []).map((x) => (
              <option key={x.name} value={x.name}>
                {x[extra.label] || x.name}
              </option>
            ))}
          </select>
        ) : (
          <input type={type} step="any" value={v} onChange={on} readOnly={extra?.createOnly && !isNew} />
        )}
      </div>
    )
  }

  return (
    <>
      <div className="bar">
        <h2>{cfg.title}</h2>
        <input className="search" placeholder={`Search ${cfg.title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => { setDialogErr(''); setForm({ __islocal: 1, ...(cfg.defaults?.() || {}) }) }}>
          + Add new {cfg.singular}
        </button>
      </div>
      {err && <div className="alert">{err}</div>}

      {/* Modal Dialog for Add New / Edit */}
      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">{isNew ? 'Create' : 'Edit'}</span>
                <h3>{isNew ? `New ${cfg.singular}` : `Edit ${form.name}`}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setForm(null)} title="Close (Esc)">✕</button>
            </div>
            <div className="modal-body">
              {dialogErr && <div className="alert">{dialogErr}</div>}
              <div className="formgrid">
                {cfg.form.map(input)}
                {(cfg.derived || []).map(([l, fn]) => (
                  <div key={l}>
                    <label>{l}</label>
                    <input readOnly value={fn(form, links)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={save}>
                {isNew ? `Save ${cfg.singular}` : 'Update changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows && !shown.length && <p className="muted">No {cfg.title.toLowerCase()} yet. Use “Add new {cfg.singular}” to create the first one.</p>}
        {shown.length > 0 && (
          <table className="tbl static">
            <thead>
              <tr>
                {cfg.cols.map((c) => <th key={c[0]} className={c[2] ? 'r' : ''}>{c[1]}</th>)}
                <th className="r actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.name}>
                  {cfg.cols.map((c, idx) => (
                    <td key={c[0]} className={`${c[2] ? 'r' : ''} ${idx === 0 ? 'cell-id' : ''}`}>
                      {cell(r, c)}
                    </td>
                  ))}
                  <td className="r nowrap">
                    <div className="table-actions">
                      <button
                        type="button"
                        className="btn btn-edit btn-icon sm"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => { setDialogErr(''); setForm({ ...r }) }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      </button>
                      <button
                        type="button"
                        className="btn btn-delete btn-icon sm"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => del(r)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
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
