import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Friendlier text for the Firebase Auth error codes we're likely to hit here.
function friendlyError(err) {
  switch (err?.code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.'
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.'
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Try logging in instead.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    default:
      return err?.message?.replace(/^Firebase:\s*/, '') || 'Something went wrong. Please try again.'
  }
}

export default function Login() {
  const { login, loginWithEmail, signupWithEmail, resetPassword } = useAuth()

  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signupWithEmail(email, password)
      } else {
        await loginWithEmail(email, password)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotPassword() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?"')
      return
    }
    setBusy(true)
    try {
      await resetPassword(email)
      setInfo('Password reset email sent. Check your inbox.')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/icon-512.png" alt="Elite Notebook" className="login-logo" />
        <p>Capture notes, checklists, and images. Link your documents in when you need them.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="login-input"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />

          {error && <div className="login-error">{error}</div>}
          {info && <div className="login-info">{info}</div>}

          <button type="submit" className="email-btn" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' ? (
            <button type="button" className="login-link" onClick={() => { setMode('signup'); setError(''); setInfo('') }} disabled={busy}>
              Need an account? Sign up
            </button>
          ) : (
            <button type="button" className="login-link" onClick={() => { setMode('login'); setError(''); setInfo('') }} disabled={busy}>
              Already have an account? Log in
            </button>
          )}
          <button type="button" className="login-link" onClick={handleForgotPassword} disabled={busy}>
            Forgot password?
          </button>
        </div>

        <div className="login-divider"><span>or</span></div>

        <button className="google-btn" onClick={login} disabled={busy}>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
