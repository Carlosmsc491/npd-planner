import { create } from 'zustand'
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

export const useBoardStore = create<BoardState>((set) => ({
  boards: [],
  activeBoard: null,
  view: 'cards',
  groupBy: 'bucket',
  showCompleted: {},
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
