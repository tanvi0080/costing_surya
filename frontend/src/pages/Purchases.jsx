import Crud from '../components/Crud'
import { fmt, n } from '../calc'

// Purchase: ID, Product name, Supplier / Source, How Many Piece / Unit, UoM, Per Piece Price, Total Amount (doctype: Purchase Entry)
const cfg = {
  title: 'Purchases', singular: 'purchase', doctype: 'Purchase Entry',
  cols: [
    ['name', 'ID'],
    ['posting_date', 'Date', 'date'],
    ['item_name', 'Product name'],
    ['supplier', 'Supplier / Source'],
    ['qty', 'Piece / Unit', 'qty'],
    ['used_qty', 'Used', 'qty'],
    ['remaining_qty', 'Remaining', 'qty'],
    ['uom_name', 'UoM'],
    ['rate', 'Per Piece Price / Rate', 'num'],
    ['amount', 'Total Amount', 'num'],
  ],
  form: [
    ['posting_date', 'Date', 'date'],
    ['supplier', 'Supplier / Source', 'text'],
    ['item', 'Product name', 'link', { doctype: 'Costing Item', label: 'item_name', also: 'uom_name' }],
    ['qty', 'How Many Piece / Unit', 'number'],
    ['rate', 'Per Piece Price / Rate', 'number'],
  ],
  defaults: () => ({ posting_date: new Date().toISOString().slice(0, 10) }),
  derived: [
    ['UoM', (f, l) => l.item?.find((x) => x.name === f.item)?.uom_name || '—'],
    ['Total Amount', (f) => fmt(n(f.qty) * n(f.rate))],
  ],
}

export default function Purchases() { return <Crud cfg={cfg} /> }
