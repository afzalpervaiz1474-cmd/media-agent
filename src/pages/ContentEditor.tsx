import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import { useToast } from '../contexts/ToastContext'
import { Sparkles, Save, CalendarClock, CheckCircle2, RefreshCcw, Send, Loader2 } from 'lucide-react'

const PLATFORMS = ['youtube','instagram','tiktok','facebook'] as const
const TONES = ['confident, practical','cinematic, warm','direct, no-fluff','playful, punchy','educational, calm']

export default function ContentEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const { push } = useToast()

  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [c, setC] = useState<any>({
    title: '',
    topic: '',
    audience: '',
    tone: TONES[0],
    cta: '',
    platforms: ['youtube','instagram'],
    description: '',
    hashtags: [],
    tags: [],
    thumbnail_concepts: [],
    platform_variants: {},
    status: 'draft',
  })

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get<{ item: any }>(`/api/content/${id}`)
      .then((r) => setC(r.item))
      .catch((e) => push({ kind: 'error', title: 'Load failed', body: e.message }))
      .finally(() => setLoading(false))
  }, [id, push])

  const save = async (patch: any = {}) => {
    setSaving(true)
    try {
      const body = { ...c, ...patch }
      const res = id
        ? await api.put<{ item: any }>(`/api/content/${id}`, body)
        : await api.post<{ item: any }>('/api/content', body)
      setC(res.item)
      push({ kind: 'success', title: 'Saved' })
      if (!id && res.item?.id) nav(`/content/${res.item.id}`, { replace: true })
      return res.item
    } catch (e: any) {
      push({ kind: 'error', title: 'Save failed', body: e.message })
    } finally { setSaving(false) }
  }

  const generate = async (kind: 'metadata' | 'variants' | 'thumbnails') => {
    if (!c.topic) { push({ kind: 'warn', title: 'Add a topic first' }); return }
    setGenerating(kind)
    try {
      const r = await api.post<{ result: any; configured: boolean; note?: string }>(`/api/ai/generate`, {
        kind, topic: c.topic, audience: c.audience, tone: c.tone, platforms: c.platforms, cta: c.cta, title: c.title,
      })
      const patch: any = {}
      if (kind === 'metadata') {
        patch.title = r.result.title || c.title
        patch.description = r.result.description || c.description
        patch.hashtags = r.result.hashtags || c.hashtags
        patch.tags = r.result.tags || c.tags
        patch.cta = r.result.cta || c.cta
      }
      if (kind === 'thumbnails') patch.thumbnail_concepts = r.result.concepts || []
      if (kind === 'variants') patch.platform_variants = r.result.variants || {}
      setC({ ...c, ...patch })
      if (r.note) push({ kind: 'info', title: r.configured ? 'Generated' : 'Draft generated (offline mode)', body: r.note })
      else push({ kind: 'success', title: 'Generated' })
    } catch (e: any) { push({ kind: 'error', title: 'Generate failed', body: e.message }) }
    finally { setGenerating(null) }
  }

  const approve = async () => { const item = await save({ status: 'approved', approved_at: new Date().toISOString() }); if (item) push({ kind: 'success', title: 'Approved' }) }
  const schedule = async () => {
    const iso = prompt('Schedule for (ISO datetime, e.g. 2026-09-14T15:00:00Z):', new Date(Date.now() + 3600e3).toISOString())
    if (!iso) return
    const item = await save({ status: 'scheduled', scheduled_for: iso })
    if (item) push({ kind: 'success', title: 'Scheduled', body: new Date(iso).toLocaleString() })
  }
  const publish = async () => {
    if (!id) { push({ kind: 'warn', title: 'Save first' }); return }
    try {
      const r = await api.post<{ job: any; warnings: string[] }>(`/api/content/${id}/publish`, {})
      if (r.warnings?.length) push({ kind: 'warn', title: 'Publish queued with warnings', body: r.warnings.join(' • ') })
      else push({ kind: 'success', title: 'Publish job queued', body: 'Track it under Jobs.' })
      nav(`/jobs/${r.job.id}`)
    } catch (e: any) { push({ kind: 'error', title: 'Publish failed', body: e.message }) }
  }

  if (loading) return <div className="max-w-7xl mx-auto p-6 md:p-8"><div className="skeleton h-8 w-64 mb-6" /><div className="grid lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-3"><div className="skeleton h-40"/><div className="skeleton h-40"/></div><div className="space-y-3"><div className="skeleton h-32"/><div className="skeleton h-32"/></div></div></div>

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow={id ? `content/${id.slice(0,8)}` : 'new content'}
        title={c.title || 'Untitled content'}
        description="Describe the idea, pick platforms, generate variants, approve, then schedule or publish."
        actions={<>
          <StatusPill status={c.status} />
          <button disabled={saving} onClick={()=>save()} className="btn btn-outline"><Save size={14}/> Save draft</button>
          {c.status !== 'approved' && <button onClick={approve} className="btn btn-outline"><CheckCircle2 size={14}/> Approve</button>}
          <button onClick={schedule} className="btn btn-outline"><CalendarClock size={14}/> Schedule</button>
          <button onClick={publish} className="btn btn-primary"><Send size={14}/> Publish</button>
        </>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card card-pad">
            <div className="label">Brief</div>
            <div className="grid md:grid-cols-2 gap-4 mt-3">
              <Field label="Title">
                <input className="input" value={c.title} onChange={(e)=>setC({...c, title: e.target.value})} placeholder="Working title" />
              </Field>
              <Field label="CTA">
                <input className="input" value={c.cta || ''} onChange={(e)=>setC({...c, cta: e.target.value})} placeholder="Read the full teardown…" />
              </Field>
              <Field label="Topic" full>
                <textarea className="textarea" value={c.topic || ''} onChange={(e)=>setC({...c, topic: e.target.value})} placeholder="What's the piece about?" />
              </Field>
              <Field label="Audience">
                <input className="input" value={c.audience || ''} onChange={(e)=>setC({...c, audience: e.target.value})} placeholder="Who is it for?" />
              </Field>
              <Field label="Tone">
                <select className="select" value={c.tone || ''} onChange={(e)=>setC({...c, tone: e.target.value})}>
                  {TONES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <div className="label mb-2">Platforms</div>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const on = c.platforms?.includes(p)
                  return (
                    <button key={p} onClick={() => setC({ ...c, platforms: on ? c.platforms.filter((x: string) => x !== p) : [...(c.platforms || []), p] })}
                      className={`chip ${on ? 'chip-accent' : ''}`}>{p}</button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <div><div className="label">Description</div><div className="h-display text-lg mt-1">Main copy</div></div>
              <button disabled={generating!==null} onClick={()=>generate('metadata')} className="btn btn-outline">{generating==='metadata'?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>} Generate</button>
            </div>
            <textarea className="textarea mt-3 min-h-32" value={c.description || ''} onChange={(e)=>setC({...c, description: e.target.value})} placeholder="Long-form description — also used as YouTube base." />
            <div className="mt-4">
              <div className="label mb-2">Hashtags</div>
              <div className="flex flex-wrap gap-1.5">
                {(c.hashtags || []).map((h: string, i: number) => (<span key={i} className="chip chip-accent">{h}</span>))}
                {(!c.hashtags || c.hashtags.length === 0) && <span className="text-xs text-[color:var(--color-muted)]">None yet — generate to fill.</span>}
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <div><div className="label">Platform variants</div><div className="h-display text-lg mt-1">Per-platform copy</div></div>
              <button disabled={generating!==null} onClick={()=>generate('variants')} className="btn btn-outline">{generating==='variants'?<Loader2 size={14} className="animate-spin"/>:<RefreshCcw size={14}/>} Rewrite</button>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              {(c.platforms || []).map((p: string) => {
                const v = c.platform_variants?.[p] || {}
                return (
                  <div key={p} className="surface-2 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="chip chip-accent">{p}</span>
                    </div>
                    <input className="input mb-2" value={v.title || ''} onChange={(e)=>setC({...c, platform_variants: { ...c.platform_variants, [p]: { ...v, title: e.target.value } }})} placeholder={`${p} title`} />
                    <textarea className="textarea min-h-20" value={v.caption || v.description || ''} onChange={(e)=>setC({...c, platform_variants: { ...c.platform_variants, [p]: { ...v, caption: e.target.value } }})} placeholder={`${p} caption / description`} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <div><div className="label">Thumbnail concepts</div><div className="h-display text-lg mt-1">Frames you could design</div></div>
              <button disabled={generating!==null} onClick={()=>generate('thumbnails')} className="btn btn-outline">{generating==='thumbnails'?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>} Ideate</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {(c.thumbnail_concepts || []).map((t: any, i: number) => (
                <div key={i} className="surface-2 rounded-lg p-3">
                  <div className="text-sm">{t.idea || t}</div>
                  {t.palette && <div className="text-xs text-[color:var(--color-muted)] mt-1">Palette: {t.palette}</div>}
                </div>
              ))}
              {(!c.thumbnail_concepts || c.thumbnail_concepts.length === 0) && <div className="text-xs text-[color:var(--color-muted)]">Generate concepts to see options.</div>}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card card-pad">
            <div className="label">Publish gate</div>
            <div className="h-display text-lg mt-1">Approval required</div>
            <p className="text-sm text-[color:var(--color-muted)] mt-2">Content must be marked <b>approved</b> before Modulate will queue a publish job. Any AI-generated update requires a fresh approval.</p>
            <div className="mt-3">
              <StatusPill status={c.status} />
              {c.scheduled_for && <div className="text-xs text-[color:var(--color-muted)] mt-2">Scheduled: {new Date(c.scheduled_for).toLocaleString()}</div>}
              {c.approved_at && <div className="text-xs text-[color:var(--color-muted)] mt-1">Approved: {new Date(c.approved_at).toLocaleString()}</div>}
            </div>
          </div>
          <div className="card card-pad">
            <div className="label">Provider check</div>
            <div className="h-display text-lg mt-1">Where this can go live</div>
            <ul className="mt-3 space-y-2 text-sm">
              {(c.platforms || []).map((p: string) => (
                <li key={p} className="flex justify-between items-center">
                  <span className="capitalize">{p}</span>
                  <span className="chip chip-warn">requires OAuth</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[color:var(--color-muted)] mt-3">Providers report status from your Connected Accounts. Modulate never fabricates a successful publish.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  )
}
