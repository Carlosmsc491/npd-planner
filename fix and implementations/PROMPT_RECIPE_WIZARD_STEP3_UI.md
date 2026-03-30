# SPEC: Recipe Manager — New Project Wizard Step 3 UI Redesign
# Target: Claude Code (terminal)

---

## Context

Recipe Manager is being built inside NPD Planner (Electron + React + TypeScript + Firebase).
The New Project wizard has 3 steps. This prompt only touches **Step 3 — Structure**.
Steps 1 and 2 are untouched. All existing data flow, types, IPC, and Firestore logic are preserved exactly.

---

## What the current Step 3 looks like (to replace)

The current Step 3 renders a `ProjectStructureBuilder` component that shows:
- A left panel: folder tree (QTreeWidget-style)
- A right panel: item list + recipe spec editor

This UI came from EliteQuote (Python/PySide6 reference). It needs to be redesigned
as a native React component that fits NPD Planner's existing Tailwind + dark mode design system.

---

## New UI Design — File Manager Table Layout

### Overall layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [+ Add Folder]  [+ Add Recipe]              [Filter by name...    ] │
├──────────────────────────────┬──────────┬──────────┬───────────────┤
│ NAME                         │ OPTION   │ PRICE    │ ACTIONS       │
├──────────────────────────────┼──────────┼──────────┼───────────────┤
│ 📁 CONTEMPORARY              │ —        │ —        │ [+] [⋯]       │
│   📄 CONTEMPORARY 3 ST       │ A        │ $12.99   │ [⿻] [⋯]      │
│     ▼ [expanded fields]      │          │          │               │
│   📄 CONTEMPORARY 20 ST      │ B        │ $12.99   │ [⿻] [⋯]      │
│ 📁 JAN - FEB                 │ —        │ —        │ [+] [⋯]       │
└──────────────────────────────┴──────────┴──────────┴───────────────┘
```

No sidebar. Single full-width table. Folders are rows. Recipes are indented rows under folders.

---

## Behavior Specs

### Folder rows
- Show folder icon 📁 + bold name + recipe count badge
- Click chevron (▶) or row to expand/collapse children
- **Drag the folder row** onto another folder row → moves folder inside it (sub-folder)
- Right-click → context menu: Rename, Duplicate (with all contents), Delete
- Action buttons on hover: `[+]` (add recipe inside), `[⋯]` (context menu)
- Indentation: depth × 20px padding-left on the name cell

### Recipe rows
- Show file icon 📄 + name + option badge + price
- Click row → expands inline below with fields:
  - **Price** input (text, prefilled)
  - **Option** select — options: A, B, C, D, E, F, G (exactly these 7)
  - **Name** text input
  - `→ filename.xlsx` link (display only)
  - **Override Project Rules** collapsible section (collapsed by default)
- When a recipe is newly created → auto-expanded
- **Drag recipe row** onto a folder row → moves recipe into that folder
- Right-click → context menu: Rename, Duplicate, Copy, Paste (if clipboard has item), Delete
- Action buttons on hover: `[⿻]` (duplicate), `[⋯]` (context menu)

### Drag & drop rules
- Draggable: folder rows, recipe rows
- Drop targets: folder rows only
- Visual feedback on valid drop target: dashed green border outline on the target row
- No drop-indicator lines between rows — only highlight the destination folder
- After drop: target folder expands automatically

### Duplicate / Copy / Paste
- Duplicate: clones item (and all children if folder) immediately below original, appending " (copy)"
- Copy: stores item in component state clipboard
- Paste: appears in context menu only when clipboard is non-empty; pastes as child if target is folder
- All duplicated/pasted items get new unique IDs

### Filter bar
- Text input top-right: filters rows by name (folders and recipes), case-insensitive
- Matching rows stay visible; non-matching hidden; parent folders of matching recipes stay visible

### Add Folder / Add Recipe (top bar buttons)
- "Add Folder" → creates folder at root level, name defaults to "NEW FOLDER", immediately editable inline
- "Add Recipe" → creates recipe at root level (or inside selected folder), auto-expanded

### Inline rename
- Double-click on a name → inline text input replaces name text, blur or Enter confirms

---

## Data shape (unchanged from existing types)

The component receives and emits the same `RecipeSpec[]` array that the existing
`ProjectStructureBuilder` uses. Internal state maps specs to a folder tree.

```typescript
// Existing type — do NOT modify
interface RecipeSpec {
  recipe_id: string
  display_name: string
  option: string        // 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  price: string
  relative_path: string // e.g. "CONTEMPORARY/CONTEMPORARY 3 ST.xlsx"
  // ... other fields passed through unchanged
}
```

The new component must expose the same props interface as the existing one so the wizard
wires up identically.

---

## Styling rules

- Use NPD Planner's existing Tailwind classes and dark mode (`dark:` variants)
- Follow existing component patterns from `BoardView.tsx`, `TaskCard.tsx`
- Table header: sticky, `bg-white dark:bg-gray-900`, 11px uppercase muted labels
- Folder rows: `font-medium`, folder icon amber/yellow (`text-amber-500`)
- Recipe rows: indented, file icon gray (`text-gray-400`)
- Expanded recipe panel: `bg-gray-50 dark:bg-gray-800/50`, subtle top border
- Context menu: `bg-white dark:bg-gray-800`, shadow, `border border-gray-200 dark:border-gray-700`
- Drag-over highlight: `outline-2 outline-dashed outline-green-500 bg-green-50 dark:bg-green-900/20`
- Option badge: small pill `bg-gray-100 dark:bg-gray-700 rounded-full px-2 text-xs`

---

## Files to create / modify

### Create (new files)
```
src/renderer/src/components/recipe-manager/
  WizardStep3Structure.tsx       ← main new component (replaces old step 3 content)
  useStructureState.ts           ← state hook: folder tree, drag, clipboard, filter
```

### Modify (minimal changes)
```
src/renderer/src/components/recipe-manager/NewProjectWizard.tsx
  (or wherever Step 3 is rendered)
  → Replace old ProjectStructureBuilder render with <WizardStep3Structure />
  → Keep same props: defaultSpecs, projectDefaults, onChange, onValidityChange
```

---

## What NOT to change

- Step 1 (Basics) — untouched
- Step 2 (General Rules) — untouched  
- Wizard navigation (Back / Generate Files buttons) — untouched
- All IPC handlers, Firestore calls, RecipeSpec generation logic — untouched
- `collect_specs()` equivalent (the output array) — same format
- Any existing types in `src/types/index.ts` — untouched

---

## Acceptance criteria

- [ ] Folder rows expand/collapse on click
- [ ] Dragging a folder onto another folder moves it as a subfolder
- [ ] Dragging a recipe onto a folder moves the recipe inside
- [ ] New recipe auto-expands showing price/option/name fields + Override section collapsed
- [ ] Option dropdown shows exactly: A, B, C, D, E, F, G
- [ ] Duplicate folder duplicates all child recipes with new IDs
- [ ] Copy + Paste works via context menu
- [ ] Filter input hides non-matching rows (keeps parent folders of matches)
- [ ] Dark mode works (all `dark:` variants applied)
- [ ] `npm run typecheck` passes with zero errors

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT FOR CLAUDE CODE — copy everything below this line
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Then read these files for context:
- src/renderer/src/components/recipe-manager/NewProjectWizard.tsx (or wherever Step 3 is rendered)
- src/types/index.ts (RecipeSpec and related types)
- src/renderer/src/components/board/BoardView.tsx (for Tailwind style patterns)
- src/renderer/src/components/board/TaskCard.tsx (for row + context menu patterns)

---

## Task: Redesign Step 3 (Structure) of the New Project Wizard

**Only modify the Step 3 content area. Steps 1 and 2 are untouched. All data flow, types, and IPC are untouched.**

### Create: `src/renderer/src/components/recipe-manager/useStructureState.ts`

A custom hook that manages the internal state for the step 3 UI:

```typescript
// Internal tree node types
type FolderNode = {
  id: string
  type: 'folder'
  name: string
  open: boolean
  children: TreeNode[]
}

type RecipeNode = {
  id: string
  type: 'recipe'
  name: string
  option: string   // 'A'|'B'|'C'|'D'|'E'|'F'|'G'
  price: string
  fileName: string
  expanded: boolean
  overrideOpen: boolean
  specData: RecipeSpec  // original spec passthrough
}

type TreeNode = FolderNode | RecipeNode
```

The hook exposes:
- `nodes: TreeNode[]` — flat ordered list for rendering (pre-flattened with depth info)
- `filterQuery: string`, `setFilterQuery`
- `addFolder(parentId?: string)`
- `addRecipe(parentId?: string)`
- `toggleFolder(id: string)`
- `toggleRecipe(id: string)`
- `toggleOverride(id: string)`
- `updateRecipeField(id: string, field: 'name'|'option'|'price', value: string)`
- `moveInto(draggedId: string, targetFolderId: string)`
- `renameItem(id: string, newName: string)`
- `duplicateItem(id: string)`
- `copyItem(id: string)`
- `pasteItem(targetId: string)`
- `deleteItem(id: string)`
- `collectSpecs(): RecipeSpec[]` — converts tree back to flat RecipeSpec[] with relative_path built from folder path + fileName
- `hasClipboard: boolean`

Use `useCallback` and `useMemo` appropriately. IDs use `crypto.randomUUID()`.

---

### Create: `src/renderer/src/components/recipe-manager/WizardStep3Structure.tsx`

Props interface (must match whatever the wizard currently passes to the old component):

```typescript
interface WizardStep3StructureProps {
  defaultSpecs?: RecipeSpec[]
  projectDefaults?: {
    customer: string
    holiday: string
    wetPack: boolean
    distribution: Record<string, number>
  }
  onChange?: (specs: RecipeSpec[]) => void
  onValidityChange?: (valid: boolean, message: string) => void
}
```

UI structure:

```
<div className="flex flex-col h-full">

  {/* Top toolbar */}
  <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
    <button onClick={addFolder}>+ Add Folder</button>
    <button onClick={addRecipe} className="primary">+ Add Recipe</button>
    <div className="flex-1" />
    <input placeholder="Filter by name..." onChange={setFilterQuery} />
  </div>

  {/* Table */}
  <div className="flex-1 overflow-y-auto">
    <table className="w-full border-collapse">
      <thead> {/* sticky header: NAME | OPTION | PRICE | ACTIONS */} </thead>
      <tbody>
        {flattenedNodes.map(node => node.type === 'folder'
          ? <FolderRow ... />
          : <RecipeRow ... />
        )}
      </tbody>
    </table>
  </div>

</div>
```

**FolderRow** (separate sub-component or inline):
- `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onContextMenu`
- Left padding: `paddingLeft: depth * 20 + 16` px on name cell
- Chevron rotates 90° when open
- Folder icon: `text-amber-500`
- Recipe count badge: small gray pill
- Hover shows action buttons: `[+]` and `[⋯]`
- Context menu on right-click or `[⋯]`: Rename, Duplicate, Delete

**RecipeRow** (inline expanded area below the row, inside the same `<td colspan="4">`):
- Collapsed: shows name, option badge, price
- Expanded (click row to toggle): shows inline form below the row header
  - Price input, Option select (A B C D E F G), Name input
  - `→ filename.xlsx` text link (display only, no action)
  - Override Project Rules: clickable collapsed bar, expands to placeholder text
- Hover shows: `[⿻]` (duplicate) and `[⋯]` (context menu)
- Context menu: Rename, Duplicate, Copy, Paste (only if hasClipboard), Delete
- `draggable`, drag to folder works same as folder drag

**Context menu**:
- Fixed-position div, shown on right-click or button click
- `useEffect` to close on outside click
- Positioned at mouse coords, clamped to viewport

**Drag & drop**:
- `draggedId` stored in `useRef` (or state)
- `onDragOver` on folder rows: `e.preventDefault()` + apply highlight class
- `onDrop` on folder rows: call `moveInto(draggedId, targetFolderId)`
- No drop zones between rows — only folder rows accept drops

**Filter logic**:
- A folder is visible if: its name matches OR any descendant recipe name matches
- A recipe is visible if: its name matches OR its parent folder is visible

Call `onChange(collectSpecs())` whenever tree mutates.
Call `onValidityChange(hasAtLeastOneRecipe, message)` whenever tree mutates.

---

### Modify: NewProjectWizard.tsx (or wherever Step 3 renders)

Find the Step 3 content render. Replace the old `ProjectStructureBuilder` (or equivalent) with:

```tsx
import { WizardStep3Structure } from './WizardStep3Structure'

// Inside step 3 render:
<WizardStep3Structure
  defaultSpecs={existingSpecs}
  projectDefaults={projectDefaults}
  onChange={handleSpecsChange}
  onValidityChange={handleStructureValidity}
/>
```

Keep all other wizard logic, navigation buttons, and state exactly as-is.

---

## Verification

After implementation:

1. Run `npm run typecheck` — must pass with zero errors
2. Open the app, go to New Project wizard, reach Step 3
3. Verify: add folder, add recipe (auto-expanded), expand/collapse, drag recipe into folder, right-click context menu, duplicate folder with recipes, filter by name, dark mode
4. Verify Generate Files still works end-to-end (data flows through unchanged)

---

## Commit message

```
feat(recipe-manager): redesign wizard step 3 structure as file manager table UI

- Replace ProjectStructureBuilder with WizardStep3Structure (React/Tailwind)
- File manager table layout: folders + recipes as rows with depth indentation
- Drag & drop: move recipes and folders by dragging onto target folder
- Options A–G in select, recipe auto-expands on creation
- Duplicate/copy/paste for folders (with children) and recipes
- Filter bar hides non-matching rows, keeps parent folders of matches
- Override Project Rules collapsible section per recipe (collapsed by default)
- Context menu on right-click or ⋯ button
- Full dark mode support
- Data flow and IPC unchanged — same RecipeSpec[] output
```

Update CLAUDE.md checkboxes and DOCUMENTACION_TECNICA_NPD_PLANNER.md to reflect this UI change.
