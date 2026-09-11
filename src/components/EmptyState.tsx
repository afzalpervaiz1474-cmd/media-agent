import type { ReactNode } from 'react'

export default function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card card-pad flex flex-col items-center text-center py-14">
      {icon && <div className="mb-3 text-[color:var(--color-muted)]">{icon}</div>}
      <div className="h-display text-xl">{title}</div>
      {description && <p className="mt-2 text-sm text-[color:var(--color-muted)] max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
