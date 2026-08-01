import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="drawer-brand">
          <span className="brand-elite">Elite</span>
          <span className="brand-notebook">Notebook</span>
        </div>
        <p>Capture notes, checklists, and images. Link your documents in when you need them.</p>
        <button className="google-btn" onClick={login}>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
