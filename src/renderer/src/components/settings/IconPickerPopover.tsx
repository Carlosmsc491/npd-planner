import { useState, useEffect, useRef } from 'react'
import { DynamicIcon, ICON_CATEGORIES, ALL_ICONS } from '../../utils/propertyUtils'

const RECENT_KEY = 'npd:recent_icons'
const MAX_RECENT = 8

function getRecentIcons(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[] }
  catch { return [] }
}

function addRecentIcon(name: string) {
  const recent = [name, ...getRecentIcons().filter((n) => n !== name)].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

interface Props {
  onSelect: (iconName: string) => void
  onClose: () => void
}

export default function IconPickerPopover({ onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState(getRecentIcons)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleSelect(name: string) {
    addRecentIcon(name)
    setRecent(getRecentIcons())
    onSelect(name)
    onClose()
  }

  const filtered = search.trim()
    ? ALL_ICONS.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : null

  return (
    <div
      ref={ref}
      className="absolute z-50 left-0 top-full mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
        />
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto p-2">
        {filtered ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-1">
              {filtered.map((name) => <IconBtn key={name} name={name} onSelect={handleSelect} />)}
            </div>
          </div>
        ) : (
          <>
            {recent.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">Recently Used</p>
                <div className="flex flex-wrap gap-1">
                  {recent.map((name) => <IconBtn key={name} name={name} onSelect={handleSelect} />)}
                </div>
              </div>
            )}
            {ICON_CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-1">{cat.label}</p>
                <div className="flex flex-wrap gap-1">
                  {cat.icons.map((name) => <IconBtn key={name} name={name} onSelect={handleSelect} />)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function IconBtn({ name, onSelect }: { name: string; onSelect: (n: string) => void }) {
  return (
    <button
      onClick={() => onSelect(name)}
      title={name}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      <DynamicIcon name={name} size={16} />
    </button>
  )
}
