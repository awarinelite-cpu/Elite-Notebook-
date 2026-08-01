import { useAuth } from '../context/AuthContext.jsx'

const TITLES = {
  notes: 'Notes',
  reminders: 'Alerts',
  labels: 'Labels',
  archive: 'Archive',
  trash: 'Trash',
}

export default function TopBar({ view, search, setSearch }) {
  const { user, logout } = useAuth()

  return (
    <header className="topbar">
      <h1>{TITLES[view] || 'Notes'}</h1>
      <div className="search-field">
        <span>&#128269;</span>
        <input
          type="text"
          placeholder="Search your notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="user-chip">
        {user?.photoURL && <img src={user.photoURL} alt={user.displayName || 'User'} />}
        <button className="text-btn" onClick={logout}>
          Sign out
        </button>
      </div>
    </header>
  )
}
