import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useToast } from '../contexts/ToastContext'
import { Bot, Plus, Trash2, Star, Beaker, Loader2, ShieldCheck, ShieldAlert, Info, Activity } from 'lucide-react'
import { timeAgo } from '../lib/format'

type Supported = Record<string, { name: string; docs: string; default_base_url: string; default_model: string; needs_key: boolean; supports_json_mode: boolean }>
type Config = {
  id: string; provider: string; label: string | null; model: string | null; base_url: string | null;
  api_key_hint: string | null; is_primary: boolean; allow_fallback: boolean;
  last_tested_at: string | null; last_test_status: string | null; last_test_detail: string | null;
}

export default function SettingsAiProviders() {
  const [supported, setSupported] = useState<Supported>({})
  const [configs, setConfigs] = useState<Config[]>([])
  const [envDefaults, setEnvDefaults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [usage, setUsage] = useState<any | null>(null)
  const { push } = useToast()

  const [form, setForm] = useState<any>({ provider: 'openrouter', model: '', base_url: '', api_key: '', is_primary: true, allow_fallback: false, label: '' })

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<{ supported: Supported; configs: Config[]; env_defaults: any[] }>('/api/ai/providers')
      setSupported(r.supported); setConfigs(r.configs); setEnvDefaults(r.env_defaults)
    } catch (e: any) { push({ kind: 'error', title: 'Load failed', body: e.message }) }
    finally { setLoading(false) }
  }
  const loadUsage = async () => { try { const u = await api.get('/api/ai/usage'); setUsage(u) } catch { /* ignore */ } }
  useEffect(() => { load(); loadUsage() }, [])

  const spec = supported[form.provider]

  const save = async (testAfter = false) => {
    setSaving(true)
    try {
      const payload: any = {
        provider: form.provider,
        label: form.label || spec?.name || form.provider,
        model: form.model || spec?.default_model || '',
        base_url: form.base_url || spec?.default_base_url || '',
        is_primary: !!form.is_primary,
        allow_fallback: !!form.allow_fallback,
      }
      if (form.api_key) payload.api_key = form.api_key
      const r = await api.post<{ item: Config }>('/api/ai/providers', payload)
      push({ kind: 'success', title: 'Saved' })
      setForm({ ...form, api_key: '' })
      await load()
      if (testAfter) await test(r.item.id)
    } catch (e: any) { push({ kind: 'error', title: 'Save failed', body: e.message }) }
    finally { setSaving(false) }
  }

  const test = async (id: string) => {
    setTestingId(id)
    try {
      const r = await api.post<{ result: any }>('/api/ai/providers/health', { id })
      const overall = r.result.overall
      push({
        kind: overall === 'PASS' ? 'success' : overall === 'WARNING' ? 'warn' : 'error',
        title: `Test: ${overall}`,
        body: r.result.checks.find((c: any) => c.id === 'probe')?.detail?.slice(0, 140),
      })
      load()
    } catch (e: any) { push({ kind: 'error', title: 'Test failed', body: e.message }) }
    finally { setTestingId(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this provider config?')) return
    await api.del('/api/ai/providers', { id }); push({ kind: 'success', title: 'Deleted' }); load()
  }

  const makePrimary = async (c: Config) => {
    await api.post('/api/ai/providers', { id: c.id, provider: c.provider, is_primary: true, allow_fallback: c.allow_fallback, model: c.model, base_url: c.base_url, label: c.label })
    push({ kind: 'success', title: `${c.label || c.provider} is now primary` }); load()
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Account"
        title="AI providers"
        description="One centralized manager for every agent (orchestrator, YouTube/TikTok/Instagram/Facebook, chat, metadata). Bring your own key — stored encrypted at rest, never sent to the browser."
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Configured providers */}
          <section className="card">
            <div className="p-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
              <div>
                <div className="label">Your providers</div>
                <div className="h-display text-lg mt-1">Resolution order</div>
              </div>
              <div className="text-xs text-[color:var(--color-muted)]">Primary → your fallbacks → server env</div>
            </div>
            {loading ? (
              <div className="p-6 space-y-2">{[0, 1].map((i) => (<div key={i} className="skeleton h-14"/>))}</div>
            ) : configs.length === 0 && envDefaults.length === 0 ? (
              <div className="p-8 text-center text-sm text-[color:var(--color-muted)]">No providers yet. Add one on the right to enable AI agents.</div>
            ) : (
              <ul>
                {configs.map((c) => (
                  <li key={c.id} className="p-4 border-b border-[color:var(--color-border)] last:border-0 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center flex-shrink-0"><Bot size={16}/></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.label || supported[c.provider]?.name || c.provider}</span>
                        {c.is_primary && <span className="chip chip-accent"><Star size={10}/> primary</span>}
                        {c.allow_fallback && <span className="chip">fallback</span>}
                        {c.last_test_status && <span className={`chip ${c.last_test_status === 'PASS' ? 'chip-success' : c.last_test_status === 'WARNING' ? 'chip-warn' : 'chip-danger'}`}>{c.last_test_status}</span>}
                      </div>
                      <div className="text-xs text-[color:var(--color-muted)] mt-1 font-mono truncate">{c.provider} · {c.model || '(default)'} {c.api_key_hint ? `· key ${c.api_key_hint}` : ''}</div>
                      {c.last_test_detail && <div className="text-[11px] text-[color:var(--color-muted)] mt-1">Last test: {c.last_test_detail} {c.last_tested_at ? `· ${timeAgo(c.last_tested_at)}` : ''}</div>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => test(c.id)} disabled={testingId === c.id} className="btn btn-ghost text-xs">{testingId === c.id ? <Loader2 size={12} className="animate-spin"/> : <Beaker size={12}/>} Test</button>
                      {!c.is_primary && <button onClick={() => makePrimary(c)} className="btn btn-ghost text-xs"><Star size={12}/> Primary</button>}
                      <button onClick={() => remove(c.id)} className="btn btn-ghost text-xs text-[color:var(--color-danger)]"><Trash2 size={12}/> Remove</button>
                    </div>
                  </li>
                ))}
                {envDefaults.map((e, i) => (
                  <li key={`env-${i}`} className="p-4 border-b border-[color:var(--color-border)] last:border-0 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center flex-shrink-0"><ShieldCheck size={16} className="text-[color:var(--color-success)]"/></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{supported[e.provider]?.name || e.provider}</span>
                        <span className="chip">server env</span>
                        <span className="chip">system default</span>
                      </div>
                      <div className="text-xs text-[color:var(--color-muted)] mt-1 font-mono">{e.provider} · {e.model}</div>
                      <div className="text-[11px] text-[color:var(--color-muted)] mt-1">Used when the user has no configured provider, or as a fallback if explicitly allowed.</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Usage */}
          <section className="card">
            <div className="p-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
              <div><div className="label">Usage</div><div className="h-display text-lg mt-1">Recent AI activity</div></div>
              <Activity size={16} className="text-[color:var(--color-muted)]"/>
            </div>
            <div className="p-4">
              {!usage ? (
                <div className="skeleton h-20"/>
              ) : usage.aggregate.total_requests === 0 ? (
                <div className="text-xs text-[color:var(--color-muted)]">No AI calls yet.</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Requests" value={usage.aggregate.total_requests}/>
                  <Stat label="OK" value={usage.aggregate.ok}/>
                  <Stat label="Errors" value={usage.aggregate.errors}/>
                  <Stat label="Tokens" value={usage.aggregate.total_tokens}/>
                </div>
              )}
              {usage?.events?.length > 0 && (
                <table className="table mt-4">
                  <thead><tr><th>When</th><th>Provider</th><th>Model</th><th>Kind</th><th>Tokens</th><th>Latency</th><th>Status</th></tr></thead>
                  <tbody>
                    {usage.events.slice(0, 10).map((e: any) => (
                      <tr key={e.id}>
                        <td className="text-xs text-[color:var(--color-muted)]">{timeAgo(e.created_at)}</td>
                        <td className="text-xs">{e.provider}</td>
                        <td className="text-xs font-mono truncate max-w-[10rem]">{e.model || '—'}</td>
                        <td className="text-xs">{e.kind}</td>
                        <td className="text-xs font-mono">{e.total_tokens ?? '—'}</td>
                        <td className="text-xs font-mono">{e.latency_ms ? `${e.latency_ms}ms` : '—'}</td>
                        <td><span className={`chip ${e.status === 'ok' ? 'chip-success' : 'chip-danger'}`}>{e.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* Add / edit form */}
        <aside className="lg:sticky lg:top-16 self-start space-y-4">
          <section className="card">
            <div className="p-4 border-b border-[color:var(--color-border)]">
              <div className="label">Add provider</div>
              <div className="h-display text-lg mt-1">New key</div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="label mb-1">Provider</div>
                <select className="select" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                  {Object.entries(supported).map(([id, s]) => (<option key={id} value={id}>{s.name}</option>))}
                </select>
                {spec && <div className="text-[11px] text-[color:var(--color-muted)] mt-1 flex items-center gap-1"><Info size={10}/> Default model: <span className="font-mono">{spec.default_model || '—'}</span></div>}
              </div>
              <div>
                <div className="label mb-1">Model (optional)</div>
                <input className="input font-mono text-xs" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={spec?.default_model || 'provider default'}/>
              </div>
              {(form.provider === 'openai_compatible' || form.provider === 'ollama') && (
                <div>
                  <div className="label mb-1">Base URL</div>
                  <input className="input font-mono text-xs" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder={spec?.default_base_url || 'https://…'}/>
                </div>
              )}
              {spec?.needs_key && (
                <div>
                  <div className="label mb-1">API key</div>
                  <input className="input font-mono text-xs" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="pasted key (encrypted at rest)" autoComplete="off"/>
                  <div className="text-[11px] text-[color:var(--color-muted)] mt-1 flex items-center gap-1"><ShieldAlert size={10}/> Sent server-side once, encrypted with AES-256-GCM, never returned to the browser.</div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}/> Primary</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.allow_fallback} onChange={(e) => setForm({ ...form, allow_fallback: e.target.checked })}/> Allow as fallback</label>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => save(false)} disabled={saving} className="btn btn-outline"><Plus size={14}/> Save</button>
                <button onClick={() => save(true)} disabled={saving} className="btn btn-primary">{saving ? <Loader2 size={14} className="animate-spin"/> : <Beaker size={14}/>} Save & test</button>
              </div>
              <div className="text-[11px] text-[color:var(--color-muted)] pt-2">
                Fallbacks run only if explicitly checked. The manager never uses another user's credentials.
              </div>
            </div>
          </section>
          <section className="card p-4 text-xs text-[color:var(--color-muted)] space-y-1.5">
            <div className="font-medium text-[color:var(--color-ink)]">Docs</div>
            {Object.entries(supported).map(([id, s]) => (
              <a key={id} href={s.docs} target="_blank" rel="noreferrer" className="link block truncate">{s.name} →</a>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-2 rounded-lg p-3">
      <div className="label">{label}</div>
      <div className="h-display text-2xl mt-1">{value}</div>
    </div>
  )
}
