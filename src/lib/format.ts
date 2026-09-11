export function timeAgo(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const d = typeof input === 'string' ? new Date(input) : input
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const day = Math.floor(h / 24)
  if (day < 30) return `${day}d ago`
  return d.toLocaleDateString()
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec?: number | null) {
  if (sec == null) return '—'
  const s = Math.round(Number(sec))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${m}:${String(rest).padStart(2, '0')}`
}

export function safeFilename(name: string) {
  return name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 200)
}

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}
