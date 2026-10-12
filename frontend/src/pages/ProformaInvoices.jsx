import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Checkbox from '@mui/material/Checkbox'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormControl from '@mui/material/FormControl'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import InputLabel from '@mui/material/InputLabel'
import Tooltip from '@mui/material/Tooltip'
import Chip from '@mui/material/Chip'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { DataGrid } from '@mui/x-data-grid'
import dayjs from 'dayjs'
import * as api from '../api'
import { fmt, fmtQty, n } from '../calc'
import { useAppStore } from '../store/useAppStore'

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
  const registerModal = useAppStore((s) => s.registerModal)
  const unregisterModal = useAppStore((s) => s.unregisterModal)
  const showSnackbar = useAppStore((s) => s.showSnackbar)

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

  // React Hook Form for Dispatch Tracking
  const {
    register: registerDispatch,
    handleSubmit: handleDispatchSubmit,
    reset: resetDispatch,
    formState: { errors: dispatchErrors },
  } = useForm({
    defaultValues: {
      transporter_name: '',
      tracking_number: '',
      dispatch_date: new Date().toISOString().slice(0, 10),
      dispatch_status: 'Dispatched',
    },
  })

  // React Hook Form for Cancellation & Stock Restoration
  const {
    register: registerCancel,
    handleSubmit: handleCancelSubmit,
    reset: resetCancel,
    formState: { errors: cancelErrors },
  } = useForm({
    defaultValues: {
      cancellation_reason: '',
    },
  })

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
  const [discountType, setDiscountType] = useState('pct') // 'pct' | 'amt'
  const [reserveStockChecked, setReserveStockChecked] = useState(true)
  const [useDataGrid, setUseDataGrid] = useState(false)
  const [lineItems, setLineItems] = useState([
    { item: '', item_name: '', qty: 1, uom: 'PIECE', rate: 0, discount_pct: 0, amount: 0, tax_pct: 18, tax_amount: 0, total_amount: 0 },
  ])

  useEffect(() => {
    loadData()
  }, [])

  // Register active modals in Zustand modal stack for ESC key handling
  useEffect(() => {
    if (showCreateModal) {
      registerModal('pi_create_modal', () => setShowCreateModal(false))
      return () => unregisterModal('pi_create_modal')
    }
  }, [showCreateModal, registerModal, unregisterModal])

  useEffect(() => {
    if (showDispatchModal) {
      registerModal('pi_dispatch_modal', () => setShowDispatchModal(false))
      return () => unregisterModal('pi_dispatch_modal')
    }
  }, [showDispatchModal, registerModal, unregisterModal])

  useEffect(() => {
    if (showCancelModal) {
      registerModal('pi_cancel_modal', () => setShowCancelModal(false))
      return () => unregisterModal('pi_cancel_modal')
    }
  }, [showCancelModal, registerModal, unregisterModal])

  useEffect(() => {
    if (showPrintModal) {
      registerModal('pi_print_modal', () => setShowPrintModal(false))
      return () => unregisterModal('pi_print_modal')
    }
  }, [showPrintModal, registerModal, unregisterModal])

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
      showSnackbar(`✓ Proforma Invoice ${inv.name} approved by customer!`, 'success')
      setMsg({ ok: `✓ Proforma Invoice ${inv.name} approved by customer!` })
      await loadData()
    } catch (e) {
      showSnackbar(e.message, 'error')
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
      showSnackbar(`✓ Final Tax Invoice generated: ${res.final_invoice_no} (${inv.name})`, 'success')
      setMsg({ ok: `✓ Final Tax Invoice generated: ${res.final_invoice_no} (${inv.name})` })
      await loadData()
    } catch (e) {
      showSnackbar(e.message, 'error')
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Open Dispatch Modal with react-hook-form reset
  function openDispatch(inv) {
    setActiveInvoice(inv)
    resetDispatch({
      transporter_name: inv.transporter_name || '',
      tracking_number: inv.tracking_number || '',
      dispatch_date: inv.dispatch_date || new Date().toISOString().slice(0, 10),
      dispatch_status: inv.dispatch_status === 'Delivered' ? 'Delivered' : 'Dispatched',
    })
    setShowDispatchModal(true)
  }

  // Save Dispatch via react-hook-form
  async function onDispatchSubmit(data) {
    if (!activeInvoice) return
    setBusy(true)
    try {
      await api.updateDispatchTracking({
        name: activeInvoice.name,
        transporter_name: data.transporter_name,
        tracking_number: data.tracking_number,
        dispatch_date: data.dispatch_date,
        dispatch_status: data.dispatch_status,
      })
      setShowDispatchModal(false)
      showSnackbar(`✓ Updated dispatch details for ${activeInvoice.name} (${data.dispatch_status})`, 'success')
      setMsg({ ok: `✓ Updated dispatch details for ${activeInvoice.name} (${data.dispatch_status})` })
      await loadData()
    } catch (e) {
      showSnackbar(e.message, 'error')
      setMsg({ err: e.message })
    }
    setBusy(false)
  }

  // Open Cancel Modal with react-hook-form reset
  function openCancel(inv) {
    setActiveInvoice(inv)
    resetCancel({
      cancellation_reason: '',
    })
    setShowCancelModal(true)
  }

  // Save Cancel via react-hook-form
  async function onCancelSubmit(data) {
    if (!activeInvoice) return
    setBusy(true)
    try {
      const res = await api.cancelProformaInvoice({
        name: activeInvoice.name,
        cancellation_reason: data.cancellation_reason,
      })
      setShowCancelModal(false)
      const cnMsg = res.credit_note_no ? ` Credit note issued: ${res.credit_note_no}.` : ''
      showSnackbar(`✓ Cancelled ${activeInvoice.name}.${cnMsg} Reserved stock restored!`, 'success')
      setMsg({ ok: `✓ Cancelled ${activeInvoice.name}.${cnMsg} Reserved stock has been completely restored to inventory!` })
      await loadData()
    } catch (e) {
      showSnackbar(e.message, 'error')
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

  // MUI DataGrid rows & columns definition
  const dataGridRows = filtered.map((inv) => ({
    id: inv.name,
    ...inv,
  }))

  const dataGridColumns = [
    {
      field: 'name',
      headerName: 'PI NUMBER',
      width: 140,
      renderCell: (params) => <b style={{ color: 'var(--accent)' }}>{params.value}</b>,
    },
    {
      field: 'customer_name',
      headerName: 'CUSTOMER',
      width: 200,
      renderCell: (params) => (
        <div>
          <div style={{ fontWeight: 600 }}>{params.value}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{params.row.customer_phone || params.row.customer_email || ''}</div>
        </div>
      ),
    },
    { field: 'posting_date', headerName: 'DATE', width: 120 },
    {
      field: 'final_invoice_no',
      headerName: 'TAX INVOICE',
      width: 150,
      renderCell: (params) =>
        params.value ? (
          <div>
            <b style={{ color: '#2563eb' }}>{params.value}</b>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{params.row.invoice_date}</div>
          </div>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        ),
    },
    {
      field: 'grand_total',
      headerName: 'TOTAL (₹)',
      width: 130,
      renderCell: (params) => <b>₹{fmt(params.value)}</b>,
    },
    {
      field: 'status',
      headerName: 'STATUS',
      width: 180,
      renderCell: (params) => {
        const val = params.value
        let col = 'default'
        if (val === 'Approved') col = 'success'
        if (val === 'Invoiced') col = 'secondary'
        if (val === 'Dispatched') col = 'primary'
        if (val === 'Delivered') col = 'success'
        if (val === 'Cancelled') col = 'error'
        if (val === 'Pending Customer Approval') col = 'warning'
        return <Chip label={val} color={col} size="small" />
      },
    },
    {
      field: 'tracking_number',
      headerName: 'DISPATCH / LR',
      width: 160,
      renderCell: (params) =>
        params.value ? (
          <div>
            <b>{params.row.transporter_name || 'COURIER'}</b>: {params.value}
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{params.row.dispatch_status}</div>
          </div>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Not dispatched</span>
        ),
    },
    {
      field: 'actions',
      headerName: 'ACTIONS',
      width: 150,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Open & Edit PI / Apply Customer Discount" arrow>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(params.row); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </IconButton>
          </Tooltip>
          <Tooltip title="View / Print Proforma or Tax Invoice" arrow>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); openPrint(params.row); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ]

  return (
    <>
      {/* Top Action Bar with MUI Button & Stack */}
      <div className="bar">
        <div>
          <h2>Invoices &amp; Dispatch</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            Proforma Invoices, Stock Reservations, Tax Invoices &amp; Dispatch Tracking
          </p>
        </div>
        <div className="spacer" />
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button variant="outlined" size="small" onClick={loadData} disabled={busy || loading} sx={{ textTransform: 'none' }}>
            ↻ Refresh Stock
          </Button>
          <Button variant="contained" color="primary" onClick={openCreate} sx={{ fontWeight: 700, textTransform: 'none' }}>
            + New Proforma Invoice
          </Button>
        </Stack>
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

      {/* Status Filter Tabs & Search with MUI Stack, Switch, and TextField */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" justifyContent="space-between">
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

          <Stack direction="row" spacing={2} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={useDataGrid}
                  onChange={(e) => setUseDataGrid(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label={<span style={{ fontSize: 13, fontWeight: 600 }}>DataGrid View</span>}
            />

            <TextField
              size="small"
              placeholder="SEARCH PI, CUSTOMER, AWB…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 230 }}
            />
          </Stack>
        </Stack>
      </div>

      {/* Invoices View: DataGrid Mode OR Classic Table Mode */}
      {useDataGrid ? (
        <Paper sx={{ width: '100%', mb: 3, p: 1, borderRadius: 2 }} elevation={0}>
          <DataGrid
            rows={dataGridRows}
            columns={dataGridColumns}
            pageSizeOptions={[5, 10, 20]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            autoHeight
            disableRowSelectionOnClick
            sx={{
              border: '1px solid var(--line)',
              borderRadius: '10px',
              '& .MuiDataGrid-columnHeaders': {
                fontWeight: 700,
                background: 'var(--panel)',
              },
            }}
          />
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', mb: 3 }}>
          <Table className="tbl">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>PI NUMBER</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>CUSTOMER</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>DATE</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>FINAL INVOICE NO</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>AMOUNT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>STATUS</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>DISPATCH / TRACKING</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right', width: 140 }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
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
                        <Tooltip title="Open & Edit PI / Apply Customer Discount" arrow>
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
                            onClick={(e) => { e.stopPropagation(); openEdit(inv); }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </Tooltip>

                        {/* Print / Preview */}
                        <Tooltip title="View / Print Proforma or Tax Invoice" arrow>
                          <button
                            type="button"
                            className="btn-icon btn-edit"
                            onClick={(e) => { e.stopPropagation(); openPrint(inv); }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                          </button>
                        </Tooltip>

                        {/* Approve Button */}
                        {isPending && (
                          <Tooltip title="Customer Approves PI (Reserves Stock)" arrow>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ background: '#dbeafe', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                              onClick={(e) => { e.stopPropagation(); handleApprove(inv); }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </button>
                          </Tooltip>
                        )}

                        {/* Convert to Final Tax Invoice */}
                        {(isPending || isApproved) && !inv.final_invoice_no && (
                          <Tooltip title="Generate Final Tax Invoice" arrow>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ background: '#f3e8ff', color: '#7e22ce', borderColor: '#e9d5ff' }}
                              onClick={(e) => { e.stopPropagation(); handleConvertToInvoice(inv); }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            </button>
                          </Tooltip>
                        )}

                        {/* Dispatch Tracking */}
                        {!isCancelled && (
                          <Tooltip title="Add / Update Courier & Tracking" arrow>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ background: '#e0e7ff', color: '#4338ca', borderColor: '#c7d2fe' }}
                              onClick={() => openDispatch(inv)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="1" y="3" width="15" height="13" />
                                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                                <circle cx="5.5" cy="18.5" r="2.5" />
                                <circle cx="18.5" cy="18.5" r="2.5" />
                              </svg>
                            </button>
                          </Tooltip>
                        )}

                        {/* Cancel / Restore Stock */}
                        {!isCancelled && !isDelivered && (
                          <Tooltip title="Cancel Order & Restore Stock" arrow>
                            <button
                              type="button"
                              className="btn-icon btn-delete"
                              onClick={() => openCancel(inv)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      required
                      fullWidth
                      size="small"
                      label="CUSTOMER NAME *"
                      placeholder="E.G. ABC INDUSTRIAL SOLUTIONS"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="PHONE / MOBILE"
                      placeholder="E.G. +91 99000 00099"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      type="email"
                      size="small"
                      label="EMAIL ADDRESS"
                      placeholder="E.G. ABC@GMAIL.COM"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="GSTIN / TAX ID"
                      placeholder="E.G. 24AAACA1234A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      type="date"
                      size="small"
                      label="PI DATE"
                      InputLabelProps={{ shrink: true }}
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="BILLING ADDRESS"
                      placeholder="CITY, STATE, PINCODE"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                    />
                  </Grid>
                </Grid>

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

                    {/* Customer Discount Selection (MUI RadioGroup) */}
                    <div style={{ margin: '8px 0', padding: '8px 0', borderTop: '1px dashed var(--line)', borderBottom: '1px dashed var(--line)' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <div>
                          <b style={{ color: '#d97706', fontSize: 13 }}>DISCOUNT TYPE:</b>
                          <div className="muted" style={{ fontSize: 11 }}>Customer discount mode</div>
                        </div>
                        <RadioGroup
                          row
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value)}
                        >
                          <FormControlLabel value="pct" control={<Radio size="small" />} label="%" />
                          <FormControlLabel value="amt" control={<Radio size="small" />} label="₹" />
                        </RadioGroup>
                      </Stack>

                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                        {discountType === 'pct' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <TextField
                              size="small"
                              type="number"
                              inputProps={{ min: 0, max: 100, step: 'any' }}
                              placeholder="0"
                              value={discountPct || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setDiscountPct(val)
                                setDiscountAmount(val ? ((subtotal * n(val)) / 100).toFixed(2) : 0)
                              }}
                              sx={{ width: 85 }}
                            />
                            <span>%</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>₹</span>
                            <TextField
                              size="small"
                              type="number"
                              inputProps={{ min: 0, step: 'any' }}
                              placeholder="0"
                              value={discountAmount || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setDiscountAmount(val)
                                setDiscountPct(val && subtotal > 0 ? (((n(val) / subtotal)) * 100).toFixed(2) : 0)
                              }}
                              sx={{ width: 110 }}
                            />
                          </div>
                        )}
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

                <div style={{ marginTop: 12 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={reserveStockChecked}
                        onChange={(e) => setReserveStockChecked(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={<span style={{ fontSize: 13, fontWeight: 600 }}>RESERVE INVENTORY IMMEDIATELY FOR THIS ORDER</span>}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button onClick={() => setShowCreateModal(false)} color="inherit" sx={{ textTransform: 'none' }}>
                  CANCEL
                </Button>
                <Button type="submit" variant="contained" color="primary" disabled={busy} sx={{ textTransform: 'none', fontWeight: 600 }}>
                  {busy ? 'SAVING…' : editingInvoice ? '💾 SAVE & UPDATE PROFORMA INVOICE' : 'CREATE & RESERVE STOCK'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Dispatch & Tracking (MUI Dialog) */}
      <Dialog
        open={Boolean(showDispatchModal && activeInvoice)}
        onClose={() => setShowDispatchModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label="STEP 3" color="primary" size="small" />
            <Typography variant="h6" component="span" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              DISPATCH &amp; TRACKING DETAILS
            </Typography>
          </Stack>
          <IconButton onClick={() => setShowDispatchModal(false)} size="small">✕</IconButton>
        </DialogTitle>
        <form onSubmit={handleDispatchSubmit(onDispatchSubmit)}>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              UPDATING DISPATCH TRACKING FOR <b>{activeInvoice?.name}</b> ({activeInvoice?.customer_name})
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="TRANSPORTER / COURIER *"
                  placeholder="E.G. BLUE DART, DELHIVERY"
                  {...registerDispatch('transporter_name', { required: 'TRANSPORTER NAME IS REQUIRED' })}
                  error={Boolean(dispatchErrors.transporter_name)}
                  helperText={dispatchErrors.transporter_name?.message}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="LR / AWB / TRACKING NO *"
                  placeholder="E.G. BD-893721948"
                  {...registerDispatch('tracking_number', { required: 'TRACKING NUMBER IS REQUIRED' })}
                  error={Boolean(dispatchErrors.tracking_number)}
                  helperText={dispatchErrors.tracking_number?.message}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="date"
                  size="small"
                  label="DISPATCH DATE"
                  InputLabelProps={{ shrink: true }}
                  {...registerDispatch('dispatch_date')}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="dispatch-status-label">STATUS</InputLabel>
                  <Select
                    labelId="dispatch-status-label"
                    label="STATUS"
                    defaultValue="Dispatched"
                    {...registerDispatch('dispatch_status')}
                  >
                    <MenuItem value="Dispatched">DISPATCHED</MenuItem>
                    <MenuItem value="Delivered">DELIVERED</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setShowDispatchModal(false)} color="inherit" sx={{ textTransform: 'none' }}>
              CANCEL
            </Button>
            <Button type="submit" variant="contained" color="primary" disabled={busy} sx={{ textTransform: 'none', fontWeight: 600 }}>
              {busy ? 'SAVING…' : 'SAVE TRACKING'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 3. Modal: Cancellation & Stock Restoration (MUI Dialog) */}
      <Dialog
        open={Boolean(showCancelModal && activeInvoice)}
        onClose={() => setShowCancelModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label="STEP 4" color="error" size="small" />
            <Typography variant="h6" component="span" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              CANCEL ORDER &amp; RESTORE STOCK
            </Typography>
          </Stack>
          <IconButton onClick={() => setShowCancelModal(false)} size="small">✕</IconButton>
        </DialogTitle>
        <form onSubmit={handleCancelSubmit(onCancelSubmit)}>
          <DialogContent dividers>
            <Paper sx={{ p: 1.5, mb: 2, bgcolor: '#fee2e2', color: '#991b1b', borderRadius: 1 }} elevation={0}>
              ⚠️ <b>AUTOMATIC STOCK RESTORATION</b>: CANCELLING THIS ORDER WILL IMMEDIATELY RELEASE THE RESERVED QUANTITY BACK TO AVAILABLE INVENTORY.
              {activeInvoice?.final_invoice_no && (
                <div style={{ marginTop: 4 }}>
                  A <b>CREDIT NOTE</b> WILL BE ISSUED TO CANCEL TAX INVOICE <b>{activeInvoice.final_invoice_no}</b>.
                </div>
              )}
            </Paper>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="CANCELLATION REASON *"
              placeholder="E.G. CUSTOMER CANCELLED ORDER / DELIVERY ADDRESS UNREACHABLE…"
              {...registerCancel('cancellation_reason', {
                required: 'PLEASE ENTER A CANCELLATION REASON',
                minLength: { value: 3, message: 'REASON MUST BE AT LEAST 3 CHARACTERS' },
              })}
              error={Boolean(cancelErrors.cancellation_reason)}
              helperText={cancelErrors.cancellation_reason?.message}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setShowCancelModal(false)} color="inherit" sx={{ textTransform: 'none' }}>
              CLOSE
            </Button>
            <Button type="submit" variant="contained" color="error" disabled={busy} sx={{ textTransform: 'none', fontWeight: 600 }}>
              {busy ? 'PROCESSING…' : 'CONFIRM CANCELLATION & RESTORE STOCK'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

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
