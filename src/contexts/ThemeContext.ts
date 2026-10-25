import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: Theme; setTheme: (t: Theme) => void; resolved: 'light' | 'dark' }

export const ThemeContext = createContext<ThemeContextValue>({ theme: 'system', setTheme: () => {}, resolved: 'light' })

export function systemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useTheme = () => useContext(ThemeContext)
