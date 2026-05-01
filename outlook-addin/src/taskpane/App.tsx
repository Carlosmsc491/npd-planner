import { useEffect, useState } from 'react'

const API = 'http://localhost:3847'

interface TaskOption {
  id: string
  title: string
  clientName: string
  year: string
}

interface BucketOption {
  id: string
  name: string
  tasks: TaskOption[]
}

interface BoardOption {
  id: string
  name: string
  buckets: BucketOption[]
}

interface BoardsResponse {
  sharePointRoot: string
  boards: BoardOption[]
}

type AppState = 'checking' | 'offline' | 'loading' | 'ready' | 'assigning' | 'success' | 'error'

export default function App() {
  const [state, setState] = useState<AppState>('checking')
  const [sharePointRoot, setSharePointRoot] = useState('')
  const [boards, setBoards] = useState<BoardOption[]>([])
  const [selectedBoard, setSelectedBoard] = useState('')
  const [selectedBucket, setSelectedBucket] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetch(`${API}/ping`)
      .then((r) => r.json())
      .then(() => {
        setState('loading')
        return fetch(`${API}/api/boards`)
      })
      .then((r) => r.json())
      .then((data: BoardsResponse) => {
        setSharePointRoot(data.sharePointRoot ?? '')
        setBoards(data.boards ?? [])
        setState('ready')
      })
      .catch(() => setState('offline'))
  }, [])

  const currentBoard = boards.find((b) => b.id === selectedBoard)
  const currentBucket = currentBoard?.buckets.find((b) => b.id === selectedBucket)
  const currentTask = currentBucket?.tasks.find((t) => t.id === selectedTask)

  const handleAssign = async () => {
    if (!selectedTask || !currentTask) return
    setState('assigning')

    const item = Office.context.mailbox.item!

    try {
      const bodyText = await new Promise<string>((resolve) => {
        item.body.getAsync(Office.CoercionType.Text, (r) =>
          resolve(r.value?.trim().slice(0, 200) ?? '')
        )
      })

      const attachments = await Promise.all(
        (item.attachments ?? [])
          .filter((att) => !att.isInline)
          .map(async (att) => {
            const content = await new Promise<string>((resolve) => {
              item.getAttachmentContentAsync(att.id, (r) =>
                resolve(r.value?.content ?? '')
              )
            })
            return {
              name: att.name,
              contentType: att.contentType ?? 'application/octet-stream',
              sizeBytes: att.size ?? 0,
              base64Content: content,
            }
          })
      )

      const payload = {
        taskId: selectedTask,
        sharePointRoot,
        year: currentTask.year,
        clientName: currentTask.clientName,
        taskTitle: currentTask.title,
        email: {
          subject: item.subject ?? '(No subject)',
          from: `${item.from?.displayName ?? ''} <${item.from?.emailAddress ?? ''}>`,
          dateReceived: item.dateTimeCreated?.toISOString() ?? new Date().toISOString(),
          bodySnippet: bodyText,
          attachments,
        },
      }

      const res = await fetch(`${API}/api/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = (await res.json()) as { success: boolean; error?: string }
      if (result.success) {
        setState('success')
      } else {
        throw new Error(result.error ?? 'Unknown error')
      }
    } catch (err) {
      setErrorMsg(String(err))
      setState('error')
    }
  }

  const resetToReady = () => {
    setSelectedTask('')
    setSelectedBucket('')
    setSelectedBoard('')
    setState('ready')
  }

  const attachmentCount = (Office.context.mailbox.item?.attachments ?? []).filter(
    (a) => !a.isInline
  ).length

  // ── States ───────────────────────────────────────────────────────────────────

  if (state === 'checking') {
    return (
      <div className="center">
        <div className="spinner" />
        <p className="muted">Connecting to NPD Planner…</p>
      </div>
    )
  }

  if (state === 'offline') {
    return (
      <div className="center">
        <div className="icon icon-offline">!</div>
        <p className="title">NPD Planner is not running</p>
        <p className="muted">Open NPD Planner on this computer, then try again.</p>
        <button className="btn-secondary" onClick={() => setState('checking')}>
          Try again
        </button>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div className="center">
        <div className="spinner" />
        <p className="muted">Loading boards…</p>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="center success">
        <div className="icon icon-success">✓</div>
        <p className="title">Email assigned!</p>
        <p className="muted">
          The email{attachmentCount > 0 ? ` and ${attachmentCount} attachment(s)` : ''} were saved
          to the task.
        </p>
        <button className="btn-secondary" onClick={resetToReady}>
          Assign another
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="center">
        <p className="title" style={{ color: '#dc2626' }}>Something went wrong</p>
        <p className="muted">{errorMsg}</p>
        <button className="btn-secondary" onClick={resetToReady}>
          Go back
        </button>
      </div>
    )
  }

  // ── Ready: board → bucket → task selector ────────────────────────────────────

  return (
    <div className="panel">
      <div className="header">
        <div className="logo-dot" />
        <span className="header-title">NPD Planner</span>
      </div>

      <p className="section-label">Select destination</p>

      <div className="field">
        <label>Board</label>
        <select
          value={selectedBoard}
          onChange={(e) => {
            setSelectedBoard(e.target.value)
            setSelectedBucket('')
            setSelectedTask('')
          }}
        >
          <option value="">— Select board —</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {selectedBoard && (
        <div className="field">
          <label>Bucket</label>
          <select
            value={selectedBucket}
            onChange={(e) => {
              setSelectedBucket(e.target.value)
              setSelectedTask('')
            }}
          >
            <option value="">— Select bucket —</option>
            {currentBoard?.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedBucket && (
        <div className="field">
          <label>Task</label>
          <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
            <option value="">— Select task —</option>
            {currentBucket?.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {attachmentCount > 0 && (
        <div className="attachments-preview">
          <p className="section-label">Attachments included</p>
          {(Office.context.mailbox.item?.attachments ?? [])
            .filter((a) => !a.isInline)
            .map((att) => (
              <div key={att.id} className="att-row">
                <span className="att-icon">📎</span>
                <span className="att-name">{att.name}</span>
              </div>
            ))}
        </div>
      )}

      <button
        className="btn-primary"
        disabled={!selectedTask || state === 'assigning'}
        onClick={handleAssign}
      >
        {state === 'assigning' ? 'Assigning…' : 'Assign to task'}
      </button>
    </div>
  )
}
