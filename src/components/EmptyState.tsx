import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-slate-600">
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      <p className="text-sm leading-relaxed">{description}</p>
      {action}
    </div>
  )
}
