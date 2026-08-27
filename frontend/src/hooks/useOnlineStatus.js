import { useEffect, useState } from 'react'

// navigator.onLine flips on actual network interface state, not on
// whether the API server specifically is reachable -- good enough for a
// "you appear to be offline" banner (api.js's retry-with-backoff handles
// the finer-grained "API unreachable but network is up" case).
export default function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
