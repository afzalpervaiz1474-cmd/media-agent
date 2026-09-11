import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { User, ShieldCheck, Bell, Bot, ArrowUpRight } from 'lucide-react'

export default function Settings() {
  const items = [
    { to: '/settings/profile', icon: User, title: 'Profile', desc: 'Display name, avatar, workspace preferences.' },
    { to: '/settings/security', icon: ShieldCheck, title: 'Security', desc: 'Password, active sessions, sign out other devices.' },
    { to: '/settings/notifications', icon: Bell, title: 'Notifications', desc: 'In-app + email preferences, mute noisy events.' },
    { to: '/settings/ai-providers', icon: Bot, title: 'AI providers', desc: 'Bring your own key. OpenRouter, OpenAI, Groq, Gemini, Ollama, OpenAI-compatible.' },
  ]
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your workspace preferences." />
      <div className="grid gap-3">
        {items.map((it) => (
          <Link key={it.to} to={it.to} className="card card-pad flex items-center justify-between hover:border-[color:var(--color-border-strong)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[color:var(--color-surface-2)] grid place-items-center"><it.icon size={18}/></div>
              <div>
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-[color:var(--color-muted)]">{it.desc}</div>
              </div>
            </div>
            <ArrowUpRight size={16} className="text-[color:var(--color-muted)]"/>
          </Link>
        ))}
      </div>
    </div>
  )
}
