// src/renderer/src/components/settings/ClientManager.tsx
// Admin panel to manage clients: activate, deactivate, rename, view task counts

import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToAllClients,
  updateClient,
  deleteClient,
  getClientTaskCount,
} from '../../lib/firestore'
import { Search, Edit2, Check, X, Power, PowerOff, Trash2, AlertTriangle } from 'lucide-react'
import type { Client } from '../../types'

interface ClientWithCount extends Client {
  taskCount: number
}

export default function ClientManager() {
  const [clients, setClients] = useState<ClientWithCount[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Subscribe to all clients (active and inactive)
  useEffect(() => {
    const unsub = subscribeToAllClients(async (fetchedClients) => {
      // Fetch task counts for each client
      const clientsWithCounts = await Promise.all(
        fetchedClients.map(async (client) => {
          const count = await getClientTaskCount(client.id)
          return { ...client, taskCount: count }
        })
      )
      setClients(clientsWithCounts)
      setLoading(false)
    })
    return unsub
  }, [])

  // Filter and sort clients
  const filteredClients = useMemo(() => {
    let filtered = clients

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(query))
    }

    // Filter by active status if needed
    if (!showInactive) {
      filtered = filtered.filter((c) => c.active)
    }

    // Sort alphabetically by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [clients, searchQuery, showInactive])

  const activeCount = clients.filter((c) => c.active).length
  const inactiveCount = clients.filter((c) => !c.active).length

  async function handleToggleActive(client: ClientWithCount) {
    setError('')
    try {
      await updateClient(client.id, { active: !client.active })
    } catch (err) {
      setError(`Failed to ${client.active ? 'deactivate' : 'activate'} client`)
      console.error(err)
    }
  }

  function startEditing(client: ClientWithCount) {
    setEditingId(client.id)
    setEditName(client.name)
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditName('')
    setError('')
  }

  async function saveEdit(clientId: string) {
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Client name cannot be empty')
      return
    }

    setError('')
    try {
      await updateClient(clientId, { name: trimmed })
      setEditingId(null)
      setEditName('')
    } catch (err) {
      setError('Failed to update client name')
      console.error(err)
    }
  }

  async function handleDelete(client: ClientWithCount) {
    if (client.taskCount > 0) {
      setError('Cannot delete client with existing tasks')
      setDeleteConfirmId(null)
      return
    }

    setError('')
    try {
      await deleteClient(client.id)
      setDeleteConfirmId(null)
    } catch (err) {
      setError('Failed to delete client')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-green-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">
              {activeCount}
            </span>
            <span className="text-gray-500 dark:text-gray-400"> active</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">
              {inactiveCount}
            </span>
            <span className="text-gray-500 dark:text-gray-400"> inactive</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm 
                       focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                       dark:border-gray-700 dark:bg-gray-700 dark:text-white sm:w-64"
          />
        </div>
      </div>

      {/* Show inactive toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded border-gray-300 text-green-500 focus:ring-green-500"
        />
        Show inactive clients
      </label>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Client list */}
      <div className="space-y-2">
        {filteredClients.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No clients match your search' : 'No clients found'}
            </p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors
                ${client.active 
                  ? 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700' 
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:bg-gray-700/60'
                }`}
            >
              {/* Status indicator */}
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  client.active ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />

              {/* Client name / Edit input */}
              <div className="min-w-0 flex-1">
                {editingId === client.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(client.id)
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      autoFocus
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm 
                                 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                                 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={() => saveEdit(client.id)}
                      className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <p
                      className={`truncate text-sm font-medium ${
                        client.active
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-500 line-through dark:text-gray-400'
                      }`}
                    >
                      {client.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Status badge */}
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  client.active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {client.active ? 'Active' : 'Inactive'}
              </span>

              {/* Task count */}
              <div className="shrink-0 text-right">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {client.taskCount} task{client.taskCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Actions */}
              {editingId !== client.id && (
                <div className="flex items-center gap-1">
                  {/* Edit button */}
                  <button
                    onClick={() => startEditing(client)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 
                               dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Edit name"
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Activate/Deactivate button */}
                  <button
                    onClick={() => handleToggleActive(client)}
                    className={`rounded p-1.5 ${
                      client.active
                        ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
                        : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                    }`}
                    title={client.active ? 'Deactivate' : 'Activate'}
                  >
                    {client.active ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>

                  {/* Delete button (only if no tasks) */}
                  {client.taskCount === 0 && (
                    <button
                      onClick={() => setDeleteConfirmId(client.id)}
                      className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-semibold">Delete Client?</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
              This action cannot be undone. The client will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 
                           hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const client = clients.find((c) => c.id === deleteConfirmId)
                  if (client) handleDelete(client)
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white 
                           hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
