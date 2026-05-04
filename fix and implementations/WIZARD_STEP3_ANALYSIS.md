# New Project Wizard — Step 3 "Structure" Analysis

## What Step 3 Is

Step 3 is a mini file-tree editor inside the wizard. The user defines the folder and recipe layout of the project *before* it is created on disk. When they click "Create Project," the wizard:

1. Creates real folders on disk at `{rootPath}/{ProjectName}/{FolderName}/`
2. Copies the Excel template into each recipe slot with the name `{price} {option} {recipeName}.xlsx`
3. Writes initial data (price, option, customer, holiday, distribution %) directly into Excel cells via COM/AppleScript
4. Saves all metadata to Firestore (`recipeProjects` + `recipeFiles` collections)

---

## How the UI Works (Current Implementation)

**File:** `src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx`
**State hook:** `src/renderer/src/components/recipes/wizard/useStructureState.ts`

### Layout
- A sticky-header table with 4 columns: **Name | Option | Price | Actions**
- Folders appear as collapsible rows (amber folder icon, chevron toggle)
- Recipes expand as child rows under their parent folder, indented 20 px per depth level
- A filter input in the top-right filters visible rows by name

### Adding items
- **"Add Folder"** button (top-left, gray border) → creates a new folder at the root level
- **"Add Recipe"** button (top-left, green) → creates a new recipe **at root level** (not inside the selected folder)

### Editing recipes
- Each recipe row shows a **Name** field, **Option** dropdown (A–G), **Price** input
- Clicking **"▶ Override Project Rules"** at the bottom of a recipe row expands a section for per-recipe overrides: customer, holiday, wet pack, box type, pick needed, and full distribution editor
- Inline rename: **double-click** on any name label to edit in place (Enter = save, Escape = cancel)

### Actions (hover-only, opacity 0 → 1)
- **Folder actions:** "Add Recipe" (inside that folder), "Rename", "Duplicate", "Delete"
- **Recipe actions:** "Duplicate", "Delete"
- **Context menu:** Right-click any row → same options

### Drag and drop
- Recipes and folders are `draggable`
- Dropping a recipe or folder onto a **folder row** moves it inside that folder
- No visual drag handle is shown — the whole row is the handle

---

## What Happens on Disk (Creation Flow)

**File:** `src/renderer/src/components/recipes/wizard/NewRecipeProjectWizard.tsx`

```
{rootPath}/
└── {ProjectName}/
    ├── _project/           ← internal index folder
    └── {FolderName}/
        └── $12.99 A VALENTINE.xlsx   ← copied + written
```

Excel cells written per recipe (via IPC `recipeBatchWriteCells`):
| Sheet | Cell | Value |
|---|---|---|
| Quote | D3 | Display name (price + option + name) |
| Quote | Z52 | Stable UUID (recipeUid — never changes on rename) |
| Quote | D6 | Holiday |
| Quote | D7 | Customer |
| Quote | AA40 | Wet pack |
| Quote | Z6 | Box type |
| Quote | AC23 | Pick needed |
| Quote | AB25 | Sleeve price (auto-computed from price map) |
| Quote | AC25 | "Y" if sleeve price exists, else blank |
| Spec Sheet | E4 | Project name |
| Quote | (many cells) | Distribution percentages |

---

## UX Problems Found

### 1. "Add Recipe" always adds to root, not to the selected folder
**Impact: High.** Users expect clicking "Add Recipe" after selecting a folder to add inside it. Instead it always adds at root, requiring a manual drag-and-drop to move it.

**Fix:** Disable the root-level "Add Recipe" button or make it context-aware. Better: automatically add inside the last-selected/expanded folder.

---

### 2. "Add Recipe" button in the folder hover menu is the only reliable way to add inside a folder
**Impact: High discoverability issue.** The hover actions disappear when the mouse moves away, and new users have no visual cue that hovering reveals an "Add Recipe" button per folder.

**Fix:** Show folder action buttons persistently, or add a `+` icon always visible next to the folder name.

---

### 3. No onboarding / empty state guidance
**Impact: Medium.** When the user first arrives at Step 3, they see "No folders yet. Add your first folder." — but the button to do so is at the top of the panel, far from the empty state message.

**Fix:** Add an empty state action button inline — e.g., "Add first folder" centered in the empty table area.

---

### 4. Double-click to rename is not discoverable
**Impact: Medium.** There is no tooltip, no edit icon, no hint that double-clicking a name starts inline rename. The only way to discover it is through the right-click context menu.

**Fix:** Add a pencil icon (opacity-0 group-hover) next to folder/recipe names.

---

### 5. "Override Project Rules" label is jargon
**Impact: Medium.** Business users don't know what "project rules" means in this context. The collapsed section sounds like an advanced or dangerous setting.

**Fix:** Rename to "Custom Settings for this Recipe" or "Per-Recipe Overrides."

---

### 6. Option column is not explained
**Impact: Low–Medium.** Options A–G map to specific bouquet tiers in the company's pricing system. A new user has no idea what "Option" means.

**Fix:** Add a tooltip or subtitle under the "Option" column header explaining what the letters represent.

---

### 7. Price field has no validation or formatting help
**Impact: Low.** Users can type anything in the price field. If they type `12.99` instead of `$12.99`, the sleeve price lookup fails silently (shows "requiresManualUpdate: true" with no explanation in the UI).

**Fix:** Auto-prefix `$` if missing. Show a warning chip on the recipe row if `requiresManualUpdate` is true after creation.

---

### 8. Drag handles are invisible
**Impact: Low.** The whole row is draggable but there's no grip icon. Users discover drag-and-drop by accident, if at all.

**Fix:** Add a `GripVertical` icon (6 dots) to the far-left of each row, visible on hover.

---

### 9. No count/summary before creating
**Impact: Low.** The user can't see at a glance how many folders and total recipes they've defined before pressing "Create Project."

**Fix:** Add a footer summary bar: "3 folders · 24 recipes" or show counts in the toolbar.

---

## What Works Well

- The table layout is clean and scalable to many recipes
- The distribution editor (when opened) is very complete
- Filters work well for large structures
- Duplicate folder/recipe saves significant repetitive input
- The progress overlay during creation (with per-step status) is excellent UX

---

## Recommended Priority Fixes

| Priority | Fix |
|---|---|
| P1 | "Add Recipe" must add inside the active/selected folder |
| P1 | Persistent folder actions (not just on hover) |
| P2 | Empty state with inline CTA button |
| P2 | Rename "Override Project Rules" → "Per-Recipe Overrides" |
| P2 | Pencil icon on hover for rename affordance |
| P3 | Price validation + auto-$ prefix |
| P3 | Drag handle icon |
| P3 | Recipe/folder count summary in toolbar |
