import { useEffect, useState } from 'react'

function isStandaloneNow() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function detectIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream
}

// Chrome/Edge/Android fire 'beforeinstallprompt' and let us trigger the
// native install dialog on demand. Safari/iOS never fires it — there's no
// programmatic install API there, only the manual Share -> Add to Home
// Screen flow, so we just surface that it's iOS and let the UI show
// instructions instead of a button.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [standalone, setStandalone] = useState(isStandaloneNow)
  const isIOS = detectIOS()

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function onInstalled() {
      setDeferredPrompt(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return null
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome // 'accepted' | 'dismissed'
  }

  return {
    standalone,
    isIOS,
    canPromptInstall: !!deferredPrompt,
    promptInstall,
  }
}
