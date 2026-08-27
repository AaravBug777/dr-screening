import { useState } from 'react'
import { motion } from 'framer-motion'
import RetinaEye from './RetinaEye'

const API_BASE = '/api'

/**
 * Operator login gate. Sessions are a signed HttpOnly cookie (backend/auth.py)
 * -- this component only needs to POST credentials and re-check; it never
 * touches the token itself. `credentials: 'include'` on every fetch here and
 * throughout the app is what makes the cookie actually get sent/stored
 * cross-port (Vite dev server on :5173, API on :8000).
 */
export default function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Login failed.')
      }
      const operator = await res.json()
      onLoggedIn(operator)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong signing in.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-scope-bg px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <RetinaEye className="w-7 h-7 text-scope-textInverse opacity-90" />
          <span className="font-display text-2xl text-scope-textInverse">Netra</span>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/95 rounded-2xl border border-scope-line p-6 space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-scope-text/40 mb-1">Operator sign-in</p>
            <p className="font-body text-xs text-scope-text/50">Screening results are tied to your operator account for this clinic's history.</p>
          </div>

          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-scope-text/50 block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full rounded-lg border border-scope-line px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-scope-accent/40"
            />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-scope-text/50 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-scope-line px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-scope-accent/40"
            />
          </div>

          {status === 'error' && (
            <p className="font-body text-xs text-scope-accent">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-lg bg-scope-bg text-scope-textInverse font-body text-sm py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === 'submitting' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
