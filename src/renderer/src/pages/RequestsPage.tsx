// src/renderer/src/pages/RequestsPage.tsx
// Sample requests hub (teams platform). Sales file requests; NPD and account
// managers drive them through the status pipeline. Each request is linked to
// a task in the NPD Planner board.

import { useEffect, useMemo, useState } from 'react'
import {
  Plus, X, Loader2, Inbox, Building2, CalendarDays, ChevronRight, Truck, ClipboardList,
  MessageSquare, Mail, Send,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import AppLayout from '../components/ui/AppLayout'
import { useAuthStore } from '../store/authStore'
import { useTeamStore } from '../store/teamStore'
import { useRequestStore } from '../store/requestStore'
import { useTaskStore } from '../store/taskStore'
import {
  createSampleRequest, updateRequestStatus, updateRequestLogistics,
  subscribeToRequestEvents, subscribeToRequestComments, addRequestComment,
  getRequestParticipantEmails,
} from '../lib/requestsFirestore'
import { buildRequestEmailUrl, buildRecipientList } from '../lib/requestEmail'
import { subscribeToTeams } from '../lib/teamsFirestore'
import {
  isPrivileged, canCreateSampleRequest, canManageRequestLogistics,
} from '../lib/permissions'
import { formatDate } from '../utils/dateUtils'
import {
  SAMPLE_REQUEST_BUCKETS, SAMPLE_REQUEST_STATUS_LABELS, SAMPLE_REQUEST_STATUS_ORDER,
} from '../types'
import type {
  AppUser, SampleRequest, SampleRequestComment, SampleRequestEvent, SampleRequestStatus, Team,
} from '../types'

const STATUS_STYLES: Record<SampleRequestStatus, string> = {
  submitted:          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  accepted:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_production:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ready:              'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  handed_to_shipping: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped:            'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered:          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  completed:          'bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  cancelled:          'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

export default function RequestsPage() {
  const { user } = useAuthStore()
  const { myMemberships } = useTeamStore()
  const { requests, initAdmin, initMember } = useRequestStore()
  const [showNew, setShowNew] = useState(false)
  const [openRequest, setOpenRequest] = useState<SampleRequest | null>(null)

  const privileged = !!user && isPrivileged(user)

  useEffect(() => {
    if (!user) return
    return privileged ? initAdmin() : initMember(user.uid)
  }, [user?.uid, privileged, initAdmin, initMember])

  // Keep the open detail in sync with live data
  const liveOpenRequest = useMemo(
    () => (openRequest ? requests.find((r) => r.id === openRequest.id) ?? openRequest : null),
    [openRequest, requests]
  )

  const salesTeamIds = useMemo(
    () => myMemberships.filter((m) => m.teamRole === 'sales').map((m) => m.teamId),
    [myMemberships]
  )
  const canCreate = privileged || salesTeamIds.length > 0

  if (!user) return null

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Requests</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {privileged
                ? 'All sample requests across teams — NPD admin view.'
                : 'Your sample requests and the ones assigned to you.'}
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              <Plus size={16} />
              New Request
            </button>
          )}
        </div>

        {/* List */}
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-600">
            <Inbox className="mx-auto mb-2 text-gray-300 dark:text-gray-600" size={36} />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No requests yet{canCreate ? ' — create the first one.' : '.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <button
                key={req.id}
                onClick={() => setOpenRequest(req)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-green-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-green-700"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{req.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status]}`}>
                      {SAMPLE_REQUEST_STATUS_LABELS[req.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <span className="flex items-center gap-1"><Building2 size={11} />{req.teamName}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><ClipboardList size={11} />{req.bucket}</span>
                    {req.needByDate && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1"><CalendarDays size={11} />Need by {formatDate(req.needByDate)}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>by {req.createdByName}</span>
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-gray-300 dark:text-gray-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewRequestModal
          user={user}
          privileged={privileged}
          salesTeamIds={salesTeamIds}
          onClose={() => setShowNew(false)}
        />
      )}

      {liveOpenRequest && (
        <RequestDetailModal
          request={liveOpenRequest}
          user={user}
          onClose={() => setOpenRequest(null)}
        />
      )}
    </AppLayout>
  )
}

// ─── New request modal ───────────────────────────────────────────────────────

function NewRequestModal({
  user, privileged, salesTeamIds, onClose,
}: {
  user: AppUser
  privileged: boolean
  salesTeamIds: string[]
  onClose: () => void
}) {
  const { setToast } = useTaskStore()
  const { myMemberships } = useTeamStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [bucket, setBucket] = useState(SAMPLE_REQUEST_BUCKETS[0])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [needBy, setNeedBy] = useState('')
  const [shipDate, setShipDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Teams the user can file under: privileged → all active; sales → their teams
  useEffect(() => subscribeToTeams((all) => {
    const active = all.filter((t) => t.active)
    setTeams(privileged ? active : active.filter((t) => salesTeamIds.includes(t.id)))
  }), [privileged, salesTeamIds.join(',')])

  useEffect(() => {
    if (!teamId && teams.length > 0) setTeamId(teams[0].id)
  }, [teams, teamId])

  function toTs(value: string): Timestamp | null {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    return Timestamp.fromDate(new Date(y, m - 1, d, 12)) // noon avoids TZ day-shift
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const team = teams.find((t) => t.id === teamId)
    if (!team) { setError('Select a team'); return }
    if (!title.trim()) { setError('Title is required'); return }
    if (!privileged && !canCreateSampleRequest(user, team.id, myMemberships)) {
      setError('Only sales people of this team can file requests')
      return
    }
    setIsLoading(true)
    try {
      await createSampleRequest({
        team,
        bucket,
        title: title.trim(),
        description: description.trim(),
        needByDate: toTs(needBy),
        shipDate: toTs(shipDate),
      }, user)
      setToast({ id: `req-new-${Date.now()}`, message: 'Request submitted — NPD has it now', type: 'success', duration: 4000 })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Sample Request</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Type (bucket)</label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {SAMPLE_REQUEST_BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="Spring bouquet samples for Publix"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What do you need, quantities, varieties, special instructions…"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Need by</label>
              <input
                type="date"
                value={needBy}
                onChange={(e) => setNeedBy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Ship date</label>
              <input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />Submitting…
                </span>
              ) : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Request detail modal ────────────────────────────────────────────────────

function RequestDetailModal({
  request, user, onClose,
}: {
  request: SampleRequest
  user: AppUser
  onClose: () => void
}) {
  const { setToast } = useTaskStore()
  const { myMemberships } = useTeamStore()
  const [events, setEvents] = useState<SampleRequestEvent[]>([])
  const [comments, setComments] = useState<SampleRequestComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [orderNumber, setOrderNumber] = useState(request.orderNumber)
  const [farmInfo, setFarmInfo] = useState(request.farmInfo)
  const [awbNumber, setAwbNumber] = useState(request.awbNumber)
  const [eta, setEta] = useState(request.eta)
  const [saving, setSaving] = useState(false)

  useEffect(() => subscribeToRequestEvents(request.id, setEvents), [request.id])
  useEffect(() => subscribeToRequestComments(request.id, setComments), [request.id])

  const canLogistics = canManageRequestLogistics(user, request, myMemberships)
  const canStatus = canLogistics  // same audience: NPD + the team's AMs
  const logisticsDirty =
    orderNumber !== request.orderNumber || farmInfo !== request.farmInfo ||
    awbNumber !== request.awbNumber || eta !== request.eta

  async function handleStatus(status: SampleRequestStatus) {
    try {
      await updateRequestStatus(request, status, user)
    } catch (err) {
      setToast({ id: `req-st-err-${Date.now()}`, message: err instanceof Error ? err.message : String(err), type: 'error', duration: 5000 })
    }
  }

  async function saveLogistics() {
    setSaving(true)
    try {
      await updateRequestLogistics(request, { orderNumber, farmInfo, awbNumber, eta }, user)
      setToast({ id: `req-log-${Date.now()}`, message: 'Logistics updated', type: 'success', duration: 3000 })
    } catch (err) {
      setToast({ id: `req-log-err-${Date.now()}`, message: err instanceof Error ? err.message : String(err), type: 'error', duration: 5000 })
    } finally {
      setSaving(false)
    }
  }

  async function handleComment() {
    if (!commentText.trim()) return
    setSendingComment(true)
    try {
      await addRequestComment(request, commentText.trim(), user)
      setCommentText('')
    } catch (err) {
      setToast({ id: `req-cm-err-${Date.now()}`, message: err instanceof Error ? err.message : String(err), type: 'error', duration: 5000 })
    } finally {
      setSendingComment(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700/60">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{request.title}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[request.status]}`}>
                {SAMPLE_REQUEST_STATUS_LABELS[request.status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {request.teamName} · {request.bucket} · by {request.createdByName}
              {request.needByDate && ` · need by ${formatDate(request.needByDate)}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* Description */}
          {request.description && (
            <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{request.description}</p>
          )}

          {/* Status pipeline */}
          {canStatus && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Move to</p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_REQUEST_STATUS_ORDER.filter((s) => s !== request.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75 ${STATUS_STYLES[s]}`}
                  >
                    {SAMPLE_REQUEST_STATUS_LABELS[s]}
                  </button>
                ))}
                <button
                  onClick={() => handleStatus('cancelled')}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75 ${STATUS_STYLES.cancelled}`}
                >
                  Cancel Request
                </button>
              </div>
            </div>
          )}

          {/* Logistics (AM + NPD) */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <Truck size={12} /> Logistics
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['Order number', orderNumber, setOrderNumber],
                ['Farm info', farmInfo, setFarmInfo],
                ['AWB', awbNumber, setAwbNumber],
                ['ETA', eta, setEta],
              ] as [string, string, (v: string) => void][]).map(([label, value, setter]) => (
                <div key={label}>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    disabled={!canLogistics}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-700/40"
                  />
                </div>
              ))}
            </div>
            {canLogistics && logisticsDirty && (
              <button
                onClick={saveLogistics}
                disabled={saving}
                className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Logistics'}
              </button>
            )}
          </div>

          {/* Timeline */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Follow-up</p>
            {events.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{ev.message}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {ev.createdAt ? formatDate(ev.createdAt) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <MessageSquare size={12} /> Comments
            </p>
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/40">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {c.authorName} · {c.createdAt ? formatDate(c.createdAt) : ''}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{c.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleComment() }}
                placeholder="Write a comment…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || sendingComment}
                className="rounded-lg bg-green-600 p-2 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {sendingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 px-6 py-3 dark:border-gray-700/60">
          <button
            onClick={() => setShowEmail(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <Mail size={14} />
            Send Email Update
          </button>
        </div>
      </div>

      {showEmail && (
        <RequestEmailModal request={request} onClose={() => setShowEmail(false)} />
      )}
    </div>
  )
}

// ─── Manual email update modal ───────────────────────────────────────────────
// Prefills a mailto: with the request info + the fields below and opens the
// user's mail app. Recipients: creator + assigned managers.

function RequestEmailModal({ request, onClose }: { request: SampleRequest; onClose: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [truck, setTruck] = useState('')
  const [clientName, setClientName] = useState(request.teamName.replace(/ team$/i, ''))
  const [extraNotes, setExtraNotes] = useState('')
  const [opening, setOpening] = useState(false)

  async function handleOpen() {
    setOpening(true)
    try {
      const emails = await getRequestParticipantEmails(request)
      const url = buildRequestEmailUrl(request, buildRecipientList(emails), {
        date, truck, clientName, extraNotes,
      })
      await window.electronAPI.openExternal(url)
      onClose()
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Email Update</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          {([
            ['Date', date, setDate, 'date'],
            ['Truck / Carrier', truck, setTruck, 'text'],
            ['Client', clientName, setClientName, 'text'],
          ] as [string, string, (v: string) => void, string][]).map(([label, value, setter, type]) => (
            <div key={label}>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
              <input
                type={type}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Message</label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              rows={3}
              placeholder="The flower arrived, NPD finished — pallet handed to shipping…"
              className="w-full resize-none rounded-lg border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            onClick={handleOpen}
            disabled={opening}
            className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {opening ? 'Opening…' : 'Open in Mail App'}
          </button>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Sends to the request creator and assigned account managers.
          </p>
        </div>
      </div>
    </div>
  )
}
