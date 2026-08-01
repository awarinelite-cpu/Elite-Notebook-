import { NAV_ITEMS } from '../constants.js'

export default function Sidebar({ view, setView }) {
  return (
    <nav className="spine">
      <div className="spine-logo">EN</div>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`spine-tab ${view === item.id ? 'active' : ''}`}
          onClick={() => setView(item.id)}
        >
          <span className="spine-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
