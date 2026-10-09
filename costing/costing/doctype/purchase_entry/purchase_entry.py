import frappe
from frappe.model.document import Document


from frappe.utils import flt


class PurchaseEntry(Document):
	def validate(self):
		it = frappe.db.get_value('Costing Item', self.item, ['item_name', 'uom', 'uom_name'], as_dict=True) or {}
		self.item_name, self.uom, self.uom_name = it.get('item_name'), it.get('uom'), it.get('uom_name')
		self.amount = flt(self.qty) * flt(self.rate)

