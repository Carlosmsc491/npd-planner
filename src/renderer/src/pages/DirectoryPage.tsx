// src/renderer/src/pages/DirectoryPage.tsx
// Directory module — contact database with custom columns, search, sort

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, Trash2, Edit2, X, Settings2, Check,
  Loader2, Phone, Mail, MapPin, ChevronsUpDown,
} from 'lucide-react'
import AppLayout from '../components/ui/AppLayout'
import {
  subscribeToDirectoryContacts,
  subscribeToDirectorySettings,
  createDirectoryContact,
  updateDirectoryContact,
  deleteDirectoryContact,
  saveDirectoryColumns,
} from '../lib/directoryFirestore'
import { useAuthStore } from '../store/authStore'
import { useTaskStore } from '../store/taskStore'
import { nanoid } from 'nanoid'
import type {
  DirectoryContact,
  DirectoryColumnDef,
  DirectoryColumnType,
  DirectoryColumnOption,
} from '../types'

const CONTACT_FOR_SUGGESTIONS = [
  'Publix', 'Kroger', 'Walmart', 'Whole Foods', 'Costco', 'Target',
  'Texas Warehouse', 'Miami Warehouse', 'New Jersey Warehouse',
  'Bloomstar', 'SFO Hub', 'LAX Hub',
]

// ─── Phone formatter ─────────────────────────────────────────────────────────
// Accepts any digit string and outputs (305) 558-8183 format
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function fullName(c: DirectoryContact) {
  return `${c.firstName} ${c.lastName}`.trim()
}

type SortKey = 'lastName' | 'firstName' | 'email' | 'location' | `col:${string}`

export default function DirectoryPage() {
  const { user } = useAuthStore()
  const { setToast } = useTaskStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'owner'

  const [contacts, setContacts] = useState<DirectoryContact[]>([])
  const [settings, setSettings] = useState<{ columns: DirectoryColumnDef[] } | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('lastName')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<DirectoryContact | null>(null)
  const [colMgrOpen, setColMgrOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const columns = settings?.columns ?? []

  // subscribeToDirectoryContacts no longer uses orderBy — sorted client-side
  // to avoid requiring a Firestore composite index.
  useEffect(() => {
    const u1 = subscribeToDirectoryContacts(setContacts)
    const u2 = subscribeToDirectorySettings(setSettings)
    return () => { u1(); u2() }
  }, [])

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'lastName',  label: 'Last Name A→Z' },
    { key: 'firstName', label: 'First Name A→Z' },
    { key: 'email',     label: 'Email A→Z' },
    { key: 'location',  label: 'Location A→Z' },
    ...columns.map((col) => ({ key: `col:${col.id}` as SortKey, label: col.name })),
  ]

  function getColVal(c: DirectoryContact, key: SortKey): string {
    if (key.startsWith('col:')) {
      const id = key.slice(4)
      const v = c.customValues?.[id]
      return Array.isArray(v) ? v.join(',') : (v ?? '')
    }
    if (key === 'lastName')  return c.lastName.toLowerCase()
    if (key === 'firstName') return c.firstName.toLowerCase()
    if (key === 'email')     return c.email.toLowerCase()
    if (key === 'location')  return c.location.toLowerCase()
    return ''
  }

  const displayed = useMemo(() => {
    const q = search.toLowerCase()
    const result = contacts.filter((c) => {
      if (!q) return true
      return (
        fullName(c).toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.location.toLowerCase().includes(q) ||
        c.contactFor.some((v) => v.toLowerCase().includes(q))
      )
    })
    return result.sort((a, b) => getColVal(a, sortBy).localeCompare(getColVal(b, sortBy)))
  }, [contacts, search, sortBy])

  function openNew() { setEditingContact(null); setDrawerOpen(true) }
  function openEdit(c: DirectoryContact) { setEditingContact(c); setDrawerOpen(true) }

  async function handleDelete(id: string) {
    try {
      await deleteDirectoryContact(id)
      setToast({ id: `dir-del-${id}`, message: 'Contact deleted', type: 'success', duration: 3000 })
    } catch (err) {
      setToast({ id: `dir-del-err-${id}`, message: `Delete failed: ${err instanceof Error ? err.message : String(err)}`, type: 'error', duration: 4000 })
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">

        {/* ── Main content ─────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Directory</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setColMgrOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Settings2 size={14} />
                  Columns
                </button>
              )}
              <button
                onClick={openNew}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <Plus size={14} />
                Add Contact
              </button>
            </div>
          </div>

          {/* Toolbar: search + sort */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-sm">
              <ChevronsUpDown size={14} className="text-gray-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-2 pr-7 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/30 appearance-none cursor-pointer"
              >
                {sortOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>

            {search && (
              <span className="text-xs text-gray-500 shrink-0">{displayed.length} result{displayed.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                <BookUserIcon size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">
                  {search ? 'No contacts match your search' : 'No contacts yet'}
                </p>
                {!search && (
                  <button onClick={openNew} className="mt-3 text-sm text-green-600 hover:underline">
                    Add the first contact
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <Th label="Name" />
                    <Th label="Email" />
                    <Th label="Phone" />
                    <Th label="Location" />
                    <Th label="Contact For" />
                    {columns.map((col) => <Th key={col.id} label={col.name} />)}
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {displayed.map((contact) => (
                    <tr
                      key={contact.id}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {fullName(contact)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {contact.email
                          ? <a href={`mailto:${contact.email}`} className="hover:text-green-600 transition-colors">{contact.email}</a>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {contact.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {contact.location || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {contact.contactFor.length > 0
                            ? contact.contactFor.map((v) => <Pill key={v} label={v} />)
                            : <span className="text-gray-400">—</span>
                          }
                        </div>
                      </td>
                      {columns.map((col) => {
                        const val = contact.customValues?.[col.id]
                        return (
                          <td key={col.id} className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {Array.isArray(val) ? val.join(', ') || '—' : (val as string) || '—'}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(contact)}
                            className="rounded p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          {isAdmin && deleteConfirm === contact.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(contact.id)}
                                className="rounded px-2 py-0.5 text-xs bg-red-500 text-white hover:bg-red-600"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : isAdmin && (
                            <button
                              onClick={() => setDeleteConfirm(contact.id)}
                              className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Contact Drawer ────────────────────────────────── */}
        {drawerOpen && (
          <ContactDrawer
            contact={editingContact}
            columns={columns}
            uid={user?.uid ?? ''}
            onClose={() => setDrawerOpen(false)}
            onSaved={() => {
              setDrawerOpen(false)
              setToast({ id: `dir-saved-${Date.now()}`, message: editingContact ? 'Contact updated' : 'Contact added', type: 'success', duration: 3000 })
            }}
            onError={(msg) => setToast({ id: `dir-err-${Date.now()}`, message: msg, type: 'error', duration: 4000 })}
          />
        )}

        {/* ── Column Manager ────────────────────────────────── */}
        {colMgrOpen && isAdmin && (
          <ColumnManager
            columns={columns}
            uid={user?.uid ?? ''}
            onClose={() => setColMgrOpen(false)}
            onSaved={(cols) => {
              setToast({ id: 'dir-cols-saved', message: 'Columns updated', type: 'success', duration: 3000 })
              void saveDirectoryColumns(cols, user?.uid ?? '').catch(() => {})
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}

// ─── Shared small components ──────────────────────────────────────────────────

function Th({ label }: { label: string }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap">
      {label}
    </th>
  )
}

// Read-only pill for the table — aligned via flex + leading-none
function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium leading-none text-green-700 dark:text-green-400">
      {label}
    </span>
  )
}

function BookUserIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      <circle cx="12" cy="8" r="2" />
      <path d="M8 14c0-2 1.8-3 4-3s4 1 4 3" />
    </svg>
  )
}

// ─── Contact Drawer ───────────────────────────────────────────────────────────

interface ContactDrawerProps {
  contact: DirectoryContact | null
  columns: DirectoryColumnDef[]
  uid: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

function ContactDrawer({ contact, columns, uid, onClose, onSaved, onError }: ContactDrawerProps) {
  const [form, setForm] = useState({
    firstName:    contact?.firstName ?? '',
    lastName:     contact?.lastName ?? '',
    email:        contact?.email ?? '',
    phone:        contact?.phone ?? '',
    location:     contact?.location ?? '',
    contactFor:   contact?.contactFor ?? [] as string[],
    customValues: { ...(contact?.customValues ?? {}) } as Record<string, string | string[]>,
  })
  const [contactForInput, setContactForInput] = useState('')
  const [saving, setSaving] = useState(false)

  function setField<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  function handlePhoneChange(raw: string) {
    setField('phone', formatPhone(raw))
  }

  function addContactFor(val: string) {
    const v = val.trim()
    if (!v || form.contactFor.includes(v)) return
    setField('contactFor', [...form.contactFor, v])
    setContactForInput('')
  }

  function removeContactFor(val: string) {
    setField('contactFor', form.contactFor.filter((v) => v !== val))
  }

  function setCustomValue(colId: string, val: string | string[]) {
    setForm((prev) => ({
      ...prev,
      customValues: { ...prev.customValues, [colId]: val },
    }))
  }

  async function handleSave() {
    if (!form.firstName.trim()) { onError('First name is required'); return }
    setSaving(true)
    try {
      const data = {
        firstName:    form.firstName.trim(),
        lastName:     form.lastName.trim(),
        email:        form.email.trim().toLowerCase(),
        phone:        form.phone.trim(),
        location:     form.location.trim(),
        contactFor:   form.contactFor,
        customValues: form.customValues,
      }
      if (contact) {
        await updateDirectoryContact(contact.id, data, uid)
      } else {
        await createDirectoryContact({ ...data, createdBy: uid, updatedBy: uid }, uid)
      }
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-96 shrink-0 border-l border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {contact ? 'Edit Contact' : 'New Contact'}
        </h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={16} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name *">
            <input value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} placeholder="John" className={INPUT_CLS} />
          </Field>
          <Field label="Last Name">
            <input value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} placeholder="Doe" className={INPUT_CLS} />
          </Field>
        </div>

        <Field label="Email">
          <div className="relative">
            <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="name@company.com" className={`${INPUT_CLS} pl-8`} />
          </div>
        </Field>

        <Field label="Phone">
          <div className="relative">
            <Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={form.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="(305) 000-0000"
              className={`${INPUT_CLS} pl-8`}
            />
          </div>
        </Field>

        <Field label="Location">
          <div className="relative">
            <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="Miami, FL" className={`${INPUT_CLS} pl-8`} />
          </div>
        </Field>

        <Field label="Contact For">
          <div className="space-y-2">
            {form.contactFor.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.contactFor.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium leading-none text-green-700 dark:text-green-400"
                  >
                    {v}
                    {/* Explicit type=button so it never triggers form submit */}
                    <button
                      type="button"
                      onClick={() => removeContactFor(v)}
                      className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800 hover:text-red-500 transition-colors"
                    >
                      <X size={9} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <ContactForInput
              value={contactForInput}
              onChange={setContactForInput}
              suggestions={CONTACT_FOR_SUGGESTIONS.filter((s) => !form.contactFor.includes(s))}
              onAdd={addContactFor}
            />
          </div>
        </Field>

        {/* Custom columns */}
        {columns.map((col) => (
          <Field key={col.id} label={col.name}>
            {col.type === 'text' && (
              <input value={(form.customValues[col.id] as string) ?? ''} onChange={(e) => setCustomValue(col.id, e.target.value)} className={INPUT_CLS} />
            )}
            {col.type === 'droplist' && (
              <select value={(form.customValues[col.id] as string) ?? ''} onChange={(e) => setCustomValue(col.id, e.target.value)} className={INPUT_CLS}>
                <option value="">— Select —</option>
                {col.options.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
              </select>
            )}
            {col.type === 'multi-select' && (
              <MultiSelectField
                options={col.options}
                value={Array.isArray(form.customValues[col.id]) ? form.customValues[col.id] as string[] : []}
                onChange={(v) => setCustomValue(col.id, v)}
              />
            )}
          </Field>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Column Manager ────────────────────────────────────────────────────────────

function ColumnManager({
  columns: initial,
  uid,
  onClose,
  onSaved,
}: {
  columns: DirectoryColumnDef[]
  uid: string
  onClose: () => void
  onSaved: (cols: DirectoryColumnDef[]) => void
}) {
  const [columns, setColumns] = useState<DirectoryColumnDef[]>(initial)
  const [saving, setSaving] = useState(false)

  function addColumn() {
    setColumns((prev) => [
      ...prev,
      { id: nanoid(8), name: '', type: 'text', options: [], order: prev.length },
    ])
  }

  function removeColumn(id: string) { setColumns((prev) => prev.filter((c) => c.id !== id)) }
  function updateColumn(id: string, patch: Partial<DirectoryColumnDef>) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function addOption(colId: string) {
    setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, options: [...c.options, { id: nanoid(6), label: '' }] } : c))
  }
  function updateOption(colId: string, optId: string, label: string) {
    setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, options: c.options.map((o) => o.id === optId ? { ...o, label } : o) } : c))
  }
  function removeOption(colId: string, optId: string) {
    setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, options: c.options.filter((o) => o.id !== optId) } : c))
  }

  async function handleSave() {
    if (!columns.every((c) => c.name.trim())) { alert('All columns must have a name'); return }
    setSaving(true)
    try {
      await saveDirectoryColumns(columns.map((c, i) => ({ ...c, order: i })), uid)
      onSaved(columns)
      onClose()
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Custom Columns</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {columns.map((col) => (
            <div key={col.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input value={col.name} onChange={(e) => updateColumn(col.id, { name: e.target.value })} placeholder="Column name" className={`${INPUT_CLS} flex-1`} />
                <select value={col.type} onChange={(e) => updateColumn(col.id, { type: e.target.value as DirectoryColumnType, options: [] })} className={INPUT_CLS}>
                  <option value="text">Text</option>
                  <option value="droplist">Droplist</option>
                  <option value="multi-select">Multi-select</option>
                </select>
                <button type="button" onClick={() => removeColumn(col.id)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
              {(col.type === 'droplist' || col.type === 'multi-select') && (
                <div className="space-y-1 pl-2">
                  {col.options.map((opt) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input value={opt.label} onChange={(e) => updateOption(col.id, opt.id, e.target.value)} placeholder="Option label" className={`${INPUT_CLS} flex-1 text-xs`} />
                      <button type="button" onClick={() => removeOption(col.id, opt.id)} className="text-gray-400 hover:text-red-500 p-1">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOption(col.id)} className="text-xs text-green-600 hover:underline">
                    + Add option
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" onClick={addColumn} className="flex items-center gap-2 text-sm text-green-600 hover:underline">
            <Plus size={14} /> Add column
          </button>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save Columns'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ContactForInput({
  value, onChange, suggestions, onAdd,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  onAdd: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onAdd(value) }
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Add client or location…"
          className={INPUT_CLS}
        />
        <button
          type="button"
          onClick={() => onAdd(value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Plus size={14} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-10 z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { onAdd(s); setOpen(false) }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MultiSelectField({
  options, value, onChange,
}: {
  options: DirectoryColumnOption[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(label: string) {
    onChange(value.includes(label) ? value.filter((v) => v !== label) : [...value, label])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value.includes(opt.label)
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.label)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium leading-none border transition-colors ${
              selected
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-green-400'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
