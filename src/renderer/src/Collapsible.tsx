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
  const [open, setOpen] = useState(() => sessionStorage.getItem(`collapse:${id}`) !== 'closed')
  return (
    <details
      className="collapsible"
      open={open}
      onToggle={(e) => {
        const value = e.currentTarget.open
        setOpen(value)
        sessionStorage.setItem(`collapse:${id}`, value ? 'open' : 'closed')
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  )
}
