export default function StatusPill({ status }: { status: string }) {
  const s = (status || '').toUpperCase()
  const map: Record<string, string> = {
    COMPLETED: 'chip-success',
    SUCCESS: 'chip-success',
    APPROVED: 'chip-success',
    ACTIVE: 'chip-success',
    PASS: 'chip-success',
    QUEUED: 'chip',
    DRAFT: 'chip',
    PAUSED: 'chip',
    MANUAL: 'chip',
    SKIP: 'chip',
    SKIPPED: 'chip',
    VALIDATING: 'chip-accent',
    PREPARING_MEDIA: 'chip-accent',
    UPLOADING: 'chip-accent',
    PROCESSING: 'chip-accent',
    PUBLISHING: 'chip-accent',
    RETRYING: 'chip-warn',
    SCHEDULED: 'chip-warn',
    WARNING: 'chip-warn',
    WAITING_FOR_APPROVAL: 'chip-warn',
    PENDING_APPROVAL: 'chip-warn',
    AUTHORIZATION_REQUIRED: 'chip-warn',
    FAIL: 'chip-danger',
    FAILED: 'chip-danger',
    CANCELLED: 'chip-danger',
  }
  const cls = map[s] || 'chip'
  return <span className={`chip ${cls}`}>{s.toLowerCase().replace(/_/g, ' ')}</span>
}
