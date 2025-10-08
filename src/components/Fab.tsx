import type { ReactNode } from 'react'

interface FabProps {
  label: string
  onClick(): void
  tone?: 'primary' | 'secondary'
  icon?: ReactNode
}

export function Fab({ label, onClick, tone = 'primary', icon }: FabProps) {
  const base =
    'flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg shadow-sky-500/20 transition focus-visible:ring-2 focus-visible:ring-offset-2'
  const variant =
    tone === 'primary'
      ? 'bg-sky-500 text-white hover:bg-sky-600 focus-visible:ring-sky-400'
      : 'bg-white text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400'
  return (
    <button type="button" onClick={onClick} className={`${base} ${variant}`}>
      {icon ? <span className="text-lg" aria-hidden>{icon}</span> : null}
      <span>{label}</span>
    </button>
  )
}
