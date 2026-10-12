import frappe
from frappe.model.document import Document


class CostingItem(Document):
	def validate(self):
		if self.uom:
			self.uom_name = frappe.db.get_value("Costing UOM", self.uom, "uom_name") or self.uom
