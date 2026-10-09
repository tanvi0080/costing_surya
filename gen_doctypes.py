import json, os
MOD="costing/costing/costing"
PERM=[{"role":"System Manager","read":1,"write":1,"create":1,"delete":1,"report":1,"export":1,"print":1,"share":1,"email":1}]
def F(fn,label,ft="Data",**kw):
    d=dict(fieldname=fn,label=label,fieldtype=ft); d.update(kw); return d
SB=lambda fn,label="":F(fn,label,"Section Break")
BASE='''import frappe
from frappe.model.document import Document


class {cls}(Document):
{body}
'''
def dt(name,fields,body="\tpass",**kw):
    folder=name.lower().replace(" ","_"); cls=name.replace(" ","")
    d={"doctype":"DocType","name":name,"module":"Costing","custom":0,"engine":"InnoDB",
       "creation":"2026-10-09 10:00:00.000000","modified":"2026-10-09 10:00:00.000000",
       "field_order":[f["fieldname"] for f in fields],"fields":fields,
       "sort_field":"modified","sort_order":"DESC","states":[],
       "permissions":[] if kw.get("istable") else PERM}
    d.update(kw)
    p=f"{MOD}/doctype/{folder}"; os.makedirs(p,exist_ok=True)
    json.dump(d,open(f"{p}/{folder}.json","w"),indent=1)
    open(f"{p}/__init__.py","w").close()
    open(f"{p}/{folder}.py","w").write(BASE.format(cls=cls,body=body))

# ---------- masters ----------
dt("Costing UOM",[
 F("uom_name","Name",reqd=1,unique=1,in_list_view=1)],
 autoname="UOM-.###",title_field="uom_name",show_title_field_in_link=1,search_fields="uom_name")

dt("Costing Item",[
 F("item_code","ID",reqd=1,unique=1,in_list_view=1),
 F("item_name","Name",reqd=1,in_list_view=1),
 F("uom","UoM","Link",options="Costing UOM",reqd=1,in_list_view=1),
 F("uom_name","UoM name",fetch_from="uom.uom_name",read_only=1)],
 autoname="field:item_code",search_fields="item_name",title_field="item_name")

dt("Process",[
 F("process_name","Name",reqd=1,in_list_view=1)],
 autoname="PR-.####",title_field="process_name",show_title_field_in_link=1,search_fields="process_name")

dt("Purchase Entry",[
 F("posting_date","Date","Date",default="Today",reqd=1,in_list_view=1),
 F("supplier","Supplier",in_list_view=1),
 F("item","Product name","Link",options="Costing Item",reqd=1,in_list_view=1),
 F("item_name","Item name",fetch_from="item.item_name",read_only=1),
 F("qty","Unit","Float",reqd=1,in_list_view=1),
 F("uom","UoM","Link",options="Costing UOM",fetch_from="item.uom",read_only=1),
 F("uom_name","UoM name",fetch_from="item.uom_name",read_only=1,in_list_view=1),
 F("rate","Rate","Currency",reqd=1,in_list_view=1),
 F("amount","Total","Currency",read_only=1,in_list_view=1)],
 autoname="PE-.#####",
 body=("\tdef validate(self):\n"
  "\t\tit = frappe.db.get_value('Costing Item', self.item, ['item_name', 'uom', 'uom_name'], as_dict=True) or {}\n"
  "\t\tself.item_name, self.uom, self.uom_name = it.get('item_name'), it.get('uom'), it.get('uom_name')\n"
  "\t\tself.amount = (self.qty or 0) * (self.rate or 0)"))

# ---------- child tables ----------
dt("Costing Batch Process",[
 F("process","Process","Link",options="Process",reqd=1,in_list_view=1,columns=2),
 F("item","Product","Link",options="Costing Item",in_list_view=1,columns=2),
 F("qty","Unit","Float",in_list_view=1,columns=1),
 F("uom","UoM",read_only=1),
 F("rate","Per unit price","Currency",in_list_view=1,columns=1),
 F("total_price","Total price","Currency",read_only=1),
 F("total_output","Total output","Float",in_list_view=1,columns=1),
 F("per_output_rate","Per output rate","Float",read_only=1,precision="3"),
 F("extra_cost","Extra cost","Currency"),
 F("total_rate","Total rate / output","Float",read_only=1,in_list_view=1,precision="2",columns=1)],
 istable=1,editable_grid=1)

dt("Costing Usage Process",[
 F("process","Process","Link",options="Process",reqd=1,in_list_view=1,columns=2),
 F("item","Product","Link",options="Costing Item",in_list_view=1,columns=2),
 F("usage_per_output","Usage / output","Float",in_list_view=1,columns=1,precision="6"),
 F("unit_price","Unit price","Currency",in_list_view=1,columns=1),
 F("total_per_output","Total / output","Float",read_only=1,precision="4"),
 F("extra_cost","Extra","Currency"),
 F("total_rate","Total rate / output","Float",read_only=1,in_list_view=1,precision="2",columns=1)],
 istable=1,editable_grid=1)

dt("Costing Charge",[
 F("charge","Charge",reqd=1,in_list_view=1,columns=3),
 F("amount","Amount (per period)","Currency",in_list_view=1,columns=2),
 F("qty","Qty (pieces)","Float",default="1",in_list_view=1,columns=2),
 F("cost_per_piece","Cost per piece","Float",read_only=1,in_list_view=1,precision="2",columns=2)],
 istable=1,editable_grid=1)

# ---------- main doctype ----------
BATCH_CODE='''import frappe
from frappe.model.document import Document
from frappe.utils import flt
from costing.api import get_purchase_rate


def reject(x, pct, method):
\tpct = flt(pct)
\tif method == "Divide by yield":
\t\treturn x / (1 - pct / 100) if pct < 100 else x
\treturn x * (1 + pct / 100)


class CostingBatch(Document):
\tdef validate(self):
\t\tself.fetch_rates()
\t\tself.calculate()

\tdef fetch_rates(self):
\t\tif self.rate_basis == "Manual":
\t\t\treturn
\t\tfor table, key in (("batch_processes", "rate"), ("usage_processes", "unit_price")):
\t\t\tfor row in self.get(table):
\t\t\t\tif not row.item:
\t\t\t\t\tcontinue
\t\t\t\trow.uom = frappe.db.get_value("Costing Item", row.item, "uom_name") if table == "batch_processes" else None
\t\t\t\trate = get_purchase_rate(row.item, self.rate_basis)
\t\t\t\tif rate:
\t\t\t\t\trow.set(key, rate)

\tdef calculate(self):
\t\tmat = 0
\t\tfor r in self.batch_processes:
\t\t\tr.total_price = flt(r.qty) * flt(r.rate)
\t\t\tr.per_output_rate = r.total_price / flt(r.total_output) if flt(r.total_output) else 0
\t\t\tr.total_rate = r.per_output_rate + flt(r.extra_cost)
\t\t\tmat += r.total_rate
\t\tfor r in self.usage_processes:
\t\t\tr.total_per_output = flt(r.usage_per_output) * flt(r.unit_price)
\t\t\tr.total_rate = r.total_per_output + flt(r.extra_cost)
\t\t\tmat += r.total_rate
\t\tfor r in list(self.labour_charges) + list(self.machine_charges):
\t\t\tr.cost_per_piece = flt(r.amount) / flt(r.qty) if flt(r.qty) else 0

\t\tm = self.rejection_method
\t\tself.materials_total = mat
\t\tself.after_material_rejection = reject(mat, self.material_rejection_pct, m)
\t\tself.labour_total = sum(flt(r.cost_per_piece) for r in self.labour_charges)
\t\tself.after_labour_rejection = reject(self.after_material_rejection + self.labour_total, self.labour_rejection_pct, m)
\t\tself.machine_total = sum(flt(r.cost_per_piece) for r in self.machine_charges)
\t\tself.total_cost_per_piece = reject(self.after_labour_rejection + self.machine_total, self.machine_rejection_pct, m)
'''
dt("Costing Batch",[
 F("product","Product name","Link",options="Costing Item",reqd=1,in_list_view=1,in_standard_filter=1),
 F("product_name","Product title",fetch_from="product.item_name",read_only=1,in_list_view=1),
 F("batch_date","Batch date","Date",default="Today",reqd=1,in_list_view=1),
 F("cb1","",  "Column Break"),
 F("rejection_method","Rejection method","Select",options="Add % on top\nDivide by yield",default="Add % on top"),
 F("rate_basis","Rate from purchase entry","Select",options="Latest Purchase\nWeighted Average\nManual",default="Latest Purchase"),
 SB("sb_mat","1. Process with batch purchase"),
 F("batch_processes","Batch purchase processes","Table",options="Costing Batch Process"),
 SB("sb_use","2. Process with known usage per piece"),
 F("usage_processes","Usage per piece processes","Table",options="Costing Usage Process"),
 F("material_rejection_pct","Material rejection %","Float"),
 SB("sb_lab","3. Labour & light charges"),
 F("labour_charges","Labour & light charges","Table",options="Costing Charge"),
 F("labour_rejection_pct","Labour & light rejection %","Float"),
 SB("sb_mac","4. Machine, chemical, tooling & grinding"),
 F("machine_charges","Machine charges","Table",options="Costing Charge"),
 F("machine_rejection_pct","Machine & tooling rejection %","Float"),
 SB("sb_res","Cost build-up per piece"),
 F("materials_total","Materials & processes total","Currency",read_only=1),
 F("after_material_rejection","After material rejection","Currency",read_only=1),
 F("labour_total","+ Labour & light charges","Currency",read_only=1),
 F("after_labour_rejection","After labour & light rejection","Currency",read_only=1),
 F("cb2","","Column Break"),
 F("machine_total","+ Machine & tooling charges","Currency",read_only=1),
 F("total_cost_per_piece","Total production cost per piece","Currency",read_only=1,bold=1,in_list_view=1),
 ],body=None,autoname="CB-.#####",title_field="product_name",track_changes=1)
# overwrite controller with full code
open(f"{MOD}/doctype/costing_batch/costing_batch.py","w").write(BATCH_CODE)
