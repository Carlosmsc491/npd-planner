import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase'
import { useAuthStore } from '../store/authStore'
import type { Board } from '../types'

export default function BoardsPage() {
  const { user } = useAuthStore()
  const [boards, setBoards] = useState<Board[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(collection(db, 'boards'), orderBy('order'))
    return onSnapshot(q, (snap) =>
      setBoards(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Board)))
    )
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between safe-top">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-4 h-4">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-base">NPD Planner</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{user?.name}</span>
          <button
            onClick={() => signOut(auth)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Boards</h2>

        {boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mx-auto mb-3 opacity-30">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <p className="text-sm">No boards yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {boards.map((board) => (
              <button
                key={board.id}
                onClick={() => navigate(`/board/${board.id}`)}
                className="flex items-center gap-4 bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 text-left hover:shadow-md active:scale-98 transition"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white text-lg font-bold"
                  style={{ backgroundColor: board.color }}
                >
                  {board.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{board.name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{board.type}</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-gray-300 ml-auto shrink-0">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
