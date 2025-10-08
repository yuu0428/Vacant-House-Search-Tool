export function MapAttribution() {
  return (
    <div className="pointer-events-auto absolute bottom-1 right-1 rounded bg-white/70 px-1 py-[2px] text-[10px] text-slate-600">
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        © OpenStreetMap contributors
      </a>{' '}
      /{' '}
      <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer" className="underline">
        © MapTiler
      </a>
    </div>
  )
}
