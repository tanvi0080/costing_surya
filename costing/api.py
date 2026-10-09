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
def get_purchase_rate(item, basis="Latest Purchase"):
	"""Unit price of an item taken from Purchase Entry records."""
	if not item:
		return 0
	if basis == "Weighted Average":
		amount, qty = frappe.db.sql(
			"select coalesce(sum(amount),0), coalesce(sum(qty),0) from `tabPurchase Entry` where item=%s",
			item,
		)[0]
		return flt(amount) / flt(qty) if flt(qty) else 0
	return flt(
		frappe.db.get_value(
			"Purchase Entry", {"item": item}, "rate", order_by="posting_date desc, creation desc"
		)
	)
