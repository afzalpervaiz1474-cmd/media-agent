import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import { ListChecks, Search } from 'lucide-react'

export default function Jobs() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')

  const load = () => { setLoading(true); api.get<{ items: any[] }>(`/api/jobs`).then((r)=>setItems(r.items||[])).finally(()=>setLoading(false)) }
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id) }, [])

  const filtered = useMemo(() => items.filter((j) => {
    if (status !== 'all' && j.status !== status) return false
    if (q && !j.kind.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [items, q, status])

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Runtime"
        title="Jobs"
        description="Every automation step, publish, and AI call becomes a job. State transitions and events are persisted."
      />
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <label className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-[color:var(--color-muted)]" />
          <input className="input pl-8" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search by kind (ai.generate_metadata, publish.youtube…)" />
        </label>
        <select className="select md:w-56" value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['QUEUED','PROCESSING','WAITING_FOR_APPROVAL','SCHEDULED','PUBLISHING','COMPLETED','FAILED','CANCELLED'].map((s)=>(<option key={s} value={s}>{s}</option>))}
        </select>
      </div>
      <div className="card">
        {loading ? (
          <div className="p-6 space-y-3">{[0,1,2,3].map((i)=>(<div key={i} className="skeleton h-10"/>))}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8"><EmptyState icon={<ListChecks size={24}/>} title={items.length===0?'No jobs yet':'No results'} description={items.length===0?'Trigger an automation or publish content to see jobs here.':'Try clearing filters.'} /></div>
        ) : (
          <table className="table">
            <thead><tr><th>Kind</th><th>Status</th><th>Progress</th><th>Started</th><th>Finished</th><th>Attempts</th></tr></thead>
            <tbody>
              {filtered.map((j)=>(
                <tr key={j.id}>
                  <td><Link to={`/jobs/${j.id}`} className="link font-mono text-xs">{j.kind}</Link></td>
                  <td><StatusPill status={j.status}/></td>
                  <td className="w-40">
                    <div className="h-1.5 bg-[color:var(--color-surface-2)] rounded-full overflow-hidden"><div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${j.progress}%` }}/></div>
                    <div className="text-[10px] text-[color:var(--color-muted)] mt-1 font-mono">{j.progress}%</div>
                  </td>
                  <td className="text-xs text-[color:var(--color-muted)]">{j.started_at ? timeAgo(j.started_at) : '—'}</td>
                  <td className="text-xs text-[color:var(--color-muted)]">{j.finished_at ? timeAgo(j.finished_at) : '—'}</td>
                  <td className="font-mono text-xs">{j.attempts}/{j.max_attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
