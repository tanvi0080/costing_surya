import frappe
from frappe.model.document import Document
from frappe.utils import flt
from costing.api import get_purchase_rate


def reject(x, pct, method):
	pct = flt(pct)
	if method == "Divide by yield":
		return x / (1 - pct / 100) if pct < 100 else x
	return x * (1 + pct / 100)


class CostingBatch(Document):
	def validate(self):
		self.fetch_rates()
		self.calculate()

	def fetch_rates(self):
		for table, key in (("batch_processes", "rate"), ("usage_processes", "unit_price")):
			for row in self.get(table):
				if not row.item:
					continue
				it = frappe.db.get_value("Costing Item", row.item, ["uom", "uom_name"], as_dict=True) or {}
				item_uom = it.get("uom_name") or (frappe.db.get_value("Costing UOM", it.get("uom"), "uom_name") if it.get("uom") else "") or ""
				if not row.uom:
					if table == "usage_processes" and item_uom.upper() == "KG":
						row.uom = "GM"
					else:
						row.uom = item_uom
				if not row.get(key):
					rate = get_purchase_rate(row.item, "Latest Purchase")
					if rate:
						row.set(key, rate)

	def calculate(self):
		mat = 0
		for r in self.batch_processes:
			r.total_price = flt(r.qty) * flt(r.rate)
			r.per_output_rate = r.total_price / flt(r.total_output) if flt(r.total_output) else 0
			r.total_rate = r.per_output_rate + flt(r.extra_cost)
			mat += r.total_rate
		for r in self.usage_processes:
			total_consumed = flt(r.usage_per_output) * flt(self.output_qty or 1)
			r.total_usage = total_consumed
			uom = (r.uom or "").strip().upper()
			if uom == "GM":
				r.used_kg = total_consumed / 1000.0
			else:
				r.used_kg = total_consumed
			stock = flt(frappe.db.sql("select coalesce(sum(qty), 0) from `tabPurchase Entry` where item=%s", r.item)[0][0]) if r.item else 0
			r.remaining_stock = max(0.0, stock - flt(r.used_kg))
			r.total_per_output = flt(r.usage_per_output) * flt(r.unit_price)
			r.total_rate = r.total_per_output + flt(r.extra_cost)
			mat += r.total_rate
		for r in list(self.labour_charges) + list(self.machine_charges):
			r.cost_per_piece = flt(r.amount) / flt(r.qty) if flt(r.qty) else 0

		# Extra charges calculation
		extra_tot = 0
		for r in self.get("extra_charges") or []:
			r.cost_per_piece = flt(r.cost_per_piece) or (flt(r.amount) / flt(r.qty) if flt(r.qty) else 0)
			rej = flt(r.rejection_pct)
			r.total_cost = reject(r.cost_per_piece, rej, self.rejection_method)
			extra_tot += flt(r.total_cost)
		self.extra_charges_total = extra_tot

		m = self.rejection_method
		self.materials_total = mat
		self.after_material_rejection = reject(mat, self.material_rejection_pct, m)
		self.labour_total = sum(flt(r.cost_per_piece) for r in self.labour_charges)
		self.after_labour_rejection = reject(self.after_material_rejection + self.labour_total, self.labour_rejection_pct, m)
		self.machine_total = sum(flt(r.cost_per_piece) for r in self.machine_charges)
		self.total_cost_per_piece = reject(self.after_labour_rejection + self.machine_total, self.machine_rejection_pct, m) + extra_tot
		self.total_batch_amount = flt(self.output_qty or 1) * flt(self.total_cost_per_piece)

	def on_update(self):
		from costing.api import sync_purchase_remaining_qty
		if self.purchase_entry and frappe.db.exists("Purchase Entry", self.purchase_entry):
			pe = frappe.get_doc("Purchase Entry", self.purchase_entry)
			pe.posting_date = self.batch_date
			pe.item = self.product
			it = frappe.db.get_value("Costing Item", self.product, ["item_name", "uom", "uom_name"], as_dict=True) or {}
			pe.item_name = it.get("item_name")
			pe.uom = it.get("uom")
			pe.uom_name = it.get("uom_name") or (frappe.db.get_value("Costing UOM", pe.uom, "uom_name") if pe.uom else None)
			pe.qty = flt(self.output_qty) or 1.0
			pe.rate = flt(self.total_cost_per_piece)
			pe.amount = flt(pe.qty) * flt(pe.rate)
			pe.supplier = f"In-house Production ({self.name})"
			pe.save()
		sync_purchase_remaining_qty()

	def on_trash(self):
		from costing.api import sync_purchase_remaining_qty
		sync_purchase_remaining_qty()

