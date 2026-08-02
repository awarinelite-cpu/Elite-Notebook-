import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDriveSession, clearDriveSession, requestDriveToken } from '../lib/googleDrive.js'

export function useDriveAuth() {
  const [session, setSession] = useState(() => loadDriveSession())
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const triedSilentRefresh = useRef(false)

  const isExpired = !!session && session.expiresAt <= Date.now()

  const connect = useCallback(
    async (interactive = true) => {
      setConnecting(true)
      setError(null)
      try {
        const fresh = await requestDriveToken({ interactive, loginHint: session?.email })
        setSession(fresh)
        return fresh
      } catch (e) {
        if (e.message === 'missing-client-id') {
          setError('missing-client-id')
        } else if (interactive) {
          setError('connect-failed')
        }
        return null
      } finally {
        setConnecting(false)
      }
    },
    [session]
  )

  const disconnect = useCallback(() => {
    clearDriveSession()
    setSession(null)
    setError(null)
    triedSilentRefresh.current = false
  }, [])

  // On load, if we have a session but its token has expired, try once to
  // silently refresh it in the background before falling back to showing
  // a "reconnect" prompt.
  useEffect(() => {
    if (!session || !isExpired || triedSilentRefresh.current || connecting) return
    triedSilentRefresh.current = true
    connect(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isExpired])

  return {
    email: session?.email || null,
    accessToken: session && !isExpired ? session.accessToken : null,
    connected: !!session && !isExpired,
    expired: !!session && isExpired,
    connecting,
    error,
    connect,
    disconnect,
  }
}
