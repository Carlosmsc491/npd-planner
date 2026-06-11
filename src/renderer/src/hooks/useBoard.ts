import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useBoardStore } from '../store/boardStore'

export function useBoard() {
  const { boardId } = useParams<{ boardId?: string }>()
  const { boards, activeBoard, setActiveBoard } = useBoardStore()

  useEffect(() => {
    if (boardId && boards.length > 0) {
      const found = boards.find((b) => b.id === boardId) ?? null
      console.info(`[Perf] activeBoard route=${boardId} → ${found ? `${found.id}=${found.name}` : 'NOT FOUND in boards list'}`)
      setActiveBoard(found)
    } else if (!boardId) {
      setActiveBoard(null)
    }
  }, [boardId, boards, setActiveBoard])

  return { boards, activeBoard }
}
