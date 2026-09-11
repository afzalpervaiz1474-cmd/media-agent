import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import supabase from '../lib/supabase'
import { signInWithGoogle } from '../lib/googleAuth'
import { useToast } from '../contexts/ToastContext'
import { Waves } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('demo@modulate.app')
  const [password, setPassword] = useState('demo1234!')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { push } = useToast()
  const next = params.get('next') || '/dashboard'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setLoading(false)
    if (error) { setErr(error.message); return }
    push({ kind: 'success', title: 'Welcome back' })
    nav(next, { replace: true })
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-[color:var(--color-surface-2)] border-r border-[color:var(--color-border)]">
        <div className="flex items-center gap-2"><Waves size={18} className="text-[color:var(--color-accent)]" /><span className="h-display text-lg">Modulate</span></div>
        <div>
          <blockquote className="h-display text-3xl leading-tight max-w-md">“We cut our weekly content ops from two days to two hours — without shipping fake analytics.”</blockquote>
          <div className="mt-4 text-sm text-[color:var(--color-muted)]">Aya — Head of Creator Ops, north.studio</div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="h-display text-3xl">Sign in</h1>
          <p className="text-sm text-[color:var(--color-muted)] mt-1">Use email + password or Google.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <label className="label">Email</label>
              <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Password</label>
              <input required type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && <div className="text-xs text-[color:var(--color-danger)]">{err}</div>}
            <button disabled={loading} className="btn btn-primary w-full h-10">{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="my-4 text-center text-xs text-[color:var(--color-muted)]">or</div>
          <button onClick={() => signInWithGoogle('Modulate')} className="btn btn-outline w-full h-10">Continue with Google</button>
          <div className="mt-6 text-sm text-[color:var(--color-muted)]">
            No account? <Link to="/signup" className="link">Create one</Link>
          </div>
          <div className="mt-8 text-xs text-[color:var(--color-muted)]">
            Demo credentials are prefilled. Change them if you sign up your own account.
          </div>
        </div>
      </div>
    </div>
  )
}
