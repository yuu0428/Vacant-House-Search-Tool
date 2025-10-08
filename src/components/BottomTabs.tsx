import type { ReactNode } from 'react'

interface TabItem {
  key: string
  label: string
  icon?: ReactNode
}

interface BottomTabsProps {
  current: string
  items: TabItem[]
  onChange(key: string): void
}

export function BottomTabs({ current, items, onChange }: BottomTabsProps) {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl justify-around px-2 py-1">
        {items.map((item) => {
          const isActive = item.key === current
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                className={`mx-auto flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition ${isActive ? 'text-sky-600' : 'text-slate-500'}`}
                onClick={() => onChange(item.key)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
