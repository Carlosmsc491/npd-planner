import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { subscribeToBoards } from '../lib/firestore'
import { useBoardStore } from '../store/boardStore'

export function useBoard() {
  const { boardId } = useParams<{ boardId?: string }>()
  const { boards, setBoards, activeBoard, setActiveBoard } = useBoardStore()

  useEffect(() => {
    const unsub = subscribeToBoards(setBoards)
    return unsub
  }, [setBoards])

  useEffect(() => {
    if (boardId && boards.length > 0) {
      setActiveBoard(boards.find((b) => b.id === boardId) ?? null)
    } else if (!boardId) {
      setActiveBoard(null)
    }
  }, [boardId, boards, setActiveBoard])

  return { boards, activeBoard }
}
