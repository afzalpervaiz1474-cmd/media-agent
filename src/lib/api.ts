import supabase from './supabase'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) || {}),
  }
  const res = await fetch(path, { ...init, headers })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`
    const err = new Error(msg) as Error & { status?: number; body?: any }
    err.status = res.status
    err.body = json
    throw err
  }
  return json as T
}

export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(path: string, body?: any) => apiFetch<T>(path, { method: 'DELETE', body: JSON.stringify(body ?? {}) }),
}
