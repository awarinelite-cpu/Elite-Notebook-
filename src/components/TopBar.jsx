import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { IconMenu, IconSearch, IconGrid, IconList, IconSort, IconMoon, IconSun, IconDrive } from './Icons.jsx'

export default function TopBar({ search, setSearch, onMenuClick, listView, setListView, sortAsc, setSortAsc, onDriveClick }) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase()

  return (
    <header className="topbar">
      <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open menu">
        <IconMenu />
      </button>

      <div className="search-field">
        <IconSearch style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search Keep"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="topbar-icons">
        <button
          className="icon-toggle-btn"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          className="icon-toggle-btn"
          title={listView ? 'Grid view' : 'List view'}
          onClick={() => setListView((v) => !v)}
        >
          {listView ? <IconGrid /> : <IconList />}
        </button>
        <button
          className="icon-toggle-btn"
          title="Sort by last edited"
          onClick={() => setSortAsc((v) => !v)}
        >
          <IconSort />
        </button>
        <button
          className="icon-toggle-btn"
          title="Drive"
          onClick={onDriveClick}
        >
          <IconDrive />
        </button>
        <div className="user-chip">
          {user?.photoURL ? (
            <img className="user-avatar" src={user.photoURL} alt={user.displayName || 'User'} />
          ) : (
            <div className="user-avatar-fallback">{initial}</div>
          )}
        </div>
      </div>
    </header>
  )
}
