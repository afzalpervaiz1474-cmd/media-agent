import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import { FileText, Plus, Search } from 'lucide-react'

export default function ContentList() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')

  const load = () => {
    setLoading(true)
    api.get<{ items: any[] }>('/api/content')
      .then((r) => setItems(r.items || []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() => items.filter((c) => {
    if (status !== 'all' && c.status !== status) return false
    if (q && !c.title.toLowerCase().includes(q.toLowerCase()) && !(c.topic || '').toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [items, q, status])

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Studio"
        title="Content"
        description="Every draft, approved piece, and scheduled post is persisted in your workspace."
        actions={<Link to="/content/new" className="btn btn-primary"><Plus size={14}/> New content</Link>}
      />

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <label className="relative flex items-center flex-1">
          <Search size={14} className="absolute left-3 text-[color:var(--color-muted)]" />
          <input className="input pl-8" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search title or topic" />
        </label>
        <select className="select md:w-52" value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option>draft</option><option>approved</option><option>scheduled</option><option>published</option><option>archived</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="p-6 space-y-3">{[0,1,2,3].map((i)=>(<div key={i} className="skeleton h-10"/>))}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8"><EmptyState icon={<FileText size={24}/>} title={items.length === 0 ? 'No content yet' : 'No results'} description={items.length === 0 ? 'Create your first piece — pick platforms and let the studio generate variants.' : 'Try clearing the filters.'} action={<Link to="/content/new" className="btn btn-primary">Create content</Link>} /></div>
        ) : (
          <table className="table">
            <thead><tr><th>Title</th><th>Platforms</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {filtered.map((c)=>(
                <tr key={c.id}>
                  <td className="max-w-[28rem]">
                    <Link to={`/content/${c.id}`} className="link block truncate">{c.title}</Link>
                    {c.topic && <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">{c.topic}</div>}
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {(c.platforms || []).map((p: string)=>(<span key={p} className="chip">{p}</span>))}
                    </div>
                  </td>
                  <td><StatusPill status={c.status}/></td>
                  <td className="text-xs text-[color:var(--color-muted)]">{timeAgo(c.updated_at || c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
