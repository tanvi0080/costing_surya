import Crud from '../components/Crud'

// UoM: ID, Name  (doctype: Costing UOM)
const cfg = {
  title: 'UOM', singular: 'UoM', doctype: 'Costing UOM',
  cols: [['name', 'ID'], ['uom_name', 'Name']],
  form: [['uom_name', 'Name', 'text']],
}

export default function Uoms() { return <Crud cfg={cfg} /> }
