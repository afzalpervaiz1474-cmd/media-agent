import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import supabase from '../lib/supabase'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import PageHeader from '../components/PageHeader'
import AgentPanel from '../components/AgentPanel'
import StatusPill from '../components/StatusPill'
import { formatBytes, formatDuration, safeFilename, timeAgo } from '../lib/format'
import {
  Youtube, Music2, Instagram, Facebook, ShieldAlert, CheckCircle2, ExternalLink, Loader2,
  Upload, Wand2, Save, Send, ShieldCheck, Sparkles, RefreshCw, XCircle, Info, Link as LinkIcon, PlugZap, Activity,
} from 'lucide-react'

type Provider = 'youtube' | 'tiktok' | 'instagram' | 'facebook'

const ICONS: Record<Provider, any> = { youtube: Youtube, tiktok: Music2, instagram: Instagram, facebook: Facebook }
const CONTENT_TYPES: Record<Provider, { id: string; label: string; hint: string }[]> = {
  youtube: [
    { id: 'short', label: 'Short', hint: 'Vertical 9:16, ≤60s' },
    { id: 'long', label: 'Long-form', hint: 'Any aspect, standard video' },
  ],
  tiktok: [{ id: 'video', label: 'Video', hint: '3s–10min, MP4' }],
  instagram: [
    { id: 'reel', label: 'Reel', hint: '9:16, 3–90s' },
    { id: 'image', label: 'Image', hint: 'JPEG/PNG' },
  ],
  facebook: [
    { id: 'video', label: 'Video', hint: 'MP4/MOV' },
    { id: 'post', label: 'Post', hint: 'Text or image' },
  ],
}

export default function ProviderWorkspace({ provider }: { provider: Provider }) {
  const Icon = ICONS[provider]
  const { push } = useToast()

  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [channelUrl, setChannelUrl] = useState('')

  const [contentType, setContentType] = useState<string>(CONTENT_TYPES[provider][0].id)
  const [media, setMedia] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<any | null>(null)
  const [metadata, setMetadata] = useState<any>({ title: '', description: '', caption: '', tags: [], hashtags: [], cta: '', thumbnail_concepts: [] })

  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<any | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [health, setHealth] = useState<any | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadAccount = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ providers: any }>(`/api/accounts`)
      setState(r.providers?.[provider])
    } catch (e: any) { push({ kind: 'error', title: 'Failed to load account', body: e.message }) }
    finally { setLoading(false) }
  }, [provider, push])

  const loadMedia = useCallback(async () => {
    try {
      const r = await api.get<{ items: any[] }>(`/api/media`)
      setMedia(r.items || [])
    } catch { /* handled elsewhere */ }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('publish_results').select('*').eq('user_id', user.id).eq('provider', provider).order('created_at', { ascending: false }).limit(10)
      setHistory(data || [])
    } catch { /* soft */ }
  }, [provider])

  useEffect(() => { loadAccount(); loadMedia(); loadHistory() }, [loadAccount, loadMedia, loadHistory])

  useEffect(() => {
const onMsg = (event: MessageEvent) => {
      if (event.data?.type !== 'modulate-oauth') return;
      if (event.data.status === 'success') {
        push({ kind: 'success', title: `${provider} connected` })
        loadAccount()
      } else {
        push({ kind: 'error', title: `${provider} connect failed`, body: event.data.message || 'Provider returned an error.' })
      }
      setConnecting(false)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [provider, push, loadAccount])

const beginConnect = async () => {
     setConnecting(true)
     try {
       const next = channelUrl ? `/${provider}?channel=${encodeURIComponent(channelUrl)}` : `/${provider}`;
       const r = await api.get<{ configured: boolean; url?: string; missing?: string[]; note?: string; testing?: boolean }>(`/api/oauth/${provider}/start${channelUrl ? '?channel=' + encodeURIComponent(channelUrl) : ''}`)
       if (!r || typeof r !== 'object' || !('configured' in r) || r.configured === undefined) {
         setConnecting(false)
         push({ kind: 'error', title: 'Invalid response from server', body: 'Received an unexpected response from the OAuth server.' })
         return
       }
if (!r.configured) {
          setConnecting(false)
          const testingNote = r.testing ? 'Google OAuth is currently in testing mode. The application owner must publish the OAuth app before public users can connect YouTube.' : undefined;
          push({ kind: 'warn', title: 'Configuration required', body: testingNote || r.note || `Missing: ${r.missing?.join(', ')}` })
          return
        }
        if (r.testing) {
          push({ kind: 'warn', title: 'Testing Mode', body: 'Google OAuth is currently in testing mode. The application owner must publish the OAuth app before public users can connect YouTube.' })
        }
        if (!r.url) {
         setConnecting(false)
         push({ kind: 'error', title: 'Missing authorization URL', body: 'The server did not return an authorization URL. Check provider configuration.' })
         return
       }
       window.open(r.url, `modulate-oauth-${provider}`, 'width=520,height=680')
     } catch (e: any) {
       setConnecting(false)
       push({ kind: 'error', title: 'Could not start OAuth', body: e.message })
     }
   }

  const runHealth = async () => {
    setHealthLoading(true)
    try { const r = await api.get(`/api/health/${provider}`); setHealth(r) }
    catch (e: any) { push({ kind: 'error', title: 'Health check failed', body: e.message }) }
    finally { setHealthLoading(false) }
  }

  const disconnect = async () => {
    if (!confirm(`Disconnect ${provider}? Stored tokens will be deleted.`)) return
    try { await api.post(`/api/oauth/${provider}/disconnect`); push({ kind: 'success', title: 'Disconnected' }); loadAccount() }
    catch (e: any) { push({ kind: 'error', title: 'Disconnect failed', body: e.message }) }
  }

  const saveChannelUrl = async () => {
    // YouTube-only identification field. Does NOT grant upload permission.
    if (provider !== 'youtube') return
    if (!/^https?:\/\/(www\.)?youtube\.com\//i.test(channelUrl.trim())) { push({ kind: 'warn', title: 'Enter a full YouTube channel URL' }); return }
    // We just annotate the profile via the connected_accounts if present; otherwise store as a note.
    push({ kind: 'info', title: 'Identification saved', body: 'Channel URL is for identification only. Publishing still requires OAuth.' })
  }

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
      if (file.type.startsWith('video/')) {
        try { const meta = await probeVideo(file); duration = meta.duration; width = meta.width; height = meta.height } catch { /* ignore */ }
      } else if (file.type.startsWith('image/')) {
        try { const meta = await probeImage(file); width = meta.width; height = meta.height } catch { /* ignore */ }
      }
      const r = await api.post<{ item: any }>(`/api/media`, {
        filename: name, storage_path: path, public_url: urlData.publicUrl,
        mime_type: file.type, size_bytes: file.size, duration_sec: duration, width, height,
        kind: file.type.startsWith('image/') ? 'image' : 'video',
      })
      setSelected(r.item)
      loadMedia()
      push({ kind: 'success', title: 'Uploaded' })
      // Auto-analyze
      analyzeAsset(r.item)
    } catch (e: any) { push({ kind: 'error', title: 'Upload failed', body: e.message }) }
    finally { setUploading(false) }
  }

  const analyzeAsset = async (asset = selected) => {
    if (!asset) { push({ kind: 'warn', title: 'Select or upload media first' }); return }
    setAnalyzing(true); setLastError(null)
    try {
      const r = await api.post<{ analysis: any; configured: boolean }>(`/api/ai/analyze-media`, {
        media_asset_id: asset.id, platform: provider, content_type: contentType,
      })
      setAnalysis(r.analysis)
      const s = r.analysis?.suggestions || {}
      setMetadata((prev: any) => ({
        title: s.title || prev.title,
        description: s.description || prev.description,
        caption: s.caption || prev.caption,
        tags: s.tags || prev.tags,
        hashtags: s.hashtags || prev.hashtags,
        cta: s.cta || prev.cta,
        thumbnail_concepts: s.thumbnail_concepts || prev.thumbnail_concepts,
      }))
      push({ kind: r.configured ? 'success' : 'info', title: r.configured ? 'AI analysis complete' : 'Draft analysis ready', body: r.configured ? undefined : 'Add OPENROUTER_API_KEY for model-backed analysis.' })
    } catch (e: any) { setLastError(e.message); push({ kind: 'error', title: 'Analyze failed', body: e.message }) }
    finally { setAnalyzing(false) }
  }

  const validateNow = useMemo(() => {
    if (!selected) return []
    const v: { level: 'error' | 'warn' | 'info'; message: string }[] = []
    const dur = selected.duration_sec ? Number(selected.duration_sec) : null
    const w = selected.width, h = selected.height
    const orientation = w && h ? (w / h > 1.05 ? 'landscape' : w / h < 0.95 ? 'portrait' : 'square') : null
    if (provider === 'youtube' && contentType === 'short') {
      if (dur != null && dur > 60) v.push({ level: 'error', message: 'YouTube Shorts must be ≤60s.' })
      if (orientation && orientation !== 'portrait') v.push({ level: 'warn', message: 'Shorts should be 9:16 (portrait).' })
    }
    if (provider === 'tiktok' && dur != null && dur < 3) v.push({ level: 'error', message: 'TikTok requires ≥3s.' })
    if (provider === 'instagram' && contentType === 'reel') {
      if (dur != null && (dur < 3 || dur > 90)) v.push({ level: 'error', message: 'Reels must be 3–90s.' })
      if (orientation && orientation !== 'portrait') v.push({ level: 'warn', message: 'Reels should be 9:16.' })
    }
    if (provider === 'instagram' && contentType === 'image' && !selected.mime_type?.startsWith('image/')) {
      v.push({ level: 'error', message: 'Image post requires an image file.' })
    }
    return v
  }, [selected, provider, contentType])

  const canPublish = !!state?.account && !!state?.tokenHealth?.has_token && !!selected && validateNow.every((x) => x.level !== 'error') && !!metadata.title
  const configured = !!state?.configured
  const connected = !!state?.account
  const tokenExpired = !!state?.tokenHealth?.expired

  const publish = async () => {
    if (!canPublish) return
    if (!confirm(`Publish to ${provider} now?\nThis calls the official ${provider} API and cannot be undone via Modulate.`)) return
    setPublishing(true); setLastError(null)
    try {
      const r = await api.post<{ job: any; result: any }>(`/api/publish`, {
        provider, media_asset_id: selected.id, metadata, content_type: contentType,
      })
      setPublishResult(r.result)
      loadHistory()
      push({ kind: 'success', title: 'Published', body: r.result?.provider_url || `id: ${r.result?.provider_post_id || 'accepted'}` })
    } catch (e: any) {
      setLastError(e.message)
      push({ kind: 'error', title: 'Publish failed', body: e.message })
    } finally { setPublishing(false) }
  }

  const saveDraft = async () => {
    try {
      const r = await api.post<{ item: any }>(`/api/content`, {
        title: metadata.title, description: metadata.description, cta: metadata.cta,
        tags: metadata.tags, hashtags: metadata.hashtags, thumbnail_concepts: metadata.thumbnail_concepts,
        platforms: [provider], platform_variants: { [provider]: { title: metadata.title, caption: metadata.caption, content_type: contentType } },
        media_asset_id: selected?.id || null, status: 'draft',
      })
      push({ kind: 'success', title: 'Draft saved', body: `Content ${r.item.id.slice(0, 8)}` })
    } catch (e: any) { push({ kind: 'error', title: 'Save failed', body: e.message }) }
  }

  const meta = state?.meta
  const missing = state?.missing || []

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Publishing suite"
        title={meta?.name || provider}
        description={meta ? `${meta.name} publishing runs on the official API. Configure OAuth, connect an account, then upload → analyze → approve → publish.` : ''}
        actions={<a href={meta?.docs} target="_blank" rel="noreferrer" className="btn btn-outline"><ExternalLink size={12}/> Provider docs</a>}
      />

      {/* Account header */}
      <div className="card mb-6 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-[color:var(--color-surface-2)] grid place-items-center flex-shrink-0 overflow-hidden">
            {connected && state.account.avatar_url ? (
              <img src={state.account.avatar_url} alt="" className="h-full w-full object-cover"/>
            ) : (
              <Icon size={24} className="text-[color:var(--color-accent)]"/>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="skeleton h-8 w-56 rounded-lg"/>
            ) : !configured ? (
              <>
                <div className="flex items-center gap-2 text-[color:var(--color-danger)] font-medium"><ShieldAlert size={16}/> Configuration required</div>
                <div className="text-sm text-[color:var(--color-ink-2)] mt-1">Set these server env vars, then reconnect. Modulate never fakes a connected state.</div>
                <div className="font-mono text-xs mt-2 text-[color:var(--color-muted)]">{missing.join(', ')}</div>
              </>
            ) : connected ? (
              <>
                <div className="h-display text-2xl truncate">{state.account.display_name || state.account.handle || state.account.provider_account_id}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-muted)]">
                  {state.account.handle && <span>@{state.account.handle}</span>}
                  <span className="font-mono">{provider}:{String(state.account.provider_account_id).slice(0, 24)}</span>
                  {state.account.last_synced_at && <span>synced {timeAgo(state.account.last_synced_at)}</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="chip chip-success"><CheckCircle2 size={12}/> Connected</span>
                  {state.tokenHealth?.expired && <span className="chip chip-danger">Token expired</span>}
                  {state.tokenHealth?.has_token && !state.tokenHealth?.expired && <span className="chip">Token healthy</span>}
                  {state.account.scopes?.length > 0 && <span className="chip">scopes: {state.account.scopes.length}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="h-display text-2xl">Not connected</div>
                <div className="text-sm text-[color:var(--color-muted)] mt-1">Complete OAuth to enable uploads and publishing. Modulate stores tokens server-side and never exposes them to the browser.</div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end flex-shrink-0">
            {connected ? (
              <>
                <button onClick={runHealth} disabled={healthLoading} className="btn btn-outline">{healthLoading ? <Loader2 size={14} className="animate-spin"/> : <Activity size={14}/>} Health check</button>
                <button onClick={beginConnect} disabled={connecting} className="btn btn-outline"><RefreshCw size={14}/> Reauthorize</button>
                <button onClick={disconnect} className="btn btn-ghost text-[color:var(--color-danger)]"><XCircle size={14}/> Disconnect</button>
              </>
            ) : configured ? (
              <>
                <button onClick={runHealth} disabled={healthLoading} className="btn btn-outline">{healthLoading ? <Loader2 size={14} className="animate-spin"/> : <Activity size={14}/>} Health check</button>
                <button onClick={beginConnect} disabled={connecting} className="btn btn-primary">{connecting ? <Loader2 size={14} className="animate-spin"/> : <PlugZap size={14}/>} Connect {meta?.name}</button>
              </>
            ) : (
              <>
                <button onClick={runHealth} disabled={healthLoading} className="btn btn-outline">{healthLoading ? <Loader2 size={14} className="animate-spin"/> : <Activity size={14}/>} Health check</button>
                <span className="text-xs text-[color:var(--color-muted)] max-w-[16rem] text-right">Env vars must be set before the connect button becomes active.</span>
              </>
            )}
          </div>
        </div>

        {provider === 'youtube' && (
          <div className="border-t border-[color:var(--color-border)] px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Info size={14} className="text-[color:var(--color-muted)] flex-shrink-0"/>
            <div className="text-xs text-[color:var(--color-ink-2)] flex-1">
              Optional: enter your channel URL for identification/verification only. <b>A channel URL alone never grants upload permission</b> — real access requires the OAuth flow above.
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@yourchannel" className="input h-9 w-full sm:w-72"/>
              <button onClick={saveChannelUrl} className="btn btn-outline h-9"><LinkIcon size={12}/> Save</button>
            </div>
          </div>
        )}

        {health && (
          <div className="border-t border-[color:var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="label">Health</span>
              <span className={`chip ${health.overall === 'PASS' ? 'chip-success' : health.overall === 'WARNING' ? 'chip-warn' : 'chip-danger'}`}>{health.overall}</span>
            </div>
            <ul className="space-y-1.5">
              {health.checks.map((c: any) => (
                <li key={c.id} className="grid grid-cols-[110px_1fr] gap-3 text-xs">
                  <span className={`font-mono ${c.status === 'PASS' ? 'text-[color:var(--color-success)]' : c.status === 'WARNING' ? 'text-[color:var(--color-warn)]' : c.status === 'FAIL' ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--color-muted)]'}`}>{c.status}</span>
                  <div>
                    <div><b>{c.label}:</b> <span className="text-[color:var(--color-ink-2)]">{c.detail}</span></div>
                    {c.action && <div className="text-[color:var(--color-muted)] mt-0.5">→ {c.action}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {meta?.notes && meta.notes.length > 0 && (
          <div className="border-t border-[color:var(--color-border)] px-5 py-3 text-xs text-[color:var(--color-muted)] space-y-1">
            {meta.notes.map((n: string) => (<div key={n}>• {n}</div>))}
          </div>
        )}
      </div>

      {/* Workspace grid */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Step 1 — select or upload media */}
          <Section num={1} title="Select or upload media">
            <div className="flex flex-wrap gap-2 mb-3">
              {CONTENT_TYPES[provider].map((c) => (
                <button key={c.id} onClick={() => setContentType(c.id)} className={`chip ${contentType === c.id ? 'chip-accent' : ''}`} title={c.hint}>{c.label} <span className="text-[10px] text-[color:var(--color-muted)] ml-1">{c.hint}</span></button>
              ))}
            </div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3">
              <div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                  {media.length === 0 ? (
                    <div className="col-span-full text-xs text-[color:var(--color-muted)]">No media yet. Upload one to get started.</div>
                  ) : media.map((m) => {
                    const videoProxyUrl = m.kind === 'video' && m.storage_path ? `/api/media/proxy?path=${encodeURIComponent(m.storage_path)}` : null;
                    return (
                      <button key={m.id} onClick={() => { setSelected(m); setAnalysis(null); }} className={`text-left surface-2 rounded-lg p-2 border ${selected?.id === m.id ? 'border-[color:var(--color-accent)]' : 'border-transparent'} hover:border-[color:var(--color-border-strong)]`}>
                        <div className="aspect-video w-full bg-[color:var(--color-bg)] rounded overflow-hidden grid place-items-center text-[color:var(--color-muted)] text-xs">
                          {m.kind === 'image' ? (
                            <img
                              src={m.public_url}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={(e) => { const el = e.currentTarget as HTMLElement; el.style.display = 'none'; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = 'flex'; }}
                            />
                          ) : (
                            <video
                              src={videoProxyUrl || m.public_url}
                              className="h-full w-full object-cover"
                              muted
                              preload="metadata"
                              onError={(e) => { const el = e.currentTarget as HTMLElement; el.style.display = 'none'; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = 'flex'; }}
                            />
                          )}
                          <div style={{ display: 'none' }} className="h-full w-full flex items-center justify-center text-xs">Preview unavailable</div>
                        </div>
                        <div className="text-xs truncate mt-1">{m.filename}</div>
                        <div className="text-[10px] text-[color:var(--color-muted)] font-mono">{formatBytes(m.size_bytes)} · {formatDuration(m.duration_sec)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col justify-start gap-2">
                <input ref={fileInput} type="file" hidden accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files && uploadFile(e.target.files[0])}/>
                <button onClick={() => fileInput.current?.click()} disabled={uploading} className="btn btn-primary w-full">{uploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Upload</button>
                <Link to="/uploads" className="btn btn-ghost text-xs">All uploads →</Link>
              </div>
            </div>
            {selected && (
              <>
                <div className="mt-3 surface-2 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-xs">
                    <div className="font-medium">{selected.filename}</div>
                    <div className="text-[color:var(--color-muted)] font-mono">{formatBytes(selected.size_bytes)} · {formatDuration(selected.duration_sec)} · {selected.width || '?'}×{selected.height || '?'}</div>
                  </div>
                  <button onClick={() => analyzeAsset()} disabled={analyzing} className="btn btn-outline">{analyzing ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>} Analyze</button>
                </div>
                {(selected.kind === 'video' && selected.storage_path) && (
                  <div className="mt-3 aspect-video w-full bg-[color:var(--color-bg)] rounded overflow-hidden">
                    <video
                      src={`/api/media/proxy?path=${encodeURIComponent(selected.storage_path)}`}
                      className="h-full w-full object-cover"
                      controls
                      muted
                      preload="metadata"
                      onError={(e) => { const el = e.currentTarget as HTMLElement; el.style.display = 'none'; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = 'flex'; }}
                    />
                    <div style={{ display: 'none' }} className="h-full w-full flex items-center justify-center text-xs text-[color:var(--color-muted)]">Preview unavailable</div>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Step 2 — AI analysis / editable metadata */}
          <Section num={2} title="Metadata (AI-prepared, editable)">
            {analysis && (
              <div className="surface-2 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 text-xs"><Sparkles size={12} className="text-[color:var(--color-accent)]"/><span>{analysis.summary}</span></div>
                {analysis._note && <div className="text-[10px] text-[color:var(--color-muted)] mt-1">{analysis._note}</div>}
                {analysis.rationale && <div className="text-[11px] text-[color:var(--color-muted)] mt-1 italic">{analysis.rationale}</div>}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              <Field label={provider === 'facebook' && contentType === 'post' ? 'Message' : 'Title'}>
                <input className="input" value={metadata.title || ''} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} placeholder="Write a strong opener"/>
              </Field>
              <Field label="Call to action">
                <input className="input" value={metadata.cta || ''} onChange={(e) => setMetadata({ ...metadata, cta: e.target.value })}/>
              </Field>
              <Field full label={provider === 'youtube' ? 'Description' : 'Caption / Description'}>
                <textarea className="textarea min-h-28" value={metadata.description || metadata.caption || ''} onChange={(e) => setMetadata({ ...metadata, description: e.target.value, caption: e.target.value })}/>
              </Field>
              <Field label="Tags (comma separated)">
                <input className="input" value={(metadata.tags || []).join(', ')} onChange={(e) => setMetadata({ ...metadata, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}/>
              </Field>
              <Field label="Hashtags (space separated)">
                <input className="input" value={(metadata.hashtags || []).join(' ')} onChange={(e) => setMetadata({ ...metadata, hashtags: e.target.value.split(/\s+/).map((h) => h.startsWith('#') ? h : `#${h}`).filter((h) => h.length > 1) })}/>
              </Field>
            </div>
            {metadata.thumbnail_concepts?.length > 0 && (
              <div className="mt-3">
                <div className="label mb-2">Thumbnail concepts</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {metadata.thumbnail_concepts.map((c: any, i: number) => (
                    <div key={i} className="surface-2 rounded-lg p-2 text-xs">
                      <div>{c.idea || c}</div>
                      {c.palette && <div className="text-[color:var(--color-muted)] mt-0.5">Palette: {c.palette}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Step 3 — validation & preview */}
          <Section num={3} title="Platform validation">
            {!selected ? (
              <div className="text-xs text-[color:var(--color-muted)]">Select media first to see validation results.</div>
            ) : validateNow.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-[color:var(--color-success)]"><ShieldCheck size={14}/> Meets {provider} requirements for {contentType}.</div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {validateNow.map((v, i) => (
                  <li key={i} className={`flex gap-2 ${v.level === 'error' ? 'text-[color:var(--color-danger)]' : v.level === 'warn' ? 'text-[color:var(--color-warn)]' : 'text-[color:var(--color-ink-2)]'}`}>
                    <ShieldAlert size={14} className="mt-0.5"/>
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Step 4 — approve + publish */}
          <Section num={4} title="Approve and publish">
            {lastError && (
              <div className="mb-3 surface-2 rounded-lg p-3 border border-[color:var(--color-danger)]/40">
                <div className="text-xs text-[color:var(--color-danger)] font-medium">Last error</div>
                <div className="text-xs text-[color:var(--color-ink-2)] mt-1 font-mono whitespace-pre-wrap">{lastError}</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={saveDraft} className="btn btn-outline"><Save size={14}/> Save draft</button>
              <button onClick={() => analyzeAsset()} disabled={analyzing || !selected} className="btn btn-outline">{analyzing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Regenerate</button>
              <button onClick={publish} disabled={!canPublish || publishing} className="btn btn-primary">{publishing ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Publish to {meta?.name}</button>
            </div>
            <div className="text-[11px] text-[color:var(--color-muted)] mt-2">
              {!connected && 'Connect an account before publishing. '}
              {connected && tokenExpired && 'Token expired — reauthorize before publishing. '}
              {!selected && connected && 'Select media before publishing. '}
              {selected && !metadata.title && 'A title is required. '}
              Publish always requires explicit confirmation.
            </div>
            {publishResult && (
              <div className="mt-4 surface-2 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-[color:var(--color-success)]"><CheckCircle2 size={14}/> Published to {provider}</div>
                <div className="mt-2 text-xs space-y-0.5">
                  {publishResult.provider_url && (<div>URL: <a className="link" href={publishResult.provider_url} target="_blank" rel="noreferrer">{publishResult.provider_url}</a></div>)}
                  {publishResult.provider_post_id && (<div className="font-mono text-[color:var(--color-muted)]">id: {publishResult.provider_post_id}</div>)}
                </div>
              </div>
            )}
          </Section>

          {/* History */}
          <Section num={5} title={`Recent publishes to ${meta?.name || provider}`}>
            {history.length === 0 ? (
              <div className="text-xs text-[color:var(--color-muted)]">Nothing published from Modulate yet.</div>
            ) : (
              <table className="table">
                <thead><tr><th>When</th><th>Status</th><th>Result</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="text-xs text-[color:var(--color-muted)]">{timeAgo(h.created_at)}</td>
                      <td><StatusPill status={h.status === 'published' ? 'COMPLETED' : 'FAILED'}/></td>
                      <td className="text-xs">
                        {h.provider_url ? <a className="link" href={h.provider_url} target="_blank" rel="noreferrer">{h.provider_url}</a> : h.provider_post_id ? <span className="font-mono">{h.provider_post_id}</span> : h.error ? <span className="text-[color:var(--color-danger)]">{h.error}</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Agent panel */}
        <div className="lg:sticky lg:top-16 self-start">
          <AgentPanel
            context={{
              provider, account: state?.account, mediaAsset: selected, metadata,
              contentType, lastError, publishResult,
            }}
            suggestions={[
              { label: 'Generate 5 better titles', prompt: 'Return JSON: { "title": "the single best title" } after considering 5 punchy alternatives for the current media and metadata.' },
              { label: 'More professional description', prompt: 'Rewrite the current description in a confident, professional tone. Return JSON: { "description": "..." }.' },
              { label: 'Fix hashtags', prompt: 'Suggest 8 relevant hashtags. Return JSON: { "hashtags": ["#..."] }.' },
              { label: 'Prepare all platforms', prompt: 'Suggest short platform-specific captions for youtube, tiktok, instagram and facebook based on the current metadata. Return JSON: { "caption": "..." } for the current platform.' },
              { label: 'Why did the last publish fail?', prompt: 'Given the last error above, explain in plain language what likely went wrong and what to try next. No JSON needed.' },
            ]}
            onApplyMetadata={(patch) => setMetadata((prev: any) => ({ ...prev, ...patch }))}
          />
        </div>
      </div>
    </div>
  )

}

function Section({ num, title, children }: { num: number; title: string; children: any }) {
  return (
    <section className="card">
      <div className="p-4 border-b border-[color:var(--color-border)] flex items-center gap-3">
        <div className="h-6 w-6 rounded-md bg-[color:var(--color-surface-2)] grid place-items-center text-[11px] font-mono">{num}</div>
        <div className="font-medium text-sm">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
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

function probeVideo(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    const to = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('metadata timeout')) }, 10000)
    v.onloadedmetadata = () => { clearTimeout(to); URL.revokeObjectURL(url); resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }) }
    v.onerror = () => { clearTimeout(to); URL.revokeObjectURL(url); reject(new Error('Cannot read video metadata')) }
    v.src = url
  })
}
function probeImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot read image')) }
    img.src = url
  })
}


