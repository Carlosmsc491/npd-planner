// Maps a mission's per-task draft state into the fixed FieldVisitSection
// shape ({ key, label, photos[], notes, parsedPrices[] }) that fieldCheckSync
// writes to Firestore — task E. That shape is a contract the desktop
// dashboard already consumes and must NOT change, but a section can now hold
// an arbitrary list of tasks (Competitive Intelligence has sections with 1,
// 2 or 3 tasks mixing kinds). So: every text task in a section folds into
// that section's single `notes` string, every photo task's photos concatenate
// into one `photos[]` array, every prices task's rows concatenate into one
// `parsedPrices[]` array. When a section has more than one task of the same
// kind, each contribution is label-prefixed (text) or just appended
// (photos/prices) so nothing is silently dropped.

import type { FieldMission } from '../types'
import type { DraftPriceRow, DraftSectionState, QueuedVisit } from './fieldCheckDb'
import { emptyTaskState } from './missionProgress'
import { toCompetitorPrices } from './priceRows'

export function buildQueuedSections(
  mission: FieldMission,
  sections: Record<string, DraftSectionState>
): QueuedVisit['sections'] {
  return mission.sections.map((sectionDef) => {
    const sectionState = sections[sectionDef.key] ?? {
      tasks: sectionDef.tasks.map(() => emptyTaskState()),
    }
    const textTaskCount = sectionDef.tasks.filter((t) => t.kind === 'text').length

    const textParts: string[] = []
    const photos: QueuedVisit['sections'][number]['photos'] = []
    const priceRows: DraftPriceRow[] = []

    sectionDef.tasks.forEach((task, i) => {
      const taskState = sectionState.tasks[i] ?? emptyTaskState()
      if (task.kind === 'text') {
        const value = taskState.text.trim()
        if (value !== '') textParts.push(textTaskCount > 1 ? `${task.label}: ${value}` : value)
      } else if (task.kind === 'photo') {
        taskState.photos.forEach((p) => photos.push({ photoId: p.id, blob: p.blob, width: p.width, height: p.height }))
      } else if (task.kind === 'prices') {
        priceRows.push(...taskState.priceRows)
      }
    })

    return {
      key: sectionDef.key,
      label: sectionDef.label,
      notes: textParts.join('\n\n'),
      parsedPrices: toCompetitorPrices(priceRows, sectionDef.key),
      photos,
    }
  })
}
