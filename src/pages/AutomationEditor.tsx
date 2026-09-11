import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import StatusPill from '../components/StatusPill'
import { useToast } from '../contexts/ToastContext'
import { PlayCircle, Save, Trash2, Plus, GripVertical } from 'lucide-react'

const STEP_KINDS = [
  { kind: 'trigger', name: 'Trigger' },
  { kind: 'input', name: 'Input' },
  { kind: 'ai.metadata', name: 'AI: generate metadata' },
  { kind: 'ai.variants', name: 'AI: platform variants' },
  { kind: 'ai.thumbnails', name: 'AI: thumbnail concepts' },
  { kind: 'media.transcode', name: 'Media: transcode' },
  { kind: 'media.thumbnail', name: 'Media: extract thumbnail' },
  { kind: 'validate', name: 'Validate for platform' },
  { kind: 'approval', name: 'Approval gate' },
  { kind: 'publish', name: 'Publish' },
  { kind: 'notify', name: 'Notify' },
]

export default function AutomationEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const { push } = useToast()
  const [loading, setLoading] = useState(!!id)
  const [a, setA] = useState<any>({
    name: 'New automation',
    description: '',
    trigger_type: 'manual',
    schedule_cron: '',
    status: 'active',
    approval_required: true,
    steps: [
      { position: 1, kind: 'trigger', name: 'Manual trigger', config: {} },
      { position: 2, kind: 'ai.metadata', name: 'Generate metadata', config: { tone: 'confident, practical' } },
      { position: 3, kind: 'approval', name: 'Team approval', config: {} },
      { position: 4, kind: 'publish', name: 'Publish', config: { platforms: ['youtube','tiktok'] } },
    ],
  })

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get<{ item: any }>(`/api/automations/${id}`).then((r)=>setA(r.item)).finally(()=>setLoading(false))
  }, [id])

  const save = async () => {
    try {
      const res = id ? await api.put<{ item: any }>(`/api/automations/${id}`, a) : await api.post<{ item: any }>(`/api/automations`, a)
      push({ kind: 'success', title: 'Saved' })
      if (!id && res.item?.id) nav(`/automations/${res.item.id}`, { replace: true })
    } catch (e: any) { push({ kind: 'error', title: 'Save failed', body: e.message }) }
  }
  const run = async () => {
    if (!id) { push({ kind: 'warn', title: 'Save first' }); return }
    try { const r = await api.post<{ job: any }>(`/api/automations/${id}/run`, {}); push({ kind: 'success', title: 'Run queued', body: `Job ${r.job.id.slice(0,8)}` }); nav(`/jobs/${r.job.id}`) }
    catch (e: any) { push({ kind: 'error', title: 'Run failed', body: e.message }) }
  }

  const addStep = () => setA({ ...a, steps: [...(a.steps || []), { position: (a.steps?.length || 0) + 1, kind: 'ai.metadata', name: 'AI step', config: {} }] })
  const removeStep = (i: number) => setA({ ...a, steps: a.steps.filter((_: any, idx: number) => idx !== i).map((s: any, idx: number) => ({ ...s, position: idx + 1 })) })
  const updateStep = (i: number, patch: any) => setA({ ...a, steps: a.steps.map((s: any, idx: number) => idx === i ? { ...s, ...patch } : s) })

  if (loading) return <div className="max-w-5xl mx-auto p-6 md:p-8"><div className="skeleton h-8 w-64 mb-6"/><div className="skeleton h-64"/></div>

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow={id ? `automation/${id.slice(0,8)}` : 'new automation'}
        title={a.name || 'Automation'}
        description="Define trigger and steps. Approval gates require human sign-off before publish steps run."
        actions={<>
          <StatusPill status={a.status} />
          <button onClick={save} className="btn btn-outline"><Save size={14}/> Save</button>
          <button onClick={run} className="btn btn-primary"><PlayCircle size={14}/> Run now</button>
        </>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card card-pad lg:col-span-1 space-y-3">
          <div><div className="label mb-1">Name</div><input className="input" value={a.name} onChange={(e)=>setA({...a, name: e.target.value})} /></div>
          <div><div className="label mb-1">Description</div><textarea className="textarea" value={a.description || ''} onChange={(e)=>setA({...a, description: e.target.value})} /></div>
          <div><div className="label mb-1">Trigger</div>
            <select className="select" value={a.trigger_type} onChange={(e)=>setA({...a, trigger_type: e.target.value})}>
              <option value="manual">Manual</option><option value="scheduled">Scheduled (one-off)</option><option value="recurring">Recurring (cron)</option>
            </select>
          </div>
          {a.trigger_type === 'recurring' && (
            <div><div className="label mb-1">Cron</div><input className="input font-mono" value={a.schedule_cron || ''} onChange={(e)=>setA({...a, schedule_cron: e.target.value})} placeholder="0 9 * * MON" /></div>
          )}
          <div className="flex items-center justify-between border border-[color:var(--color-border)] rounded-lg p-3">
            <div><div className="text-sm font-medium">Approval required</div><div className="text-xs text-[color:var(--color-muted)]">Pause before publish steps</div></div>
            <input type="checkbox" checked={!!a.approval_required} onChange={(e)=>setA({...a, approval_required: e.target.checked})} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-display text-xl">Steps</div>
            <button className="btn btn-outline" onClick={addStep}><Plus size={14}/> Add step</button>
          </div>
          {(a.steps || []).map((s: any, i: number) => (
            <div key={i} className="card card-pad">
              <div className="flex items-start gap-3">
                <GripVertical size={16} className="text-[color:var(--color-muted)] mt-2" />
                <div className="flex-1 grid md:grid-cols-3 gap-3">
                  <div>
                    <div className="label mb-1">Kind</div>
                    <select className="select" value={s.kind} onChange={(e)=>{ const k = STEP_KINDS.find(x=>x.kind===e.target.value); updateStep(i, { kind: e.target.value, name: k?.name || s.name }) }}>
                      {STEP_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <div className="label mb-1">Label</div>
                    <input className="input" value={s.name} onChange={(e)=>updateStep(i, { name: e.target.value })} />
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={()=>removeStep(i)}><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
