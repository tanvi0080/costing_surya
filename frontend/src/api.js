// Thin Frappe client. Same-origin in production (/costing), proxied by Vite in dev.
let csrf = ''

function errorText(j, fallback) {
  try {
    if (j._server_messages) {
      return JSON.parse(j._server_messages).map((m) => JSON.parse(m).message).join('\n').replace(/<[^>]+>/g, '')
    }
  } catch (e) { /* ignore */ }
  return j.message || j.exception || fallback
}

async function call(path, { method = 'GET', body, params } = {}) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  const res = await fetch(path + qs, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorText(j, res.statusText))
  return j
}

export async function session() {
  const { message } = await call('/api/method/costing.api.session_info')
  if (message?.csrf_token) csrf = message.csrf_token
  return message
}

export async function login(usr, pwd) {
  await call('/api/method/login', { method: 'POST', body: { usr, pwd } })
  return session()
}

export async function logout() {
  await call('/api/method/logout', { method: 'POST' })
  csrf = ''
}

export const list = async (doctype, fields = ['name'], extra = {}) =>
  (await call(`/api/resource/${encodeURIComponent(doctype)}`, {
    params: { fields: JSON.stringify(fields), limit_page_length: 0, order_by: 'modified desc', ...extra },
  })).data

export const getDoc = async (doctype, name) =>
  (await call(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)).data

export const saveDoc = async (doctype, doc) =>
  (doc.name && !doc.__islocal
    ? await call(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(doc.name)}`, { method: 'PUT', body: doc })
    : await call(`/api/resource/${encodeURIComponent(doctype)}`, { method: 'POST', body: doc })
  ).data

export const delDoc = (doctype, name) =>
  call(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: 'DELETE' })

export const rate = async (item, basis) =>
  (await call('/api/method/costing.api.get_purchase_rate', { params: { item, basis } })).message || 0

export const generateFinishedGoodPurchase = async (batchName) =>
  (await call('/api/method/costing.api.generate_finished_good_purchase', {
    method: 'POST',
    body: { batch_name: batchName },
  })).message

export const syncPurchaseRemainingQty = async (item) =>
  (await call('/api/method/costing.api.sync_purchase_remaining_qty', {
    params: item ? { item } : {},
  })).message

export const getStockSummary = async (item) =>
  (await call('/api/method/costing.api.get_stock_summary', {
    params: item ? { item } : {},
  })).message || {}

export const approveProformaInvoice = async (name) =>
  (await call('/api/method/costing.api.approve_proforma_invoice', {
    method: 'POST',
    body: { name },
  })).message

export const convertToFinalInvoice = async (name) =>
  (await call('/api/method/costing.api.convert_to_final_invoice', {
    method: 'POST',
    body: { name },
  })).message

export const updateDispatchTracking = async ({ name, transporter_name, tracking_number, dispatch_date, dispatch_status }) =>
  (await call('/api/method/costing.api.update_dispatch_tracking', {
    method: 'POST',
    body: { name, transporter_name, tracking_number, dispatch_date, dispatch_status },
  })).message

export const cancelProformaInvoice = async ({ name, cancellation_reason }) =>
  (await call('/api/method/costing.api.cancel_proforma_invoice', {
    method: 'POST',
    body: { name, cancellation_reason },
  })).message

export const saveProformaInvoice = async (data) =>
  (await call('/api/method/costing.api.save_proforma_invoice', {
    method: 'POST',
    body: { data },
  })).message



