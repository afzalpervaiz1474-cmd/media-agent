import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null, session: null, loading: true,
  signOut: async () => {}, refresh: async () => {},
})

export const useAuth = () => useContext(AuthContext)
