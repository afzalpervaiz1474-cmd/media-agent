import { createContext, useContext } from 'react'

export type Toast = { id: string; title: string; body?: string; kind: 'success' | 'error' | 'warn' | 'info' }
type ToastContextValue = { push: (t: Omit<Toast, 'id'>) => void }

export const ToastContext = createContext<ToastContextValue>({ push: () => {} })

export const useToast = () => useContext(ToastContext)
