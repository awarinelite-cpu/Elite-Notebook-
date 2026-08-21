import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { IconSignOut, IconFingerprint } from './Icons.jsx'

const PIN_LENGTH = 4

function PinDots({ length, filled }) {
  return (
    <div className="pin-dots">
      {Array.from({ length }).map((_, i) => (
        <span key={i} className={`pin-dot${i < filled ? ' filled' : ''}`} />
      ))}
    </div>
  )
}

function PinKeypad({ onPress, onBackspace }) {
  return (
    <div className="pin-keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button key={n} type="button" onClick={() => onPress(String(n))}>
          {n}
        </button>
      ))}
      <span aria-hidden="true" />
      <button type="button" onClick={() => onPress('0')}>
        0
      </button>
      <button type="button" onClick={onBackspace} aria-label="Backspace">
        ⌫
      </button>
    </div>
  )
}

// Full-screen lock shown after Google sign-in but before the notes. First
// visit walks the person through choosing a PIN; every visit after that
// requires it to unlock.
export default function SecurityLock({ security }) {
  const { user, logout } = useAuth()
  const isSetup = !security.hasPin

  const [stage, setStage] = useState('enter') // 'enter' | 'confirm'
  const [firstPin, setFirstPin] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Fingerprint unlock is only offered once a PIN already exists — see
  // useSecurity.js. It's a shortcut alongside the PIN, not instead of it.
  const canUseBiometric = !isSetup && security.biometricEnrolled
  const [bioChecking, setBioChecking] = useState(false)
  const [bioError, setBioError] = useState('')

  const tryBiometric = useCallback(async () => {
    if (busy || bioChecking) return
    setBioChecking(true)
    setBioError('')
    try {
      const ok = await security.unlockWithBiometric()
      if (!ok) setBioError('Fingerprint not recognized — try again or use your PIN.')
    } catch (e) {
      setBioError(
        e.name === 'NotAllowedError'
          ? 'Fingerprint unlock cancelled — use your PIN below.'
          : (e.message || 'Could not verify fingerprint on this device.')
      )
    }
    setBioChecking(false)
  }, [security, busy, bioChecking])

  // Prompt for fingerprint automatically the moment the lock screen shows.
  useEffect(() => {
    if (canUseBiometric) tryBiometric()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseBiometric])

  function press(digit) {
    if (busy || value.length >= PIN_LENGTH) return
    const next = value + digit
    setValue(next)
    if (next.length === PIN_LENGTH) submit(next)
  }

  function backspace() {
    if (busy) return
    setError('')
    setValue((v) => v.slice(0, -1))
  }

  async function submit(pin) {
    setError('')
    if (isSetup) {
      if (stage === 'enter') {
        setFirstPin(pin)
        setValue('')
        setStage('confirm')
        return
      }
      if (pin !== firstPin) {
        setError("PINs didn't match — try again")
        setFirstPin('')
        setValue('')
        setStage('enter')
        return
      }
      setBusy(true)
      await security.setPin(pin)
      setBusy(false)
    } else {
      setBusy(true)
      const ok = await security.verifyPin(pin)
      setBusy(false)
      if (!ok) {
        setError('Wrong PIN')
        setValue('')
      }
    }
  }

  const title = isSetup ? (stage === 'enter' ? 'Set up a PIN' : 'Confirm your PIN') : 'Enter your PIN'
  const subtitle = isSetup
    ? 'This locks your notes on this device. Pick 4 digits you\u2019ll remember.'
    : user?.email

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="drawer-brand" style={{ justifyContent: 'center' }}>
          <span className="brand-elite">Elite</span>
          <span className="brand-notebook">Notebook</span>
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>

        {canUseBiometric && (
          <>
            <button
              type="button"
              className="lock-biometric-btn"
              onClick={tryBiometric}
              disabled={bioChecking || busy}
            >
              <IconFingerprint />
              {bioChecking ? 'Checking fingerprint…' : 'Unlock with Fingerprint'}
            </button>
            {bioError && <div className="pin-error">{bioError}</div>}
            <div className="lock-divider"><span>or enter PIN</span></div>
          </>
        )}

        <PinDots length={PIN_LENGTH} filled={value.length} />
        {error && <div className="pin-error">{error}</div>}

        <PinKeypad onPress={press} onBackspace={backspace} />

        <button className="lock-signout" onClick={logout}>
          <IconSignOut />
          Sign out
        </button>
      </div>
    </div>
  )
}

// Used from Settings to set up, change, or turn off the PIN.
// mode: 'setup' | 'change' | 'remove'
export function PinModal({ mode, security, onClose }) {
  const [step, setStep] = useState(mode === 'setup' ? 'new' : 'verify')
  const [value, setValue] = useState('')
  const [firstNew, setFirstNew] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function press(digit) {
    if (busy || value.length >= PIN_LENGTH) return
    const next = value + digit
    setValue(next)
    if (next.length === PIN_LENGTH) handleComplete(next)
  }

  function backspace() {
    if (busy) return
    setError('')
    setValue((v) => v.slice(0, -1))
  }

  async function handleComplete(pin) {
    setError('')
    if (step === 'verify') {
      setBusy(true)
      const ok = await security.verifyPin(pin)
      setBusy(false)
      if (!ok) {
        setError('Wrong PIN')
        setValue('')
        return
      }
      if (mode === 'remove') {
        setBusy(true)
        await security.removePin()
        setBusy(false)
        onClose()
        return
      }
      setStep('new')
      setValue('')
    } else if (step === 'new') {
      setFirstNew(pin)
      setStep('confirm')
      setValue('')
    } else if (step === 'confirm') {
      if (pin !== firstNew) {
        setError("PINs didn't match — try again")
        setFirstNew('')
        setStep('new')
        setValue('')
        return
      }
      setBusy(true)
      await security.setPin(pin)
      setBusy(false)
      onClose()
    }
  }

  const titles = {
    verify: 'Enter current PIN',
    new: mode === 'setup' ? 'Choose a PIN' : 'Enter new PIN',
    confirm: 'Confirm new PIN',
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="lock-card lock-card-modal" onClick={(e) => e.stopPropagation()}>
        <h1>{titles[step]}</h1>
        <PinDots length={PIN_LENGTH} filled={value.length} />
        {error && <div className="pin-error">{error}</div>}
        <PinKeypad onPress={press} onBackspace={backspace} />
        <button className="lock-signout" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
