import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt, fmtQty, n } from '../calc'

const STATUS_FILTERS = [
  'All',
  'Pending Customer Approval',
  'Approved',
  'Invoiced',
  'Dispatched',
  'Delivered',
  'Cancelled',
]

export default function ProformaInvoices() {
  const [invoices, setInvoices] = useState([])
  const [items, setItems] = useState([])
  const [stockSummary, setStockSummary] = useState({})
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState(null)

  // Form State for PI (Create / Edit & Discounts)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [editingStatus, setEditingStatus] = useState('Pending Customer Approval')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [discountPct, setDiscountPct] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [lineItems, setLineItems] = useState([
    { item: '', item_name: '', qty: 1, uom: 'PIECE', rate: 0, discount_pct: 0, amount: 0, tax_pct: 18, tax_amount: 0, total_amount: 0 },
  ])

  // Form State for Dispatch Tracking
  const [transporterName, setTransporterName] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dispatchStatus, setDispatchStatus] = useState('Dispatched')

  // Form State for Cancellation
  const [cancellationReason, setCancellationReason] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [invList, itemList, stock] = await Promise.all([
        api.list('Proforma Invoice', [
          'name',
          'customer_name',
          'customer_phone',
          'customer_email',
          'gstin',
          'posting_date',
          'status',
          'subtotal',
          'discount_pct',
          'discount_amount',
          'tax_amount',
          'grand_total',
          'is_invoiced',
          'final_invoice_no',
          'invoice_date',
          'transporter_name',
          'tracking_number',
          'dispatch_date',
          'delivery_date',
          'dispatch_status',
          'cancellation_reason',
          'cancelled_date',
          'credit_note_no',
          'stock_reserved',
        ]),
        api.list('Costing Item', ['name', 'item_name', 'uom_name', 'category']),
        api.getStockSummary(),
      ])
      setInvoices(invList || [])
      setItems(itemList || [])
      setStockSummary(stock || {})
    } catch (e) {
      setMsg({ err: e.message })
    }
    setLoading(false)
  }

  // Calculate totals for PI modal
  const subtotal = lineItems.reduce((acc, row) => {
    const base = n(row.qty) * n(row.rate)
    const itemDisc = base * (n(row.discount_pct) / 100)
    return acc + (base - itemDisc)
  }, 0)

  // Overall discount: if discountPct given, compute discountAmount
  const computedDiscount =
    n(discountPct) > 0
      ? subtotal * (n(discountPct) / 100)
      : n(discountAmount)

  const taxableTotal = Math.max(0, subtotal - computedDiscount)

  const totalTax = lineItems.reduce((acc, row) => {
    const base = n(row.qty) * n(row.rate)
    const itemDisc = base * (n(row.discount_pct) / 100)
    const rowAmt = base - itemDisc
    const taxFactor = subtotal > 0 ? (taxableTotal / subtotal) : 1
    return acc + (rowAmt * (n(row.tax_pct) / 100) * taxFactor)
  }, 0)

  const grandTotal = taxableTotal + totalTax

  function openCreate() {
    setEditingInvoice(null)
    setEditingStatus('Pending Customer Approval')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setGstin('')
    setBillingAddress('')
    setShippingAddress('')
    setPostingDate(new Date().toISOString().slice(0, 10))
    setDiscountPct(0)
    setDiscountAmount(0)
    setLineItems([
      { item: '', item_name: '', qty: 1, uom: 'PIECE', rate: 0, discount_pct: 0, amount: 0, tax_pct: 18, tax_amount: 0, total_amount: 0 },
    ])
    setShowCreateModal(true)
  }

  async function openEdit(inv) {
    setBusy(true)
    try {
      const fullDoc = await api.getDoc('Proforma Invoice', inv.name)
      setEditingInvoice(fullDoc.name)
      setEditingStatus(fullDoc.status)
      setCustomerName(fullDoc.customer_name || '')
      setCustomerPhone(fullDoc.customer_phone || '')
      setCustomerEmail(fullDoc.customer_email || '')
      setGstin(fullDoc.gstin || '')
      setPostingDate(fullDoc.posting_date || new Date().toISOString().slice(0, 10))
      setBillingAddress(fullDoc.billing_address || '')
      setShippingAddress(fullDoc.shipping_address || '')
      setDiscountPct(fullDoc.discount_pct || 0)
      setDiscountAmount(fullDoc.discount_amount || 0)

      const itemsList = (fullDoc.items || []).map((it) => {
        const qty = n(it.qty)
        const rate = n(it.rate)
        const discPct = n(it.discount_pct)
        const base = qty * rate
        const amt = base - (base * (discPct / 100))
        const taxPct = n(it.tax_pct) || 18
        const taxAmt = amt * (taxPct / 100)
        return {
          item: it.item,
          item_name: it.item_name || it.item,
          qty: qty,
          uom: it.uom || 'PIECE',
          rate: rate,
          discount_pct: discPct,
          amount: amt,
          tax_pct: taxPct,
          tax_amount: taxAmt,
          total_amount: amt + taxAmt,
        }
      })

      setLineItems(
        itemsList.length > 0
          ? itemsList
          : [{ item: '', item_name: '', qty: 1, uom: 'PIECE', rate: 0, discount_pct: 0, amount: 0, tax_pct: 18, tax_amount: 0, total_amount: 0 }]
      )
      setShowCreateModal(true)
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  function handleItemChange(idx, field, val) {
    setLineItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row
        const updated = { ...row, [field]: val }

        if (field === 'item') {
          const selected = items.find((x) => x.name === val)
          const st = stockSummary[val] || {}
          if (selected || st) {
            updated.item_name = selected?.item_name || st.item_name || val
            updated.uom = selected?.uom_name || st.uom || 'PIECE'
            const autoRate = st.rate ?? 0
            if (autoRate > 0 || !n(row.rate)) {
              updated.rate = autoRate > 0 ? Number(autoRate).toFixed(2) : autoRate
            }
          }
        }

        // Automatic calculation of Amount with discount & GST
        const qty = n(updated.qty)
        const rate = n(updated.rate)
        const discPct = n(updated.discount_pct)
        const taxPct = n(updated.tax_pct)

        const baseAmount = qty * rate
        const discAmount = baseAmount * (discPct / 100)
        const amount = baseAmount - discAmount
        const taxAmount = amount * (taxPct / 100)
        const totalAmount = amount + taxAmount

        updated.amount = amount
        updated.tax_amount = taxAmount
        updated.total_amount = totalAmount

        return updated
      })
    )
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { item: '', item_name: '', qty: 1, uom: 'PIECE', rate: 0, discount_pct: 0, amount: 0, tax_pct: 18, tax_amount: 0, total_amount: 0 },
    ])
  }

  function removeLineItem(idx) {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSavePI(e) {
    e.preventDefault()
    if (!customerName.trim()) return alert('Please enter Customer Name.')
    if (lineItems.some((x) => !x.item || n(x.qty) <= 0)) {
      return alert('Please select a product and valid quantity for each line item.')
    }

    setBusy(true)
    try {
      const payload = {
        name: editingInvoice || undefined,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        gstin: gstin,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        posting_date: postingDate,
        discount_pct: n(discountPct),
        discount_amount: n(computedDiscount),
        status: editingStatus || 'Pending Customer Approval',
        items: lineItems.map((row) => ({
          item: row.item,
          item_name: row.item_name,
          qty: n(row.qty),
          uom: row.uom,
          rate: n(row.rate),
          discount_pct: n(row.discount_pct),
          tax_pct: n(row.tax_pct),
        })),
      }

      const saved = await api.saveProformaInvoice(payload)
      setShowCreateModal(false)
      setMsg({
        ok: editingInvoice
          ? `✓ Updated Proforma Invoice ${saved.name}. Discount & pricing successfully saved!`
          : `✓ Created Proforma Invoice ${saved.name}. Product stock is now reserved!`,
      })
      await loadData()
    } catch (err) {
      setMsg({ err: err.message })
    }
    setBusy(false)
  }

  // Approve PI
  async function handleApprove(inv) {
    if (!confirm(`Approve Proforma Invoice ${inv.name} for ${inv.customer_name}?`)) return
    setBusy(true)
    try {
      await api.approveProformaInvoice(inv.name)
      setMsg({ ok: `✓ Proforma Invoice ${inv.name} approved by customer!` })
      await loadData()
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Convert to Final Invoice
  async function handleConvertToInvoice(inv) {
    if (!confirm(`Convert ${inv.name} into Final Tax Invoice? Stock is already reserved and will NOT be deducted a second time.`)) return
    setBusy(true)
    try {
      const res = await api.convertToFinalInvoice(inv.name)
      setMsg({ ok: `✓ Final Tax Invoice generated: ${res.final_invoice_no} (${inv.name})` })
      await loadData()
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Open Dispatch Modal
  function openDispatch(inv) {
    setActiveInvoice(inv)
    setTransporterName(inv.transporter_name || '')
    setTrackingNumber(inv.tracking_number || '')
    setDispatchDate(inv.dispatch_date || new Date().toISOString().slice(0, 10))
    setDispatchStatus(inv.dispatch_status === 'Delivered' ? 'Delivered' : 'Dispatched')
    setShowDispatchModal(true)
  }

  // Save Dispatch
  async function handleSaveDispatch(e) {
    e.preventDefault()
    if (!activeInvoice) return
    setBusy(true)
    try {
      await api.updateDispatchTracking({
        name: activeInvoice.name,
        transporter_name: transporterName,
        tracking_number: trackingNumber,
        dispatch_date: dispatchDate,
        dispatch_status: dispatchStatus,
      })
      setShowDispatchModal(false)
      setMsg({ ok: `✓ Updated dispatch details for ${activeInvoice.name} (${dispatchStatus})` })
      await loadData()
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Open Cancel Modal
  function openCancel(inv) {
    setActiveInvoice(inv)
    setCancellationReason('')
    setShowCancelModal(true)
  }

  // Save Cancel
  async function handleCancelInvoice(e) {
    e.preventDefault()
    if (!activeInvoice) return
    if (!cancellationReason.trim()) return alert('Please enter a cancellation reason.')
    setBusy(true)
    try {
      const res = await api.cancelProformaInvoice({
        name: activeInvoice.name,
        cancellation_reason: cancellationReason,
      })
      setShowCancelModal(false)
      const cnMsg = res.credit_note_no ? ` Credit note issued: ${res.credit_note_no}.` : ''
      setMsg({ ok: `✓ Cancelled ${activeInvoice.name}.${cnMsg} Reserved stock has been completely restored to inventory!` })
      await loadData()
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Open Print Modal
  async function openPrint(inv) {
    setBusy(true)
    try {
      const fullDoc = await api.getDoc('Proforma Invoice', inv.name)
      setActiveInvoice(fullDoc)
      setShowPrintModal(true)
    } catch (e) {
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Filtering
  const filtered = invoices.filter((inv) => {
    const matchesFilter = filter === 'All' || inv.status === filter
    const searchLower = search.toLowerCase()
    const matchesSearch =
      !search ||
      inv.name.toLowerCase().includes(searchLower) ||
      (inv.customer_name || '').toLowerCase().includes(searchLower) ||
      (inv.final_invoice_no || '').toLowerCase().includes(searchLower) ||
      (inv.tracking_number || '').toLowerCase().includes(searchLower)
    return matchesFilter && matchesSearch
  })

  // Summary Metrics
  const countPending = invoices.filter((x) => x.status === 'Pending Customer Approval').length
  const countApproved = invoices.filter((x) => x.status === 'Approved').length
  const countInvoiced = invoices.filter((x) => x.status === 'Invoiced').length
  const countDispatched = invoices.filter((x) => x.status === 'Dispatched').length
  const countDelivered = invoices.filter((x) => x.status === 'Delivered').length
  const totalValue = invoices
    .filter((x) => x.status !== 'Cancelled')
    .reduce((s, x) => s + n(x.grand_total), 0)

  return (
    <>
      {/* Top Action Bar */}
      <div className="bar">
        <div>
          <h2>Invoices &amp; Dispatch</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            Proforma Invoices, Stock Reservations, Tax Invoices &amp; Dispatch Tracking
          </p>
        </div>
        <div className="spacer" />
        <button type="button" className="btn ghost sm" onClick={loadData} disabled={busy || loading}>
          ↻ Refresh Stock
        </button>
        <button type="button" className="btn primary" onClick={openCreate}>
          + New Proforma Invoice
        </button>
      </div>

      {msg?.err && <div className="alert">{msg.err}</div>}
      {msg?.ok && <div className="alert ok">{msg.ok}</div>}

      {/* Metrics Summary Strip (All 5 boxes strictly in 1 row) */}
      <div className="metrics-strip">
        <div
          className={`metric-card metric-total ${filter === 'All' ? 'active' : ''}`}
          onClick={() => setFilter('All')}
          title="Filter: All Orders"
        >
          <div className="metric-header">
            <span className="metric-title">Total Orders</span>
            <div className="metric-icon-bubble">📋</div>
          </div>
          <div className="metric-value">{invoices.length}</div>
          <div className="metric-sub">All created PIs</div>
        </div>

        <div
          className={`metric-card metric-amber ${filter === 'Pending Customer Approval' ? 'active' : ''}`}
          onClick={() => setFilter('Pending Customer Approval')}
          title="Filter: Pending Customer Approval"
        >
          <div className="metric-header">
            <span className="metric-title">Pending Approval</span>
            <div className="metric-icon-bubble">⏳</div>
          </div>
          <div className="metric-value">{countPending}</div>
          <div className="metric-sub">🔒 Stock reserved</div>
        </div>

        <div
          className={`metric-card metric-blue ${filter === 'Approved' || filter === 'Invoiced' ? 'active' : ''}`}
          onClick={() => setFilter(filter === 'Approved' ? 'Invoiced' : 'Approved')}
          title="Filter: Approved / Invoiced"
        >
          <div className="metric-header">
            <span className="metric-title">Approved / Invoiced</span>
            <div className="metric-icon-bubble">🧾</div>
          </div>
          <div className="metric-value">{countApproved + countInvoiced}</div>
          <div className="metric-sub">✓ No double deduction</div>
        </div>

        <div
          className={`metric-card metric-green ${filter === 'Dispatched' || filter === 'Delivered' ? 'active' : ''}`}
          onClick={() => setFilter(filter === 'Dispatched' ? 'Delivered' : 'Dispatched')}
          title="Filter: Dispatched / Delivered"
        >
          <div className="metric-header">
            <span className="metric-title">Dispatched / Delivered</span>
            <div className="metric-icon-bubble">🚚</div>
          </div>
          <div className="metric-value">{countDispatched + countDelivered}</div>
          <div className="metric-sub">📍 LR/AWB tracked</div>
        </div>

        <div
          className="metric-card metric-highlight"
          onClick={() => setFilter('All')}
          title="Total Active Order Revenue"
        >
          <div className="metric-header">
            <span className="metric-title">Active Order Value</span>
            <div className="metric-icon-bubble">💰</div>
          </div>
          <div className="metric-value">₹{fmt(totalValue)}</div>
          <div className="metric-sub">Excludes cancelled</div>
        </div>
      </div>

      {/* Status Filter Tabs & Search */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tabs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {STATUS_FILTERS.map((s) => {
              const count =
                s === 'All'
                  ? invoices.length
                  : invoices.filter((x) => x.status === s).length
              return (
                <button
                  key={s}
                  type="button"
                  className={filter === s ? 'on' : ''}
                  onClick={() => setFilter(s)}
                  style={{ fontSize: 13, padding: '6px 12px' }}
                >
                  {s} <span style={{ opacity: 0.7, fontSize: 11, marginLeft: 4 }}>({count})</span>
                </button>
              )
            })}
          </div>
          <input
            className="search"
            style={{ maxWidth: 260 }}
            placeholder="Search PI, customer, AWB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Invoices List */}
      <div className="card" style={{ padding: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>PI Number</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Final Invoice No</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Dispatch / Tracking</th>
              <th className="actions-th" style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 30 }} className="muted">
                  Loading invoices…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: 30 }} className="muted">
                  No invoices found. Click &quot;+ New Proforma Invoice&quot; to create one.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const isPending = inv.status === 'Pending Customer Approval'
                const isApproved = inv.status === 'Approved'
                const isInvoiced = inv.status === 'Invoiced'
                const isDispatched = inv.status === 'Dispatched'
                const isDelivered = inv.status === 'Delivered'
                const isCancelled = inv.status === 'Cancelled'

                return (
                  <tr
                    key={inv.name}
                    onClick={() => openEdit(inv)}
                    style={{ cursor: 'pointer' }}
                    title="Click to open this Proforma Invoice (edit quantities & apply customer discounts)"
                  >
                    <td>
                      <b style={{ color: 'var(--accent)' }}>
                        {inv.name}
                      </b>
                      {inv.stock_reserved === 1 && !isCancelled && (
                        <span className="stock-tag" title="Product quantity is reserved/deducted from available stock">
                          Stock Reserved
                        </span>
                      )}
                    </td>
                    <td>
                      <div><b>{inv.customer_name}</b></div>
                      <div className="muted" style={{ fontSize: 12 }}>{inv.customer_phone || inv.customer_email || '—'}</div>
                    </td>
                    <td>{inv.posting_date}</td>
                    <td>
                      {inv.final_invoice_no ? (
                        <div>
                          <b style={{ color: '#2563eb' }}>{inv.final_invoice_no}</b>
                          <div className="muted" style={{ fontSize: 11 }}>{inv.invoice_date}</div>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <b>₹{fmt(inv.grand_total)}</b>
                      {n(inv.discount_amount) > 0 && (
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                          Disc: -₹{fmt(inv.discount_amount)}
                        </div>
                      )}
                      <div className="muted" style={{ fontSize: 11 }}>Tax: ₹{fmt(inv.tax_amount)}</div>
                    </td>
                    <td>
                      <span className={`status-badge status-${inv.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      {inv.tracking_number ? (
                        <div>
                          <b>{inv.transporter_name || 'Courier'}</b>: {inv.tracking_number}
                          <div className="muted" style={{ fontSize: 11 }}>
                            {inv.dispatch_status} ({inv.dispatch_date || '—'})
                          </div>
                        </div>
                      ) : (
                        <span className="muted">Not dispatched</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {/* Open / Edit / Discount */}
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
                          onClick={(e) => { e.stopPropagation(); openEdit(inv); }}
                          title="Open & Edit PI / Apply Customer Discount"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>

                        {/* Print / Preview */}
                        <button
                          type="button"
                          className="btn-icon btn-edit"
                          onClick={(e) => { e.stopPropagation(); openPrint(inv); }}
                          title="View / Print Proforma or Tax Invoice"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                          </svg>
                        </button>

                        {/* Approve Button */}
                        {isPending && (
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ background: '#dbeafe', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                            onClick={(e) => { e.stopPropagation(); handleApprove(inv); }}
                            title="Customer Approves PI"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        )}

                        {/* Convert to Final Tax Invoice */}
                        {(isPending || isApproved) && !inv.final_invoice_no && (
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ background: '#f3e8ff', color: '#7e22ce', borderColor: '#e9d5ff' }}
                            onClick={(e) => { e.stopPropagation(); handleConvertToInvoice(inv); }}
                            title="Convert to Final Tax Invoice"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                          </button>
                        )}

                        {/* Dispatch Tracking */}
                        {!isCancelled && (
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ background: '#e0e7ff', color: '#4338ca', borderColor: '#c7d2fe' }}
                            onClick={() => openDispatch(inv)}
                            title="Add / Update Courier & Tracking"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="3" width="15" height="13" />
                              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                              <circle cx="5.5" cy="18.5" r="2.5" />
                              <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                          </button>
                        )}

                        {/* Cancel / Restore Stock */}
                        {!isCancelled && !isDelivered && (
                          <button
                            type="button"
                            className="btn-icon btn-delete"
                            onClick={() => openCancel(inv)}
                            title="Cancel Order & Restore Stock"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 1. Modal: Create Proforma Invoice */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)} role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 940 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">{editingInvoice ? 'Edit & Discount' : 'Step 1'}</span>
                <h3>{editingInvoice ? `Edit Proforma Invoice (${editingInvoice})` : 'Create Proforma Invoice (PI)'}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSavePI}>
              <div className="modal-body">
                <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  ⚠️ <b>Stock Reservation &amp; Discounting</b>: {editingInvoice ? `Modifying ${editingInvoice}. You can adjust product quantities, negotiated customer rates, or apply special discounts.` : 'Saving this Proforma Invoice will automatically reserve/deduct the requested quantity from available inventory.'}
                </div>

                <div className="formgrid" style={{ marginBottom: 16 }}>
                  <div>
                    <label>Customer Name *</label>
                    <input
                      required
                      placeholder="e.g. Abc Industrial Solutions"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Phone / Mobile</label>
                    <input
                      placeholder="e.g. +91 99000 00099"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. abc@gmail.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>GSTIN / Tax ID</label>
                    <input
                      placeholder="e.g. 24AAACA1234A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>PI Date</label>
                    <input
                      type="date"
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Billing Address</label>
                    <input
                      placeholder="City, State, Pincode"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
                  <h4 style={{ margin: 0 }}>Line Items (Products)</h4>
                  <small className="muted">Rate auto-fetches on product selection • Adjust rate or add Disc % to give discounts</small>
                </div>

                <div className="line-items-table" style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 12px' }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 0.9fr 0.8fr 1fr 0.8fr 1.1fr 0.8fr 1.1fr 32px',
                    gap: 8,
                    padding: '0 4px 8px',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}>
                    <div>Product *</div>
                    <div>Qty *</div>
                    <div>UoM</div>
                    <div>Rate (₹) *</div>
                    <div>Disc %</div>
                    <div style={{ textAlign: 'right' }}>Amount (₹)</div>
                    <div>GST %</div>
                    <div style={{ textAlign: 'right' }}>Total (₹)</div>
                    <div></div>
                  </div>

                  {lineItems.map((row, idx) => {
                    const st = stockSummary[row.item] || {}
                    const avail = st.available_stock ?? 0
                    const baseAmt = n(row.qty) * n(row.rate)
                    const itemDiscAmt = baseAmt * (n(row.discount_pct) / 100)
                    const lineAmt = baseAmt - itemDiscAmt
                    const lineTot = lineAmt * (1 + n(row.tax_pct) / 100)

                    return (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 0.9fr 0.8fr 1fr 0.8fr 1.1fr 0.8fr 1.1fr 32px',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 10
                      }}>
                        <div>
                          <select
                            value={row.item}
                            onChange={(e) => handleItemChange(idx, 'item', e.target.value)}
                            required
                          >
                            <option value="">Select product…</option>
                            {items.map((it) => (
                              <option key={it.name} value={it.name}>
                                {it.item_name || it.name} ({it.uom_name || 'PIECE'})
                              </option>
                            ))}
                          </select>
                          {row.item && (
                            <small className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                              Available Stock: <b style={{ color: avail > 0 ? '#059669' : '#dc2626' }}>{fmtQty(avail)} {st.uom || row.uom}</b>
                            </small>
                          )}
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            placeholder="Qty"
                            value={row.qty}
                            onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <input type="text" readOnly value={row.uom || ''} style={{ opacity: 0.8 }} />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            placeholder="Rate"
                            value={row.rate}
                            onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            placeholder="0%"
                            value={row.discount_pct || ''}
                            onChange={(e) => handleItemChange(idx, 'discount_pct', e.target.value)}
                            title="Item Discount %"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            readOnly
                            value={`₹${fmt(lineAmt)}`}
                            style={{ textAlign: 'right', fontWeight: 600, background: 'var(--field)', opacity: 0.95 }}
                            title="Auto-calculated taxable amount after item discount"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="any"
                            placeholder="GST %"
                            value={row.tax_pct}
                            onChange={(e) => handleItemChange(idx, 'tax_pct', e.target.value)}
                          />
                        </div>
                        <div style={{ fontWeight: 700, padding: '8px 2px', textAlign: 'right', color: 'var(--accent)', fontSize: 13.5 }}>
                          ₹{fmt(lineTot)}
                        </div>
                        <div>
                          <button
                            type="button"
                            className="x"
                            onClick={() => removeLineItem(idx)}
                            disabled={lineItems.length <= 1}
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" className="btn ghost sm" onClick={addLineItem} style={{ marginTop: 4 }}>
                    + Add Product Row
                  </button>
                </div>

                {/* Totals Summary */}
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: 340, background: 'var(--panel)', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="muted">Gross Subtotal:</span>
                      <b>₹{fmt(subtotal)}</b>
                    </div>

                    {/* Customer Discount Input Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', padding: '8px 0', borderTop: '1px dashed var(--line)', borderBottom: '1px dashed var(--line)' }}>
                      <div>
                        <b style={{ color: '#d97706', fontSize: 13 }}>Discount:</b>
                        <div className="muted" style={{ fontSize: 11 }}>Customer discount</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            placeholder="0"
                            value={discountPct || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              setDiscountPct(val)
                              setDiscountAmount(val ? ((subtotal * n(val)) / 100).toFixed(2) : 0)
                            }}
                            style={{ width: 55, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                            title="Discount %"
                          />
                          <span style={{ fontSize: 12 }}>%</span>
                        </div>
                        <span className="muted" style={{ fontSize: 11 }}>or</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 12 }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={discountAmount || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              setDiscountAmount(val)
                              setDiscountPct(val && subtotal > 0 ? (((n(val) / subtotal)) * 100).toFixed(2) : 0)
                            }}
                            style={{ width: 75, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                            title="Discount Amount in ₹"
                          />
                        </div>
                      </div>
                    </div>

                    {computedDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#dc2626' }}>
                        <span>Discount Applied:</span>
                        <b>-₹{fmt(computedDiscount)}</b>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="muted">Taxable Subtotal:</span>
                      <b>₹{fmt(taxableTotal)}</b>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="muted">Total GST:</span>
                      <b>₹{fmt(totalTax)}</b>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--text)', paddingTop: 8, fontSize: 16 }}>
                      <b>Grand Total:</b>
                      <b style={{ color: 'var(--accent)' }}>₹{fmt(grandTotal)}</b>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Saving…' : editingInvoice ? '💾 Save & Update Proforma Invoice' : 'Create & Reserve Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Dispatch & Tracking */}
      {showDispatchModal && activeInvoice && (
        <div className="modal-overlay" onClick={() => setShowDispatchModal(false)} role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge">Step 3</span>
                <h3>Dispatch &amp; Tracking Details</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowDispatchModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveDispatch}>
              <div className="modal-body">
                <p className="muted" style={{ margin: '0 0 14px' }}>
                  Updating dispatch tracking for <b>{activeInvoice.name}</b> ({activeInvoice.customer_name})
                </p>
                <div className="formgrid">
                  <div>
                    <label>Transporter / Courier *</label>
                    <input
                      required
                      placeholder="e.g. Blue Dart, Delhivery, V-Trans"
                      value={transporterName}
                      onChange={(e) => setTransporterName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>LR / AWB / Tracking No *</label>
                    <input
                      required
                      placeholder="e.g. BD-893721948"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Dispatch Date</label>
                    <input
                      type="date"
                      value={dispatchDate}
                      onChange={(e) => setDispatchDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Status</label>
                    <select value={dispatchStatus} onChange={(e) => setDispatchStatus(e.target.value)}>
                      <option value="Dispatched">Dispatched</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowDispatchModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Updating…' : 'Save Tracking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Cancellation & Stock Restoration */}
      {showCancelModal && activeInvoice && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)} role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-badge" style={{ background: '#fee2e2', color: '#991b1b' }}>Step 4</span>
                <h3>Cancel Order &amp; Restore Stock</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCancelInvoice}>
              <div className="modal-body">
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  ⚠️ <b>Automatic Stock Restoration</b>: Cancelling this order will immediately release the reserved quantity back to available inventory.
                  {activeInvoice.final_invoice_no && (
                    <div style={{ marginTop: 6 }}>
                      A <b>Credit Note</b> will be issued to cancel Tax Invoice <b>{activeInvoice.final_invoice_no}</b>.
                    </div>
                  )}
                </div>

                <div>
                  <label>Cancellation Reason *</label>
                  <textarea
                    required
                    rows="3"
                    placeholder="e.g. Customer cancelled order / delivery address unreachable…"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    style={{ width: '100%', borderRadius: 8, padding: 10, border: '1px solid var(--line)', background: 'var(--field)', color: 'var(--text)' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={() => setShowCancelModal(false)}>
                  Close
                </button>
                <button type="submit" className="btn btn-delete" disabled={busy}>
                  {busy ? 'Processing…' : 'Confirm Cancellation & Restore Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Printable Proforma Invoice / Tax Invoice */}
      {showPrintModal && activeInvoice && (
        <div className="modal-overlay" onClick={() => setShowPrintModal(false)} role="dialog" aria-modal="true">
          <div className="modal-card print-modal-card" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header no-print">
              <div className="modal-title-wrap">
                <h3>{activeInvoice.final_invoice_no ? 'Tax Invoice' : 'Proforma Invoice'} Preview</h3>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn primary sm" onClick={() => window.print()}>
                  🖨️ Print / PDF
                </button>
                <button type="button" className="modal-close" onClick={() => setShowPrintModal(false)}>✕</button>
              </div>
            </div>

            <div className="printable-invoice" style={{ padding: 24, background: '#ffffff', color: '#111827', borderRadius: 8 }}>
              {/* Header Letterhead */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #e5e7eb', paddingBottom: 16, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', color: '#1e3a8a', fontSize: 24 }}>SURYA MANUFACTURING</h2>
                  <div style={{ fontSize: 13, color: '#4b5563' }}>SuryaCLS Precision Components Ltd.</div>
                  <div style={{ fontSize: 13, color: '#4b5563' }}>Plot 12, GIDC Industrial Estate, Gujarat, India</div>
                  <div style={{ fontSize: 13, color: '#4b5563' }}>GSTIN: <b>24AAACS9988Z1Z2</b> | Contact: +91 99000 11223</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: '0 0 6px', fontSize: 22, color: activeInvoice.final_invoice_no ? '#059669' : '#d97706' }}>
                    {activeInvoice.final_invoice_no ? 'TAX INVOICE' : 'PROFORMA INVOICE'}
                  </h2>
                  <div style={{ fontSize: 14 }}><b>{activeInvoice.final_invoice_no || activeInvoice.name}</b></div>
                  {activeInvoice.final_invoice_no && <div style={{ fontSize: 12, color: '#6b7280' }}>Ref PI: {activeInvoice.name}</div>}
                  <div style={{ fontSize: 13, color: '#4b5563' }}>Date: <b>{activeInvoice.invoice_date || activeInvoice.posting_date}</b></div>
                  {activeInvoice.credit_note_no && (
                    <div style={{ marginTop: 4, color: '#dc2626', fontWeight: 700, fontSize: 13 }}>
                      CANCELLED (Credit Note: {activeInvoice.credit_note_no})
                    </div>
                  )}
                </div>
              </div>

              {/* Bill To & Dispatch Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, fontSize: 13 }}>
                <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 6 }}>
                  <b style={{ color: '#1e3a8a', textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>Bill To:</b>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{activeInvoice.customer_name}</div>
                  <div>Phone: {activeInvoice.customer_phone || '—'}</div>
                  <div>Email: {activeInvoice.customer_email || '—'}</div>
                  <div>GSTIN: {activeInvoice.gstin || 'Unregistered'}</div>
                  <div>Address: {activeInvoice.billing_address || '—'}</div>
                </div>
                <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 6 }}>
                  <b style={{ color: '#1e3a8a', textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>Dispatch &amp; Delivery:</b>
                  <div>Transporter: <b>{activeInvoice.transporter_name || 'Pending'}</b></div>
                  <div>LR / AWB No: <b>{activeInvoice.tracking_number || 'Pending'}</b></div>
                  <div>Dispatch Date: {activeInvoice.dispatch_date || '—'}</div>
                  <div>Status: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{activeInvoice.dispatch_status}</span></div>
                  <div>Ship To: {activeInvoice.shipping_address || activeInvoice.billing_address || 'Same as Billing'}</div>
                </div>
              </div>

              {/* Line Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item Description</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>UoM</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate (₹)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Taxable Amt (₹)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>GST %</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeInvoice.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 10px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <b>{it.item_name || it.item}</b>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Code: {it.item}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtQty(it.qty)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.uom || 'PIECE'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(it.rate)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(it.amount)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(it.tax_pct, 1)}%</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(it.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary Calculations */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <div style={{ width: 290, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#4b5563' }}>Gross Subtotal:</span>
                    <b>₹{fmt(activeInvoice.subtotal)}</b>
                  </div>
                  {n(activeInvoice.discount_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#dc2626' }}>
                      <span>Discount {n(activeInvoice.discount_pct) > 0 ? `(${activeInvoice.discount_pct}%)` : ''}:</span>
                      <b>-₹{fmt(activeInvoice.discount_amount)}</b>
                    </div>
                  )}
                  {n(activeInvoice.discount_amount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ color: '#4b5563' }}>Taxable Value:</span>
                      <b>₹{fmt(activeInvoice.subtotal - activeInvoice.discount_amount)}</b>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ color: '#4b5563' }}>Integrated GST / Tax:</span>
                    <b>₹{fmt(activeInvoice.tax_amount)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #111827', fontSize: 16 }}>
                    <b>Grand Total:</b>
                    <b style={{ color: '#1e3a8a' }}>₹{fmt(activeInvoice.grand_total)}</b>
                  </div>
                </div>
              </div>

              {/* Signatures & Terms */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 20, fontSize: 12, color: '#4b5563' }}>
                <div>
                  <b>Terms &amp; Conditions:</b>
                  <div>1. Goods once sold will not be taken back unless defective.</div>
                  <div>2. Subject to Gujarat Jurisdiction only.</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ height: 40 }} />
                  <div style={{ borderTop: '1px dashed #9ca3af', width: 180, paddingTop: 4 }}>
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
