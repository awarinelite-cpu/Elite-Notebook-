export default function Toast({ message, actionLabel, onAction, onClose }) {
  if (!message) return null
  return (
    <div className="toast">
      <span className="toast-message" onClick={onClose}>{message}</span>
      {actionLabel && (
        <button
          className="toast-action"
          onClick={(e) => {
            e.stopPropagation()
            onAction?.()
            onClose?.()
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
