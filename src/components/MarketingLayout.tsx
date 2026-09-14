import { Link, Outlet, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Moon, Sun, Waves } from 'lucide-react'

export default function MarketingLayout() {
  const { user, loading } = useAuth()
  const { resolved, setTheme } = useTheme()
  const [params] = useSearchParams()
  if (loading) return null
  if (user) return <Navigate to={params.get('next') || '/dashboard'} replace />
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Waves size={18} className="text-[color:var(--color-accent)]" />
            <span className="h-display text-lg">Modulate</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#pipeline" className="btn btn-ghost hidden sm:inline-flex">Pipeline</a>
            <a href="#studio" className="btn btn-ghost hidden sm:inline-flex">Studio</a>
            <a href="#agents" className="btn btn-ghost hidden sm:inline-flex">Agents</a>
            <button className="btn btn-ghost" onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} title="Toggle theme">
              {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {!user ? (
              <>
                <Link to="/login" className="btn btn-ghost">Sign in</Link>
                <Link to="/signup" className="btn btn-primary">Start free</Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-[color:var(--color-border)] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[color:var(--color-muted)]">
          <div className="flex items-center gap-2"><Waves size={14} className="text-[color:var(--color-accent)]" /> © {new Date().getFullYear()} Modulate. Built for creators who ship.</div>
          <div className="flex gap-4">
            <a className="link" href="https://developers.google.com/youtube/v3" target="_blank" rel="noreferrer">YouTube API</a>
            <a className="link" href="https://developers.tiktok.com/" target="_blank" rel="noreferrer">TikTok API</a>
            <a className="link" href="https://developers.facebook.com/docs/instagram-api" target="_blank" rel="noreferrer">Meta Graph</a>
            <Link to="/privacy-policy" className="link">Privacy Policy</Link>
            <Link to="/terms" className="link">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
