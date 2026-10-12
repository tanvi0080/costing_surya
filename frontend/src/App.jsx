import { useEffect, useState } from 'react'
import * as api from './api'
import Login from './components/Login'
import Dashboard from './pages/Dashboard'
import Batches from './pages/Batches'
import BatchEditor from './pages/BatchEditor'
import Products from './pages/Products'
import Categories from './pages/Categories'
import Processes from './pages/Processes'
import Purchases from './pages/Purchases'
import Uoms from './pages/Uoms'
import ProformaInvoices from './pages/ProformaInvoices'
import { useAppStore } from './store/useAppStore'
import MuiProvider from './components/MuiProvider'
import { initGlobalKeyboardNav } from './utils/keyboardNav'

const NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    key: 'batches',
    label: 'Batches',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
        <path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5" />
        <path d="m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5" />
      </svg>
    ),
  },
  {
    key: 'invoices',
    label: 'Invoices & Dispatch',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    key: 'products',
    label: 'Products',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7.5 4.27 9 5.15" />
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
  {
    key: 'categories',
    label: 'Categories',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h16" />
        <path d="M4 15h16" />
        <path d="M10 3L8 21" />
        <path d="M16 3l-2 18" />
      </svg>
    ),
  },
  {
    key: 'processes',
    label: 'Processes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4" />
        <path d="m16.2 7.8 2.9-2.9" />
        <path d="M18 12h4" />
        <path d="m16.2 16.2 2.9 2.9" />
        <path d="M12 18v4" />
        <path d="m4.9 19.1 2.9-2.9" />
        <path d="M2 12h4" />
        <path d="m4.9 4.9 2.9 2.9" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: 'purchases',
    label: 'Purchases',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
    ),
  },
  {
    key: 'uoms',
    label: 'UOM',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.12 6.4-6.05-4.06a2 2 0 0 0-2.17-.05L2.95 8.41a2 2 0 0 0-.95 1.7v5.78a2 2 0 0 0 .95 1.7l6.05 4.06a2 2 0 0 0 2.17.05l9.95-6.12a2 2 0 0 0 .95-1.7V8.1a2 2 0 0 0-.95-1.7Z" />
        <path d="m10 22-8-5.3" />
        <path d="M10 12v10" />
        <path d="M10 12 2 6.7" />
        <path d="M10 12l11.5-7.1" />
      </svg>
    ),
  },
]

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking session
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const batch = useAppStore((s) => s.batch)
  const openBatch = useAppStore((s) => s.openBatch)
  const goBack = useAppStore((s) => s.goBack)

  const [theme, setTheme] = useState(() => localStorage.getItem('costing_theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('costing_theme', theme)
  }, [theme])

  useEffect(() => {
    api.session().then((s) => setUser(s?.user ? s : null)).catch(() => setUser(null))
  }, [])

  // Initialize global keyboard navigation (ESC: go back/close modal, ArrowRight: advance field)
  useEffect(() => {
    const cleanup = initGlobalKeyboardNav()
    return cleanup
  }, [])

  if (user === undefined) return <div className="login-wrap"><p className="muted">Loading…</p></div>
  if (!user) return <Login onLogin={setUser} />

  const open = (n) => openBatch(n)
  const active = page === 'editor' ? 'batches' : page

  return (
    <MuiProvider themeMode={theme}>
      <div className="shell" data-theme={theme}>
        <aside className="side">
          {/* Unique SuryaCLS Brand Logo */}
          <div className="brand-wrap">
            <div className="brand-emblem">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <defs>
                  <linearGradient id="suryaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
                <circle cx="16" cy="16" r="6.5" fill="url(#suryaGrad)" />
                <g stroke="url(#suryaGrad)" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="16" y1="2" x2="16" y2="5" />
                  <line x1="16" y1="27" x2="16" y2="30" />
                  <line x1="2" y1="16" x2="5" y2="16" />
                  <line x1="27" y1="16" x2="30" y2="16" />
                  <line x1="6.1" y1="6.1" x2="8.3" y2="8.3" />
                  <line x1="23.7" y1="23.7" x2="25.9" y2="25.9" />
                  <line x1="6.1" y1="25.9" x2="8.3" y2="23.7" />
                  <line x1="23.7" y1="8.3" x2="25.9" y2="6.1" />
                </g>
              </svg>
            </div>
            <div className="brand-info">
              <span className="brand-name">
                <span className="surya-title">Surya</span>
                <span className="cls-badge">CLS</span>
              </span>
              <span className="brand-tagline">Manufacturing </span>
            </div>
          </div>

          {/* Navigation with icons */}
          <nav>
            {NAV.map((item) => (
              <button
                key={item.key}
                className={active === item.key ? 'on' : ''}
                onClick={() => setPage(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Sidebar Footer with Shortcuts Hint, Theme, Administrator Badge & Red Signout */}
          <div className="side-foot">
            {/* Keyboard Shortcuts Hint */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.03)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--muted)',
              marginBottom: 8,
              border: '1px dashed var(--line)'
            }}>
              <span><kbd style={{ background: 'var(--panel)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--line)', fontWeight: 600 }}>ESC</kbd> Back</span>
              <span>•</span>
              <span><kbd style={{ background: 'var(--panel)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--line)', fontWeight: 600 }}>→</kbd> Next Field</span>
            </div>

            <div className="theme-picker">
              <label className="theme-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span>Theme</span>
              </label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="light">⚪ White Base</option>
                <option value="dark">🌑 Dark Slate</option>
                <option value="emerald">🌲 Emerald Green</option>
                <option value="indigo">🔮 Royal Indigo</option>
                <option value="sunset">🌅 Sunset Amber</option>
              </select>
            </div>

            {/* Administrator User Badge with Icon */}
            <div className="user-profile-badge">
              <div className="user-avatar">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="user-details">
                <span className="user-name">{user.full_name || user.user}</span>
                <span className="user-role">Administrator</span>
              </div>
              <span className="user-status-dot" title="Active Session" />
            </div>

            {/* Sign Out Button in Red */}
            <button
              type="button"
              className="btn btn-signout"
              onClick={() => api.logout().then(() => setUser(null))}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        <main>
          {page === 'dashboard' && <Dashboard onNav={setPage} onOpen={open} />}
          {page === 'batches' && <Batches onOpen={open} />}
          {page === 'editor' && <BatchEditor key={batch} name={batch} onBack={goBack} />}
          {page === 'invoices' && <ProformaInvoices />}
          {page === 'products' && <Products />}
          {page === 'categories' && <Categories />}
          {page === 'processes' && <Processes />}
          {page === 'purchases' && <Purchases />}
          {page === 'uoms' && <Uoms />}
        </main>
      </div>
    </MuiProvider>
  )
}
