import { useCallback, useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
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

  // Tries a silent refresh whenever the active account is expired or about
  // to be (a few minutes of buffer, so the token doesn't visibly go stale
  // mid-session) — checked on mount, whenever the active account changes,
  // and again whenever the app comes back to the foreground (native
  // resume, or a backgrounded/reopened browser tab). This is what makes
  // "stay signed in" actually hold across closing and reopening the app:
  // as long as Google is willing to silently re-authorize (i.e. this
  // account's authorization hasn't hit Google's own expiry for this
  // project — see the note on the OAuth consent screen's Testing/
  // Production status), the person never sees a prompt at all.
  useEffect(() => {
    function trySilentRefresh() {
      if (!active || connecting) return
      const refreshBufferMs = 5 * 60 * 1000
      if (active.expiresAt - Date.now() > refreshBufferMs) return
      reconnect(active.email, false)
    }

    trySilentRefresh()

    function onVisibility() {
      if (document.visibilityState === 'visible') trySilentRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let resumeHandle
    CapacitorApp.addListener('resume', trySilentRefresh).then((h) => { resumeHandle = h })

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      resumeHandle?.remove()
    }
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
