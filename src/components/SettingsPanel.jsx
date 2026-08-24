import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useInstallPrompt } from '../hooks/useInstallPrompt.js'
import { IconSignOut, IconMoon, IconSun, IconLock, IconDownload, IconFingerprint } from './Icons.jsx'
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
  const { theme, setTheme } = useTheme()
  const install = useInstallPrompt()
  const [pinModal, setPinModal] = useState(null) // 'setup' | 'change' | 'remove' | null
  const [bioBusy, setBioBusy] = useState(false)
  const [bioError, setBioError] = useState('')

  async function toggleBiometric() {
    setBioError('')
    if (security.biometricEnrolled) {
      security.disableBiometric()
      return
    }
    setBioBusy(true)
    try {
      await security.enableBiometric()
    } catch (e) {
      setBioError(
        e.name === 'NotAllowedError'
          ? 'Fingerprint setup was cancelled.'
          : (e.message || 'Could not set up fingerprint unlock on this device.')
      )
    }
    setBioBusy(false)
  }

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

      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', padding: '0 2px' }}>Theme</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'light', label: 'Light', icon: <IconSun width="16" height="16" /> },
            { id: 'dark', label: 'Dark', icon: <IconMoon width="16" height="16" /> },
            { id: 'oled', label: 'OLED black', icon: <IconMoon width="16" height="16" /> },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 6px',
                background: theme === opt.id ? 'var(--surface-soft)' : 'transparent',
                border: `1px solid ${theme === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--ink)',
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!install.standalone && install.canPromptInstall && (
        <button style={rowStyle} onClick={install.promptInstall}>
          <IconDownload />
          Install app
        </button>
      )}

      {!install.standalone && !install.canPromptInstall && install.isIOS && (
        <div style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconDownload />
            Install app
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', paddingLeft: 30 }}>
            Tap Share, then "Add to Home Screen" to install.
          </div>
        </div>
      )}

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
              {security.biometricSupported && (
                <>
                  <button style={rowStyle} onClick={toggleBiometric} disabled={bioBusy}>
                    <IconFingerprint />
                    {bioBusy
                      ? 'Setting up…'
                      : security.biometricEnrolled
                        ? 'Turn off Fingerprint unlock'
                        : 'Enable Fingerprint unlock'}
                  </button>
                  {bioError && (
                    <div style={{ color: '#E05252', fontSize: 12.5, margin: '-4px 0 10px 4px' }}>{bioError}</div>
                  )}
                </>
              )}
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
