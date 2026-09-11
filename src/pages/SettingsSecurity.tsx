import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import supabase from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { KeyRound, LogOut } from 'lucide-react'

export default function SettingsSecurity() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const { push } = useToast()
  const { signOut } = useAuth()

  const changePw = async () => {
    if (pw.length < 8) { push({ kind: 'warn', title: 'Password too short', body: 'At least 8 characters' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { push({ kind: 'error', title: 'Update failed', body: error.message }); return }
    setPw(''); push({ kind: 'success', title: 'Password updated' })
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8">
      <PageHeader eyebrow="Account" title="Security" description="Passwords are hashed by Supabase Auth (bcrypt). Sessions live in secure cookies." />
      <div className="card card-pad space-y-4">
        <div>
          <div className="label mb-1">New password</div>
          <input className="input" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div className="flex gap-2">
          <button onClick={changePw} disabled={busy || !pw} className="btn btn-primary"><KeyRound size={14}/> Update password</button>
          <button onClick={signOut} className="btn btn-outline"><LogOut size={14}/> Sign out</button>
        </div>
      </div>
    </div>
  )
}
