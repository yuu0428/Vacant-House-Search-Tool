import { useEffect } from 'react'
import { useToastStore } from '../stores/useToastStore'

export function ToastContainer() {
  const items = useToastStore((state) => state.items)
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timers = items.map((item) =>
      setTimeout(() => {
        dismiss(item.id)
      }, 4000),
    )
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [items, dismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex min-w-[260px] max-w-[90vw] items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg shadow-slate-900/20 ${item.kind === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-800 text-white'}`}
        >
          <span>{item.message}</span>
          <button
            type="button"
            className="ml-auto rounded-full p-1 text-xs"
            onClick={() => dismiss(item.id)}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
