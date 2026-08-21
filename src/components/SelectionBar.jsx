import { IconClose, IconShare, IconArchive, IconTrash, IconRestore, IconPin, IconUnpin } from './Icons.jsx'

export default function SelectionBar({
  count,
  allSelected,
  allPinned,
  view,
  sharing,
  onCancel,
  onSelectAll,
  onShare,
  onTogglePin,
  onArchive,
  onTrash,
  onRestore,
  onDeleteForever,
}) {
  return (
    <header className="selection-bar">
      <button className="icon-toggle-btn" title="Cancel selection" onClick={onCancel}>
        <IconClose />
      </button>

      <span className="selection-bar-count">{count} selected</span>

      <button className="selection-bar-textbtn" title={allSelected ? 'Clear all' : 'Select all'} onClick={onSelectAll}>
        {allSelected ? 'Clear all' : 'Select all'}
      </button>

      <div className="selection-bar-actions">
        <button className="icon-toggle-btn" title="Share" onClick={onShare} disabled={sharing}>
          <IconShare />
        </button>

        {view !== 'trash' ? (
          <>
            <button className="icon-toggle-btn" title={allPinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
              {allPinned ? <IconUnpin /> : <IconPin />}
            </button>
            <button className="icon-toggle-btn" title="Archive" onClick={onArchive}>
              <IconArchive />
            </button>
            <button className="icon-toggle-btn" title="Move to trash" onClick={onTrash}>
              <IconTrash />
            </button>
          </>
        ) : (
          <>
            <button className="icon-toggle-btn" title="Restore" onClick={onRestore}>
              <IconRestore />
            </button>
            <button className="icon-toggle-btn" title="Delete forever" onClick={onDeleteForever}>
              <IconClose />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
