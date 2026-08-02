// Per-task completion + the GoSpotCheck-style "N Optional · N Required"
// progress counter (task D). Shared by the visit form (header counter +
// submit gate) and the section card (per-section completed count).

import type { FieldMission, FieldMissionTask } from '../types'
import type { DraftSectionState, DraftTaskState } from './fieldCheckDb'

export function emptyTaskState(): DraftTaskState {
  return { text: '', priceRows: [], photos: [] }
}

export function emptyMissionSections(mission: FieldMission): Record<string, DraftSectionState> {
  const out: Record<string, DraftSectionState> = {}
  mission.sections.forEach((section) => {
    out[section.key] = { tasks: section.tasks.map(() => emptyTaskState()) }
  })
  return out
}

export function isTaskComplete(task: FieldMissionTask, state: DraftTaskState | undefined): boolean {
  if (!state) return false
  switch (task.kind) {
    case 'photo':
      return state.photos.length > 0
    case 'text':
      return state.text.trim() !== ''
    case 'prices':
      return state.priceRows.some((r) => r.priceUsd.trim() !== '')
  }
}

export interface MissionProgress {
  requiredTotal: number
  requiredDone: number
  optionalTotal: number
  optionalDone: number
  /** "Section label — Task label" for every incomplete required task, in mission order. */
  missingRequired: string[]
}

export function computeMissionProgress(
  mission: FieldMission,
  sections: Record<string, DraftSectionState>
): MissionProgress {
  let requiredTotal = 0
  let requiredDone = 0
  let optionalTotal = 0
  let optionalDone = 0
  const missingRequired: string[] = []

  for (const section of mission.sections) {
    const sectionState = sections[section.key]
    section.tasks.forEach((task, i) => {
      const done = isTaskComplete(task, sectionState?.tasks[i])
      if (task.required) {
        requiredTotal += 1
        if (done) requiredDone += 1
        else missingRequired.push(`${section.label} — ${task.label}`)
      } else {
        optionalTotal += 1
        if (done) optionalDone += 1
      }
    })
  }

  return { requiredTotal, requiredDone, optionalTotal, optionalDone, missingRequired }
}

export function countTotalPhotos(sections: Record<string, DraftSectionState>): number {
  return Object.values(sections).reduce(
    (sum, section) => sum + section.tasks.reduce((s, t) => s + t.photos.length, 0),
    0
  )
}
