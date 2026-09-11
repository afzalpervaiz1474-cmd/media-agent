import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import { timeAgo } from '../lib/format'
import {
  Activity, ArrowUpRight, FileText, ListChecks, Users, Workflow, PlayCircle, Sparkles,
  Youtube, Music2, Instagram, Facebook, CheckCircle2, ShieldAlert, PlugZap, Bell,
} from 'lucide-react'

const ICONS: Record<string, any> = { youtube: Youtube, tiktok: Music2, instagram: Instagram, facebook: Facebook }

type Dash = {
  counts: { content: number; jobs: number; automations: number; accounts: number; active_automations: number; published_recent: number; failed_recent: number }
  contentByStatus: Record<string, number>
  jobsByStatus: Record<string, number>
  recentJobs: any[]
  recentContent: any[]
  recentPublishes: any[]
  recentMedia: any[]
  unreadNotifications: any[]
  jobsHistogram: { day: string; total: number }[]
  providerStatus: Record<string, { name: string; configured: boolean; connected: boolean; account: any }>
}

export default function Dashboard() {
  const [data, setData] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.get<Dash>('/api/dashboard').then((d) => { if (alive) setData(d) }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Overview"
        title="Your production line"
        description="Live signals from your workspace. Every number below is a count from the database, not an estimate."
        actions={<>
          <Link to="/content/new" className="btn btn-outline"><Sparkles size={14}/> New content</Link>
          <Link to="/accounts" className="btn btn-primary"><PlugZap size={14}/> Connect a platform</Link>
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat loading={loading} icon={<FileText size={16}/>} label="Content records" value={data?.counts.content ?? 0} to="/content"/>
        <Stat loading={loading} icon={<ListChecks size={16}/>} label="Jobs total" value={data?.counts.jobs ?? 0} to="/jobs"/>
        <Stat loading={loading} icon={<Workflow size={16}/>} label="Active automations" value={data?.counts.active_automations ?? 0} to="/automations"/>
        <Stat loading={loading} icon={<Users size={16}/>} label="Connected accounts" value={data?.counts.accounts ?? 0} to="/accounts"/>
      </div>

      {/* Provider strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {['youtube', 'tiktok', 'instagram', 'facebook'].map((p) => {
          const s = data?.providerStatus?.[p]
          const Icon = ICONS[p]
          const configured = !!s?.configured, connected = !!s?.connected
          return (
            <Link key={p} to={`/${p}`} className="card card-pad hover:border-[color:var(--color-border-strong)] transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center overflow-hidden">
                  {connected && s?.account?.avatar_url ? <img src={s.account.avatar_url} alt="" className="h-full w-full object-cover"/> : <Icon size={16}/>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s?.name || p}</div>
                  <div className="text-[10px] text-[color:var(--color-muted)] truncate">{connected ? (s?.account?.display_name || s?.account?.handle || 'connected') : configured ? 'Not connected' : 'Config required'}</div>
                </div>
                {loading ? <span className="skeleton h-4 w-16"/> : connected ? <CheckCircle2 size={14} className="text-[color:var(--color-success)]"/> : configured ? <PlugZap size={14} className="text-[color:var(--color-warn)]"/> : <ShieldAlert size={14} className="text-[color:var(--color-danger)]"/>}
              </div>
            </Link>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card card-pad lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label">Job throughput</div>
              <div className="h-display text-xl mt-1">Last 14 days</div>
            </div>
            <Link to="/jobs" className="btn btn-ghost">All jobs <ArrowUpRight size={14}/></Link>
          </div>
          {loading ? (
            <div className="skeleton h-40"/>
          ) : (data?.jobsHistogram?.length ?? 0) === 0 || (data?.counts.jobs ?? 0) === 0 ? (
            <EmptyState icon={<Activity size={24}/>} title="No jobs yet" description="Publish something or run an automation to see throughput here."/>
          ) : (
            <Histogram data={data!.jobsHistogram}/>
          )}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {['QUEUED', 'PROCESSING', 'COMPLETED', 'WAITING_FOR_APPROVAL', 'FAILED', 'CANCELLED'].map((s) => (
              <div key={s} className="surface-2 rounded-lg p-3 flex items-center justify-between">
                <StatusPill status={s}/>
                <span className="font-mono text-sm">{data?.jobsByStatus[s] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="label">Content pipeline</div>
          <div className="h-display text-xl mt-1 mb-4">By status</div>
          {(['draft', 'approved', 'scheduled', 'published', 'archived'] as const).map((s) => {
            const total = data ? Object.values(data.contentByStatus).reduce((a, b) => a + b, 0) : 0
            const val = data?.contentByStatus[s] ?? 0
            const pct = total ? Math.round((val / total) * 100) : 0
            return (
              <div key={s} className="mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-[color:var(--color-ink-2)]">{s}</span>
                  <span className="font-mono text-[color:var(--color-muted)]">{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[color:var(--color-surface-2)] mt-1 overflow-hidden">
                  <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${pct}%` }}/>
                </div>
              </div>
            )
          })}
          <Link to="/content" className="btn btn-outline w-full mt-4">Open content <ArrowUpRight size={14}/></Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="card">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="label">Recent publishes</div>
              <div className="h-display text-lg mt-1">Real provider results</div>
            </div>
            <div className="flex gap-1 text-xs">
              <span className="chip chip-success">{data?.counts.published_recent ?? 0} ok</span>
              <span className="chip chip-danger">{data?.counts.failed_recent ?? 0} failed</span>
            </div>
          </div>
          <div className="divider"/>
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => (<div key={i} className="skeleton h-10"/>))}</div>
          ) : (data?.recentPublishes?.length ?? 0) === 0 ? (
            <div className="p-8"><EmptyState icon={<PlayCircle size={24}/>} title="Nothing published yet" description="Real provider results appear here after your first publish."/></div>
          ) : (
            <table className="table">
              <thead><tr><th>Provider</th><th>Status</th><th>Result</th><th>When</th></tr></thead>
              <tbody>
                {data!.recentPublishes.map((r: any) => (
                  <tr key={r.id}>
                    <td><span className="chip">{r.provider}</span></td>
                    <td><StatusPill status={r.status === 'published' ? 'COMPLETED' : 'FAILED'}/></td>
                    <td className="text-xs">
                      {r.provider_url ? <a href={r.provider_url} target="_blank" rel="noreferrer" className="link truncate block max-w-xs">{r.provider_url}</a>
                      : r.provider_post_id ? <span className="font-mono">{r.provider_post_id}</span>
                      : r.error ? <span className="text-[color:var(--color-danger)] truncate block max-w-xs">{r.error}</span> : '—'}
                    </td>
                    <td className="text-xs text-[color:var(--color-muted)]">{timeAgo(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="label">Notifications</div>
              <div className="h-display text-lg mt-1">Unread</div>
            </div>
            <Link to="/settings/notifications" className="btn btn-ghost"><Bell size={14}/></Link>
          </div>
          <div className="divider"/>
          {loading ? (
            <div className="p-6 space-y-3">{[0, 1, 2].map((i) => (<div key={i} className="skeleton h-10"/>))}</div>
          ) : (data?.unreadNotifications?.length ?? 0) === 0 ? (
            <div className="p-8"><EmptyState icon={<Bell size={22}/>} title="No unread notifications" description="Job completions and approval requests will appear here."/></div>
          ) : (
            <ul>
              {data!.unreadNotifications.map((n: any) => (
                <li key={n.id} className="p-4 border-b border-[color:var(--color-border)] last:border-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-[color:var(--color-muted)] mt-0.5 line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-[color:var(--color-muted)] mt-1 font-mono">{timeAgo(n.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, to, loading }: { icon: any; label: string; value: number; to: string; loading?: boolean }) {
  return (
    <Link to={to} className="card card-pad hover:border-[color:var(--color-border-strong)] transition-colors">
      <div className="flex items-center justify-between text-[color:var(--color-muted)]">
        <span className="label">{label}</span>{icon}
      </div>
      <div className="h-display text-3xl mt-2">{loading ? <span className="skeleton inline-block h-7 w-14"/> : value}</div>
    </Link>
  )
}

function Histogram({ data }: { data: { day: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => {
        const h = Math.round((d.total / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t" style={{ height: `${Math.max(4, h)}%`, background: 'linear-gradient(to top, var(--color-accent), color-mix(in oklab, var(--color-accent) 40%, var(--color-surface-2)))' }} title={`${d.day}: ${d.total}`}/>
            <div className="text-[10px] text-[color:var(--color-muted)]">{d.day.slice(5)}</div>
          </div>
        )
      })}
    </div>
  )
}
