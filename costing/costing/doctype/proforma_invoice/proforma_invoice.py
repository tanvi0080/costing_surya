import frappe
from frappe.model.document import Document
from frappe.utils import flt, nowdate


class ProformaInvoice(Document):
	def validate(self):
		self.calculate_totals()
		self.handle_status_flags()

	def calculate_totals(self):
		subtotal = 0.0
		total_tax = 0.0
		for item in self.items or []:
			if item.item and not item.item_name:
				item.item_name = frappe.db.get_value("Costing Item", item.item, "item_name") or item.item
			if item.item and not item.uom:
				item.uom = frappe.db.get_value("Costing Item", item.item, "uom_name") or ""
			qty = flt(item.qty)
			rate = flt(item.rate)
			disc_pct = flt(getattr(item, "discount_pct", 0.0))
			base_amount = qty * rate
			item_disc = base_amount * (disc_pct / 100.0)
			amount = base_amount - item_disc
			tax_pct = flt(item.tax_pct) if item.tax_pct is not None else 18.0
			tax_amt = amount * (tax_pct / 100.0)
			tot = amount + tax_amt
			item.amount = amount
			item.discount_pct = disc_pct
			item.tax_pct = tax_pct
			item.tax_amount = tax_amt
			item.total_amount = tot
			subtotal += amount
			total_tax += tax_amt

		# Invoice-level overall discount if specified
		inv_disc_pct = flt(getattr(self, "discount_pct", 0.0))
		inv_disc_amt = flt(getattr(self, "discount_amount", 0.0))
		if inv_disc_pct > 0 and inv_disc_amt == 0.0:
			inv_disc_amt = subtotal * (inv_disc_pct / 100.0)

		taxable_amount = max(0.0, subtotal - inv_disc_amt)
		if subtotal > 0 and inv_disc_amt > 0:
			tax_ratio = taxable_amount / subtotal
			total_tax = total_tax * tax_ratio

		self.subtotal = subtotal
		self.discount_amount = inv_disc_amt
		self.tax_amount = total_tax
		self.grand_total = taxable_amount + total_tax

	def handle_status_flags(self):
		if self.status == "Cancelled":
			self.stock_reserved = 0
			if not self.cancelled_date:
				self.cancelled_date = nowdate()
		else:
			self.stock_reserved = 1

		if self.status in ("Invoiced", "Dispatched", "Delivered"):
			self.is_invoiced = 1
			if not self.final_invoice_no:
				# Generate sequential Tax Invoice Number: INV-00001
				last_num = frappe.db.sql(
					"""
					select max(cast(substring(final_invoice_no, 5) as unsigned))
					from `tabProforma Invoice`
					where final_invoice_no like 'INV-%'
					"""
				)[0][0] or 0
				self.final_invoice_no = f"INV-{last_num + 1:05d}"
				if not self.invoice_date:
					self.invoice_date = nowdate()

		if self.status == "Dispatched" and not self.dispatch_status:
			self.dispatch_status = "Dispatched"
		elif self.status == "Delivered" and self.dispatch_status != "Delivered":
			self.dispatch_status = "Delivered"

	def on_update(self):
		from costing.api import sync_purchase_remaining_qty
		sync_purchase_remaining_qty()

	def on_trash(self):
		from costing.api import sync_purchase_remaining_qty
		sync_purchase_remaining_qty()
