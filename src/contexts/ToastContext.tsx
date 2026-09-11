import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type Toast = { id: string; title: string; body?: string; kind: 'success' | 'error' | 'warn' | 'info' }
type ToastContextValue = { push: (t: Omit<Toast, 'id'>) => void }

const ToastContext = createContext<ToastContextValue>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200)
  }, [])
  const dismiss = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id))

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div key={t.id} className="card card-pad flex gap-3 items-start shadow-lg">
            <div className="mt-0.5">
              {t.kind === 'success' && <CheckCircle2 size={18} className="text-[color:var(--color-success)]" />}
              {t.kind === 'error' && <XCircle size={18} className="text-[color:var(--color-danger)]" />}
              {t.kind === 'warn' && <AlertTriangle size={18} className="text-[color:var(--color-warn)]" />}
              {t.kind === 'info' && <Info size={18} className="text-[color:var(--color-ink-2)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t.title}</div>
              {t.body && <div className="text-xs text-[color:var(--color-muted)] mt-0.5">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="btn btn-ghost h-6 w-6 p-0"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
