import { NAV_ITEMS } from '../constants.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function Drawer({ open, view, setView, onClose }) {
  const { logout } = useAuth()
  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer">
        <div className="drawer-brand">
          <div className="drawer-brand-mark">EN</div>
          <span>Elite Notebook</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`drawer-item ${view === item.id ? 'active' : ''}`}
            onClick={() => {
              setView(item.id)
              onClose()
            }}
          >
            <span className="drawer-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
        <button className="drawer-item" onClick={logout}>
          <span className="drawer-icon">&#8618;</span>
          Sign out
        </button>
      </nav>
    </>
  )
}
