// Regression tests for manifest merging — the union merge without tombstones
// resurrected every deleted photo (files already unlinked → ghost thumbnails).
import { describe, it, expect } from 'vitest'
import { mergeManifests, emptyManifest, summarize, PhotoManifest } from '../src/shared/photoManifest'

function baseManifest(): PhotoManifest {
  return {
    ...emptyManifest({
      recipeUid: 'uid-1', excelRelativePath: 'Valentine/Rose.xlsx',
      recipeName: 'Rose', subfolderName: 'Valentine', userId: 'carlos',
    }),
    lastModified: '2026-06-11T10:00:00Z',
    camera: [
      { filename: 'Rose - 1.jpg', sequence: 1, isSelected: false, capturedAt: '2026-06-10T10:00:00Z', capturedBy: 'carlos' },
      { filename: 'Rose - 2.jpg', sequence: 2, isSelected: true, capturedAt: '2026-06-10T10:01:00Z', capturedBy: 'carlos', selectedAt: '2026-06-10T11:00:00Z', selectedBy: 'carlos' },
    ],
    ready: { pngFilename: 'Rose.png', jpgFilename: 'Rose.jpg', processedAt: '2026-06-10T12:00:00Z', processedBy: 'carlos' },
  }
}

describe('mergeManifests — tombstones', () => {
  it('a deletion survives the merge against the disk copy', () => {
    const disk = baseManifest()
    const incoming: PhotoManifest = {
      ...disk,
      lastModified: '2026-06-11T11:00:00Z',
      camera: [disk.camera[0]],
      deleted: [{ filename: 'Rose - 2.jpg', location: 'camera', deletedAt: '2026-06-11T11:00:00Z', deletedBy: 'carlos' }],
    }
    const merged = mergeManifests(disk, incoming)
    expect(merged.camera.map(c => c.filename)).toEqual(['Rose - 1.jpg'])
    expect(merged.deleted?.length).toBe(1)
  })

  it('a cleared READY does not resurrect', () => {
    const disk = baseManifest()
    const incoming: PhotoManifest = {
      ...disk,
      lastModified: '2026-06-11T11:00:00Z',
      ready: null,
      deleted: [{ filename: 'Rose.png', location: 'ready', deletedAt: '2026-06-11T11:00:00Z', deletedBy: 'carlos' }],
    }
    expect(mergeManifests(disk, incoming).ready).toBeNull()
  })

  it('a re-capture NEWER than the tombstone revives the photo and prunes the tombstone', () => {
    const disk = baseManifest()
    disk.deleted = [{ filename: 'Rose - 2.jpg', location: 'camera', deletedAt: '2026-06-11T11:00:00Z', deletedBy: 'carlos' }]
    disk.camera = [disk.camera[0]]
    const recaptured: PhotoManifest = {
      ...disk,
      lastModified: '2026-06-11T12:00:00Z',
      camera: [...disk.camera, { filename: 'Rose - 2.jpg', sequence: 2, isSelected: false, capturedAt: '2026-06-11T12:00:00Z', capturedBy: 'carlos' }],
    }
    const merged = mergeManifests(disk, recaptured)
    expect(merged.camera.map(c => c.filename)).toContain('Rose - 2.jpg')
    expect(merged.deleted?.some(d => d.filename === 'Rose - 2.jpg')).toBe(false)
  })

  it('legacy manifests without the deleted field merge cleanly', () => {
    const legacy = baseManifest()
    delete (legacy as unknown as Record<string, unknown>).deleted
    const incoming: PhotoManifest = {
      ...baseManifest(),
      lastModified: '2026-06-11T11:00:00Z',
      camera: [baseManifest().camera[0]],
      deleted: [{ filename: 'Rose - 2.jpg', location: 'camera', deletedAt: '2026-06-11T11:00:00Z', deletedBy: 'carlos' }],
    }
    const merged = mergeManifests(legacy, incoming)
    expect(merged.camera.map(c => c.filename)).toEqual(['Rose - 1.jpg'])
  })
})

describe('mergeManifests — union semantics', () => {
  it('unions camera entries from both sides; newest selection event wins on dupes', () => {
    const a = baseManifest()
    const b: PhotoManifest = {
      ...baseManifest(),
      lastModified: '2026-06-11T09:00:00Z',
      camera: [
        { filename: 'Rose - 2.jpg', sequence: 2, isSelected: false, capturedAt: '2026-06-10T10:01:00Z', capturedBy: 'laura' },
        { filename: 'Rose - 3.jpg', sequence: 3, isSelected: false, capturedAt: '2026-06-10T10:05:00Z', capturedBy: 'laura' },
      ],
    }
    const merged = mergeManifests(a, b)
    expect(merged.camera.map(c => c.filename)).toEqual(['Rose - 1.jpg', 'Rose - 2.jpg', 'Rose - 3.jpg'])
    // a's "Rose - 2" has the newer selectedAt → its isSelected=true wins
    expect(merged.camera.find(c => c.filename === 'Rose - 2.jpg')?.isSelected).toBe(true)
  })
})

describe('summarize', () => {
  it('derives photoStatus=ready when a READY entry exists', () => {
    expect(summarize(baseManifest()).photoStatus).toBe('ready')
  })
  it('derives photoStatus=selected when selections exist but no READY', () => {
    const m = { ...baseManifest(), ready: null }
    expect(summarize(m).photoStatus).toBe('selected')
  })
  it('derives photoStatus=pending for an empty manifest', () => {
    const m = { ...baseManifest(), camera: [], ready: null }
    expect(summarize(m).photoStatus).toBe('pending')
  })
})
