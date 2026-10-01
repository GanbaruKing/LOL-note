import { useState, type ReactNode } from 'react'
export default function Collapsible({
  id,
  title,
  children,
}: {
  id: string
  title: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`collapse:${id}`) !== 'closed'
    } catch {
      return true
    }
  })
  return (
    <details
      className="collapsible"
      open={open}
      onToggle={(e) => {
        const value = e.currentTarget.open
        setOpen(value)
        try {
          localStorage.setItem(`collapse:${id}`, value ? 'open' : 'closed')
        } catch {
          // Keep folding usable even when persistent storage is unavailable.
        }
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  )
}
