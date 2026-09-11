import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import supabase from '../lib/supabase'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import AgentPanel from '../components/AgentPanel'
import { useToast } from '../contexts/ToastContext'
import { formatBytes, formatDuration, safeFilename, timeAgo } from '../lib/format'
import {
  Youtube, Music2, Instagram, Facebook, Upload, Wand2, Send, Loader2, CheckCircle2, XCircle,
  ShieldAlert, ExternalLink, Sparkles, ArrowUpRight, Radio,
} from 'lucide-react'

type Provider = 'youtube' | 'tiktok' | 'instagram' | 'facebook'
const ALL: Provider[] = ['youtube', 'tiktok', 'instagram', 'facebook']
const ICONS: Record<Provider, any> = { youtube: Youtube, tiktok: Music2, instagram: Instagram, facebook: Facebook }
const DEFAULT_CT: Record<Provider, string> = { youtube: 'short', tiktok: 'video', instagram: 'reel', facebook: 'video' }

type Mode = 'manual' | 'approval' | 'auto'

export default function SocialCompose() {
  const { push } = useToast()
  const nav = useNavigate()

  const [providers, setProviders] = useState<Record<string, any>>({})
  const [providersLoading, setProvidersLoading] = useState(true)

  const [media, setMedia] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [chosen, setChosen] = useState<Provider[]>(['youtube', 'tiktok'])
  const [mode, setMode] = useState<Mode>('approval')
  const [metadataByPlatform, setMetadataByPlatform] = useState<Record<Provider, any>>({
    youtube: { content_type: 'short', title: '', description: '', tags: [], hashtags: [] },
    tiktok: { content_type: 'video', title: '', caption: '' },
    instagram: { content_type: 'reel', caption: '' },
    facebook: { content_type: 'video', description: '' },
  } as any)

  const [analyzing, setAnalyzing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [orchestrationResult, setOrchestrationResult] = useState<any | null>(null)

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)
    try { const r = await api.get<{ providers: any }>('/api/accounts'); setProviders(r.providers) }
    finally { setProvidersLoading(false) }
  }, [])
  const loadMedia = useCallback(async () => {
    try { const r = await api.get<{ items: any[] }>('/api/media'); setMedia(r.items || []) } catch { /* ignore */ }
  }, [])
  useEffect(() => { loadProviders(); loadMedia() }, [loadProviders, loadMedia])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const name = safeFilename(file.name)
      const path = `${user.id}/${Date.now()}_${name}`
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      let duration: number | null = null, width: number | null = null, height: number | null = null
      if (file.type.startsWith('video/')) { try { const m = await probeVideo(file); duration = m.duration; width = m.width; height = m.height } catch { /* ignore */ } }
      else if (file.type.startsWith('image/')) { try { const m = await probeImage(file); width = m.width; height = m.height } catch { /* ignore */ } }
      const r = await api.post<{ item: any }>('/api/media', {
        filename: name, storage_path: path, public_url: urlData.publicUrl,
        mime_type: file.type, size_bytes: file.size, duration_sec: duration, width, height,
        kind: file.type.startsWith('image/') ? 'image' : 'video',
      })
      setSelected(r.item); loadMedia(); push({ kind: 'success', title: 'Uploaded' })
    } catch (e: any) { push({ kind: 'error', title: 'Upload failed', body: e.message }) }
    finally { setUploading(false) }
  }

  const analyzeAll = async () => {
    if (!selected || chosen.length === 0) { push({ kind: 'warn', title: 'Select media and at least one platform' }); return }
    setAnalyzing(true)
    try {
      const patches: any = { ...metadataByPlatform }
      for (const p of chosen) {
        const r = await api.post<{ analysis: any }>('/api/ai/analyze-media', {
          media_asset_id: selected.id, platform: p, content_type: metadataByPlatform[p]?.content_type || DEFAULT_CT[p],
        })
        const s = r.analysis?.suggestions || {}
        patches[p] = {
          ...patches[p],
          title: s.title || patches[p].title,
          description: s.description || patches[p].description,
          caption: s.caption || patches[p].caption,
          tags: s.tags || patches[p].tags,
          hashtags: s.hashtags || patches[p].hashtags,
          cta: s.cta || patches[p].cta,
        }
      }
      setMetadataByPlatform(patches)
      push({ kind: 'success', title: 'Analyzed and prepared metadata' })
    } catch (e: any) { push({ kind: 'error', title: 'Analyze failed', body: e.message }) }
    finally { setAnalyzing(false) }
  }

  const publish = async () => {
    if (!selected) { push({ kind: 'warn', title: 'Select media first' }); return }
    if (chosen.length === 0) { push({ kind: 'warn', title: 'Select at least one platform' }); return }
    if (mode === 'auto' && !confirm(`Auto mode will call the official API for: ${chosen.join(', ')}.\nContinue?`)) return
    setPublishing(true); setOrchestrationResult(null)
    try {
      const r = await api.post<{ orchestration: any }>('/api/social/compose', {
        media_asset_id: selected.id,
        platforms: chosen,
        mode,
        metadata_by_platform: chosen.reduce((acc, p) => ({ ...acc, [p]: metadataByPlatform[p] }), {}),
      })
      setOrchestrationResult(r.orchestration)
      push({ kind: 'success', title: `Orchestration complete (${mode})`, body: `Job ${r.orchestration.job_id.slice(0, 8)}` })
    } catch (e: any) { push({ kind: 'error', title: 'Orchestrate failed', body: e.message }) }
    finally { setPublishing(false) }
  }

  const readiness = useMemo(() => chosen.map((p) => {
    const s = providers[p]
    if (!s?.configured) return { p, level: 'error' as const, msg: `Config required (${s?.missing?.join(', ') || 'env vars'})` }
    if (!s?.account) return { p, level: 'warn' as const, msg: 'Not connected' }
    if (s?.tokenHealth?.expired) return { p, level: 'error' as const, msg: 'Token expired — reauthorize' }
    return { p, level: 'ok' as const, msg: `Ready as ${s.account.display_name || s.account.handle}` }
  }), [chosen, providers])

  const anyBlocking = readiness.some((r) => r.level === 'error') || readiness.some((r) => r.level === 'warn' && mode === 'auto')

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Orchestrator"
        title="Compose across platforms"
        description="Upload once. The orchestrator inspects every selected platform, generates AI copy per platform, validates rules, and — in Auto mode — publishes through each official API."
        actions={<Link to="/accounts" className="btn btn-outline"><ExternalLink size={12}/> Manage accounts</Link>}
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Media */}
          <Section step={1} title="Media">
            <div className="grid sm:grid-cols-[1fr_auto] gap-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                {media.length === 0 ? (
                  <div className="col-span-full text-xs text-[color:var(--color-muted)]">No media yet. Upload one to begin.</div>
                ) : media.map((m) => (
                  <button key={m.id} onClick={() => setSelected(m)} className={`text-left surface-2 rounded-lg p-2 border ${selected?.id === m.id ? 'border-[color:var(--color-accent)]' : 'border-transparent'} hover:border-[color:var(--color-border-strong)]`}>
                    <div className="aspect-video w-full bg-[color:var(--color-bg)] rounded overflow-hidden">
                      {m.kind === 'image' ? <img src={m.public_url} alt="" className="h-full w-full object-cover"/> : <video src={m.public_url} className="h-full w-full object-cover" muted preload="metadata"/>}
                    </div>
                    <div className="text-xs truncate mt-1">{m.filename}</div>
                    <div className="text-[10px] text-[color:var(--color-muted)] font-mono">{formatBytes(m.size_bytes)} · {formatDuration(m.duration_sec)}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileInput} type="file" hidden accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files && uploadFile(e.target.files[0])}/>
                <button onClick={() => fileInput.current?.click()} disabled={uploading} className="btn btn-primary">{uploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Upload</button>
                <Link to="/uploads" className="btn btn-ghost text-xs">All uploads →</Link>
              </div>
            </div>
          </Section>

          {/* Platforms */}
          <Section step={2} title="Platforms">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
              {ALL.map((p) => {
                const s = providers[p]
                const configured = !!s?.configured, connected = !!s?.account
                const on = chosen.includes(p)
                const Icon = ICONS[p]
                return (
                  <button key={p} onClick={() => setChosen(on ? chosen.filter((x) => x !== p) : [...chosen, p])} className={`surface-2 rounded-lg p-3 text-left border transition-colors ${on ? 'border-[color:var(--color-accent)]' : 'border-transparent hover:border-[color:var(--color-border-strong)]'}`}>
                    <div className="flex items-center gap-2">
                      <Icon size={14}/>
                      <span className="text-sm font-medium capitalize">{p}</span>
                      {providersLoading ? null : connected ? <CheckCircle2 size={12} className="text-[color:var(--color-success)] ml-auto"/> : configured ? <span className="chip chip-warn ml-auto text-[10px]">connect</span> : <ShieldAlert size={12} className="text-[color:var(--color-danger)] ml-auto"/>}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--color-muted)] truncate">{connected ? (s.account.display_name || s.account.handle) : configured ? 'Not connected' : 'Config required'}</div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Per-platform metadata */}
          <Section step={3} title="Per-platform metadata"
            actions={<button onClick={analyzeAll} disabled={analyzing || !selected || chosen.length === 0} className="btn btn-outline">{analyzing ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>} AI generate for all</button>}>
            {chosen.length === 0 ? (
              <div className="text-xs text-[color:var(--color-muted)]">Select at least one platform above.</div>
            ) : (
              <div className="space-y-3">
                {chosen.map((p) => {
                  const m = metadataByPlatform[p]
                  const Icon = ICONS[p]
                  return (
                    <div key={p} className="surface-2 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={14}/> <span className="capitalize font-medium text-sm">{p}</span>
                        <select className="select h-7 text-xs ml-auto w-auto" value={m.content_type || DEFAULT_CT[p]} onChange={(e) => setMetadataByPlatform((prev) => ({ ...prev, [p]: { ...prev[p], content_type: e.target.value } }))}>
                          {p === 'youtube' && (<><option value="short">Short</option><option value="long">Long-form</option></>)}
                          {p === 'tiktok' && (<option value="video">Video</option>)}
                          {p === 'instagram' && (<><option value="reel">Reel</option><option value="image">Image</option></>)}
                          {p === 'facebook' && (<><option value="video">Video</option><option value="post">Post</option></>)}
                        </select>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2">
                        <input className="input" placeholder={p === 'facebook' && m.content_type === 'post' ? 'Message' : 'Title'} value={m.title || ''} onChange={(e) => setMetadataByPlatform((prev) => ({ ...prev, [p]: { ...prev[p], title: e.target.value } }))}/>
                        <input className="input" placeholder="Tags / hashtags (space)" value={((m.hashtags || []).concat(m.tags || [])).join(' ')} onChange={(e) => setMetadataByPlatform((prev) => ({ ...prev, [p]: { ...prev[p], hashtags: e.target.value.split(/\s+/).filter((h) => h.startsWith('#')), tags: e.target.value.split(/\s+/).filter((t) => t && !t.startsWith('#')) } }))}/>
                      </div>
                      <textarea className="textarea mt-2 min-h-16 text-sm" placeholder={p === 'youtube' ? 'Description' : 'Caption'} value={m.description || m.caption || ''} onChange={(e) => setMetadataByPlatform((prev) => ({ ...prev, [p]: { ...prev[p], description: e.target.value, caption: e.target.value } }))}/>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Mode + publish */}
          <Section step={4} title="Mode and publish">
            <div className="flex flex-wrap gap-2 mb-3">
              {([['manual', 'Manual', 'You publish from each provider workspace'], ['approval', 'Approval', 'Prepare everything; wait for approval'], ['auto', 'Auto', 'Publish now via each official API']] as const).map(([id, label, desc]) => (
                <button key={id} onClick={() => setMode(id)} className={`surface-2 rounded-lg px-3 py-2 text-left border ${mode === id ? 'border-[color:var(--color-accent)]' : 'border-transparent hover:border-[color:var(--color-border-strong)]'}`}>
                  <div className="flex items-center gap-1.5 text-sm font-medium"><Radio size={12}/> {label}</div>
                  <div className="text-[10px] text-[color:var(--color-muted)]">{desc}</div>
                </button>
              ))}
            </div>
            {chosen.length > 0 && (
              <ul className="mb-3 space-y-1 text-xs">
                {readiness.map((r) => (
                  <li key={r.p} className={`flex items-center gap-2 ${r.level === 'error' ? 'text-[color:var(--color-danger)]' : r.level === 'warn' ? 'text-[color:var(--color-warn)]' : 'text-[color:var(--color-ink-2)]'}`}>
                    <span className="capitalize w-20">{r.p}</span> — <span>{r.msg}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={publish} disabled={publishing || !selected || chosen.length === 0 || (mode === 'auto' && anyBlocking)} className="btn btn-primary">{publishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} {mode === 'auto' ? 'Publish now' : mode === 'approval' ? 'Prepare for approval' : 'Record for manual publish'}</button>
              <Link to="/jobs" className="btn btn-ghost">Open jobs <ArrowUpRight size={14}/></Link>
            </div>
            {orchestrationResult && (
              <div className="mt-4 surface-2 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm mb-2"><Sparkles size={14} className="text-[color:var(--color-accent)]"/> Orchestration result</div>
                <div className="space-y-1.5 text-xs">
                  {Object.entries(orchestrationResult.results || {}).map(([p, v]: any) => (
                    <ResultRow key={p} p={p as Provider} v={v}/>
                  ))}
                </div>
                <button onClick={() => nav(`/jobs/${orchestrationResult.job_id}`)} className="btn btn-ghost text-xs mt-2">Open job {orchestrationResult.job_id.slice(0, 8)} →</button>
              </div>
            )}
          </Section>
        </div>

        <div className="lg:sticky lg:top-16 self-start">
          <AgentPanel
            context={{
              provider: chosen[0] || 'youtube',
              mediaAsset: selected,
              contentType: chosen[0] ? metadataByPlatform[chosen[0]]?.content_type : undefined,
              metadata: chosen[0] ? metadataByPlatform[chosen[0]] : undefined,
            }}
            suggestions={[
              { label: 'Prepare all platforms', prompt: `You are the orchestrator. Prepare short, on-tone copy for ${chosen.join(', ')}. Return JSON: { "description": "single best caption for the current platform" }.` },
              { label: 'Tighten titles', prompt: 'Rewrite the current title to be shorter, punchier and platform-safe. Return JSON: { "title": "..." }.' },
              { label: 'More hashtags', prompt: 'Suggest 8 relevant hashtags. Return JSON: { "hashtags": ["#..."] }.' },
              { label: 'Explain readiness', prompt: 'Given the readiness list on this page, explain in plain language which platforms are blocked and what the user should do next.' },
            ]}
            onApplyMetadata={(patch) => {
              if (!chosen[0]) return
              setMetadataByPlatform((prev) => ({ ...prev, [chosen[0]]: { ...prev[chosen[0]], ...patch } }))
            }}
          />
        </div>
      </div>
    </div>
  )
}

function ResultRow({ p, v }: { p: Provider; v: any }) {
  const Icon = ICONS[p]
  const ok = v.status === 'SUCCESS'
  const soft = v.status === 'PENDING_APPROVAL' || v.status === 'MANUAL' || v.status === 'SKIPPED' || v.status === 'AUTHORIZATION_REQUIRED' || v.status === 'PENDING'
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} className="mt-0.5"/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="capitalize text-sm">{p}</span>
          {ok ? <CheckCircle2 size={12} className="text-[color:var(--color-success)]"/> : soft ? <span className="chip">{v.status.toLowerCase().replace(/_/g, ' ')}</span> : <XCircle size={12} className="text-[color:var(--color-danger)]"/>}
          {v.status && ok && <span className="chip chip-success">success</span>}
        </div>
        {v.provider_url && <a href={v.provider_url} target="_blank" rel="noreferrer" className="link text-[11px] truncate block">{v.provider_url}</a>}
        {v.provider_post_id && !v.provider_url && <span className="font-mono text-[10px] text-[color:var(--color-muted)]">id: {v.provider_post_id}</span>}
        {v.reason && <div className="text-[11px] text-[color:var(--color-muted)] mt-0.5">{v.reason}</div>}
      </div>
    </div>
  )
}

function Section({ step, title, children, actions }: { step: number; title: string; children: any; actions?: any }) {
  return (
    <section className="card">
      <div className="p-4 border-b border-[color:var(--color-border)] flex items-center gap-3">
        <div className="h-6 w-6 rounded-md bg-[color:var(--color-surface-2)] grid place-items-center text-[11px] font-mono">{step}</div>
        <div className="font-medium text-sm">{title}</div>
        <div className="ml-auto">{actions}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function probeVideo(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'metadata'
    const to = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('metadata timeout')) }, 10000)
    v.onloadedmetadata = () => { clearTimeout(to); URL.revokeObjectURL(url); resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }) }
    v.onerror = () => { clearTimeout(to); URL.revokeObjectURL(url); reject(new Error('metadata error')) }
    v.src = url
  })
}
function probeImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image error')) }
    img.src = url
  })
}
