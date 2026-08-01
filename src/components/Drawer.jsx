import { IconBulb, IconBell, IconPlus, IconArchive, IconTrash, IconSettings, IconHelp } from './Icons.jsx'

export default function Drawer({ open, view, setView, onClose }) {
  if (!open) return null

  function go(id) {
    setView(id)
    onClose()
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer">
        <div className="drawer-brand">
          <span className="brand-elite">Elite</span>
          <span className="brand-notebook">Notebook</span>
        </div>

        <button className={`drawer-item ${view === 'notes' ? 'active' : ''}`} onClick={() => go('notes')}>
          <IconBulb className="drawer-icon-svg" />
          Notes
        </button>
        <button className={`drawer-item ${view === 'reminders' ? 'active' : ''}`} onClick={() => go('reminders')}>
          <IconBell className="drawer-icon-svg" />
          Reminders
        </button>
        <button className="drawer-item" onClick={() => go('labels')}>
          <IconPlus className="drawer-icon-svg" />
          Create new label
        </button>

        <div className="drawer-gap" />

        <button className={`drawer-item ${view === 'archive' ? 'active' : ''}`} onClick={() => go('archive')}>
          <IconArchive className="drawer-icon-svg" />
          Archive
        </button>
        <button className={`drawer-item ${view === 'trash' ? 'active' : ''}`} onClick={() => go('trash')}>
          <IconTrash className="drawer-icon-svg" />
          Trash
        </button>

        <div className="drawer-gap" />

        <button className={`drawer-item ${view === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
          <IconSettings className="drawer-icon-svg" />
          Settings
        </button>
        <button className={`drawer-item ${view === 'help' ? 'active' : ''}`} onClick={() => go('help')}>
          <IconHelp className="drawer-icon-svg" />
          Help &amp; feedback
        </button>
      </nav>
    </>
  )
}
