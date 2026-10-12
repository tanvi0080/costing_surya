import { fmt, fmtQty } from '../calc'

// cols: { key, label, type: 'text'|'num'|'select'|'calc', w, options, ro, dp, format }
export default function Grid({ cols, rows, onChange, onAdd, onDel, addLabel }) {
  const tpl = cols.map((c) => c.w || '1fr').join(' ') + ' 34px'
  const right = (c) => (c.type === 'num' || c.type === 'calc' ? 'r' : '')
  return (
    <div className="grid">
      <div className="g-row g-head" style={{ gridTemplateColumns: tpl }}>
        {cols.map((c) => <span key={c.key} className={right(c)}>{c.label}</span>)}<span />
      </div>
      {rows.map((r, i) => (
        <div className="g-row" key={i} style={{ gridTemplateColumns: tpl }}>
          {cols.map((c) => {
            const ro = typeof c.ro === 'function' ? c.ro() : c.ro
            if (c.type === 'calc') {
              const formatted = c.format === 'qty' ? fmtQty(r[c.key], c.dp ?? 4) : fmt(r[c.key], c.dp ?? 2)
              return <b key={c.key} className="r calc">{formatted}</b>
            }
            if (c.type === 'select')
              return (
                <select key={c.key} value={r[c.key] || ''} onChange={(e) => onChange(i, c.key, e.target.value)}>
                  <option value="">Select…</option>
                  {c.options(r).map((o) => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
                </select>
              )
            return (
              <input key={c.key} className={right(c)} type={c.type === 'num' ? 'number' : 'text'} step="any"
                readOnly={ro} value={r[c.key] ?? ''} onChange={(e) => onChange(i, c.key, e.target.value)} />
            )
          })}
          <button className="x" title="Remove row" onClick={() => onDel(i)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-add" onClick={onAdd}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>{addLabel}</span>
      </button>
    </div>
  )
}
