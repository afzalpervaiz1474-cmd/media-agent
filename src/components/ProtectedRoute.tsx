import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-sm text-[color:var(--color-muted)]">
      Restoring session…
    </div>
  )
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <>{children}</>
}
