import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { IconSignOut, IconMoon, IconSun, IconLock } from './Icons.jsx'
import { PinModal } from './SecurityLock.jsx'

const rowStyle = {
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
}

export default function SettingsPanel({ security }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [pinModal, setPinModal] = useState(null) // 'setup' | 'change' | 'remove' | null

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

      {security && !security.loading && (
        <>
          {!security.hasPin ? (
            <button style={rowStyle} onClick={() => setPinModal('setup')}>
              <IconLock />
              Set up PIN lock
            </button>
          ) : (
            <>
              <button style={rowStyle} onClick={() => setPinModal('change')}>
                <IconLock />
                Change PIN
              </button>
              <button style={rowStyle} onClick={() => setPinModal('remove')}>
                <IconLock />
                Turn off PIN lock
              </button>
              <button style={rowStyle} onClick={security.lock}>
                <IconLock />
                Lock now
              </button>
            </>
          )}
        </>
      )}

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

      {pinModal && security && (
        <PinModal mode={pinModal} security={security} onClose={() => setPinModal(null)} />
      )}
    </div>
  )
}
