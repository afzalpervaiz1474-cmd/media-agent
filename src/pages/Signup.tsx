import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import supabase from '../lib/supabase'
import { signInWithGoogle } from '../lib/googleAuth'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { Waves } from 'lucide-react'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()
  const { push } = useToast()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setLoading(true)
    const cleanEmail = email.trim().toLowerCase()
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); setLoading(false); return }
    const { error } = await supabase.auth.signUp({
      email: cleanEmail, password,
      options: { data: { full_name: name } },
    })
    if (error) { setErr(error.message); setLoading(false); return }
    // Ensure profile row is created; api/me uses the verified auth token to derive identity.
    try { await api.post('/api/me', { full_name: name }) } catch { /* server logs; safe to ignore */ }
    setLoading(false)
    push({ kind: 'success', title: 'Account created', body: 'Signed you in.' })
    nav('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-[color:var(--color-surface-2)] border-r border-[color:var(--color-border)]">
        <div className="flex items-center gap-2"><Waves size={18} className="text-[color:var(--color-accent)]" /><span className="h-display text-lg">Modulate</span></div>
        <div>
          <h2 className="h-display text-3xl leading-tight max-w-md">One workspace for every platform you ship to.</h2>
          <p className="mt-4 text-sm text-[color:var(--color-muted)] max-w-md">Bring your own OAuth apps. We store tokens encrypted at rest and never surface them to the browser.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="h-display text-3xl">Create account</h1>
          <p className="text-sm text-[color:var(--color-muted)] mt-1">Free while in beta.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="label">Name</label>
              <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1">
              <label className="label">Work email</label>
              <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
            </div>
            <div className="space-y-1">
              <label className="label">Password</label>
              <input required type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            {err && <div className="text-xs text-[color:var(--color-danger)]">{err}</div>}
            <button disabled={loading} className="btn btn-primary w-full h-10">{loading ? 'Creating…' : 'Create account'}</button>
          </form>
          <div className="my-4 text-center text-xs text-[color:var(--color-muted)]">or</div>
          <button onClick={() => signInWithGoogle('Modulate')} className="btn btn-outline w-full h-10">Continue with Google</button>
          <div className="mt-6 text-sm text-[color:var(--color-muted)]">Have an account? <Link to="/login" className="link">Sign in</Link></div>
        </div>
      </div>
    </div>
  )
}
