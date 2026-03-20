import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Board, BoardView, GroupByField } from '../types'

interface BoardState {
  boards: Board[]
  activeBoard: Board | null
  view: BoardView
  groupBy: GroupByField
  showCompleted: Record<string, boolean>
  setBoards: (boards: Board[]) => void
  setActiveBoard: (board: Board | null) => void
  setView: (view: BoardView) => void
  setGroupBy: (groupBy: GroupByField) => void
  toggleShowCompleted: (groupKey: string) => void
}

const initialState = {
  boards: [] as Board[],
  activeBoard: null as Board | null,
  view: 'cards' as BoardView,
  groupBy: 'bucket' as GroupByField,
  showCompleted: {} as Record<string, boolean>,
}

export const useBoardStore = create<BoardState>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    setBoards: (boards) => set({ boards }),
    setActiveBoard: (activeBoard) => set({ activeBoard }),
    setView: (view) => set({ view }),
    setGroupBy: (groupBy) => set({ groupBy }),
    toggleShowCompleted: (groupKey) =>
      set((state) => ({
        showCompleted: {
          ...state.showCompleted,
          [groupKey]: !state.showCompleted[groupKey],
        },
      })),
  }))
)
