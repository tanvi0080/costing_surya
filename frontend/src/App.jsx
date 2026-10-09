import { useEffect, useState } from 'react'
import * as api from './api'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import Batches from './pages/Batches'
import BatchEditor from './pages/BatchEditor'
import Products from './pages/Products'
import Processes from './pages/Processes'
import Purchases from './pages/Purchases'
import Uoms from './pages/Uoms'

const NAV = [['dashboard', 'Dashboard'], ['batches', 'Batches'], ['products', 'Products'], ['processes', 'Processes'], ['purchases', 'Purchases'], ['uoms', 'UoM']]

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking session
  const [page, setPage] = useState('dashboard')
  const [batch, setBatch] = useState(null)

  useEffect(() => { api.session().then((s) => setUser(s?.user ? s : null)).catch(() => setUser(null)) }, [])
  if (user === undefined) return <div className="login-wrap"><p className="muted">Loading…</p></div>
  if (!user) return <Login onLogin={setUser} />

  const open = (n) => { setBatch(n); setPage('editor') }
  const active = page === 'editor' ? 'batches' : page
  return (
    <div className="shell">
      <aside className="side">
        <strong className="brand">Product costing</strong>
        <nav>{NAV.map(([k, l]) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setPage(k)}>{l}</button>)}</nav>
        <div className="side-foot">
          <span className="muted">{user.full_name || user.user}</span>
          <button className="btn ghost" onClick={() => api.logout().then(() => setUser(null))}>Sign out</button>
        </div>
      </aside>
      <main>
        {page === 'dashboard' && <Dashboard onNav={setPage} onOpen={open} />}
        {page === 'batches' && <Batches onOpen={open} />}
        {page === 'editor' && <BatchEditor key={batch} name={batch} onBack={() => setPage('batches')} />}
        {page === 'products' && <Products />}
        {page === 'processes' && <Processes />}
        {page === 'purchases' && <Purchases />}
        {page === 'uoms' && <Uoms />}
      </main>
    </div>
  )
}
