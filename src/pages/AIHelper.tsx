import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useToast } from '../contexts/ToastContext'
import { Bot, Send, Loader2, Plus, MessageSquare, ShieldAlert, Wrench } from 'lucide-react'

type Msg = { id?: string; role: 'user'|'assistant'|'system'|'tool'; content: string; tool_calls?: any[]; metadata?: any }
type Conv = { id: string; title: string; created_at: string }

export default function AIHelper() {
  const [conversations, setConversations] = useState<Conv[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const { push } = useToast()
  const scroller = useRef<HTMLDivElement>(null)

  const loadConvs = async () => {
    const r = await api.get<{ items: Conv[]; configured: boolean }>('/api/ai/chat')
    setConversations(r.items || [])
    setConfigured(r.configured)
    if (!current && r.items?.[0]) selectConv(r.items[0].id)
  }

  useEffect(() => { loadConvs() }, [])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  const selectConv = async (id: string) => {
    setCurrent(id)
    const r = await api.get<{ messages: Msg[] }>(`/api/ai/chat/${id}`)
    setMessages(r.messages || [])
  }

  const newConv = async () => {
    const r = await api.post<{ item: Conv }>('/api/ai/chat', { title: 'New chat' })
    await loadConvs(); selectConv(r.item.id); setMessages([])
  }

  const send = async () => {
    if (!input.trim()) return
    const userMsg: Msg = { role: 'user', content: input }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const r = await api.post<{ message: Msg; conversation_id: string; configured: boolean }>(`/api/ai/chat/${current || 'new'}`, { content: userMsg.content })
      if (!current) { setCurrent(r.conversation_id); loadConvs() }
      setMessages((m) => [...m, r.message])
      if (!r.configured) push({ kind: 'info', title: 'AI not configured', body: 'Add OPENROUTER_API_KEY to enable model calls. Draft mode is on.' })
    } catch (e: any) { push({ kind: 'error', title: 'AI failed', body: e.message }) }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Agent"
        title="AI Helper"
        description="A bounded agent scoped to your workspace. Tools are whitelisted and validated — no shell, no arbitrary web access."
        actions={<button className="btn btn-outline" onClick={newConv}><Plus size={14}/> New chat</button>}
      />

      {configured === false && (
        <div className="card card-pad mb-4 border-[color:var(--color-warn)]/40">
          <div className="flex items-center gap-2 text-[color:var(--color-warn)]"><ShieldAlert size={16}/><span className="font-medium">AI provider not configured</span></div>
          <p className="text-sm text-[color:var(--color-ink-2)] mt-2">Set <span className="font-mono">OPENROUTER_API_KEY</span> (or <span className="font-mono">OPENAI_API_KEY</span>) in your server env to enable model calls. Until then, the helper runs in draft mode and returns deterministic templates.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-[240px_1fr] gap-4 min-h-[70vh]">
        <aside className="card p-2 space-y-1 h-fit lg:sticky lg:top-16">
          {conversations.length === 0 && <div className="p-3 text-xs text-[color:var(--color-muted)]">No chats yet.</div>}
          {conversations.map((c) => (
            <button key={c.id} onClick={()=>selectConv(c.id)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ${current===c.id?'bg-[color:var(--color-surface-2)]':'hover:bg-[color:var(--color-surface-2)]'}`}>
              <MessageSquare size={14} className="text-[color:var(--color-muted)]"/>
              <span className="text-sm truncate">{c.title}</span>
            </button>
          ))}
        </aside>
        <div className="card flex flex-col min-h-[70vh]">
          <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="h-full grid place-items-center text-center">
                <div>
                  <Bot size={28} className="mx-auto text-[color:var(--color-accent)]"/>
                  <div className="h-display text-xl mt-2">Ask the agent</div>
                  <p className="text-sm text-[color:var(--color-muted)] mt-1 max-w-sm">Try: “Draft a 3-part YouTube Shorts pipeline from my latest upload” or “Refresh Instagram captions for drafts.”</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role==='user'?'justify-end':''}`}>
                {m.role !== 'user' && <div className="h-7 w-7 rounded-full bg-[color:var(--color-surface-2)] grid place-items-center flex-shrink-0"><Bot size={14}/></div>}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role==='user'?'bg-[color:var(--color-ink)] text-[color:var(--color-bg)]':'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]'}`}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {(m.tool_calls && m.tool_calls.length > 0) && (
                    <div className="mt-2 space-y-1">
                      {m.tool_calls.map((t: any, k: number) => (
                        <div key={k} className="text-xs font-mono flex items-center gap-1.5 text-[color:var(--color-accent)]"><Wrench size={10}/> {t.name}({t.args && Object.keys(t.args).slice(0,3).join(', ')})</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3"><div className="h-7 w-7 rounded-full bg-[color:var(--color-surface-2)] grid place-items-center"><Bot size={14}/></div><div className="rounded-2xl bg-[color:var(--color-surface-2)] px-4 py-3"><Loader2 size={14} className="animate-spin"/></div></div>
            )}
          </div>
          <div className="border-t border-[color:var(--color-border)] p-3 flex gap-2">
            <input className="input flex-1" placeholder="Message the agent…" value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}><Send size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  )
}
