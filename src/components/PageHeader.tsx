import type { ReactNode } from 'react'

export default function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div className="max-w-2xl">
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h1 className="h-display text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-[color:var(--color-ink-2)] leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
