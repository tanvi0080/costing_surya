import Crud from '../components/Crud'

// Product: ID, Name, Category, UoM  (doctype: Costing Item)
const cfg = {
  title: 'Products', singular: 'product', doctype: 'Costing Item',
  cols: [['name', 'ID'], ['item_name', 'Name'], ['category', 'Category'], ['uom_name', 'UoM']],
  form: [
    ['item_code', 'ID / code', 'text', { createOnly: true }],
    ['item_name', 'Name', 'text'],
    ['category', 'Category', 'link', { doctype: 'Product Category', label: 'category_name' }],
    ['uom', 'UoM', 'link', { doctype: 'Costing UOM', label: 'uom_name' }],
  ],
  defaults: () => ({ category: 'Raw Material' }),
}

export default function Products() { return <Crud cfg={cfg} /> }
