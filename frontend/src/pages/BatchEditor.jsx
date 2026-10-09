import { useEffect, useState } from 'react'
import * as api from '../api'
import { calcBatch, emptyBatch, fmt } from '../calc'
import Grid from '../components/Grid'

const opt = (arr, v = 'name', l) => arr.map((x) => ({ value: x[v], label: l ? `${x[v]} — ${x[l]}` : x[v] }))

export default function BatchEditor({ name, onBack }) {
  const [doc, setDoc] = useState(null)
  const [o, setO] = useState({ products: [], processes: [], items: [] })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const [products, processes, items] = await Promise.all([
        api.list('Costing Item', ['name', 'item_name']),
        api.list('Process', ['name', 'process_name']),
        api.list('Costing Item', ['name', 'item_name', 'uom_name']),
      ])
      setO({ products, processes, items })
      setDoc(name === 'new' ? calcBatch(emptyBatch()) : calcBatch(await api.getDoc('Costing Batch', name)))
    })().catch((e) => setMsg({ err: e.message }))
  }, [name])

  if (!doc) return <p className="muted">{msg?.err || 'Loading…'}</p>

  const manual = doc.rate_basis === 'Manual'
  const set = (patch) => setDoc((d) => calcBatch({ ...d, ...patch }))
  const setRow = (t, i, patch) => setDoc((d) => calcBatch({ ...d, [t]: d[t].map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const addRow = (t, blank) => setDoc((d) => ({ ...d, [t]: [...d[t], blank] }))
  const delRow = (t, i) => setDoc((d) => calcBatch({ ...d, [t]: d[t].filter((_, j) => j !== i) }))
  const rateKey = (t) => (t === 'usage_processes' ? 'unit_price' : 'rate')

  async function fetchRate(t, i, item, basis = doc.rate_basis) {
    if (!item || basis === 'Manual') return
    const r = await api.rate(item, basis)
    if (r) setRow(t, i, { [rateKey(t)]: r })
  }

  // choosing a Process fills its default item/extra; choosing an item pulls its price from Purchase Entry
  async function onRow(t, i, key, val) {
    const patch = { [key]: val }
    if (key === 'process') {
      const p = o.processes.find((x) => x.name === val)
      const row = doc[t][i]
      if (p?.default_item && !row.item) patch.item = p.default_item
      if (p?.default_extra_cost && !row.extra_cost) patch.extra_cost = p.default_extra_cost
    }
    if (patch.item) patch.uom = o.items.find((x) => x.name === patch.item)?.uom_name
    setRow(t, i, patch)
    if (patch.item) fetchRate(t, i, patch.item)
  }

  async function changeBasis(basis) {
    set({ rate_basis: basis })
    if (basis === 'Manual') return
    for (const t of ['batch_processes', 'usage_processes'])
      doc[t].forEach((r, i) => fetchRate(t, i, r.item, basis))
  }

  async function save() {
    if (!doc.product) return setMsg({ err: 'Select a product name first.' })
    setBusy(true); setMsg(null)
    try {
      const saved = await api.saveDoc('Costing Batch', doc)
      setDoc(calcBatch(saved)); setMsg({ ok: `Saved ${saved.name}` })
    } catch (e) { setMsg({ err: e.message }) }
    setBusy(false)
  }
  async function duplicate() {
    const { name: _n, creation, modified, owner, modified_by, docstatus, idx, ...rest } = doc
    const strip = (rows) => rows.map(({ name, parent, parentfield, parenttype, owner, creation, modified, modified_by, ...r }) => r)
    setDoc(calcBatch({ ...rest, __islocal: 1, batch_processes: strip(doc.batch_processes), usage_processes: strip(doc.usage_processes),
      labour_charges: strip(doc.labour_charges), machine_charges: strip(doc.machine_charges) }))
    setMsg({ ok: 'Duplicated — edit and save as a new batch.' })
  }
  async function remove() {
    if (!doc.name || !confirm(`Delete ${doc.name}?`)) return
    await api.delDoc('Costing Batch', doc.name); onBack()
  }

  const procOpts = () => () => opt(o.processes, 'name', 'process_name')
  const itemOpts = () => opt(o.items, 'name', 'item_name')
  const chargeCols = [
    { key: 'charge', label: 'Charge', type: 'text', w: '2fr' },
    { key: 'amount', label: 'Amount (per period)', type: 'num', w: '1.4fr' },
    { key: 'qty', label: 'Qty (pieces)', type: 'num', w: '1.4fr' },
    { key: 'cost_per_piece', label: 'Cost per piece', type: 'calc', w: '1fr' },
  ]
  const blankCharge = { charge: '', amount: '', qty: 1 }

  return (
    <>
      <div className="bar">
        <button className="btn ghost" onClick={onBack}>← Batches</button>
        <h2>{doc.name || 'New batch'}</h2>
        <span className="spacer" />
        {doc.name && <button className="btn ghost" onClick={duplicate}>Duplicate</button>}
        {doc.name && <button className="btn ghost danger" onClick={remove}>Delete</button>}
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save batch'}</button>
      </div>
      {msg?.err && <div className="alert">{msg.err}</div>}
      {msg?.ok && <div className="alert ok">{msg.ok}</div>}

      <section className="card head">
        <div><label>Product name</label>
          <select value={doc.product} onChange={(e) => set({ product: e.target.value })}>
            <option value="">Select product…</option>
            {opt(o.products, 'name', 'item_name').map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select></div>
        <div><label>Batch date</label><input type="date" value={doc.batch_date || ''} onChange={(e) => set({ batch_date: e.target.value })} /></div>
        <div><label>Rejection method</label>
          <select value={doc.rejection_method} onChange={(e) => set({ rejection_method: e.target.value })}>
            <option>Add % on top</option><option>Divide by yield</option></select></div>
        <div><label>Rate from purchase entry</label>
          <select value={doc.rate_basis} onChange={(e) => changeBasis(e.target.value)}>
            <option>Latest Purchase</option><option>Weighted Average</option><option>Manual</option></select></div>
      </section>

      <section className="card">
        <h3>1. Process with batch purchase</h3>
        <p className="muted">Total = units × price. Per output = total ÷ total output. Rate = per output + extra.</p>
        <Grid addLabel="Add process row" rows={doc.batch_processes}
          onChange={(i, k, v) => onRow('batch_processes', i, k, v)} onDel={(i) => delRow('batch_processes', i)}
          onAdd={() => addRow('batch_processes', { process: '', item: '', qty: '', uom: '', rate: '', total_output: '', extra_cost: '' })}
          cols={[
            { key: 'process', label: 'Process', type: 'select', w: '1.5fr', options: procOpts('Batch Purchase') },
            { key: 'item', label: 'Product', type: 'select', w: '1.7fr', options: itemOpts },
            { key: 'qty', label: 'Unit', type: 'num', w: '0.8fr' },
            { key: 'uom', label: 'UoM', type: 'text', w: '0.6fr', ro: true },
            { key: 'rate', label: 'Per unit price', type: 'num', w: '1fr', ro: () => !manual },
            { key: 'total_price', label: 'Total price', type: 'calc', w: '1fr' },
            { key: 'total_output', label: 'Total output', type: 'num', w: '1fr' },
            { key: 'per_output_rate', label: 'Per output rate', type: 'calc', dp: 3, w: '1fr' },
            { key: 'extra_cost', label: 'Extra cost', type: 'num', w: '0.8fr' },
            { key: 'total_rate', label: 'Total rate / output', type: 'calc', w: '1fr' },
          ]} />
      </section>

      <section className="card">
        <h3>2. Process with known usage per piece</h3>
        <p className="muted">Total per output = usage × unit price.</p>
        <Grid addLabel="Add usage row" rows={doc.usage_processes}
          onChange={(i, k, v) => onRow('usage_processes', i, k, v)} onDel={(i) => delRow('usage_processes', i)}
          onAdd={() => addRow('usage_processes', { process: '', item: '', usage_per_output: '', unit_price: '', extra_cost: '' })}
          cols={[
            { key: 'process', label: 'Process', type: 'select', w: '1.5fr', options: procOpts('Usage Per Piece') },
            { key: 'item', label: 'Product', type: 'select', w: '1.7fr', options: itemOpts },
            { key: 'usage_per_output', label: 'Usage / output', type: 'num', w: '1fr' },
            { key: 'unit_price', label: 'Unit price', type: 'num', w: '1fr', ro: () => !manual },
            { key: 'total_per_output', label: 'Total / output', type: 'calc', dp: 4, w: '1fr' },
            { key: 'extra_cost', label: 'Extra', type: 'num', w: '0.8fr' },
            { key: 'total_rate', label: 'Total rate / output', type: 'calc', w: '1fr' },
          ]} />
        <div className="pct"><label>Material rejection %</label>
          <input type="number" value={doc.material_rejection_pct ?? ''} onChange={(e) => set({ material_rejection_pct: e.target.value })} /></div>
      </section>

      <section className="card">
        <h3>Labour &amp; light charges</h3>
        <Grid addLabel="Add charge" rows={doc.labour_charges} cols={chargeCols}
          onChange={(i, k, v) => setRow('labour_charges', i, { [k]: v })} onDel={(i) => delRow('labour_charges', i)}
          onAdd={() => addRow('labour_charges', { ...blankCharge })} />
        <div className="pct"><label>Labour &amp; light rejection %</label>
          <input type="number" value={doc.labour_rejection_pct ?? ''} onChange={(e) => set({ labour_rejection_pct: e.target.value })} /></div>
      </section>

      <section className="card">
        <h3>Machine, chemical, tooling &amp; grinding</h3>
        <Grid addLabel="Add charge" rows={doc.machine_charges} cols={chargeCols}
          onChange={(i, k, v) => setRow('machine_charges', i, { [k]: v })} onDel={(i) => delRow('machine_charges', i)}
          onAdd={() => addRow('machine_charges', { ...blankCharge })} />
        <div className="pct"><label>Machine &amp; tooling rejection %</label>
          <input type="number" value={doc.machine_rejection_pct ?? ''} onChange={(e) => set({ machine_rejection_pct: e.target.value })} /></div>
      </section>

      <section className="card build">
        <h3>Cost build-up per piece</h3>
        {[
          ['Materials & processes total', doc.materials_total],
          [`After material rejection`, doc.after_material_rejection],
          ['+ Labour & light charges', doc.labour_total],
          ['After labour & light rejection', doc.after_labour_rejection],
          ['+ Machine & tooling charges', doc.machine_total],
        ].map(([l, v]) => <div className="b-row" key={l}><span>{l}</span><span>{fmt(v)}</span></div>)}
        <div className="b-row total"><span>Total production cost per piece</span><span>{fmt(doc.total_cost_per_piece)}</span></div>
      </section>
    </>
  )
}
