// src/utils/biometricAuth.js
//
// Fingerprint/Face ID unlock, built on the standard Web Authentication API
// (WebAuthn) against the device's own platform authenticator. This is a
// device-level shortcut in front of the PIN, not a server-verified login
// credential and not a replacement for the PIN itself — Elite Notebook
// still requires a PIN to exist before biometric unlock can be turned on,
// and "Use PIN instead" always works as a fallback. The credential's
// private key never leaves the phone's secure hardware; only the public
// credential ID is stored (in localStorage, per account, on this device).
//
// Requires HTTPS (or localhost) and a platform authenticator.

const STORAGE_PREFIX = 'elite-notebook-biometric-'

function keyFor(id) {
  return STORAGE_PREFIX + String(id || '').trim()
}

function b64urlEncode(buf) {
  let str = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const normal = (str + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(normal)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// Whether this browser/device can actually do a platform biometric check.
export async function isBiometricAvailable() {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  if (!window.PublicKeyCredential || !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isBiometricEnrolled(id) {
  try {
    return !!localStorage.getItem(keyFor(id))
  } catch {
    return false
  }
}

// Registers a new platform credential for this account on this device.
// Throws if the person cancels the OS fingerprint prompt.
export async function enrollBiometric({ id, displayName }) {
  if (!id) throw new Error('Missing account id.')

  const challenge = window.crypto.getRandomValues(new Uint8Array(32))
  const userHandle = window.crypto.getRandomValues(new Uint8Array(16))

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Elite Notebook' },
      user: { id: userHandle, name: displayName || id, displayName: displayName || id },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none',
    },
  })

  if (!credential) throw new Error('Fingerprint setup did not complete.')

  localStorage.setItem(keyFor(id), b64urlEncode(credential.rawId))
  return true
}

// Asks the device to verify fingerprint/Face ID against the stored
// credential. Resolves true on success, throws on failure/cancellation.
export async function verifyBiometric(id) {
  const stored = localStorage.getItem(keyFor(id))
  if (!stored) throw new Error('Fingerprint unlock is not set up on this device.')

  const challenge = window.crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b64urlDecode(stored), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })

  if (!assertion) throw new Error('Fingerprint was not verified.')
  return true
}

export function disableBiometric(id) {
  try {
    localStorage.removeItem(keyFor(id))
  } catch {
    // ignore
  }
}
