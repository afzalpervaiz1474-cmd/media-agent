import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, Workflow, ShieldCheck, PlayCircle, Wand2, Boxes, Zap, LineChart } from 'lucide-react'

export default function Landing() {
  return (
    <div>
      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-noise opacity-40 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 relative">
          <div className="chip chip-accent mb-6"><Sparkles size={12} /> New · Bounded AI agent with tool registry</div>
          <h1 className="h-display text-5xl md:text-7xl leading-[1.02] tracking-tight max-w-4xl">
            The production line for <em className="not-italic text-[color:var(--color-accent)]">social video</em>, wired end to end.
          </h1>
          <p className="mt-6 text-lg text-[color:var(--color-ink-2)] max-w-2xl leading-relaxed">
            Modulate is an AI automation studio for creators and lean teams. Upload once, generate metadata, cut variants, route through approvals, and publish to YouTube, TikTok, Instagram and Facebook — with a real audit trail and no fake success messages.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn btn-primary h-11 px-5">Start free <ArrowRight size={16} /></Link>
            <Link to="/login" className="btn btn-outline h-11 px-5">I have an account</Link>
          </div>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
            {[
              ['Real DB', 'Every action persists'],
              ['Real OAuth', 'Official provider APIs'],
              ['Real jobs', 'State machine + retries'],
              ['Real agents', 'Tool registry, no shell'],
            ].map(([t, s]) => (
              <div key={t} className="card card-pad">
                <div className="h-display text-lg">{t}</div>
                <div className="text-xs text-[color:var(--color-muted)] mt-1">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pipeline */}
      <section id="pipeline" className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="label mb-3">The pipeline</div>
          <h2 className="h-display text-3xl md:text-4xl max-w-2xl">From raw footage to published post — one traceable flow.</h2>
          <div className="mt-10 grid md:grid-cols-4 gap-4">
            {[
              { icon: PlayCircle, t: 'Ingest', d: 'Multipart uploads to object storage. MIME, size and duration checks.' },
              { icon: Wand2, t: 'Enrich', d: 'AI titles, descriptions, hashtags, CTA, thumbnail concepts, per platform.' },
              { icon: Workflow, t: 'Route', d: 'Approval-aware automations with pause, resume, retry and history.' },
              { icon: ShieldCheck, t: 'Publish', d: 'Provider-confirmed posts only. No fabricated URLs or IDs, ever.' },
            ].map((s) => (
              <div key={s.t} className="card card-pad">
                <s.icon size={18} className="text-[color:var(--color-accent)]" />
                <div className="h-display text-xl mt-3">{s.t}</div>
                <p className="mt-1 text-sm text-[color:var(--color-ink-2)] leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* studio */}
      <section id="studio" className="border-t border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="label mb-3">Content studio</div>
            <h2 className="h-display text-3xl md:text-4xl">Write less. Approve faster. Ship on cadence.</h2>
            <p className="mt-4 text-[color:var(--color-ink-2)] leading-relaxed">
              Pick a platform mix, describe the audience and tone, and Modulate produces platform-specific variants you can edit, regenerate, approve and schedule. Every draft is versioned in Postgres, not in a browser tab.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Platform-aware caption + hashtag generation',
                'Thumbnail concepts with palette suggestions',
                'Approval gate before anything reaches a provider',
                'Full activity log for every content record',
              ].map((f) => (<li key={f} className="flex gap-2"><Zap size={14} className="mt-1 text-[color:var(--color-accent)]" /><span>{f}</span></li>))}
            </ul>
          </div>
          <div className="card card-pad">
            <div className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]"><Boxes size={12}/> content/458·draft</div>
            <div className="h-display text-2xl mt-2">How we redesigned our onboarding in 7 days</div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <span className="chip">youtube</span><span className="chip">instagram</span><span className="chip">tiktok</span>
            </div>
            <div className="mt-4 text-sm text-[color:var(--color-ink-2)] leading-relaxed">
              A 34-second look at how we cut activation friction by 41% by rebuilding the first-run experience around a single Aha moment.
            </div>
            <div className="divider my-4" />
            <div className="flex gap-2">
              <span className="chip chip-accent">#productdesign</span><span className="chip chip-accent">#saas</span><span className="chip chip-accent">#onboarding</span>
            </div>
          </div>
        </div>
      </section>

      {/* agents */}
      <section id="agents" className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="label mb-3">Bounded AI agents</div>
              <h2 className="h-display text-3xl md:text-4xl">Planner. Executor. Auditor.</h2>
              <p className="mt-4 text-[color:var(--color-ink-2)] leading-relaxed">
                The Modulate agent runs against a whitelisted tool registry with schema-validated arguments. No shell, no arbitrary web calls, no silent publishes. Everything is logged, everything is reversible.
              </p>
            </div>
            <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
              {[
                ['generate_titles', 'Produces N candidate titles for a given platform.'],
                ['generate_hashtags', 'Ranks hashtags by relevance and reach class.'],
                ['create_platform_variants', 'Rewrites a caption for each requested platform.'],
                ['analyze_content', 'Extracts hook, promise and payoff from a script.'],
              ].map(([n, d]) => (
                <div key={n} className="card card-pad">
                  <div className="font-mono text-xs text-[color:var(--color-accent)]">tool: {n}</div>
                  <div className="mt-2 text-sm text-[color:var(--color-ink-2)]">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-[color:var(--color-border)]">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <LineChart size={22} className="mx-auto text-[color:var(--color-accent)]" />
          <h2 className="h-display text-4xl md:text-5xl mt-4">Ship a week of content in an afternoon.</h2>
          <p className="mt-4 text-[color:var(--color-ink-2)] max-w-xl mx-auto">
            Free while in beta. Bring your own OAuth apps and AI keys. Your data stays yours.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/signup" className="btn btn-primary h-11 px-6">Create your workspace <ArrowRight size={16} /></Link>
            <Link to="/login" className="btn btn-outline h-11 px-6">Sign in</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
