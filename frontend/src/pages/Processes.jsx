import Crud from '../components/Crud'

// Process: ID, Name  (doctype: Process)
const cfg = {
  title: 'Processes', singular: 'process', doctype: 'Process',
  cols: [['name', 'ID'], ['process_name', 'Name']],
  form: [['process_name', 'Name', 'text']],
}

export default function Processes() { return <Crud cfg={cfg} /> }
