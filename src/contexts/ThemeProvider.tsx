import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, systemPref, type Theme } from './ThemeContext'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPref() === 'dark')
  // Resolved theme is derived during render instead of being set inside an
  // effect, so no effect ever sets state synchronously.
  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    localStorage.setItem('theme', theme)
  }, [theme, resolved])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { setSystemDark(mq.matches) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme: setThemeState, resolved }}>{children}</ThemeContext.Provider>
}
