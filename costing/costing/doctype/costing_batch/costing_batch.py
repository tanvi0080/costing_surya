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
		if self.rate_basis == "Manual":
			return
		for table, key in (("batch_processes", "rate"), ("usage_processes", "unit_price")):
			for row in self.get(table):
				if not row.item:
					continue
				row.uom = frappe.db.get_value("Costing Item", row.item, "uom_name") if table == "batch_processes" else None
				rate = get_purchase_rate(row.item, self.rate_basis)
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
			r.total_per_output = flt(r.usage_per_output) * flt(r.unit_price)
			r.total_rate = r.total_per_output + flt(r.extra_cost)
			mat += r.total_rate
		for r in list(self.labour_charges) + list(self.machine_charges):
			r.cost_per_piece = flt(r.amount) / flt(r.qty) if flt(r.qty) else 0

		m = self.rejection_method
		self.materials_total = mat
		self.after_material_rejection = reject(mat, self.material_rejection_pct, m)
		self.labour_total = sum(flt(r.cost_per_piece) for r in self.labour_charges)
		self.after_labour_rejection = reject(self.after_material_rejection + self.labour_total, self.labour_rejection_pct, m)
		self.machine_total = sum(flt(r.cost_per_piece) for r in self.machine_charges)
		self.total_cost_per_piece = reject(self.after_labour_rejection + self.machine_total, self.machine_rejection_pct, m)
