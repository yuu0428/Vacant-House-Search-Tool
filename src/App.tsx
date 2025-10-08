import { useEffect, useState, type ReactNode } from 'react'
import { ListPage } from './app/ListPage'
import { MapPage } from './app/MapPage'
import { SettingsPage } from './app/SettingsPage'
import { BottomTabs } from './components/BottomTabs'
import { ToastContainer } from './components/ToastContainer'
import { usePlacesStore } from './stores/usePlacesStore'
import { useRouteStore } from './stores/useRouteStore'

type TabKey = 'map' | 'list' | 'settings'

const TAB_ITEMS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: 'map', label: '地図', icon: '🗺️' },
  { key: 'list', label: '一覧', icon: '📋' },
  { key: 'settings', label: '設定', icon: '⚙️' },
]

export function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>('map')
  const loadPlaces = usePlacesStore((state) => state.load)
  const placesInitialized = usePlacesStore((state) => state.initialized)
  const loadRoutes = useRouteStore((state) => state.load)

  useEffect(() => {
    if (!placesInitialized) {
      loadPlaces().catch((error) => {
        console.error(error)
      })
    }
  }, [loadPlaces, placesInitialized])

  useEffect(() => {
    loadRoutes().catch((error) => {
      console.error(error)
    })
  }, [loadRoutes])

  return (
    <div className="mx-auto flex h-screen max-w-xl flex-col bg-slate-100">
      <ToastContainer />
      <main className="flex-1 overflow-hidden">
        {currentTab === 'map' ? <MapPage /> : null}
        {currentTab === 'list' ? <ListPage /> : null}
        {currentTab === 'settings' ? <SettingsPage /> : null}
      </main>
      <BottomTabs current={currentTab} items={TAB_ITEMS} onChange={(key) => setCurrentTab(key as TabKey)} />
    </div>
  )
}
