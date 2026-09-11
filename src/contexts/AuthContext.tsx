import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import supabase from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, loading: true,
  signOut: async () => {}, refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setUser(s?.user ?? null); setLoading(false)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const signOut = async () => { await supabase.auth.signOut() }
  const refresh = async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session); setUser(data.session?.user ?? null)
  }

  return <AuthContext.Provider value={{ user, session, loading, signOut, refresh }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
