import { useEffect, useState } from 'react'
import * as api from '../api'
import { calcBatch, emptyBatch, fmt, fmtQty, n } from '../calc'
import Grid from '../components/Grid'

const opt = (arr, v = 'name', l) => arr.map((x) => ({ value: x[v], label: l ? (x[l] || x[v]) : x[v] }))

export default function BatchEditor({ name, onBack }) {
  const [doc, setDoc] = useState(null)
  const [o, setO] = useState({ products: [], processes: [], items: [] })
  const [uoms, setUoms] = useState([])
  const [categories, setCategories] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  // New Product Modal State
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [productModalTarget, setProductModalTarget] = useState('finished_good') // 'finished_good' | 'usage_processes'
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newUom, setNewUom] = useState('')
  const [newCategory, setNewCategory] = useState('Finished Good')

  // Extra Charge Modal State
  const [showExtraModal, setShowExtraModal] = useState(false)
  const [extraTitle, setExtraTitle] = useState('')
  const [extraCharge, setExtraCharge] = useState('')
  const [extraAmount, setExtraAmount] = useState('')
  const [extraQty, setExtraQty] = useState('')
  const [extraCostPerPiece, setExtraCostPerPiece] = useState('')
  const [extraRejectionPct, setExtraRejectionPct] = useState('')
  const [stockMap, setStockMap] = useState({})

  useEffect(() => {
    ;(async () => {
      const [products, processes, items, uomList, catList, purchases] = await Promise.all([
        api.list('Costing Item', ['name', 'item_name', 'category']),
        api.list('Process', ['name', 'process_name']),
        api.list('Costing Item', ['name', 'item_name', 'uom', 'uom_name', 'category']),
        api.list('Costing UOM', ['name', 'uom_name']),
        api.list('Product Category', ['name', 'category_name']),
        api.list('Purchase Entry', ['name', 'item', 'qty', 'used_qty', 'remaining_qty', 'uom_name']),
      ])
      const sMap = {}
      for (const p of purchases || []) {
        if (p.item) sMap[p.item] = (sMap[p.item] || 0) + n(p.qty)
      }
      setStockMap(sMap)
      setO({ products, processes, items })
      setUoms(uomList)
      setCategories(catList)
      const pieceUom = uomList.find((u) => (u.uom_name || '').toUpperCase() === 'PIECE')
      if (pieceUom) setNewUom(pieceUom.name)
      else if (uomList.length > 0) setNewUom(uomList[0].name)

      const rawDoc = name === 'new' ? emptyBatch() : await api.getDoc('Costing Batch', name)
      if (rawDoc.batch_processes) {
        rawDoc.batch_processes = rawDoc.batch_processes.map((r) => {
          const it = items.find((x) => x.name === r.item)
          return { ...r, uom: r.uom || it?.uom_name || uomList.find((u) => u.name === it?.uom)?.uom_name || '' }
        })
      }
      if (rawDoc.usage_processes) {
        rawDoc.usage_processes = rawDoc.usage_processes.map((r) => {
          const it = items.find((x) => x.name === r.item)
          return { ...r, uom: r.uom || it?.uom_name || uomList.find((u) => u.name === it?.uom)?.uom_name || '' }
        })
      }
      setDoc(calcBatch(rawDoc, sMap))
    })().catch((e) => setMsg({ err: e.message }))
  }, [name])

  if (!doc) return <p className="muted">{msg?.err || 'Loading…'}</p>

  const set = (patch) => setDoc((d) => calcBatch({ ...d, ...patch }, stockMap))
  const setRow = (t, i, patch) => setDoc((d) => calcBatch({ ...d, [t]: d[t].map((r, j) => (j === i ? { ...r, ...patch } : r)) }, stockMap))
  const addRow = (t, blank) => setDoc((d) => ({ ...d, [t]: [...(d[t] || []), blank] }))
  const delRow = (t, i) => setDoc((d) => calcBatch({ ...d, [t]: d[t].filter((_, j) => j !== i) }, stockMap))
  const rateKey = (t) => (t === 'usage_processes' ? 'unit_price' : 'rate')

  async function fetchRate(t, i, item) {
    if (!item) return
    const r = await api.rate(item, 'Weighted Average')
    if (r) setRow(t, i, { [rateKey(t)]: r })
  }

  async function syncAverageRates() {
    setBusy(true)
    setMsg(null)
    try {
      const updatedBatch = await Promise.all(
        (doc.batch_processes || []).map(async (r) => {
          if (!r.item) return r
          const avgRate = await api.rate(r.item, 'Weighted Average')
          return { ...r, rate: avgRate || r.rate }
        })
      )
      const updatedUsage = await Promise.all(
        (doc.usage_processes || []).map(async (r) => {
          if (!r.item) return r
          const avgRate = await api.rate(r.item, 'Weighted Average')
          return { ...r, unit_price: avgRate || r.unit_price }
        })
      )
      setDoc((d) => calcBatch({ ...d, batch_processes: updatedBatch, usage_processes: updatedUsage }))
      setMsg({ ok: 'Updated rates according to average of purchases.' })
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Choosing a Process fills its default item/extra; choosing an item pulls its price from Purchase Entry
  async function onRow(t, i, key, val) {
    const patch = { [key]: val }
    if (key === 'process') {
      const p = o.processes.find((x) => x.name === val)
      const row = doc[t][i]
      if (p?.default_item && !row.item) patch.item = p.default_item
      if (p?.default_extra_cost && !row.extra_cost) patch.extra_cost = p.default_extra_cost
    }
    const targetItem = patch.item || (key === 'item' ? val : null)
    if (targetItem) {
      const it = o.items.find((x) => x.name === targetItem)
      const baseUom = it?.uom_name || uoms.find((u) => u.name === it?.uom)?.uom_name || ''
      if (!doc[t][i]?.uom || key === 'item') {
        if (t === 'usage_processes' && baseUom.toUpperCase() === 'KG') {
          patch.uom = 'GM'
        } else {
          patch.uom = baseUom
        }
      }
    }
    setRow(t, i, patch)
    if (targetItem) fetchRate(t, i, targetItem)
  }

  async function save() {
    if (!doc.product) return setMsg({ err: 'Select a product name first.' })
    setBusy(true)
    setMsg(null)
    try {
      const saved = await api.saveDoc('Costing Batch', doc)
      await api.syncPurchaseRemainingQty().catch(() => {})
      setDoc(calcBatch(saved))
      setMsg({ ok: `Saved ${saved.name}` })
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  async function handleGeneratePurchaseEntry() {
    if (!doc.product) return setMsg({ err: 'Select a product name (Finished Good) first.' })
    setBusy(true)
    setMsg(null)
    try {
      const saved = await api.saveDoc('Costing Batch', doc)
      setDoc(calcBatch(saved))
      const res = await api.generateFinishedGoodPurchase(saved.name)
      setDoc((d) => ({
        ...d,
        purchase_entry: res.purchase_entry,
        total_batch_amount: res.amount,
      }))
      setMsg({
        ok: `✓ Finished Good Purchase Entry generated: ${res.purchase_entry} (${fmtQty(res.qty)} pcs @ ₹${fmt(res.rate)} = ₹${fmt(res.amount)})`,
      })
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  async function duplicate() {
    const { name: _n, creation, modified, owner, modified_by, docstatus, idx, ...rest } = doc
    const strip = (rows) =>
      (rows || []).map(({ name, parent, parentfield, parenttype, owner, creation, modified, modified_by, ...r }) => r)
    setDoc(
      calcBatch({
        ...rest,
        __islocal: 1,
        batch_processes: strip(doc.batch_processes),
        usage_processes: strip(doc.usage_processes),
        labour_charges: strip(doc.labour_charges),
        machine_charges: strip(doc.machine_charges),
        extra_charges: strip(doc.extra_charges),
      })
    )
    setMsg({ ok: 'Duplicated — edit and save as a new batch.' })
  }

  async function remove() {
    if (!doc.name || !confirm(`Delete ${doc.name}?`)) return
    await api.delDoc('Costing Batch', doc.name)
    onBack()
  }

  function openAddFinishedGood() {
    setProductModalTarget('finished_good')
    setNewCode('')
    setNewName('')
    setNewCategory('Finished Good')
    const pieceUom = uoms.find((u) => (u.uom_name || '').toUpperCase() === 'PIECE')
    setNewUom(pieceUom ? pieceUom.name : (uoms[0]?.name || ''))
    setShowAddProduct(true)
  }

  function openAddProductForUsage() {
    setProductModalTarget('usage_processes')
    setNewCode('')
    setNewName('')
    setNewCategory('Raw Material')
    const pieceUom = uoms.find((u) => (u.uom_name || '').toUpperCase() === 'PIECE')
    setNewUom(pieceUom ? pieceUom.name : (uoms[0]?.name || ''))
    setShowAddProduct(true)
  }

  async function createProduct() {
    if (!newCode || !newName) return setMsg({ err: 'Please enter Product ID and Product Name.' })
    try {
      const selectedUom = newUom || uoms[0]?.name || ''
      const uomObj = uoms.find((u) => u.name === selectedUom)
      const uomName = uomObj?.uom_name || selectedUom
      const selectedCat = newCategory || (productModalTarget === 'usage_processes' ? 'Raw Material' : 'Finished Good')
      const created = await api.saveDoc('Costing Item', {
        item_code: newCode,
        item_name: newName,
        category: selectedCat,
        uom: selectedUom,
        uom_name: uomName,
      })
      const [products, items] = await Promise.all([
        api.list('Costing Item', ['name', 'item_name', 'category']),
        api.list('Costing Item', ['name', 'item_name', 'uom', 'uom_name', 'category']),
      ])
      setO((prev) => ({ ...prev, products, items }))

      if (productModalTarget === 'usage_processes') {
        const newRow = {
          process: '',
          item: created.name,
          uom: uomName,
          usage_per_output: '',
          unit_price: '',
          extra_cost: '',
        }
        setDoc((d) => calcBatch({
          ...d,
          usage_processes: [...(d.usage_processes || []), newRow],
        }))
        setMsg({ ok: `Created product "${created.item_name}" (${uomName}) & added row to Process with known usage per piece.` })
      } else {
        set({ product: created.name })
        setMsg({ ok: `Created finished good "${created.item_name}" (${uomName}) & selected for this batch.` })
      }
      setShowAddProduct(false)
      setNewCode('')
      setNewName('')
    } catch (e) {
      setMsg({ err: e.message })
    }
  }

  // Open Extra Charge Modal with pre-filled quantity
  function openAddExtraCharge() {
    setExtraTitle('')
    setExtraCharge('')
    setExtraAmount('')
    setExtraQty(doc.output_qty || '1')
    setExtraCostPerPiece('')
    setExtraRejectionPct('')
    setShowExtraModal(true)
  }

  function handleExtraAmountQtyChange(amount, qty) {
    setExtraAmount(amount)
    setExtraQty(qty)
    const numAmt = n(amount)
    const numQty = n(qty)
    if (numQty > 0 && numAmt >= 0) {
      setExtraCostPerPiece((numAmt / numQty).toFixed(2))
    }
  }

  function addExtraChargeRow() {
    if (!extraTitle) return alert('Please enter a Title / Description for the extra charge.')
    const numAmt = n(extraAmount)
    const numQty = n(extraQty) || 1
    const costPerPiece = n(extraCostPerPiece) || (numQty ? numAmt / numQty : 0)
    const rejPct = n(extraRejectionPct)

    const newRow = {
      title: extraTitle,
      charge: extraCharge || extraTitle,
      amount: numAmt,
      qty: numQty,
      cost_per_piece: costPerPiece,
      rejection_pct: rejPct,
    }
    setDoc((d) => calcBatch({ ...d, extra_charges: [...(d.extra_charges || []), newRow] }))
    setShowExtraModal(false)
  }

  // Filter products: Only Finished Goods in batch header
  const finishedProducts = (o.products || []).filter(
    (p) => (p.category || '').trim().toLowerCase() === 'finished good'
  )
  // Ensure selected product is included even if category was recently changed
  const productOptions = finishedProducts.some((p) => p.name === doc.product)
    ? finishedProducts
    : doc.product
    ? [...finishedProducts, o.products.find((p) => p.name === doc.product) || { name: doc.product, item_name: doc.product_name || doc.product }]
    : finishedProducts

  const procOpts = () => () => opt(o.processes, 'name', 'process_name')
  const itemOpts = () => opt(o.items, 'name', 'item_name')
  const uomOpts = () => uoms.map((u) => ({ value: u.uom_name || u.name, label: u.uom_name || u.name }))

  const chargeCols = [
    { key: 'charge', label: 'Charge', type: 'text', w: '2fr' },
    { key: 'amount', label: 'Amount (per period)', type: 'num', w: '1.4fr' },
    { key: 'qty', label: 'Qty (pieces)', type: 'num', w: '1.4fr' },
    { key: 'cost_per_piece', label: 'Cost per piece', type: 'calc', w: '1fr' },
  ]
  const blankCharge = { charge: '', amount: '', qty: 1 }

  // Calculation summaries for Column-Wise representation
  const stage1Cost = doc.after_material_rejection || 0
  const stage2Cost = Math.max(0, (doc.after_labour_rejection || 0) - stage1Cost)
  const stage3Cost = doc.machine_total || 0
  const stage4Cost = doc.extra_charges_total || 0
  const totalCost = doc.total_cost_per_piece || 0
  const outputQty = n(doc.output_qty) || 1
  const totalBatchCost = totalCost * outputQty

  return (
    <>
      <div className="bar">
        <button className="btn ghost" onClick={onBack}>
          ← Batches
        </button>
        <h2>{doc.name || 'New batch'}</h2>
        <button
          type="button"
          className="btn ghost sm"
          onClick={syncAverageRates}
          disabled={busy}
          title="Recalculate rates based on weighted average of purchases"
        >
          ↻ Average Purchase Rates
        </button>
        <button
          type="button"
          className="btn btn-fg-generate sm"
          onClick={handleGeneratePurchaseEntry}
          disabled={busy || !doc.product}
          title="Generate finished good purchase entry"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          {doc.purchase_entry ? `Update PE (${doc.purchase_entry})` : 'Generate FG Purchase'}
        </button>
        {doc.name && (
          <button className="btn ghost sm" onClick={duplicate}>
            Duplicate
          </button>
        )}
        {doc.name && (
          <button className="btn btn-delete sm" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save batch'}
        </button>
      </div>

      {msg?.err && <div className="alert">{msg.err}</div>}
      {msg?.ok && <div className="alert ok">{msg.ok}</div>}

      {/* Batch Header: Product (Finished Good), Date, Output Qty, Rejection Method */}
      <section className="card head">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Product name (Finished Good)</label>
            <button type="button" className="btn ghost sm" onClick={openAddFinishedGood}>
              + New Finished Good
            </button>
          </div>
          <select value={doc.product} onChange={(e) => set({ product: e.target.value })}>
            <option value="">Select finished good…</option>
            {productOptions.map((x) => (
              <option key={x.name} value={x.name}>
                {x.item_name || x.name}
              </option>
            ))}
          </select>
          {productOptions.length === 0 && (
            <small className="muted" style={{ display: 'block', marginTop: 4 }}>
              No finished goods found. Use &quot;+ New Finished Good&quot; to create one.
            </small>
          )}
        </div>

        <div>
          <label>Batch date</label>
          <input
            type="date"
            value={doc.batch_date || ''}
            onChange={(e) => set({ batch_date: e.target.value })}
          />
        </div>

        <div>
          <label>Output generated (qty pieces)</label>
          <input
            type="number"
            step="any"
            min="1"
            placeholder="e.g. 1000"
            value={doc.output_qty ?? ''}
            onChange={(e) => set({ output_qty: e.target.value })}
          />
        </div>

        <div>
          <label>Rejection method</label>
          <select
            value={doc.rejection_method}
            onChange={(e) => set({ rejection_method: e.target.value })}
          >
            <option>Add % on top</option>
            <option>Divide by yield</option>
          </select>
        </div>
      </section>

      {/* Modal Dialog for New Product within Batch Editor */}
      {showAddProduct && (
        <div className="modal-overlay" onClick={() => setShowAddProduct(false)} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">{productModalTarget === 'usage_processes' ? 'Usage Process' : 'Finished Good'}</span>
                <h3>{productModalTarget === 'usage_processes' ? 'New Product (Process with known usage)' : 'New Finished Good Product'}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowAddProduct(false)}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="formgrid">
                <div>
                  <label>Product ID / Code</label>
                  <input
                    placeholder="e.g. FG-101 or RM-01"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label>Product Name</label>
                  <input
                    placeholder="e.g. eccentric wheel 45 MM"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div>
                  <label>Category</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                    <option value="Raw Material">Raw Material</option>
                    <option value="Finished Good">Finished Good</option>
                    {categories
                      .filter((c) => !['Finished Good', 'Raw Material'].includes(c.name))
                      .map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.category_name || c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label>UoM</label>
                  <select value={newUom} onChange={(e) => setNewUom(e.target.value)}>
                    {uoms.map((u) => (
                      <option key={u.name} value={u.name}>
                        {u.uom_name || u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setShowAddProduct(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={createProduct}>
                {productModalTarget === 'usage_processes' ? 'Save & Add to Usage Process' : 'Save & Select Finished Good'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Process with batch purchase */}
      <section className="card">
        <h3>Process with batch purchase</h3>
        <p className="muted">Total = units × price. Per output = total ÷ total output. Rate = per output + extra.</p>
        <Grid
          addLabel="Add process row"
          rows={doc.batch_processes}
          onChange={(i, k, v) => onRow('batch_processes', i, k, v)}
          onDel={(i) => delRow('batch_processes', i)}
          onAdd={() =>
            addRow('batch_processes', {
              process: '',
              item: '',
              qty: '',
              uom: '',
              rate: '',
              total_output: '',
              extra_cost: '',
            })
          }
          cols={[
            { key: 'process', label: 'Process', type: 'select', w: '1.5fr', options: procOpts('Batch Purchase') },
            { key: 'item', label: 'Product', type: 'select', w: '1.7fr', options: itemOpts },
            { key: 'qty', label: 'Unit', type: 'num', w: '0.8fr' },
            { key: 'uom', label: 'UoM', type: 'text', w: '0.6fr', ro: true },
            { key: 'rate', label: 'Per unit price', type: 'num', w: '1fr', ro: false },
            { key: 'total_price', label: 'Total price', type: 'calc', w: '1fr' },
            { key: 'total_output', label: 'Total output', type: 'num', w: '1fr' },
            { key: 'per_output_rate', label: 'Per output rate', type: 'calc', dp: 3, w: '1fr' },
            { key: 'extra_cost', label: 'Extra cost', type: 'num', w: '0.8fr' },
            { key: 'total_rate', label: 'Total rate / output', type: 'calc', w: '1fr' },
          ]}
        />
      </section>

      {/* 2. Process with known usage per piece */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Process with known usage per piece</h3>
          <button type="button" className="btn ghost sm" onClick={openAddProductForUsage}>
            + New Product
          </button>
        </div>
        <p className="muted">Total per output = usage × unit price. Total used (qty) = usage / output × output generated (deducted from purchase stock).</p>
        <Grid
          addLabel="Add usage row"
          rows={doc.usage_processes}
          onChange={(i, k, v) => onRow('usage_processes', i, k, v)}
          onDel={(i) => delRow('usage_processes', i)}
          onAdd={() =>
            addRow('usage_processes', {
              process: '',
              item: '',
              usage_per_output: '',
              uom: 'GM',
              unit_price: '',
              extra_cost: '',
            })
          }
          cols={[
            { key: 'process', label: 'Process', type: 'select', w: '1.2fr', options: procOpts('Usage Per Piece') },
            { key: 'item', label: 'Product', type: 'select', w: '1.5fr', options: itemOpts },
            { key: 'uom', label: 'UoM', type: 'select', w: '0.7fr', options: uomOpts },
            { key: 'usage_per_output', label: 'Usage / output', type: 'num', w: '0.9fr' },
            { key: 'total_usage', label: 'Total usage', type: 'calc', format: 'qty', dp: 4, w: '0.9fr' },
            { key: 'used_kg', label: 'Used (kg)', type: 'calc', format: 'qty', dp: 5, w: '0.9fr' },
            { key: 'remaining_stock', label: 'Remaining stock', type: 'calc', format: 'qty', dp: 5, w: '1.1fr' },
            { key: 'unit_price', label: 'Price / kg', type: 'num', w: '0.9fr', ro: false },
            { key: 'total_per_output', label: 'Cost / output', type: 'calc', dp: 4, w: '0.9fr' },
            { key: 'extra_cost', label: 'Extra', type: 'num', w: '0.7fr' },
            { key: 'total_rate', label: 'Total rate', type: 'calc', w: '0.9fr' },
          ]}
        />
        <div className="pct">
          <label>Material rejection %</label>
          <input
            type="number"
            value={doc.material_rejection_pct ?? ''}
            onChange={(e) => set({ material_rejection_pct: e.target.value })}
          />
        </div>
      </section>

      {/* 3. Labour & light charges */}
      <section className="card">
        <h3>Labour &amp; light charges</h3>
        <Grid
          addLabel="Add charge"
          rows={doc.labour_charges}
          cols={chargeCols}
          onChange={(i, k, v) => setRow('labour_charges', i, { [k]: v })}
          onDel={(i) => delRow('labour_charges', i)}
          onAdd={() => addRow('labour_charges', { ...blankCharge })}
        />
        <div className="pct">
          <label>Labour &amp; light rejection %</label>
          <input
            type="number"
            value={doc.labour_rejection_pct ?? ''}
            onChange={(e) => set({ labour_rejection_pct: e.target.value })}
          />
        </div>
      </section>

      {/* 4. Machine, chemical, tooling & grinding */}
      <section className="card">
        <h3>Machine, chemical, tooling &amp; grinding</h3>
        <Grid
          addLabel="Add charge"
          rows={doc.machine_charges}
          cols={chargeCols}
          onChange={(i, k, v) => setRow('machine_charges', i, { [k]: v })}
          onDel={(i) => delRow('machine_charges', i)}
          onAdd={() => addRow('machine_charges', { ...blankCharge })}
        />
        <div className="pct">
          <label>Machine &amp; tooling rejection %</label>
          <input
            type="number"
            value={doc.machine_rejection_pct ?? ''}
            onChange={(e) => set({ machine_rejection_pct: e.target.value })}
          />
        </div>

        {/* Extra Charges Section with "Add Extra charge" button */}
        <div className="extra-charges-wrapper" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px dashed var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 16 }}>Extra Charges</h4>
              <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
                Custom titles, individual amounts, piece quantities, and specific rejection percentages
              </p>
            </div>
            <button type="button" className="btn btn-add-extra" onClick={openAddExtraCharge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add Extra charge</span>
            </button>
          </div>

          {(doc.extra_charges || []).length > 0 ? (
            <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="tbl static extra-charges-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Charge</th>
                    <th className="r">Amount (per period)</th>
                    <th className="r">Qty (pieces)</th>
                    <th className="r">Cost / piece</th>
                    <th className="r">Rejection %</th>
                    <th className="r">Total / piece</th>
                    <th className="r actions-th">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.extra_charges || []).map((ec, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{ec.title}</td>
                      <td>{ec.charge}</td>
                      <td className="r">₹{fmt(ec.amount)}</td>
                      <td className="r">{fmt(ec.qty, 0)}</td>
                      <td className="r">₹{fmt(ec.cost_per_piece)}</td>
                      <td className="r">{ec.rejection_pct || 0}%</td>
                      <td className="r" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        ₹{fmt(ec.total_cost)}
                      </td>
                      <td className="r">
                        <button
                          type="button"
                          className="x"
                          title="Remove extra charge"
                          onClick={() => delRow('extra_charges', idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-extra-notice">
              <span>No extra charges added yet. Click &quot;Add Extra charge&quot; to specify custom tooling, chemical, or grinding surcharges.</span>
            </div>
          )}
        </div>
      </section>

      {/* Modal Dialog for Add Extra Charge */}
      {showExtraModal && (
        <div className="modal-overlay" onClick={() => setShowExtraModal(false)} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">Add</span>
                <h3>Add Extra Charge</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowExtraModal(false)}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="formgrid">
                <div>
                  <label>Title / Description *</label>
                  <input
                    placeholder="e.g. Diamond Tooling Surcharge"
                    value={extraTitle}
                    onChange={(e) => setExtraTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label>Charge Type</label>
                  <input
                    placeholder="e.g. Tooling, Chemical, Grinding"
                    value={extraCharge}
                    onChange={(e) => setExtraCharge(e.target.value)}
                  />
                </div>
                <div>
                  <label>Amount (per period)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5000"
                    value={extraAmount}
                    onChange={(e) => handleExtraAmountQtyChange(e.target.value, extraQty)}
                  />
                </div>
                <div>
                  <label>Qty (pieces)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1000"
                    value={extraQty}
                    onChange={(e) => handleExtraAmountQtyChange(extraAmount, e.target.value)}
                  />
                </div>
                <div>
                  <label>Cost per piece (base)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5.00"
                    value={extraCostPerPiece}
                    onChange={(e) => setExtraCostPerPiece(e.target.value)}
                  />
                </div>
                <div>
                  <label>Extra Rejection %</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5"
                    value={extraRejectionPct}
                    onChange={(e) => setExtraRejectionPct(e.target.value)}
                  />
                </div>
              </div>

              {/* Live Preview Calculation inside Dialog */}
              <div className="extra-preview-box">
                <div className="extra-preview-row">
                  <span>Base unit cost:</span>
                  <b>₹{fmt(n(extraCostPerPiece) || (n(extraQty) ? n(extraAmount) / n(extraQty) : 0))}</b>
                </div>
                <div className="extra-preview-row">
                  <span>Rejection addition (+{extraRejectionPct || 0}%):</span>
                  <b>
                    +₹
                    {fmt(
                      ((n(extraCostPerPiece) || (n(extraQty) ? n(extraAmount) / n(extraQty) : 0)) *
                        (n(extraRejectionPct) / 100))
                    )}
                  </b>
                </div>
                <div className="extra-preview-row highlight">
                  <span>Final extra cost per piece:</span>
                  <b className="val bold">
                    ₹
                    {fmt(
                      (n(extraCostPerPiece) || (n(extraQty) ? n(extraAmount) / n(extraQty) : 0)) *
                        (1 + n(extraRejectionPct) / 100)
                    )}
                  </b>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setShowExtraModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={addExtraChargeRow}>
                Add Charge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL COST BUILD-UP PER PIECE: SHOWN COLUMN-WISE (NOT ROW-WISE!) */}
      <section className="card cost-breakdown-card">
        <div className="breakdown-header">
          <div>
            <h3>Final Cost Build-Up Per Piece</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Column-wise executive cost distribution across production stages, surcharges, and grand total
            </p>
          </div>
          <div className="breakdown-badges">
            <span className="breakdown-badge">{doc.rejection_method || 'Add % on top'}</span>
            <span className="breakdown-badge">Output: {outputQty} pcs</span>
          </div>
        </div>

        

        {/* Executive Column-Wise Summary Table */}
        <div className="columnar-summary-table-wrap">
          <table className="tbl static columnar-cost-tbl">
            <thead>
              <tr>
                <th>Production Cost Stage</th>
                <th className="r">Base Charges</th>
                <th className="r">Rejection %</th>
                <th className="r">Net Cost / Piece</th>
                <th className="r">% Share</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="stage-dot dot-materials" />
                  Stage 1: Materials &amp; Processing
                </td>
                <td className="r">₹{fmt(doc.materials_total)}</td>
                <td className="r">{doc.material_rejection_pct || 0}%</td>
                <td className="r"><b>₹{fmt(stage1Cost)}</b></td>
                <td className="r">{totalCost > 0 ? ((stage1Cost / totalCost) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>
                  <span className="stage-dot dot-labour" />
                  Stage 2: Labour &amp; Light
                </td>
                <td className="r">₹{fmt(doc.labour_total)}</td>
                <td className="r">{doc.labour_rejection_pct || 0}%</td>
                <td className="r"><b>₹{fmt(stage2Cost)}</b></td>
                <td className="r">{totalCost > 0 ? ((stage2Cost / totalCost) * 100).toFixed(1) : 0}%</td>
              </tr>
              <tr>
                <td>
                  <span className="stage-dot dot-machine" />
                  Stage 3: Machine, Chemical &amp; Tooling
                </td>
                <td className="r">₹{fmt(doc.machine_total)}</td>
                <td className="r">{doc.machine_rejection_pct || 0}%</td>
                <td className="r"><b>₹{fmt(stage3Cost)}</b></td>
                <td className="r">{totalCost > 0 ? ((stage3Cost / totalCost) * 100).toFixed(1) : 0}%</td>
              </tr>
              {stage4Cost > 0 && (
                <tr>
                  <td>
                    <span className="stage-dot dot-extra" />
                    Stage 4: Custom Extra Charges
                  </td>
                  <td className="r">₹{fmt(doc.extra_charges?.reduce((s, r) => s + (n(r.amount) || n(r.cost_per_piece)), 0) || stage4Cost)}</td>
                  <td className="r">Variable</td>
                  <td className="r"><b>₹{fmt(stage4Cost)}</b></td>
                  <td className="r">{totalCost > 0 ? ((stage4Cost / totalCost) * 100).toFixed(1) : 0}%</td>
                </tr>
              )}
              <tr className="summary-total-row">
                <td>
                  <strong>GRAND TOTAL: Final Production Cost</strong>
                </td>
                <td className="r">—</td>
                <td className="r">—</td>
                <td className="r total-cell">
                  <strong>₹{fmt(totalCost)}</strong> <span style={{ fontSize: 12, fontWeight: 500 }}>/ piece</span>
                </td>
                <td className="r">
                  <strong>100.0%</strong>
                </td>
              </tr>
              <tr className="fg-callout-row">
                <td>
                  <strong>Finished Good Production ({fmtQty(outputQty)} pieces)</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {doc.purchase_entry ? `Linked Purchase Entry: ${doc.purchase_entry}` : 'Purchase entry not yet generated'}
                  </div>
                </td>
                <td className="r">
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Output:</span> <b>{fmtQty(outputQty)} pcs</b>
                </td>
                <td className="r">
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Per Piece:</span> <b>₹{fmt(totalCost)}</b>
                </td>
                <td className="r total-cell">
                  <strong>₹{fmt(totalBatchCost)}</strong> <span style={{ fontSize: 12, fontWeight: 500 }}>total</span>
                </td>
                <td className="r">
                  <button
                    type="button"
                    className="btn btn-fg-generate sm"
                    onClick={handleGeneratePurchaseEntry}
                    disabled={busy || !doc.product}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    {doc.purchase_entry ? '↻ Update PE' : '✨ Generate PE'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
