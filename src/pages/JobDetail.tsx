import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import { useToast } from '../contexts/ToastContext'
import { timeAgo } from '../lib/format'
import { ArrowLeft, PlayCircle, XCircle, CheckCircle2, RefreshCw } from 'lucide-react'

export default function JobDetail() {
  const { id } = useParams()
  const [job, setJob] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { push } = useToast()

  const load = () => {
    api.get<{ job: any; events: any[] }>(`/api/jobs/${id}`).then((r) => { setJob(r.job); setEvents(r.events || []) }).finally(() => setLoading(false))
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [id])

  const action = async (which: 'approve' | 'cancel' | 'retry' | 'run') => {
    try { const r = await api.post<{ job: any }>(`/api/jobs/${id}/${which}`, {}); setJob(r.job); push({ kind: 'success', title: `Job ${which}` }); load() }
    catch (e: any) { push({ kind: 'error', title: `${which} failed`, body: e.message }) }
  }

  if (loading || !job) return <div className="max-w-4xl mx-auto p-6 md:p-8"><div className="skeleton h-8 w-64 mb-6"/><div className="skeleton h-64"/></div>

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <Link to="/jobs" className="btn btn-ghost mb-3"><ArrowLeft size={14}/> All jobs</Link>
      <PageHeader
        eyebrow={`job/${job.id.slice(0,8)}`}
        title={job.kind}
        description="Deterministic state machine. Events are append-only — nothing here is fabricated."
        actions={<>
          <StatusPill status={job.status} />
          {job.status === 'WAITING_FOR_APPROVAL' && <button onClick={()=>action('approve')} className="btn btn-primary"><CheckCircle2 size={14}/> Approve</button>}
          {['QUEUED','SCHEDULED'].includes(job.status) && <button onClick={()=>action('run')} className="btn btn-primary"><PlayCircle size={14}/> Run now</button>}
          {job.status === 'FAILED' && <button onClick={()=>action('retry')} className="btn btn-outline"><RefreshCw size={14}/> Retry</button>}
          {['QUEUED','SCHEDULED','WAITING_FOR_APPROVAL','PROCESSING'].includes(job.status) && <button onClick={()=>action('cancel')} className="btn btn-outline"><XCircle size={14}/> Cancel</button>}
        </>}
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card card-pad"><div className="label">Progress</div><div className="h-display text-2xl mt-1">{job.progress}%</div><div className="h-1.5 bg-[color:var(--color-surface-2)] rounded-full mt-2 overflow-hidden"><div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${job.progress}%` }}/></div></div>
        <div className="card card-pad"><div className="label">Attempts</div><div className="h-display text-2xl mt-1">{job.attempts}/{job.max_attempts}</div><div className="text-xs text-[color:var(--color-muted)] mt-1">Exponential backoff between retries</div></div>
        <div className="card card-pad"><div className="label">Timing</div><div className="text-xs text-[color:var(--color-muted)] mt-1">Created {timeAgo(job.created_at)}</div><div className="text-xs text-[color:var(--color-muted)]">Started {job.started_at ? timeAgo(job.started_at) : '—'}</div><div className="text-xs text-[color:var(--color-muted)]">Finished {job.finished_at ? timeAgo(job.finished_at) : '—'}</div></div>
      </div>

      {job.error && (
        <div className="card card-pad mb-6 border-[color:var(--color-danger)]/40">
          <div className="label text-[color:var(--color-danger)]">Error</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap font-mono text-[color:var(--color-danger)]">{job.error}</pre>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card card-pad">
          <div className="label">Input</div>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-72">{JSON.stringify(job.input, null, 2)}</pre>
        </div>
        <div className="card card-pad">
          <div className="label">Output</div>
          <pre className="mt-2 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-72">{JSON.stringify(job.output, null, 2)}</pre>
        </div>
      </div>

      <div className="card">
        <div className="p-4 label">Timeline</div>
        <div className="divider" />
        {events.length === 0 ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">No events yet.</div>
        ) : (
          <ol className="p-4 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <div className={`h-2 w-2 rounded-full mt-2 ${e.level==='error'?'bg-[color:var(--color-danger)]':e.level==='warn'?'bg-[color:var(--color-warn)]':'bg-[color:var(--color-accent)]'}`}/>
                <div className="flex-1">
                  <div className="text-sm">{e.message}</div>
                  <div className="text-[10px] text-[color:var(--color-muted)] font-mono">{new Date(e.created_at).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
