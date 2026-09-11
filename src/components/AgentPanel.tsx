import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Bot, Send, Loader2, Sparkles, Wand2, Wrench } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; tool_calls?: any[] }

type ContextSummary = {
  provider: string
  account?: any
  mediaAsset?: any
  metadata?: any
  contentType?: string
  lastError?: string | null
  publishResult?: any
}

type AgentPanelProps = {
  context: ContextSummary
  suggestions?: { label: string; prompt: string }[]
  onApplyMetadata?: (patch: any) => void
}

export default function AgentPanel({ context, suggestions = [], onApplyMetadata }: AgentPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [convId, setConvId] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { push } = useToast()

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  const composeContextPrefix = () => {
    const parts: string[] = []
    parts.push(`Platform: ${context.provider}.`)
    if (context.account) parts.push(`Connected as ${context.account.display_name || context.account.handle || context.account.provider_account_id}.`)
    else parts.push('No account connected.')
    if (context.mediaAsset) parts.push(`Media: ${context.mediaAsset.filename} (${context.mediaAsset.mime_type}, ${context.mediaAsset.duration_sec ?? '?'}s, ${context.mediaAsset.width}x${context.mediaAsset.height}).`)
    if (context.contentType) parts.push(`Content type: ${context.contentType}.`)
    if (context.metadata?.title) parts.push(`Current title: ${context.metadata.title}.`)
    if (context.lastError) parts.push(`Last error: ${context.lastError}.`)
    if (context.publishResult?.provider_url) parts.push(`Last publish URL: ${context.publishResult.provider_url}`)
    return parts.join(' ')
  }

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text) return
    const userMsg: Msg = { role: 'user', content: text }
    setMessages((m) => [...m, userMsg])
    setInput(''); setLoading(true)
    try {
      const payload = { content: `${composeContextPrefix()}\n\nUser request: ${text}` }
      const url = convId ? `/api/ai/chat/${convId}` : `/api/ai/chat/new`
      const r = await api.post<{ message: Msg; conversation_id: string; configured: boolean }>(url, payload)
      if (!convId) setConvId(r.conversation_id)
      setConfigured(r.configured)
      setMessages((m) => [...m, r.message])
      // Auto-apply metadata JSON if the model returned it.
      const patch = extractJson(r.message.content)
      if (patch && onApplyMetadata) {
        onApplyMetadata(patch)
        push({ kind: 'success', title: 'Applied AI suggestions' })
      }
    } catch (e: any) { push({ kind: 'error', title: 'Agent failed', body: e.message }) }
    finally { setLoading(false) }
  }

  return (
    <div className="card flex flex-col h-full min-h-[420px]">
      <div className="flex items-center justify-between p-3 border-b border-[color:var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center"><Bot size={14} className="text-[color:var(--color-accent)]"/></div>
          <div>
            <div className="font-medium text-sm">Publishing agent</div>
            <div className="text-[10px] text-[color:var(--color-muted)] uppercase tracking-wider">Bounded · whitelisted tools</div>
          </div>
        </div>
        {configured === false && <span className="chip chip-warn">draft mode</span>}
      </div>

      {suggestions.length > 0 && (
        <div className="px-3 pt-3 pb-2 flex gap-1.5 flex-wrap border-b border-[color:var(--color-border)]">
          {suggestions.map((s) => (
            <button key={s.label} onClick={() => send(s.prompt)} disabled={loading} className="chip chip-accent hover:opacity-90"><Wand2 size={10}/> {s.label}</button>
          ))}
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-[color:var(--color-muted)] leading-relaxed">
            <div className="flex items-center gap-1.5 mb-2"><Sparkles size={12} className="text-[color:var(--color-accent)]"/> The agent knows about the account, media and metadata on this page.</div>
            <div>Try: “Generate 5 better titles”, “Make this description more professional”, “Prepare a YouTube Short version”, “Why did the last upload fail?”</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role !== 'user' && <div className="h-6 w-6 rounded-full bg-[color:var(--color-surface-2)] grid place-items-center flex-shrink-0"><Bot size={12}/></div>}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-[color:var(--color-ink)] text-[color:var(--color-bg)]' : 'bg-[color:var(--color-surface-2)]'}`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {(m.tool_calls?.length ?? 0) > 0 && (
                <div className="mt-1.5 space-y-0.5">{m.tool_calls!.map((t: any, k: number) => (<div key={k} className="flex items-center gap-1 text-[10px] font-mono text-[color:var(--color-accent)]"><Wrench size={9}/> {t.name}</div>))}</div>
              )}
            </div>
          </div>
        ))}
        {loading && (<div className="flex gap-2"><div className="h-6 w-6 rounded-full bg-[color:var(--color-surface-2)] grid place-items-center"><Bot size={12}/></div><div className="rounded-xl bg-[color:var(--color-surface-2)] px-3 py-2"><Loader2 size={12} className="animate-spin"/></div></div>)}
      </div>

      <div className="border-t border-[color:var(--color-border)] p-2 flex gap-1.5">
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Ask the agent…" className="input h-9 text-xs" />
        <button onClick={()=>send()} disabled={loading || !input.trim()} className="btn btn-primary h-9"><Send size={12}/></button>
      </div>
    </div>
  )
}

function extractJson(text: string): any | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*({[\s\S]*?})```/i)
  const raw = fence?.[1] || (text.trim().startsWith('{') ? text.trim() : null)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
