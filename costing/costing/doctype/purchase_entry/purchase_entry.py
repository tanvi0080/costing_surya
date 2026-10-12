import frappe
from frappe.model.document import Document


from frappe.utils import flt


class PurchaseEntry(Document):
	def validate(self):
		it = frappe.db.get_value('Costing Item', self.item, ['item_name', 'uom', 'uom_name'], as_dict=True) or {}
		self.item_name = it.get('item_name')
		self.uom = it.get('uom')
		self.uom_name = it.get('uom_name') or (frappe.db.get_value("Costing UOM", self.uom, "uom_name") if self.uom else None)
		self.amount = flt(self.qty) * flt(self.rate)
		if self.remaining_qty is None:
			self.remaining_qty = self.qty

	def on_update(self):
		from costing.api import sync_purchase_remaining_qty
		sync_purchase_remaining_qty(self.item)

	def on_trash(self):
		from costing.api import sync_purchase_remaining_qty
		sync_purchase_remaining_qty(self.item)

