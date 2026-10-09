// Same maths as costing_batch.py (server re-calculates on save).
export const n = (v) => parseFloat(v) || 0
export const fmt = (v, dp = 2) => n(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })

export const reject = (x, pct, method) =>
  method === 'Divide by yield' ? (n(pct) < 100 ? x / (1 - n(pct) / 100) : x) : x * (1 + n(pct) / 100)

export const emptyBatch = () => ({
  __islocal: 1,
  product: '',
  batch_date: new Date().toISOString().slice(0, 10),
  rejection_method: 'Add % on top',
  rate_basis: 'Latest Purchase',
  batch_processes: [], usage_processes: [], labour_charges: [], machine_charges: [],
  material_rejection_pct: 0, labour_rejection_pct: 0, machine_rejection_pct: 0,
})

export function calcBatch(d) {
  const batch = (d.batch_processes || []).map((r) => {
    const total_price = n(r.qty) * n(r.rate)
    const per_output_rate = n(r.total_output) ? total_price / n(r.total_output) : 0
    return { ...r, total_price, per_output_rate, total_rate: per_output_rate + n(r.extra_cost) }
  })
  const usage = (d.usage_processes || []).map((r) => {
    const total_per_output = n(r.usage_per_output) * n(r.unit_price)
    return { ...r, total_per_output, total_rate: total_per_output + n(r.extra_cost) }
  })
  const charge = (r) => ({ ...r, cost_per_piece: n(r.qty) ? n(r.amount) / n(r.qty) : 0 })
  const labour = (d.labour_charges || []).map(charge)
  const machine = (d.machine_charges || []).map(charge)

  const m = d.rejection_method
  const materials_total = [...batch, ...usage].reduce((s, r) => s + r.total_rate, 0)
  const after_material_rejection = reject(materials_total, d.material_rejection_pct, m)
  const labour_total = labour.reduce((s, r) => s + r.cost_per_piece, 0)
  const after_labour_rejection = reject(after_material_rejection + labour_total, d.labour_rejection_pct, m)
  const machine_total = machine.reduce((s, r) => s + r.cost_per_piece, 0)
  const total_cost_per_piece = reject(after_labour_rejection + machine_total, d.machine_rejection_pct, m)

  return {
    ...d, batch_processes: batch, usage_processes: usage, labour_charges: labour, machine_charges: machine,
    materials_total, after_material_rejection, labour_total, after_labour_rejection, machine_total, total_cost_per_piece,
  }
}
