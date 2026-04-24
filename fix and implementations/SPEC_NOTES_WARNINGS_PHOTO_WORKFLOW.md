# SPEC: Notes, Warnings & Photo Workflow — NPD Planner
**Date:** 2026-04-23  
**Status:** APPROVED FOR IMPLEMENTATION  
**Author:** Claude Code

---

## 0. CONFIRMED DECISIONS

| # | Decision | Answer |
|---|---|---|
| A1 | Photographer add-on: `isPhotographer` flag on any role. Existing `photographer` role kept for backwards compat. | ✅ Confirmed |
| A2 | All roles can write notes. Only author OR admin/owner can delete. | ✅ All roles |
| A3 | "Fix Now" marks ALL active notes on recipe resolved at once. | ✅ All at once |
| A4 | Cleaned folder: `3. CLEANED`. Ready renamed to `4. READY`. No real projects yet, safe to do. | ✅ Rename |
| A5 | "old" folder: `PICTURES/old/` flat, all replaced photos mixed. | ✅ Flat |
| A6 | KPIs count by recipe. "Total photos" = sum of all capturedPhotos. | ✅ Confirmed |
| A7 | Workflow: Cleaned photo with warnings → must fix warnings before Ready. In Ready drop, asks "was it fixed?" If No → optional note saved, not resolved. If Yes → all notes resolved. | ✅ Confirmed |
| A8 | Cleaned photos: 1 or many per recipe. Matched by base name before ` - {n}`. E.g. "Valentine A - 1.png", "Valentine A - 2.png" all belong to recipe "Valentine A". | ✅ Confirmed |
| A9 | Draggable photo preview in warning dialog AND "Open in Photoshop" button — both. | ✅ Both |

---

## 1. PHOTOGRAPHER AS ADD-ON

### Current state
`UserRole = 'owner' | 'admin' | 'member' | 'photographer'`  
`photographer` is a highly restricted standalone role (only sees Recipe Manager).

### New behavior
Add `isPhotographer: boolean` flag to `AppUser`. Any role can have it.  
`photographer` standalone role stays (backwards compatible), but now any member/admin can also get the flag.

### Permission function (permissions.ts)
```typescript
export function canTakePhotos(user: AppUser): boolean {
  return user.role === 'owner' ||
         user.role === 'photographer' ||
         user.isPhotographer === true
}

export function canViewPhotos(user: AppUser): boolean {
  return true  // all authenticated users with recipe access
}
```

### UI changes
- **MembersPanel**: In the role dropdown, add a "📷 Photographer" checkbox below the role selector (visible when role is member/admin). Toggle saves `isPhotographer` field.
- **Photo Manager button**: visible to ALL users (was owner+photographer only). Inside: action buttons (select candidate, delete) gated by `canTakePhotos`.
- **CapturePage** (`/capture/:id`): accessible only to `canTakePhotos` users. Others see read-only gallery.
- **Camera badge in sidebar**: shows for `canTakePhotos` users.

### Firestore / Types
```typescript
// types/index.ts — AppUser
isPhotographer?: boolean   // add-on flag, optional (defaults to false)
```

---

## 2. RECIPE NOTES & WARNING SYSTEM

### 2.1 Data model

**Subcollection:** `recipeProjects/{projectId}/recipeFiles/{fileId}/notes/{noteId}`

```typescript
interface RecipeNote {
  id: string
  text: string
  authorId: string
  authorName: string
  createdAt: Timestamp
  resolvedAt: Timestamp | null    // null = active warning
  resolvedBy: string | null
  resolvedByName: string | null
}
```

**Denormalized on RecipeFile doc (for quick list display):**
```typescript
activeNotesCount: number          // count of notes where resolvedAt === null
```

### 2.2 Notes section in RecipeDetailPanel

**Position:** Above the progress/timeline section (at the top of the detail panel body).

**Layout:**
```
┌─────────────────────────────────┐
│ 📝 NOTES                        │
│ ┌───────────────────────────┐   │
│ │ Type a note...            │   │
│ └───────────────────────────┘   │
│                   [Post Note]   │
│                                 │
│ ● Carlos - Apr 23               │
│   Missing Eucalyptus, use       │
│   Baby Blue instead.            │
│                               🗑│
│                                 │
│ ✅ (resolved) Laura - Apr 22    │
│   Change ribbon to ivory.   🗑  │
└─────────────────────────────────┘
```

- Textarea + "Post Note" button (disabled if empty)
- Notes listed newest first
- Resolved notes shown greyed-out with ✅ prefix
- Trash icon: visible to author OR admin/owner
- No editing — immutable once posted

### 2.3 Warning icon on recipe cards (list + grid)

When `activeNotesCount > 0`:
- **Grid card**: yellow warning triangle `⚠` in bottom-right corner of the Excel icon area. Tooltip: "Recipe has active notes"
- **List row**: same warning icon after the recipe name

The icon disappears when `activeNotesCount === 0` (all notes resolved).

### 2.4 Pre-capture warning popup

Before `CapturePage` opens (in `RecipeFolderSection` or `FileExplorerCard` when clicking Take Photos):

1. Check if `file.activeNotesCount > 0`
2. If yes → intercept navigation, show modal:

```
┌──────────────────────────────────────┐
│  ⚠  Active Notes on this Recipe      │
│──────────────────────────────────────│
│  Before proceeding, review these     │
│  notes from your team:               │
│                                      │
│  • Missing Eucalyptus - use Baby     │
│    Blue instead.                     │
│  • Change ribbon color to ivory.     │
│                                      │
│  [Fix Now — Mark All Resolved]       │
│  [I'll Fix Later — Continue Anyway]  │
└──────────────────────────────────────┘
```

- **"I'll Fix Later"**: primary blue button (left/default) — continues to CapturePage, notes stay active
- **"Fix Now"**: secondary grey button (right) — marks all active notes as resolved, then navigates

Color preference: Fix Later = `bg-blue-600` (prominent), Fix Now = `bg-gray-200 text-gray-700` (muted) — so photographer doesn't accidentally click Fix Now.

### 2.5 "Change Resolved" badge in RecipeDetailPanel

After all notes are resolved (via Fix Now or manual trash), the Notes section header shows:
```
📝 NOTES  ✅ All changes addressed
```

### 2.6 Warning in Photo Manager

In the recipe list rows inside Photo Manager:
- Recipe name shows `⚠` icon if `activeNotesCount > 0`
- Clicking `⚠` → small popover listing the active notes

---

## 3. PHOTO MANAGER KPIs

### 3.1 KPI cards (top of PhotoManagerView)

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  📷 Photographed │ │  ✅ Selected      │ │  ✨ Ready        │
│   4 / 50 recipes │ │  25 / 50 recipes │ │  10 / 50 recipes │
│   40 total photos│ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐
│  🎨 Cleaned      │ │  ⚠  Warnings     │
│  Retouching Ndd  │ │  3 active notes  │
│   5 recipes      │ │                  │
└──────────────────┘ └──────────────────┘
```

**Counting logic:**
| KPI | Count |
|---|---|
| Photographed | recipes where `capturedPhotos.length > 0` (subtitle: sum of all photos across all recipes) |
| Selected | recipes where `photoStatus === 'complete'` or `'selected'` |
| Ready | recipes where `readyPngPath !== null` AND `activeNotesCount === 0` |
| Cleaned (Retouching Needed) | recipes where `cleanedPhotoStatus === 'needs_retouch'` |
| Warnings | sum of `activeNotesCount` across all recipes |

### 3.2 Progress bar

```
Overall Photo Progress
████████████░░░░░░░░  60%  (30/50 recipes with ready photo)
```

Based on: recipes with `readyPngPath !== null` / total recipes in project.

---

## 4. NEW FILE DROPS

### 4.1 Folder structure additions

Current:
```
PICTURES/
  1. CAMERA/{subfolder}/
  2. SELECTED/{subfolder}/
  3. READY/
    PNG/
    JPG/
```

New structure (safe — no real projects yet):
```
PICTURES/
  1. CAMERA/{subfolder}/
  2. SELECTED/{subfolder}/
  3. CLEANED/{subfolder}/         ← NEW: background-removed, awaiting Photoshop retouch
  4. READY/                       ← renamed from "3. READY"
    PNG/
    JPG/
  old/                            ← NEW: replaced ready photos (flat, all recipes mixed)
```

### 4.2 Drop A — Cleaned Photos (optional step)

**Where:** New drop zone in Photo Manager, per-recipe row (or a dedicated "Drop Cleaned" button in RecipeDetailPanel).

**Flow:**
1. User drops a PNG file onto the drop zone for a specific recipe
2. App:
   - Copies file to `PICTURES/CLEANED/{subfolder}/{recipeName}_cleaned.png`
   - Also copies to SSD if configured (best-effort)
   - Sets `cleanedPhotoPath`, `cleanedPhotoStatus: 'needs_retouch'`, `cleanedPhotoDroppedAt` on RecipeFile
3. Recipe row in Photo Manager shows: `🎨 Photoshop Needed` badge
4. User can click "Open in Photoshop" → opens file with `shell.openPath()`
5. After retouching, user saves the file externally (Photoshop saves to same path)
6. User drops the retouched file again (on the same zone or a "Drop Retouched" zone):
   - File copied to `PICTURES/CLEANED/{subfolder}/{recipeName}_cleaned_v{n}.png`
   - `cleanedPhotoStatus` → `'done'` (removed from "Photoshop Needed" KPI)
   - The recipe is now ready for the Ready drop

**Firestore fields on RecipeFile:**
```typescript
cleanedPhotoPath: string | null
cleanedPhotoStatus: 'needs_retouch' | 'done' | null
cleanedPhotoDroppedAt: Timestamp | null
```

### 4.3 Drop B — Ready Photo (enhanced existing drop)

**Existing behavior:** User drops a PNG/JPG → saved to `3. READY/PNG/` and `3. READY/JPG/` (the JPG is auto-converted or separately dropped).

**New behavior — Warning check before accepting:**

When user drops a file and `activeNotesCount > 0`:
```
┌────────────────────────────────────────────────┐
│  ⚠  This recipe has active notes               │
│  ────────────────────────────────────────────  │
│  [Photo preview — draggable to Photoshop]      │
│                                                 │
│  Active Notes:                                  │
│  • Missing Eucalyptus — use Baby Blue instead   │
│  • Change ribbon color to ivory                 │
│                                                 │
│  Were the following changes applied?            │
│                                                 │
│  ☐ Missing Eucalyptus — use Baby Blue instead  │
│  ☐ Change ribbon color to ivory                │
│                                                 │
│  [Accept & Mark All Resolved]  [Cancel Drop]   │
└────────────────────────────────────────────────┘
```

- Photo shown is **draggable** (user can drag it to Photoshop to make quick edits)
- User can also drop a new image IN this same dialog to replace what they just dropped
- After "Accept & Mark All Resolved":
  - Old ready photo moved to `PICTURES/old/{recipeName}_replaced_{timestamp}.png`
  - New photo saved to `3. READY/PNG/`
  - All active notes marked resolved
  - `activeNotesCount` → 0

**If NO active notes:** existing flow unchanged (no dialog, straight accept).

**Partial-save / resume:** The dialog can be closed. The state is saved in localStorage as `pending_ready_drop_{fileId}` so the user can resume later. The photo is staged (not committed) until they confirm.

---

## 5. IMPLEMENTATION PHASES

### Phase 1 — Photographer add-on (1 day)
- [ ] Add `isPhotographer?: boolean` to `AppUser` type and Firestore
- [ ] Add `canTakePhotos()` to permissions.ts
- [ ] Update MembersPanel: photographer checkbox
- [ ] Update all `user.role === 'photographer'` checks to use `canTakePhotos(user)`
- [ ] Photo Manager: open to all, gate actions by `canTakePhotos`

### Phase 2 — Recipe Notes (2 days)
- [ ] Firestore subcollection + CRUD functions (recipeFirestore.ts)
- [ ] `subscribeToRecipeNotes()` hook
- [ ] `NotesSection` component for RecipeDetailPanel
- [ ] Wire into RecipeDetailPanel above progress timeline
- [ ] `activeNotesCount` denormalized field updates
- [ ] Warning icon in RecipeCard (grid + list)
- [ ] Pre-capture warning popup (intercept navigation)
- [ ] Fix Now / Fix Later logic
- [ ] Photo Manager warning indicators

### Phase 3 — Photo Manager KPIs (1 day)
- [ ] KPI card components
- [ ] Counting logic from RecipeFile array
- [ ] Progress bar
- [ ] Layout at top of PhotoManagerView

### Phase 4 — Cleaned Photos drop (2 days)
- [ ] Add `cleanedPhoto*` fields to `RecipeFile` type
- [ ] IPC handler: `recipe:save-cleaned-photo`
- [ ] Drop zone UI in Photo Manager (per recipe row)
- [ ] "Open in Photoshop" button (`shell.openPath`)
- [ ] Re-drop for retouched file → marks `cleanedPhotoStatus: 'done'`
- [ ] KPI counting for Cleaned/Photoshop Needed

### Phase 5 — Enhanced Ready Drop (2 days)
- [ ] Warning check before accepting ready drop
- [ ] Warning + photo review dialog (with draggable preview)
- [ ] Drop-replacement inside dialog
- [ ] Move old ready to `PICTURES/old/` on replacement
- [ ] All notes resolved on confirm
- [ ] Partial-save to localStorage for resume

---

## 6. FILES TO CREATE / MODIFY

### New files
```
src/renderer/src/components/recipes/NotesSection.tsx
src/renderer/src/components/recipes/CaptureWarningModal.tsx
src/renderer/src/components/recipes/ReadyDropWarningModal.tsx
src/renderer/src/components/recipes/PhotoManagerKPIs.tsx
src/renderer/src/hooks/useRecipeNotes.ts
```

### Modified files
```
src/renderer/src/types/index.ts                  — new fields
src/renderer/src/lib/recipeFirestore.ts          — notes CRUD
src/renderer/src/components/recipes/RecipeDetailPanel.tsx    — NotesSection
src/renderer/src/components/recipes/RecipeFolderSection.tsx  — warning icon, intercept navigation
src/renderer/src/components/recipes/RecipeProjectPage.tsx    — FileExplorerCard warning
src/renderer/src/components/recipes/PhotoManagerView.tsx     — KPIs, drops, warning icons
src/renderer/src/lib/permissions.ts              — canTakePhotos
src/renderer/src/components/settings/MembersPanel.tsx        — photographer checkbox
src/main/ipc/recipeIpcHandlers.ts                — save-cleaned-photo handler
src/preload/index.ts                             — expose new IPC
src/renderer/src/env.d.ts                        — type the new IPC
```

---

## 7. OPEN QUESTIONS FOR USER REVIEW

Before Phase 4/5, confirm:

**Q1:** Cleaned photos folder name: use `PICTURES/CLEANED/` (no number) to avoid renaming existing `3. READY`? Or do you want `3. CLEANED` + rename READY to `4. READY`?

**Q2:** "old" folder: flat at `PICTURES/old/` (all replaced photos mixed), or per-recipe `PICTURES/old/{subfolder}/`?

**Q3:** Who can write notes? Currently assuming: anyone with recipe edit access. Correct?

**Q4:** Fix Now — marks ALL active notes at once, or one by one?

**Q5:** In the Ready drop warning dialog, the photo preview should be draggable to Photoshop. On Windows this means Drag & Drop from the Electron window — do you use this, or is "Open in Photoshop" button enough?

**Q6:** When the user drops cleaned photos, does each recipe get ONE cleaned photo (the final candidate), or can they drop multiple (like they can have multiple camera shots)?

---

## 8. WHAT IS NOT CHANGING

- Notes are NOT editable after posting (immutable by design)
- Existing photo capture / tethering flow unchanged
- SSD remains Mac-only backup (no Windows SSD)
- SharePoint is the primary storage — all paths resolve through local SharePoint sync folder
- Cleaned photos are stored locally (SharePoint sync), not uploaded separately
