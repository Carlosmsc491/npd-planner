# WizardStepStructure — 4 UX Fixes

**Files affected:**
- `src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx`
- `src/renderer/src/components/recipes/wizard/useStructureState.ts`

---

## Fix 1 — Visual clarity: indentation + folder badge

**Problem:** Hard to tell if a recipe is inside a folder or at root level.

**Solution:**
- Recipes that live inside a folder get a **left border accent** (`border-l-2 border-emerald-400`) and `pl-6` indentation relative to their parent folder row.
- Folders show a small pill badge `bg-amber-100 text-amber-700 text-xs` with the recipe count: `3 recipes`.
- Folder rows use a slightly different background (`bg-amber-50/40`) to visually separate them from recipe rows.
- Root-level recipes (not inside any folder) use `pl-2` and no left border — visually "flat" to signal they're at root.

---

## Fix 2 — Auto-prefix `$` on price field

**Problem:** User types `12.99` and sleeve price lookup fails silently.

**Solution:**
- On the price `<input>` `onBlur`: if the value is non-empty and does not start with `$`, prepend `$` automatically.
- On `onChange`: allow free typing. Only normalize on blur.
- Example: user types `12.99` → on blur field shows `$12.99`.
- Also add `inputMode="decimal"` and `placeholder="e.g. $12.99"` to guide input.

```tsx
// In the recipe price input handler
onBlur={(e) => {
  const raw = e.target.value.trim();
  if (raw && !raw.startsWith('$')) {
    updateRecipePrice(recipe.id, `$${raw}`);
  }
}}
```

---

## Fix 3 — Collapse active recipe when "Add Recipe" is clicked

**Problem:** After filling a recipe, clicking "Add Recipe" adds a new one but leaves the previous form expanded, making the list noisy.

**Solution:**
- In `useStructureState.ts`, track `expandedRecipeId: string | null`.
- When `addRecipe()` is called, set `expandedRecipeId` to the new recipe's ID (auto-expand the new one) and collapse the previous.
- The recipe row expansion is controlled by `expandedRecipeId === recipe.id`.
- Clicking a collapsed recipe row also sets `expandedRecipeId` to that recipe's ID (see Fix 4).

```ts
// useStructureState.ts addition
const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

function addRecipe(parentFolderId?: string) {
  const newRecipe = createRecipe(parentFolderId);
  setItems(prev => [...prev, newRecipe]);
  setExpandedRecipeId(newRecipe.id); // auto-expand new, collapse all others
}
```

---

## Fix 4 — Click on collapsed recipe row opens the edit panel

**Problem:** The gray edit panel (Name/Price/Option inputs + Override section) only opens when the user explicitly clicks a toggle. It's not obvious that clicking the recipe row itself should open it.

**Solution:**
- Make the entire collapsed recipe row (`onClick`) call `setExpandedRecipeId(recipe.id)`.
- If the recipe is already expanded and the user clicks the row header again, collapse it (`setExpandedRecipeId(null)`).
- This replaces (or wires into) whatever chevron/toggle currently controls expansion.
- The row should show a subtle `hover:bg-gray-50 cursor-pointer` to signal it's clickable.

```tsx
// Collapsed recipe row
<div
  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded"
  onClick={() => setExpandedRecipeId(
    expandedRecipeId === recipe.id ? null : recipe.id
  )}
>
  <FileText className="w-4 h-4 text-gray-400" />
  <span className="font-medium text-sm">{recipe.name || 'Untitled'}</span>
  <span className="ml-auto text-sm text-gray-500">{recipe.price || '—'}</span>
  <ChevronDown className={`w-4 h-4 transition-transform ${
    expandedRecipeId === recipe.id ? 'rotate-180' : ''
  }`} />
</div>
```

---

## Summary of state changes in `useStructureState.ts`

| Addition | Purpose |
|---|---|
| `expandedRecipeId: string \| null` | Tracks which recipe form is open |
| `setExpandedRecipeId(id)` | Called on row click and on addRecipe |
| Price `onBlur` normalizer | Auto-prefixes `$` |

No new dependencies needed. All changes are within existing files.

---

## Commit message

```
fix(wizard): structure step UX — folder clarity, auto-$ price, recipe expand on click, collapse on add
```
