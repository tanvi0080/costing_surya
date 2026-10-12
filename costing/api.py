import frappe
from frappe.sessions import get_csrf_token
from frappe.utils import flt


@frappe.whitelist(allow_guest=True)
def session_info():
	"""Used by the React app on load: who is logged in + CSRF token for POST/PUT/DELETE."""
	user = frappe.session.user
	if user == "Guest":
		return {"user": None}
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"csrf_token": get_csrf_token(),
	}


@frappe.whitelist()
def get_purchase_rate(item, basis="Weighted Average"):
	"""
	Calculates unit price of an item from Purchase Entry records.
	Defaults to Weighted Average across purchases:
	  total purchase amount / total purchase quantity.
	Example: 10000 in 20kg + 15000 in 20kg = 25000 / 40kg = 625/kg.
	"""
	if not item:
		return 0
	if basis in ("Weighted Average", "Average"):
		res = frappe.db.sql(
			"select coalesce(sum(amount),0), coalesce(sum(qty),0) from `tabPurchase Entry` where item=%s",
			item,
		)[0]
		amount, qty = flt(res[0]), flt(res[1])
		if qty:
			return amount / qty
		# Fallback to single latest purchase rate if total qty is 0
		return flt(
			frappe.db.get_value(
				"Purchase Entry", {"item": item}, "rate", order_by="posting_date desc, creation desc"
			) or 0
		)
	return flt(
		frappe.db.get_value(
			"Purchase Entry", {"item": item}, "rate", order_by="posting_date desc, creation desc"
		) or 0
	)


def get_uom_conversion_factor(from_uom, to_uom):
	"""
	Returns multiplier to convert quantity from from_uom to to_uom.
	e.g. GM to KG -> 0.001
	     KG to GM -> 1000.0
	     otherwise -> 1.0
	"""
	if not from_uom or not to_uom:
		return 1.0
	f = from_uom.strip().upper()
	t = to_uom.strip().upper()
	if f == t:
		return 1.0
	if f in ("GM", "GRAM", "GRAMS") and t in ("KG", "KILOGRAM", "KGS"):
		return 0.001
	if f in ("KG", "KILOGRAM", "KGS") and t in ("GM", "GRAM", "GRAMS"):
		return 1000.0
	return 1.0


@frappe.whitelist()
def sync_purchase_remaining_qty(item=None):
	"""
	Calculates and updates used_qty and remaining_qty for Purchase Entry records.
	Computes used quantities from Costing Batches (both batch_processes and usage_processes)
	and allocates consumption FIFO to Purchase Entry rows, taking UoM conversion into account
	(e.g. usage in GM converted to KG if purchase is in KG: used / 1000).
	"""
	items = [item] if item else [r[0] for r in frappe.db.sql("select distinct item from `tabPurchase Entry`")]
	for itm in items:
		if not itm:
			continue

		# Item's base purchase UoM
		item_uom = frappe.db.get_value("Costing Item", itm, "uom_name") or "KG"

		# Calculate total used in batch_processes with UOM conversion
		batch_rows = frappe.db.sql(
			"""
			select bp.qty, bp.uom
			from `tabCosting Batch Process` bp
			inner join `tabCosting Batch` cb on cb.name = bp.parent
			where bp.item=%s and cb.docstatus < 2
			""",
			itm,
			as_dict=True,
		)
		used_batch = sum(
			flt(r.qty) * get_uom_conversion_factor(r.uom or item_uom, item_uom)
			for r in batch_rows
		)

		# Calculate total used in usage_processes with UOM conversion
		usage_rows = frappe.db.sql(
			"""
			select u.usage_per_output, u.uom, coalesce(cb.output_qty, 1) as output_qty
			from `tabCosting Usage Process` u
			inner join `tabCosting Batch` cb on cb.name = u.parent
			where u.item=%s and cb.docstatus < 2
			""",
			itm,
			as_dict=True,
		)
		used_usage = sum(
			(flt(r.usage_per_output) * flt(r.output_qty)) * get_uom_conversion_factor(r.uom or item_uom, item_uom)
			for r in usage_rows
		)

		# Calculate total reserved / deducted in active Proforma Invoices
		pi_rows = frappe.db.sql(
			"""
			select pii.qty, pii.uom
			from `tabProforma Invoice Item` pii
			inner join `tabProforma Invoice` pi on pi.name = pii.parent
			where pii.item=%s and pi.docstatus < 2 and pi.status != 'Cancelled' and coalesce(pi.stock_reserved, 1) = 1
			""",
			itm,
			as_dict=True,
		)
		used_pi = sum(
			flt(r.qty) * get_uom_conversion_factor(r.uom or item_uom, item_uom)
			for r in pi_rows
		)

		total_used = used_batch + used_usage + used_pi

		# Fetch all purchases for this item ordered by date asc, creation asc
		purchases = frappe.db.sql(
			"select name, qty, uom_name from `tabPurchase Entry` where item=%s order by posting_date asc, creation asc",
			itm,
			as_dict=True,
		)
		remaining_to_consume = total_used
		for pe in purchases:
			p_qty = flt(pe.qty)
			pe_uom = pe.uom_name or item_uom
			# Convert consumption to PE's specific UoM if needed
			conv = get_uom_conversion_factor(item_uom, pe_uom)
			target_to_consume = remaining_to_consume * conv
			consumed = min(p_qty, target_to_consume)
			rem = max(0.0, p_qty - consumed)
			remaining_to_consume = max(0.0, (target_to_consume - consumed) / conv if conv else 0.0)
			frappe.db.set_value(
				"Purchase Entry",
				pe.name,
				{
					"used_qty": consumed,
					"remaining_qty": rem,
				},
				update_modified=False,
			)

	frappe.db.commit()
	return True


@frappe.whitelist()
def generate_finished_good_purchase(batch_name):
	"""
	Generates or updates a Purchase Entry record for the finished good produced by a Costing Batch.
	Sets:
	  item: Finished good item code
	  qty: How many pieces generated (output_qty)
	  rate: Cost per piece (total_cost_per_piece)
	  amount: Total production value (output_qty * total_cost_per_piece)
	  supplier: In-house Production ({batch_name})
	  posting_date: batch_date
	"""
	batch = frappe.get_doc("Costing Batch", batch_name)
	if not batch.product:
		frappe.throw("Batch must have a finished good product selected.")

	qty = flt(batch.output_qty) or 1.0
	rate = flt(batch.total_cost_per_piece)
	amount = qty * rate

	it = frappe.db.get_value("Costing Item", batch.product, ["item_name", "uom", "uom_name"], as_dict=True) or {}
	item_uom = it.get("uom")
	item_uom_name = it.get("uom_name") or (frappe.db.get_value("Costing UOM", item_uom, "uom_name") if item_uom else None)

	pe_name = batch.purchase_entry
	if pe_name and frappe.db.exists("Purchase Entry", pe_name):
		pe = frappe.get_doc("Purchase Entry", pe_name)
		pe.posting_date = batch.batch_date
		pe.item = batch.product
		pe.item_name = batch.product_name
		pe.uom = item_uom
		pe.uom_name = item_uom_name
		pe.qty = qty
		pe.rate = rate
		pe.amount = amount
		pe.supplier = f"In-house Production ({batch.name})"
		pe.save()
		frappe.db.set_value("Costing Batch", batch.name, {
			"purchase_entry": pe.name,
			"total_batch_amount": amount,
		}, update_modified=False)
	else:
		pe = frappe.get_doc({
			"doctype": "Purchase Entry",
			"posting_date": batch.batch_date,
			"item": batch.product,
			"item_name": batch.product_name,
			"uom": item_uom,
			"uom_name": item_uom_name,
			"qty": qty,
			"rate": rate,
			"amount": amount,
			"supplier": f"In-house Production ({batch.name})",
			"remaining_qty": qty,
		})
		pe.insert()
		batch.purchase_entry = pe.name
		frappe.db.set_value("Costing Batch", batch.name, {
			"purchase_entry": pe.name,
			"total_batch_amount": amount,
		}, update_modified=False)

	# Sync all purchase entries remaining
	sync_purchase_remaining_qty()
	frappe.db.commit()

	return {
		"purchase_entry": pe.name,
		"item": batch.product,
		"item_name": batch.product_name,
		"qty": qty,
		"rate": rate,
		"amount": amount,
	}


@frappe.whitelist()
def get_stock_summary(item=None):
	"""
	Returns real-time stock summary for items:
	- total_stock (from Purchase Entry)
	- used_in_batches (from Costing Batch)
	- reserved_in_pi (from active Proforma Invoices)
	- available_stock (total_stock - used_in_batches - reserved_in_pi)
	"""
	sync_purchase_remaining_qty(item)
	items = [item] if item else [r[0] for r in frappe.db.sql("select distinct name from `tabCosting Item`")]
	result = {}
	for itm in items:
		if not itm:
			continue
		it = frappe.db.get_value("Costing Item", itm, ["item_name", "uom", "uom_name"], as_dict=True) or {}
		uom_name = it.get("uom_name") or "PIECE"

		tot_stock = flt(frappe.db.sql("select coalesce(sum(qty), 0) from `tabPurchase Entry` where item=%s", itm)[0][0])
		rem_stock = flt(frappe.db.sql("select coalesce(sum(remaining_qty), 0) from `tabPurchase Entry` where item=%s", itm)[0][0])
		pi_reserved = flt(frappe.db.sql(
			"""
			select coalesce(sum(pii.qty), 0)
			from `tabProforma Invoice Item` pii
			inner join `tabProforma Invoice` pi on pi.name = pii.parent
			where pii.item=%s and pi.docstatus < 2 and pi.status != 'Cancelled' and coalesce(pi.stock_reserved, 1) = 1
			""",
			itm
		)[0][0])

		# Determine standard / latest piece price for the item:
		# Priority 1: Produced finished product cost per piece from latest Costing Batch (e.g. 52.60 for eccentric wheel 45 MM)
		batch_rate = frappe.db.sql(
			"""
			select total_cost_per_piece
			from `tabCosting Batch`
			where product=%s and docstatus < 2 and total_cost_per_piece > 0
			order by creation desc limit 1
			""",
			itm
		)
		# Priority 2: Purchased item / raw material rate from latest Purchase Entry
		pe_rate = frappe.db.sql(
			"""
			select rate
			from `tabPurchase Entry`
			where item=%s and docstatus < 2 and rate > 0
			order by posting_date desc, creation desc limit 1
			""",
			itm
		)
		# Priority 3: Previous PI item rate fallback
		pi_rate = frappe.db.sql(
			"""
			select rate
			from `tabProforma Invoice Item`
			where item=%s and rate > 0
			order by creation desc limit 1
			""",
			itm
		)

		std_rate = 0.0
		if batch_rate and batch_rate[0][0]:
			std_rate = flt(batch_rate[0][0])
		elif pe_rate and pe_rate[0][0]:
			std_rate = flt(pe_rate[0][0])
		elif pi_rate and pi_rate[0][0]:
			std_rate = flt(pi_rate[0][0])

		result[itm] = {
			"item": itm,
			"item_name": it.get("item_name") or itm,
			"uom": uom_name,
			"rate": round(std_rate, 2),
			"total_stock": tot_stock,
			"remaining_stock": rem_stock,
			"reserved_in_pi": pi_reserved,
			"available_stock": rem_stock,
		}
	return result if not item else result.get(item, {})


@frappe.whitelist()
def approve_proforma_invoice(name):
	doc = frappe.get_doc("Proforma Invoice", name)
	if doc.status == "Cancelled":
		frappe.throw("Cannot approve a cancelled Proforma Invoice.")
	doc.status = "Approved"
	doc.save()
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def convert_to_final_invoice(name):
	doc = frappe.get_doc("Proforma Invoice", name)
	if doc.status == "Cancelled":
		frappe.throw("Cannot convert a cancelled Proforma Invoice.")
	doc.status = "Invoiced"
	doc.is_invoiced = 1
	if not doc.final_invoice_no:
		last_num = frappe.db.sql(
			"""
			select max(cast(substring(final_invoice_no, 5) as unsigned))
			from `tabProforma Invoice`
			where final_invoice_no like 'INV-%'
			"""
		)[0][0] or 0
		doc.final_invoice_no = f"INV-{last_num + 1:05d}"
	if not doc.invoice_date:
		doc.invoice_date = frappe.utils.nowdate()
	doc.save()
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def update_dispatch_tracking(name, transporter_name=None, tracking_number=None, dispatch_date=None, dispatch_status="Dispatched"):
	doc = frappe.get_doc("Proforma Invoice", name)
	if doc.status == "Cancelled":
		frappe.throw("Cannot update dispatch for a cancelled invoice.")
	if transporter_name:
		doc.transporter_name = transporter_name
	if tracking_number:
		doc.tracking_number = tracking_number
	if dispatch_date:
		doc.dispatch_date = dispatch_date
	elif not doc.dispatch_date:
		doc.dispatch_date = frappe.utils.nowdate()

	doc.dispatch_status = dispatch_status or "Dispatched"
	if dispatch_status == "Delivered":
		doc.status = "Delivered"
		if not doc.delivery_date:
			doc.delivery_date = frappe.utils.nowdate()
	else:
		doc.status = "Dispatched"

	doc.save()
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def cancel_proforma_invoice(name, cancellation_reason=None):
	if not cancellation_reason:
		frappe.throw("Cancellation reason is required to cancel this Proforma Invoice / Order.")
	doc = frappe.get_doc("Proforma Invoice", name)
	if doc.status == "Cancelled":
		return doc.as_dict()

	was_invoiced = bool(doc.final_invoice_no or doc.is_invoiced)
	doc.status = "Cancelled"
	doc.cancellation_reason = cancellation_reason
	doc.cancelled_date = frappe.utils.nowdate()
	doc.stock_reserved = 0

	# If final invoice was issued, issue Credit Note
	if was_invoiced and not doc.credit_note_no:
		last_cn = frappe.db.sql(
			"""
			select max(cast(substring(credit_note_no, 4) as unsigned))
			from `tabProforma Invoice`
			where credit_note_no like 'CN-%'
			"""
		)[0][0] or 0
		doc.credit_note_no = f"CN-{last_cn + 1:05d}"

	doc.save()
	# Immediately restore stock
	sync_purchase_remaining_qty()
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def save_proforma_invoice(data):
	import json
	if isinstance(data, str):
		data = json.loads(data)

	name = data.get("name")
	if name:
		doc = frappe.get_doc("Proforma Invoice", name)
		if doc.status == "Cancelled":
			frappe.throw("Cannot modify a cancelled Proforma Invoice.")
	else:
		doc = frappe.new_doc("Proforma Invoice")
		doc.status = data.get("status") or "Pending Customer Approval"

	doc.customer_name = data.get("customer_name")
	doc.customer_phone = data.get("customer_phone")
	doc.customer_email = data.get("customer_email")
	doc.gstin = data.get("gstin")
	doc.posting_date = data.get("posting_date") or frappe.utils.today()
	doc.billing_address = data.get("billing_address")
	doc.shipping_address = data.get("shipping_address")
	doc.discount_pct = flt(data.get("discount_pct", 0.0))
	doc.discount_amount = flt(data.get("discount_amount", 0.0))
	doc.stock_reserved = 1

	doc.items = []
	for it in data.get("items", []):
		doc.append("items", {
			"item": it.get("item"),
			"item_name": it.get("item_name"),
			"qty": flt(it.get("qty")),
			"uom": it.get("uom"),
			"rate": flt(it.get("rate")),
			"discount_pct": flt(it.get("discount_pct", 0.0)),
			"tax_pct": flt(it.get("tax_pct", 18.0)),
		})

	doc.save()
	sync_purchase_remaining_qty()
	frappe.db.commit()
	return doc.as_dict()




