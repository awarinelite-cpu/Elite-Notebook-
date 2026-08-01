export default function Toast({ message, onClose }) {
  if (!message) return null
  return (
    <div className="toast" onClick={onClose}>
      {message}
    </div>
  )
}
