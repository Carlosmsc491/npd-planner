import { useState } from 'react'
import { ExternalLink, Trash2, Plus, Globe, Folder, Link2, FileText, X } from 'lucide-react'
import type { QuickLink } from '../../types'

interface Props {
  links: QuickLink[]
  onAddLink: (title: string, url: string, icon: string) => void
  onDeleteLink: (linkId: string) => void
}

const ICON_OPTIONS = [
  { id: 'Globe', icon: Globe },
  { id: 'Folder', icon: Folder },
  { id: 'Link2', icon: Link2 },
  { id: 'FileText', icon: FileText },
]

function getIconComponent(iconName: string) {
  const option = ICON_OPTIONS.find((opt) => opt.id === iconName)
  return option?.icon ?? Globe
}

export default function QuickLinks({ links, onAddLink, onDeleteLink }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('Globe')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return

    // Ensure URL has protocol
    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    onAddLink(title.trim(), finalUrl, selectedIcon)
    setTitle('')
    setUrl('')
    setSelectedIcon('Globe')
    setShowModal(false)
  }

  const handleOpenLink = (url: string) => {
    try {
      // Use Electron's shell to open external links
      window.electronAPI?.openExternal?.(url)
    } catch (error) {
      // Fallback: open in browser
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Quick Links
        </h3>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 rounded-lg bg-green-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Links List */}
      <div className="flex-1 overflow-auto p-3">
        {links.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4">
            <Globe className="mb-2 text-gray-300 dark:text-gray-600" size={32} />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No quick links yet.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Add links to frequently visited pages.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {links.map((link) => {
              const IconComponent = getIconComponent(link.icon)
              return (
                <div
                  key={link.id}
                  className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-green-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-700 transition-all"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                    <IconComponent
                      size={18}
                      className="text-gray-600 dark:text-gray-300"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {link.title}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {link.url}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenLink(link.url)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-700 dark:hover:text-green-400"
                      title="Open"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={() => onDeleteLink(link.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Link Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Add Quick Link
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Title
                </label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Company Portal"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-green-500"
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Icon
                </label>
                <div className="flex gap-2">
                  {ICON_OPTIONS.map((option) => {
                    const IconComponent = option.icon
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedIcon(option.id)}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                          selectedIcon === option.id
                            ? 'border-green-500 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                        }`}
                      >
                        <IconComponent size={18} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim() || !url.trim()}
                  className="flex-1 rounded-lg bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
