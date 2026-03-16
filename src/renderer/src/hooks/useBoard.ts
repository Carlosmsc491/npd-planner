import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { subscribeToBoards, createBoard } from '../lib/firestore'
import { useBoardStore } from '../store/boardStore'
import { useAuthStore } from '../store/authStore'
import { BOARD_COLORS } from '../utils/colorUtils'
import type { BoardType } from '../types'

const DEFAULT_BOARDS: { name: string; color: string; type: BoardType; order: number }[] = [
  { name: 'Planner',   color: BOARD_COLORS['planner'],   type: 'planner',   order: 0 },
  { name: 'Trips',     color: BOARD_COLORS['trips'],     type: 'trips',     order: 1 },
  { name: 'Vacations', color: BOARD_COLORS['vacations'], type: 'vacations', order: 2 },
]

export function useBoard() {
  const { boardId } = useParams<{ boardId?: string }>()
  const { user } = useAuthStore()
  const { boards, setBoards, activeBoard, setActiveBoard } = useBoardStore()

  useEffect(() => {
    const unsub = subscribeToBoards(async (loaded) => {
      setBoards(loaded)
      if (loaded.length === 0 && user?.role === 'admin') {
        for (const b of DEFAULT_BOARDS) {
          await createBoard({ ...b, createdBy: user.uid, createdAt: Timestamp.now() })
        }
      }
    })
    return unsub
  }, [setBoards, user])

  useEffect(() => {
    if (boardId && boards.length > 0) {
      setActiveBoard(boards.find((b) => b.id === boardId) ?? null)
    } else if (!boardId) {
      setActiveBoard(null)
    }
  }, [boardId, boards, setActiveBoard])

  return { boards, activeBoard }
}
