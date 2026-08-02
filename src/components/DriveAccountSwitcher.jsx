import { useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconCheck, IconUserPlus, IconSignOut } from './Icons.jsx'

function initialOf(account) {
  return (account.name || account.email || '?').trim().charAt(0).toUpperCase()
}

export default function DriveAccountSwitcher({ accounts, activeEmail, onSwitch, onAddAccount, onDisconnect, connecting }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = accounts.find((a) => a.email === activeEmail)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="drive-switcher" ref={ref}>
      <button className="drive-switcher-trigger" onClick={() => setOpen((v) => !v)}>
        {active?.picture ? (
          <img src={active.picture} alt="" className="drive-switcher-avatar" />
        ) : (
          <span className="drive-switcher-avatar drive-switcher-avatar-fallback">{active ? initialOf(active) : '?'}</span>
        )}
        <span className="drive-account-email">{active?.email || 'Select account'}</span>
        <IconChevronDown width="16" height="16" />
      </button>

      {open && (
        <div className="drive-switcher-menu">
          {accounts.map((a) => (
            <div key={a.email} className={`drive-switcher-item ${a.email === activeEmail ? 'active' : ''}`}>
              <button
                className="drive-switcher-item-main"
                onClick={() => { onSwitch(a.email); setOpen(false) }}
              >
                {a.picture ? (
                  <img src={a.picture} alt="" className="drive-switcher-avatar" />
                ) : (
                  <span className="drive-switcher-avatar drive-switcher-avatar-fallback">{initialOf(a)}</span>
                )}
                <span className="drive-switcher-item-text">
                  <span className="drive-switcher-item-name">{a.name || a.email}</span>
                  {a.name && <span className="drive-switcher-item-email">{a.email}</span>}
                </span>
                {a.email === activeEmail && <IconCheck width="16" height="16" />}
              </button>
              <button
                className="icon-btn drive-switcher-remove"
                title={`Disconnect ${a.email}`}
                onClick={() => onDisconnect(a.email)}
              >
                <IconSignOut width="15" height="15" />
              </button>
            </div>
          ))}
          <button
            className="drive-switcher-add"
            onClick={() => { setOpen(false); onAddAccount() }}
            disabled={connecting}
          >
            <IconUserPlus width="16" height="16" />
            {connecting ? 'Connecting…' : 'Add another account'}
          </button>
        </div>
      )}
    </div>
  )
}
