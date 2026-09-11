import { useEffect, useRef, useState } from 'react'
import supabase from '../lib/supabase'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { formatBytes, formatDuration, safeFilename, timeAgo } from '../lib/format'
import { useToast } from '../contexts/ToastContext'
import { Upload, Trash2, Film, Loader2 } from 'lucide-react'

const ALLOWED = ['video/mp4','video/quicktime','video/webm','image/png','image/jpeg','image/webp']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

export default function Uploads() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { push } = useToast()

  const load = () => {
    setLoading(true)
    api.get<{ items: any[] }>(`/api/media`).then((r) => setItems(r.items || [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const upload = async (file: File) => {
    if (!ALLOWED.includes(file.type)) { push({ kind: 'error', title: 'Unsupported file type', body: file.type || 'unknown' }); return }
    if (file.size > MAX_BYTES) { push({ kind: 'error', title: 'File too large', body: `Max ${formatBytes(MAX_BYTES)}` }); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const name = safeFilename(file.name)
    const path = `${user.id}/${Date.now()}_${name}`
    setUploading({ name: file.name, progress: 5 })
    const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false })
    setUploading({ name: file.name, progress: 70 })
    if (error) { setUploading(null); push({ kind: 'error', title: 'Upload failed', body: error.message }); return }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
    let duration: number | null = null, width: number | null = null, height: number | null = null
    if (file.type.startsWith('video/')) {
      try {
        const meta = await probeVideo(file)
        duration = meta.duration; width = meta.width; height = meta.height
      } catch { /* ignore */ }
    }
    await api.post('/api/media', {
      filename: name,
      storage_path: path,
      public_url: urlData.publicUrl,
      mime_type: file.type,
      size_bytes: file.size,
      duration_sec: duration, width, height,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
    })
    setUploading(null)
    push({ kind: 'success', title: 'Uploaded', body: file.name })
    load()
  }

  const remove = async (m: any) => {
    if (!confirm(`Delete ${m.filename}? This removes the file from storage.`)) return
    try {
      await supabase.storage.from('media').remove([m.storage_path])
    } catch { /* soft ignore */ }
    await api.del(`/api/media/${m.id}`)
    push({ kind: 'success', title: 'Removed' })
    load()
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <PageHeader
        eyebrow="Media"
        title="Uploads"
        description="Videos and images are stored in Supabase Storage. Every asset records mime type, size, and duration."
        actions={<>
          <input ref={input} type="file" hidden accept={ALLOWED.join(',')} onChange={(e) => e.target.files && upload(e.target.files[0])} />
          <button className="btn btn-primary" onClick={() => input.current?.click()}><Upload size={14}/> Upload media</button>
        </>}
      />

      {uploading && (
        <div className="card card-pad mb-4">
          <div className="flex items-center gap-3">
            <Loader2 size={16} className="animate-spin text-[color:var(--color-accent)]" />
            <div className="flex-1">
              <div className="text-sm font-medium truncate">{uploading.name}</div>
              <div className="h-1.5 bg-[color:var(--color-surface-2)] rounded-full mt-1 overflow-hidden"><div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${uploading.progress}%` }} /></div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="p-6 space-y-3">{[0,1,2].map((i)=>(<div key={i} className="skeleton h-10" />))}</div>
        ) : items.length === 0 ? (
          <div className="p-8"><EmptyState icon={<Film size={24}/>} title="No uploads yet" description="Drag a video here or click Upload media. MP4, MOV, WebM, PNG, JPG, WebP up to 500 MB." action={<button className="btn btn-primary" onClick={() => input.current?.click()}><Upload size={14}/> Upload media</button>} /></div>
        ) : (
          <table className="table">
            <thead><tr><th>File</th><th>Kind</th><th>Size</th><th>Duration</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>
                    <a href={m.public_url} target="_blank" rel="noreferrer" className="link">{m.filename}</a>
                    {m.width && m.height && <div className="text-xs text-[color:var(--color-muted)]">{m.width}×{m.height}</div>}
                  </td>
                  <td><span className="chip">{m.kind}</span></td>
                  <td className="font-mono text-xs">{formatBytes(m.size_bytes)}</td>
                  <td className="font-mono text-xs">{formatDuration(m.duration_sec)}</td>
                  <td className="text-xs text-[color:var(--color-muted)]">{timeAgo(m.created_at)}</td>
                  <td className="text-right"><button className="btn btn-ghost" onClick={() => remove(m)}><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function probeVideo(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }) }
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot read video metadata')) }
    v.src = url
  })
}
