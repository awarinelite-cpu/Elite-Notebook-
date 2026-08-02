import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { IconSignOut, IconMoon, IconSun } from './Icons.jsx'

export default function SettingsPanel() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div style={{ maxWidth: 420 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 18px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" style={{ width: 44, height: 44, borderRadius: '50%' }} />
        ) : (
          <div className="user-avatar-fallback" style={{ width: 44, height: 44, fontSize: 18 }}>
            {(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.displayName || 'Signed in'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{user?.email}</div>
        </div>
      </div>

      <button
        onClick={toggleTheme}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 14,
          marginBottom: 10,
        }}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
        {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      </button>

      <button
        onClick={logout}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 14,
        }}
      >
        <IconSignOut />
        Sign out
      </button>
    </div>
  )
}
