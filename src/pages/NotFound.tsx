import { Link } from 'react-router-dom'
import { Waves } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <Waves size={22} className="mx-auto text-[color:var(--color-accent)]" />
        <div className="h-display text-6xl mt-4">404</div>
        <p className="mt-2 text-[color:var(--color-muted)]">This route doesn’t exist — or it moved. Try the dashboard.</p>
        <div className="mt-6 flex gap-2 justify-center">
          <Link to="/" className="btn btn-outline">Home</Link>
          <Link to="/dashboard" className="btn btn-primary">Dashboard</Link>
        </div>
      </div>
    </div>
  )
}
