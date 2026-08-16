// Small auto-dismissing success notice — replaces window.alert() after a
// report save so the page isn't blocked behind an OK button.
import { useEffect } from 'react'

export default function Toast({ message, onDone, duration = 4000 }) {
  useEffect(() => {
    if (!message) return
    const id = setTimeout(onDone, duration)
    return () => clearTimeout(id)
  }, [message, onDone, duration])

  if (!message) return null
  return (
    <div className="toast-success" role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">✓</span>
      <span>{message}</span>
    </div>
  )
}
