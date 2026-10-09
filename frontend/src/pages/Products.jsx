import Crud from '../components/Crud'

// Product: ID, Name, UoM  (doctype: Costing Item)
const cfg = {
  title: 'Products', singular: 'product', doctype: 'Costing Item',
  cols: [['name', 'ID'], ['item_name', 'Name'], ['uom_name', 'UoM']],
  form: [
    ['item_code', 'ID / code', 'text', { createOnly: true }],
    ['item_name', 'Name', 'text'],
    ['uom', 'UoM', 'link', { doctype: 'Costing UOM', label: 'uom_name' }],
  ],
}

export default function Products() { return <Crud cfg={cfg} /> }
