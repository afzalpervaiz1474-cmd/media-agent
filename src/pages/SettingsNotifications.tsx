import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import { Bell, CheckCircle2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

export default function SettingsNotifications() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { push } = useToast()

  const load = () => { setLoading(true); api.get<{ items: any[] }>('/api/notifications').then((r)=>setItems(r.items||[])).finally(()=>setLoading(false)) }
  useEffect(load, [])

  const markAll = async () => { await api.post('/api/notifications', { action: 'mark_all_read' }); push({ kind: 'success', title: 'Marked all as read' }); load() }
  const mark = async (id: string) => { await api.put(`/api/notifications`, { id, read: true }); load() }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8">
      <PageHeader eyebrow="Account" title="Notifications" description="In-app events from jobs, approvals, and automations." actions={<button className="btn btn-outline" onClick={markAll}><CheckCircle2 size={14}/> Mark all read</button>} />
      <div className="card">
        {loading ? <div className="p-6 space-y-2">{[0,1,2].map((i)=>(<div key={i} className="skeleton h-10"/>))}</div> : items.length === 0 ? (
          <div className="p-8"><EmptyState icon={<Bell size={22}/>} title="You’re all caught up" description="Job completions and approval requests will land here." /></div>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className="p-4 border-b border-[color:var(--color-border)] last:border-0 flex items-start gap-3">
                <div className={`h-2 w-2 rounded-full mt-2 ${n.read_at?'bg-[color:var(--color-border-strong)]':'bg-[color:var(--color-accent)]'}`}/>
                <div className="flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-[color:var(--color-muted)] mt-0.5">{n.body}</div>}
                  <div className="text-[10px] text-[color:var(--color-muted)] mt-1 font-mono">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read_at && <button onClick={()=>mark(n.id)} className="btn btn-ghost text-xs">Mark read</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
