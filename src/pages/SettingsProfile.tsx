import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageHeader from '../components/PageHeader'
import { useTheme } from '../contexts/ThemeContext'
import { Save } from 'lucide-react'

export default function SettingsProfile() {
  const [me, setMe] = useState<any>({ full_name: '', timezone: 'UTC' })
  const [loading, setLoading] = useState(true)
  const { push } = useToast()
  const { theme, setTheme } = useTheme()

  useEffect(() => { api.get<{ profile: any }>('/api/me').then((r)=>setMe(r.profile || me)).finally(()=>setLoading(false)) }, [])

  const save = async () => {
    try { await api.put('/api/me', me); push({ kind: 'success', title: 'Profile saved' }) }
    catch (e: any) { push({ kind: 'error', title: 'Save failed', body: e.message }) }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8">
      <PageHeader eyebrow="Account" title="Profile" description="How you appear inside Modulate." />
      {loading ? <div className="skeleton h-40"/> : (
        <div className="card card-pad space-y-4">
          <div><div className="label mb-1">Full name</div><input className="input" value={me.full_name || ''} onChange={(e)=>setMe({...me, full_name: e.target.value})} /></div>
          <div><div className="label mb-1">Email</div><input className="input" value={me.email || ''} readOnly /></div>
          <div><div className="label mb-1">Timezone</div><input className="input" value={me.timezone || ''} onChange={(e)=>setMe({...me, timezone: e.target.value})} placeholder="e.g. Europe/London" /></div>
          <div>
            <div className="label mb-1">Theme</div>
            <div className="flex gap-2">
              {(['light','dark','system'] as const).map((t) => (
                <button key={t} onClick={()=>setTheme(t)} className={`btn ${theme===t?'btn-primary':'btn-outline'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="pt-2"><button onClick={save} className="btn btn-primary"><Save size={14}/> Save changes</button></div>
        </div>
      )}
    </div>
  )
}
