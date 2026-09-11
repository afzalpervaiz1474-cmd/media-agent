import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { Youtube, Music2, Instagram, Facebook, ShieldAlert, CheckCircle2, ExternalLink, PlugZap, ArrowUpRight } from 'lucide-react'
import { timeAgo } from '../lib/format'

const ICONS: Record<string, any> = { youtube: Youtube, tiktok: Music2, instagram: Instagram, facebook: Facebook }

export default function Accounts() {
  const [providers, setProviders] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ providers: any }>(`/api/accounts`)
      .then((r) => setProviders(r.providers))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Connections"
        title="Connected accounts"
        description="Every provider uses its official API. Modulate stores OAuth tokens server-side and never fabricates a connection. Click a provider to configure and use its workspace."
      />
      <div className="grid md:grid-cols-2 gap-4">
        {loading ? [0, 1, 2, 3].map((i) => (<div key={i} className="skeleton h-40 rounded-xl"/>)) : Object.keys(providers).map((p) => {
          const s = providers[p]
          const Icon = ICONS[p]
          const configured = s.configured
          const connected = !!s.account
          const expired = !!s.tokenHealth?.expired
          return (
            <div key={p} className="card">
              <div className="p-5 flex items-start gap-4">
                <div className="h-12 w-12 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center overflow-hidden flex-shrink-0">
                  {connected && s.account.avatar_url ? <img src={s.account.avatar_url} alt="" className="h-full w-full object-cover"/> : <Icon size={22}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-display text-lg truncate">{s.meta?.name || p}</div>
                    {connected ? (
                      expired ? <span className="chip chip-danger">Token expired</span> : <span className="chip chip-success"><CheckCircle2 size={12}/> Connected</span>
                    ) : configured ? <span className="chip chip-warn">Not connected</span> : <span className="chip chip-danger"><ShieldAlert size={12}/> Config required</span>}
                  </div>
                  {connected ? (
                    <div className="mt-1 text-sm text-[color:var(--color-ink-2)] truncate">{s.account.display_name || s.account.handle}</div>
                  ) : (
                    <div className="mt-1 text-sm text-[color:var(--color-muted)]">Scopes: {s.meta?.scopes?.slice(0, 3).join(', ')}{s.meta?.scopes?.length > 3 ? '…' : ''}</div>
                  )}
                  {connected && s.account.last_synced_at && (
                    <div className="text-xs text-[color:var(--color-muted)] mt-0.5">Synced {timeAgo(s.account.last_synced_at)}</div>
                  )}
                  {!configured && s.missing?.length > 0 && (
                    <div className="mt-3 surface-2 rounded-lg p-3 text-xs">
                      <div className="font-medium mb-1">Add these to your server env:</div>
                      <div className="font-mono text-[color:var(--color-muted)]">{s.missing.join(', ')}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-[color:var(--color-border)] px-5 py-3 flex items-center justify-between">
                <a href={s.meta?.docs} target="_blank" rel="noreferrer" className="btn btn-ghost text-xs">Docs <ExternalLink size={12}/></a>
                <Link to={`/${p}`} className="btn btn-primary">{connected ? <>Open workspace <ArrowUpRight size={14}/></> : <><PlugZap size={14}/> Set up</>}</Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
