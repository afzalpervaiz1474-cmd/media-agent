import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import { useToast } from '../contexts/ToastContext'
import { Workflow, Plus, Play, Pause, PlayCircle, Trash2 } from 'lucide-react'

export default function Automations() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { push } = useToast()

  const load = () => { setLoading(true); api.get<{ items: any[] }>(`/api/automations`).then((r)=>setItems(r.items||[])).finally(()=>setLoading(false)) }
  useEffect(load, [])

  const toggle = async (a: any) => {
    const status = a.status === 'active' ? 'paused' : 'active'
    await api.put(`/api/automations/${a.id}`, { status })
    push({ kind: 'success', title: `Automation ${status}` })
    load()
  }
  const run = async (a: any) => {
    try {
      const r = await api.post<{ job: any }>(`/api/automations/${a.id}/run`, {})
      push({ kind: 'success', title: 'Run queued', body: `Job ${r.job.id.slice(0,8)}` })
    } catch (e: any) { push({ kind: 'error', title: 'Run failed', body: e.message }) }
    load()
  }
  const remove = async (a: any) => {
    if (!confirm(`Delete automation "${a.name}"?`)) return
    await api.del(`/api/automations/${a.id}`); push({ kind: 'success', title: 'Deleted' }); load()
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Automation"
        title="Automations"
        description="Multi-step pipelines: Trigger → AI → Media → Validate → Approval → Publish → Notify."
        actions={<Link to="/automations/new" className="btn btn-primary"><Plus size={14}/> New automation</Link>}
      />
      <div className="card">
        {loading ? (
          <div className="p-6 space-y-3">{[0,1,2].map((i)=>(<div key={i} className="skeleton h-10" />))}</div>
        ) : items.length === 0 ? (
          <div className="p-8"><EmptyState icon={<Workflow size={24}/>} title="No automations yet" description="Build your first pipeline — e.g. weekly Shorts factory." action={<Link to="/automations/new" className="btn btn-primary">Create automation</Link>}/></div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>Trigger</th><th>Status</th><th>Runs</th><th>Last run</th><th></th></tr></thead>
            <tbody>
              {items.map((a)=>(
                <tr key={a.id}>
                  <td>
                    <Link to={`/automations/${a.id}`} className="link">{a.name}</Link>
                    {a.description && <div className="text-xs text-[color:var(--color-muted)] truncate max-w-[28rem] mt-0.5">{a.description}</div>}
                  </td>
                  <td className="text-xs"><span className="chip">{a.trigger_type}</span>{a.schedule_cron && <span className="font-mono ml-2 text-[color:var(--color-muted)]">{a.schedule_cron}</span>}</td>
                  <td><StatusPill status={a.status}/></td>
                  <td className="font-mono text-xs">{a.run_count}</td>
                  <td className="text-xs text-[color:var(--color-muted)]">{a.last_run_at ? timeAgo(a.last_run_at) : 'never'}</td>
                  <td className="text-right space-x-1">
                    <button className="btn btn-ghost" onClick={()=>run(a)} title="Run now"><PlayCircle size={14}/></button>
                    <button className="btn btn-ghost" onClick={()=>toggle(a)} title={a.status==='active'?'Pause':'Activate'}>{a.status==='active'?<Pause size={14}/>:<Play size={14}/>}</button>
                    <button className="btn btn-ghost" onClick={()=>remove(a)}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
