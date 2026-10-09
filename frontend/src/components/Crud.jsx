import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt } from '../calc'

export default function Crud({ cfg }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null) // null = closed
  const [links, setLinks] = useState({})
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const fields = [...new Set(['name', ...cfg.cols.map((c) => c[0]), ...cfg.form.map((f) => f[0])])]
  const load = () => api.list(cfg.doctype, fields).then(setRows).catch((e) => setErr(e.message))

  useEffect(() => {
    setForm(null); setErr(''); setQ(''); setRows(null); load()
    cfg.form.filter((f) => f[2] === 'link').forEach((f) =>
      api.list(f[3].doctype, ['name', f[3].label, ...(f[3].also ? [f[3].also] : [])]).then((r) => setLinks((l) => ({ ...l, [f[0]]: r }))))
  }, [cfg])

  const isNew = form && form.__islocal
  async function save() {
    setErr('')
    try {
      const body = Object.fromEntries(cfg.form.map((f) => [f[0], form[f[0]] ?? '']))
      await api.saveDoc(cfg.doctype, isNew ? { ...body, __islocal: 1 } : { ...body, name: form.name })
      setForm(null); load()
    } catch (e) { setErr(e.message) }
  }
  async function del(r) {
    if (!confirm(`Delete ${r.name}?`)) return
    try { await api.delDoc(cfg.doctype, r.name); load() } catch (e) { setErr(e.message) }
  }

  const shown = (rows || []).filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const cell = (r, [k, , t]) => (t === 'num' ? fmt(r[k]) : r[k] ?? '')

  const input = ([k, label, type, extra]) => {
    const v = form[k] ?? ''
    const on = (e) => setForm({ ...form, [k]: e.target.value })
    return (
      <div key={k}>
        <label>{label}</label>
        {type === 'link' ? (
          <select value={v} onChange={on}>
            <option value="">Select…</option>
            {(links[k] || []).map((x) => <option key={x.name} value={x.name}>{x.name} — {x[extra.label]}</option>)}
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
        <input className="search" placeholder={`Search ${cfg.title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setForm({ __islocal: 1, ...(cfg.defaults?.() || {}) })}>+ Add new {cfg.singular}</button>
      </div>
      {err && <div className="alert">{err}</div>}

      {form && (
        <section className="card">
          <h3>{isNew ? `New ${cfg.singular}` : `Edit ${form.name}`}</h3>
          <div className="formgrid">
            {cfg.form.map(input)}
            {(cfg.derived || []).map(([l, fn]) => <div key={l}><label>{l}</label><input readOnly value={fn(form, links)} /></div>)}
          </div>
          <div className="actions">
            <button className="btn primary" onClick={save}>{isNew ? 'Save' : 'Update'}</button>
            <button className="btn ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="card">
        {rows === null && <p className="muted">Loading…</p>}
        {rows && !shown.length && <p className="muted">No {cfg.title.toLowerCase()} yet. Use “Add new {cfg.singular}” to create the first one.</p>}
        {shown.length > 0 && (
          <table className="tbl static">
            <thead><tr>{cfg.cols.map((c) => <th key={c[0]} className={c[2] ? 'r' : ''}>{c[1]}</th>)}<th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.name}>
                  {cfg.cols.map((c) => <td key={c[0]} className={c[2] ? 'r' : ''}>{cell(r, c)}</td>)}
                  <td className="r nowrap">
                    <button className="btn ghost sm" onClick={() => setForm({ ...r })}>Edit</button>{' '}
                    <button className="btn ghost sm danger" onClick={() => del(r)}>Delete</button>
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
