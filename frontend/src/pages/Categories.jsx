import Crud from '../components/Crud'

// Product Category: ID, Category Name  (doctype: Product Category)
const cfg = {
  title: 'Categories',
  singular: 'category',
  doctype: 'Product Category',
  cols: [['name', 'Category Name']],
  form: [['category_name', 'Category Name', 'text']],
}

export default function Categories() {
  return <Crud cfg={cfg} />
}
