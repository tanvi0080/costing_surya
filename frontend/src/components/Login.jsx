import { useState } from 'react'
import * as api from '../api'

export default function Login({ onLogin }) {
  const [usr, setUsr] = useState('Administrator')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try { onLogin(await api.login(usr, pwd)) }
    catch (ex) { setErr(ex.message || 'Login failed') }
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Product costing</h1>
        <p className="muted">Sign in with your Frappe account.</p>
        <label>Username</label>
        <input value={usr} onChange={(e) => setUsr(e.target.value)} autoComplete="username" />
        <label>Password</label>
        <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" autoFocus />
        {err && <div className="alert">{err}</div>}
        <button className="btn primary" disabled={busy || !pwd}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
