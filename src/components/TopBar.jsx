import { useAuth } from '../context/AuthContext.jsx'

export default function TopBar({ search, setSearch, onMenuClick, listView, setListView, sortAsc, setSortAsc }) {
  const { user } = useAuth()
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase()

  return (
    <header className="topbar">
      <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open menu">
        &#9776;
      </button>

      <div className="search-field">
        <span>&#128269;</span>
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
          title={listView ? 'Grid view' : 'List view'}
          onClick={() => setListView((v) => !v)}
        >
          {listView ? '\u25A6' : '\u2637'}
        </button>
        <button
          className="icon-toggle-btn"
          title="Sort by last edited"
          onClick={() => setSortAsc((v) => !v)}
        >
          {sortAsc ? '\u2191\u2193' : '\u2193\u2191'}
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
