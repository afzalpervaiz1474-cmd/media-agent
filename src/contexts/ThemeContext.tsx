import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: Theme; setTheme: (t: Theme) => void; resolved: 'light' | 'dark' }

const ThemeContext = createContext<ThemeContextValue>({ theme: 'system', setTheme: () => {}, resolved: 'light' })

function systemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (theme === 'system' ? systemPref() : theme))

  useEffect(() => {
    const r = theme === 'system' ? systemPref() : theme
    setResolved(r)
    document.documentElement.setAttribute('data-theme', r)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { const r = systemPref(); setResolved(r); document.documentElement.setAttribute('data-theme', r) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState, resolved }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
