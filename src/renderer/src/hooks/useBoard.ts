import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useBoardStore } from '../store/boardStore'

export function useBoard() {
  const { boardId } = useParams<{ boardId?: string }>()
  const { boards, activeBoard, setActiveBoard } = useBoardStore()

  useEffect(() => {
    if (boardId && boards.length > 0) {
      setActiveBoard(boards.find((b) => b.id === boardId) ?? null)
    } else if (!boardId) {
      setActiveBoard(null)
    }
  }, [boardId, boards, setActiveBoard])

  return { boards, activeBoard }
}
