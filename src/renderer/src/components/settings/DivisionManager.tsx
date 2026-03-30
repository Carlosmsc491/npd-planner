// src/renderer/src/components/settings/DivisionManager.tsx
// Admin panel to manage divisions: create, rename, activate/deactivate per client

import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToAllDivisions,
  subscribeToAllClients,
  createDivision,
  updateDivision,
} from '../../lib/firestore'
import { Search, Edit2, Check, X, Power, PowerOff, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import type { Division, Client } from '../../types'

interface DivisionWithClient extends Division {
  clientName: string
}

export default function DivisionManager() {
  const { user } = useAuthStore()
  const [divisions, setDivisions] = useState<DivisionWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [clientFilter, setClientFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDivisionName, setNewDivisionName] = useState('')
  const [newDivisionClient, setNewDivisionClient] = useState('')
  const [error, setError] = useState('')

  // Subscribe to all divisions and clients
  useEffect(() => {
    let unsubDivisions: (() => void) | null = null
    let unsubClients: (() => void) | null = null

    unsubClients = subscribeToAllClients((fetchedClients) => {
      setClients(fetchedClients)
    })

    unsubDivisions = subscribeToAllDivisions((fetchedDivisions) => {
      setDivisions(
        fetchedDivisions.map((d) => ({
          ...d,
          clientName: clients.find((c) => c.id === d.clientId)?.name ?? 'Unknown',
        }))
      )
      setLoading(false)
    })

    return () => {
      unsubDivisions?.()
      unsubClients?.()
    }
  }, [clients])

  // Filter and sort divisions
  const filteredDivisions = useMemo(() => {
    let filtered = divisions

    // Filter by client
    if (clientFilter) {
      filtered = filtered.filter((d) => d.clientId === clientFilter)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(query) ||
          d.clientName.toLowerCase().includes(query)
      )
    }

    // Filter by active status if needed
    if (!showInactive) {
      filtered = filtered.filter((d) => d.active)
    }

    // Sort alphabetically by name
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [divisions, clientFilter, searchQuery, showInactive])

  const activeCount = divisions.filter((d) => d.active).length
  const inactiveCount = divisions.filter((d) => !d.active).length

  async function handleToggleActive(division: DivisionWithClient) {
    setError('')
    try {
      await updateDivision(division.id, { active: !division.active })
    } catch (err) {
      setError(`Failed to ${division.active ? 'deactivate' : 'activate'} division`)
      console.error(err)
    }
  }

  function startEditing(division: DivisionWithClient) {
    setEditingId(division.id)
    setEditName(division.name)
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditName('')
    setError('')
  }

  async function saveEdit(divisionId: string) {
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Division name cannot be empty')
      return
    }

    setError('')
    try {
      await updateDivision(divisionId, { name: trimmed.toUpperCase() })
      setEditingId(null)
      setEditName('')
    } catch (err) {
      setError('Failed to update division name')
      console.error(err)
    }
  }

  async function handleCreateDivision() {
    if (!newDivisionName.trim() || !newDivisionClient || !user) {
      setError('Division name and client are required')
      return
    }

    setError('')
    try {
      await createDivision({
        clientId: newDivisionClient,
        name: newDivisionName.trim().toUpperCase(),
        active: true,
        createdBy: user.uid,
      })
      setNewDivisionName('')
      setNewDivisionClient('')
      setShowAddForm(false)
    } catch (err) {
      setError('Failed to create division')
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
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="Search divisions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm
                       focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                       dark:border-gray-700 dark:bg-gray-700 dark:text-white sm:w-64"
          />
        </div>
      </div>

      {/* Client filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-400">
          Filter by client:
        </label>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm
                     focus:border-green-500 focus:outline-none
                     dark:border-gray-700 dark:bg-gray-700 dark:text-white"
        >
          <option value="">All clients</option>
          {clients
            .filter((c) => c.active)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>

      {/* Show inactive toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded border-gray-300 text-green-500 focus:ring-green-500"
        />
        Show inactive divisions
      </label>

      {/* Add button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white
                     hover:bg-green-600 transition-colors"
        >
          <Plus size={16} />
          Add Division
        </button>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            New Division
          </h4>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={newDivisionName}
              onChange={(e) => setNewDivisionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateDivision()
                if (e.key === 'Escape') setShowAddForm(false)
              }}
              placeholder="Division name"
              autoFocus
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                         focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                         dark:border-gray-700 dark:bg-gray-700 dark:text-white"
            />
            <select
              value={newDivisionClient}
              onChange={(e) => setNewDivisionClient(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                         focus:border-green-500 focus:outline-none
                         dark:border-gray-700 dark:bg-gray-700 dark:text-white sm:w-48"
            >
              <option value="">— Select client —</option>
              {clients
                .filter((c) => c.active)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreateDivision}
                className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewDivisionName('')
                  setNewDivisionClient('')
                  setError('')
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100
                           dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Division list */}
      <div className="space-y-2">
        {filteredDivisions.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchQuery || clientFilter
                ? 'No divisions match your filters'
                : 'No divisions found'}
            </p>
          </div>
        ) : (
          filteredDivisions.map((division) => (
            <div
              key={division.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors
                ${
                  division.active
                    ? 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:bg-gray-700/60'
                }`}
            >
              {/* Status indicator */}
              <div
                className={`h-2 w-2 shrink-0 rounded-full ${
                  division.active ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />

              {/* Division name / Edit input */}
              <div className="min-w-0 flex-1">
                {editingId === division.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(division.id)
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      autoFocus
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm
                                 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500
                                 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={() => saveEdit(division.id)}
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
                  <p
                    className={`truncate text-sm font-medium ${
                      division.active
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-500 line-through dark:text-gray-400'
                    }`}
                  >
                    {division.name}
                  </p>
                )}
              </div>

              {/* Client name */}
              <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                {division.clientName}
              </span>

              {/* Status badge */}
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  division.active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {division.active ? 'Active' : 'Inactive'}
              </span>

              {/* Actions */}
              {editingId !== division.id && (
                <div className="flex items-center gap-1">
                  {/* Edit button */}
                  <button
                    onClick={() => startEditing(division)}
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700
                               dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    title="Edit name"
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Activate/Deactivate button */}
                  <button
                    onClick={() => handleToggleActive(division)}
                    className={`rounded p-1.5 ${
                      division.active
                        ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
                        : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20'
                    }`}
                    title={division.active ? 'Deactivate' : 'Activate'}
                  >
                    {division.active ? (
                      <PowerOff size={14} />
                    ) : (
                      <Power size={14} />
                    )}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
