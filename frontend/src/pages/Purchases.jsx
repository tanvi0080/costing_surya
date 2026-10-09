import Crud from '../components/Crud'
import { fmt, n } from '../calc'

// Purchase: ID, Product name, Unit, UoM, Rate, Total  (doctype: Purchase Entry)
const cfg = {
  title: 'Purchases', singular: 'purchase', doctype: 'Purchase Entry',
  cols: [['name', 'ID'], ['item_name', 'Product name'], ['qty', 'Unit', 'int'], ['uom_name', 'UoM'], ['rate', 'Rate', 'num'], ['amount', 'Total', 'num']],
  form: [
    ['posting_date', 'Date', 'date'],
    ['supplier', 'Supplier', 'text'],
    ['item', 'Product name', 'link', { doctype: 'Costing Item', label: 'item_name', also: 'uom_name' }],
    ['qty', 'Unit', 'number'],
    ['rate', 'Rate', 'number'],
  ],
  defaults: () => ({ posting_date: new Date().toISOString().slice(0, 10) }),
  derived: [
    ['UoM', (f, l) => l.item?.find((x) => x.name === f.item)?.uom_name || '—'],
    ['Total', (f) => fmt(n(f.qty) * n(f.rate))],
  ],
}

export default function Purchases() { return <Crud cfg={cfg} /> }
