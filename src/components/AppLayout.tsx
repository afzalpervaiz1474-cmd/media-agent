import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Upload, Users, Youtube, Music2, Instagram, Facebook,
  Workflow, ListChecks, Bot, Settings as SettingsIcon, LogOut, Moon, Sun, Waves, Bell, Search, Command, Menu, Radio,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/content', icon: FileText, label: 'Content' },
  { to: '/uploads', icon: Upload, label: 'Uploads' },
  { to: '/accounts', icon: Users, label: 'Accounts' },
]
const providers = [
  { to: '/youtube', icon: Youtube, label: 'YouTube' },
  { to: '/tiktok', icon: Music2, label: 'TikTok' },
  { to: '/instagram', icon: Instagram, label: 'Instagram' },
  { to: '/facebook', icon: Facebook, label: 'Facebook' },
]
const ops = [
  { to: '/social/compose', icon: Radio, label: 'Compose' },
  { to: '/automations', icon: Workflow, label: 'Automations' },
  { to: '/jobs', icon: ListChecks, label: 'Jobs' },
  { to: '/ai-helper', icon: Bot, label: 'AI Helper' },
]

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { resolved, setTheme } = useTheme()
  const loc = useLocation()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [loc.pathname])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await api.get<{ items: any[] }>('/api/notifications?unread=1')
        if (alive) setUnread(r.items?.length ?? 0)
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [loc.pathname])

  return (
    <div className="min-h-screen flex bg-[color:var(--color-bg)]">
      {/* sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)] transform transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-14 px-4 flex items-center gap-2 border-b border-[color:var(--color-border)]">
          <Waves size={18} className="text-[color:var(--color-accent)]" />
          <span className="h-display text-lg">Modulate</span>
        </div>
        <nav className="p-3 space-y-6 text-sm overflow-y-auto h-[calc(100vh-3.5rem)]">
          <Section items={nav} />
          <div>
            <div className="label px-3 mb-2">Providers</div>
            <Section items={providers} />
          </div>
          <div>
            <div className="label px-3 mb-2">Automation</div>
            <Section items={ops} />
          </div>
          <div>
            <div className="label px-3 mb-2">Account</div>
            <Section items={[{ to: '/settings', icon: SettingsIcon, label: 'Settings' }]} />
            <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 backdrop-blur sticky top-0 z-20 flex items-center gap-2 px-4">
          <button className="btn btn-ghost lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <div className="flex-1 max-w-xl">
            <label className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-[color:var(--color-muted)]" />
              <input className="input pl-8 pr-14 h-9" placeholder="Search content, jobs, automations…" />
              <span className="absolute right-2 flex items-center gap-1 text-[color:var(--color-muted)]"><Command size={12} /><span className="kbd">K</span></span>
            </label>
          </div>
          <Link to="/settings/notifications" className="btn btn-ghost relative" title="Notifications">
            <Bell size={16} />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />}
          </Link>
          <button className="btn btn-ghost" onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[color:var(--color-border)]">
            <div className="h-7 w-7 rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-bg)] grid place-items-center text-xs font-medium">
              {(user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div className="text-xs leading-tight">
              <div className="font-medium">{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</div>
              <div className="text-[color:var(--color-muted)]">{user?.email}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Section({ items }: { items: { to: string; icon: any; label: string }[] }) {
  return (
    <div className="space-y-0.5">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/dashboard'} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]'}`}>
          <it.icon size={16} />
          <span>{it.label}</span>
        </NavLink>
      ))}
    </div>
  )
}
