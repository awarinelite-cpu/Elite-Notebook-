import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadDriveAccounts,
  saveDriveAccounts,
  loadActiveAccountEmail,
  saveActiveAccountEmail,
  requestDriveToken,
} from '../lib/googleDrive.js'

// Manages every linked Google Drive account at once. `active` is whichever
// one the person currently has selected in the switcher — everything else
// (folder browsing, uploads) reads from `active`, but every account's token
// stays available so copy/move can read from one and write to another.
export function useDriveAuth() {
  const [accounts, setAccountsState] = useState(() => loadDriveAccounts())
  const [activeEmail, setActiveEmailState] = useState(() => {
    const saved = loadActiveAccountEmail()
    const initial = loadDriveAccounts()
    if (saved && initial.some((a) => a.email === saved)) return saved
    return initial[0]?.email || null
  })
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const triedSilentRefresh = useRef(new Set())

  function setActiveEmail(email) {
    setActiveEmailState(email)
    saveActiveAccountEmail(email)
  }

  const active = accounts.find((a) => a.email === activeEmail) || null
  const isExpired = (acct) => !!acct && acct.expiresAt <= Date.now()

  const upsertAccount = useCallback((session) => {
    setAccountsState((prev) => {
      const next = prev.some((a) => a.email === session.email)
        ? prev.map((a) => (a.email === session.email ? { ...a, ...session } : a))
        : [...prev, session]
      saveDriveAccounts(next)
      return next
    })
  }, [])

  // Adds a new linked account, forcing Google's account chooser so the
  // person can pick one that isn't already linked. An optional loginHint
  // pre-fills the email on Google's screen so they only have to type the
  // password there, instead of hunting for the right account in the list.
  const addAccount = useCallback(async (loginHint) => {
    setConnecting(true)
    setError(null)
    try {
      const fresh = await requestDriveToken({ interactive: true, selectAccount: true, loginHint: loginHint || undefined })
      upsertAccount(fresh)
      setActiveEmail(fresh.email)
      return fresh
    } catch (e) {
      if (e.message === 'missing-client-id') setError('missing-client-id')
      else setError('connect-failed')
      return null
    } finally {
      setConnecting(false)
    }
  }, [upsertAccount])

  // Refreshes one specific account's token (silently if possible).
  const reconnect = useCallback(
    async (email, interactive = true) => {
      setConnecting(true)
      setError(null)
      try {
        const fresh = await requestDriveToken({ interactive, loginHint: email })
        upsertAccount(fresh)
        return fresh
      } catch (e) {
        if (e.message === 'missing-client-id') setError('missing-client-id')
        else if (interactive) setError('connect-failed')
        return null
      } finally {
        setConnecting(false)
      }
    },
    [upsertAccount]
  )

  const disconnect = useCallback(
    (email) => {
      setAccountsState((prev) => {
        const next = prev.filter((a) => a.email !== email)
        saveDriveAccounts(next)
        if (activeEmail === email) {
          const fallback = next[0]?.email || null
          setActiveEmailState(fallback)
          saveActiveAccountEmail(fallback)
        }
        return next
      })
      setError(null)
    },
    [activeEmail]
  )

  const switchAccount = useCallback((email) => {
    setActiveEmail(email)
    setError(null)
  }, [])

  // If the active account's token has expired, try once to silently
  // refresh it in the background before falling back to a "reconnect"
  // prompt.
  useEffect(() => {
    if (!active || !isExpired(active) || triedSilentRefresh.current.has(active.email) || connecting) return
    triedSilentRefresh.current.add(active.email)
    reconnect(active.email, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return {
    accounts,
    active,
    activeEmail,
    email: active?.email || null,
    accessToken: active && !isExpired(active) ? active.accessToken : null,
    connected: !!active && !isExpired(active),
    expired: !!active && isExpired(active),
    hasAnyAccount: accounts.length > 0,
    connecting,
    error,
    addAccount,
    reconnect,
    disconnect,
    switchAccount,
    // Looks up a fresh, usable token for any linked account by email —
    // used by copy/move, which may need to read from a non-active account.
    tokenFor(email) {
      const acct = accounts.find((a) => a.email === email)
      return acct && !isExpired(acct) ? acct.accessToken : null
    },
  }
}
