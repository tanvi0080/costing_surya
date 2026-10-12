// Same maths as costing_batch.py (server re-calculates on save).
export const n = (v) => parseFloat(v) || 0
export const fmt = (v, dp = 2) => n(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })
export const fmtDate = (d) => {
  if (!d) return ''
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-')
    return `${day}-${m}-${y}`
  }
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return d
    const day = String(dt.getDate()).padStart(2, '0')
    const month = String(dt.getMonth() + 1).padStart(2, '0')
    const year = dt.getFullYear()
    return `${day}-${month}-${year}`
  } catch (e) {
    return d
  }
}

export const fmtQty = (v, maxDp = 4) => {
  if (v === null || v === undefined || v === '') return '0'
  const num = n(v)
  if (num === 0) return '0'
  if (Number.isInteger(num)) return num.toLocaleString('en-IN')
  const str = num.toFixed(maxDp).replace(/\.?0+$/, '')
  const parts = str.split('.')
  const intPart = parseInt(parts[0], 10).toLocaleString('en-IN')
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
}

export const reject = (x, pct, method) =>
  method === 'Divide by yield' ? (n(pct) < 100 ? x / (1 - n(pct) / 100) : x) : x * (1 + n(pct) / 100)

export const emptyBatch = () => ({
  __islocal: 1,
  product: '',
  batch_date: new Date().toISOString().slice(0, 10),
  output_qty: 1,
  rejection_method: 'Add % on top',
  batch_processes: [], usage_processes: [], labour_charges: [], machine_charges: [], extra_charges: [],
  material_rejection_pct: 0, labour_rejection_pct: 0, machine_rejection_pct: 0, extra_charges_total: 0,
})

export function calcBatch(d, stockMap = {}) {
  const batch = (d.batch_processes || []).map((r) => {
    const total_price = n(r.qty) * n(r.rate)
    const per_output_rate = n(r.total_output) ? total_price / n(r.total_output) : 0
    return { ...r, total_price, per_output_rate, total_rate: per_output_rate + n(r.extra_cost) }
  })
  const usage = (d.usage_processes || []).map((r) => {
    const total_per_output = n(r.usage_per_output) * n(r.unit_price)
    const total_consumed = n(r.usage_per_output) * (n(d.output_qty) || 1)
    const isGm = (r.uom || '').toUpperCase() === 'GM'
    const used_kg = isGm ? total_consumed / 1000 : total_consumed
    const totalStock = n(r.stock_qty ?? stockMap[r.item] ?? 0)
    const remaining_stock = totalStock ? Math.max(0, totalStock - used_kg) : (r.remaining_stock ? n(r.remaining_stock) : 0)
    return {
      ...r,
      total_per_output,
      total_consumed,
      total_usage: total_consumed,
      used_kg,
      stock_qty: totalStock || r.stock_qty || 0,
      remaining_stock,
      total_rate: total_per_output + n(r.extra_cost),
    }
  })
  const charge = (r) => ({ ...r, cost_per_piece: n(r.qty) ? n(r.amount) / n(r.qty) : 0 })
  const labour = (d.labour_charges || []).map(charge)
  const machine = (d.machine_charges || []).map(charge)

  const m = d.rejection_method
  const extra = (d.extra_charges || []).map((r) => {
    const cost_per_piece = n(r.cost_per_piece) || (n(r.qty) ? n(r.amount) / n(r.qty) : 0)
    const total_cost = reject(cost_per_piece, r.rejection_pct, m)
    return { ...r, cost_per_piece, total_cost }
  })
  const extra_charges_total = extra.reduce((s, r) => s + r.total_cost, 0)

  const materials_total = [...batch, ...usage].reduce((s, r) => s + r.total_rate, 0)
  const after_material_rejection = reject(materials_total, d.material_rejection_pct, m)
  const labour_total = labour.reduce((s, r) => s + r.cost_per_piece, 0)
  const after_labour_rejection = reject(after_material_rejection + labour_total, d.labour_rejection_pct, m)
  const machine_total = machine.reduce((s, r) => s + r.cost_per_piece, 0)
  const total_cost_per_piece = reject(after_labour_rejection + machine_total, d.machine_rejection_pct, m) + extra_charges_total
  const total_batch_amount = (n(d.output_qty) || 1) * total_cost_per_piece

  return {
    ...d, batch_processes: batch, usage_processes: usage, labour_charges: labour, machine_charges: machine,
    extra_charges: extra, extra_charges_total,
    materials_total, after_material_rejection, labour_total, after_labour_rejection, machine_total, total_cost_per_piece,
    total_batch_amount,
  }
}

