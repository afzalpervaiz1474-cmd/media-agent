import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(url as string, key as string, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export default supabase
