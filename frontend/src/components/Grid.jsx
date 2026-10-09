import { fmt } from '../calc'

// cols: { key, label, type: 'text'|'num'|'select'|'calc', w, options, ro, dp }
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
            if (c.type === 'calc') return <b key={c.key} className="r calc">{fmt(r[c.key], c.dp ?? 2)}</b>
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
      <button className="btn ghost" onClick={onAdd}>+ {addLabel}</button>
    </div>
  )
}
