import { create } from 'zustand'
import type { DateType } from '../types'

interface DateTypeState {
  dateTypes: DateType[]
  setDateTypes: (types: DateType[]) => void
  getByKey: (key: string) => DateType | undefined
}

export const useDateTypeStore = create<DateTypeState>((set, get) => ({
  dateTypes: [],
  setDateTypes: (types) => {
    // Deduplicate by key in case Firestore has duplicate documents
    const seen = new Set<string>()
    const unique = types.filter((dt) => {
      if (seen.has(dt.key)) return false
      seen.add(dt.key)
      return true
    })
    set({ dateTypes: unique })
  },
  getByKey: (key) => get().dateTypes.find((dt) => dt.key === key),
}))
