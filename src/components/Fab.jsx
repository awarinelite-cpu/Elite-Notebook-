export default function Fab({ onClick }) {
  return (
    <button className="fab" onClick={onClick} aria-label="New note">
      +
    </button>
  )
}
