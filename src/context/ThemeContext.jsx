import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const THEMES = ['light', 'dark', 'oled']

function getInitialTheme() {
  const saved = localStorage.getItem('theme')
  if (THEMES.includes(saved)) return saved
  // OLED is opt-in only — never picked from system preference, since most
  // people who prefer dark mode still want the softer gray, not true black.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function setTheme(next) {
    if (THEMES.includes(next)) setThemeState(next)
  }

  // Kept for existing callers: cycles light <-> dark only, since a blind
  // toggle isn't the right interaction for a 3-way choice — OLED is
  // selected explicitly via setTheme instead.
  function toggleTheme() {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
