━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — WizardStepStructure: 4 UX Fixes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md completely before starting.

Then read these files in full:
- src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx
- src/renderer/src/components/recipes/wizard/useStructureState.ts

Apply the following 4 fixes. Do not change any other behavior.

─────────────────────────────────────────────────────────────────
FIX 1 — Visual clarity: folders vs root-level recipes
─────────────────────────────────────────────────────────────────

Make it visually obvious whether a recipe is inside a folder or at root.

a) Folder rows:
   - Background: `bg-amber-50/40`
   - Add a pill badge next to the folder name showing the number of child
     recipes: `{count} recipe{count !== 1 ? 's' : ''}`.
     Style: `ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium`

b) Recipes inside a folder:
   - Add `border-l-2 border-emerald-400` on the left side of the row
   - Apply `pl-6` indentation (relative to the folder's left edge)

c) Recipes at root level (not inside any folder):
   - No left border, `pl-2` indentation
   - No other visual change

─────────────────────────────────────────────────────────────────
FIX 2 — Auto-prefix `$` on price field (onBlur)
─────────────────────────────────────────────────────────────────

In the recipe price `<input>` inside WizardStepStructure.tsx:

a) Add `inputMode="decimal"` and `placeholder="e.g. $12.99"`.

b) On `onBlur`: if the trimmed value is non-empty and does not start
   with `$`, call the existing price update handler with `$` prepended.

   Example:
   ```tsx
   onBlur={(e) => {
     const raw = e.target.value.trim();
     if (raw && !raw.startsWith('$')) {
       // call whatever handler updates the recipe's price field
       updatePrice(recipe.id, `$${raw}`);
     }
   }}
   ```

   Match the exact handler name already used in the file.

c) Do NOT change onChange behavior — allow free typing while editing.

─────────────────────────────────────────────────────────────────
FIX 3 — Collapse current recipe and expand new one on "Add Recipe"
─────────────────────────────────────────────────────────────────

In useStructureState.ts:

a) Add state: `const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);`

b) In the `addRecipe` function (or equivalent), after adding the new
   recipe to the list, call `setExpandedRecipeId(newRecipe.id)`.
   This auto-expands the new recipe and collapses all others (since
   only one can match `expandedRecipeId` at a time).

c) Return `expandedRecipeId` and `setExpandedRecipeId` from the hook.

In WizardStepStructure.tsx:

d) Replace the current expansion condition for each recipe row with:
   `expandedRecipeId === recipe.id`

e) The form body (Name/Price/Option inputs + Override section) renders
   only when `expandedRecipeId === recipe.id`.

─────────────────────────────────────────────────────────────────
FIX 4 — Click on collapsed recipe row opens the edit form
─────────────────────────────────────────────────────────────────

In WizardStepStructure.tsx, on the collapsed recipe row (the row that
shows the recipe icon, name, and price in read-only mode):

a) Add `onClick={() => setExpandedRecipeId(expandedRecipeId === recipe.id ? null : recipe.id)}`

b) Add `className` additions: `hover:bg-gray-50 cursor-pointer`

c) Add a `ChevronDown` icon (from lucide-react, already imported) at the
   far right of the collapsed row. Rotate it 180° when expanded:
   `className={`w-4 h-4 text-gray-400 transition-transform ${expandedRecipeId === recipe.id ? 'rotate-180' : ''}`}`

d) If there is already a toggle button or chevron controlling expansion,
   wire it to use `setExpandedRecipeId` from the hook instead of local
   state. Remove any redundant local expansion state.

─────────────────────────────────────────────────────────────────
VERIFICATION
─────────────────────────────────────────────────────────────────

After implementing:

- [ ] npm run typecheck — must pass with 0 errors
- [ ] Folder rows show amber background + recipe count badge
- [ ] Recipes inside folders have green left border + pl-6
- [ ] Root-level recipes have no border + pl-2
- [ ] Typing `12.99` in price and clicking away → field shows `$12.99`
- [ ] Clicking "Add Recipe" collapses the previously open recipe form
     and expands the newly added one
- [ ] Clicking a collapsed recipe row opens its form
- [ ] Clicking the expanded recipe row header collapses it
- [ ] ChevronDown rotates correctly on expand/collapse

─────────────────────────────────────────────────────────────────
UPDATE DOCS
─────────────────────────────────────────────────────────────────

After all changes pass typecheck, update:
- CLAUDE.md — note the 4 UX fixes in the Recipe Manager / Wizard section
- DOCUMENTACION_TECNICA_NPD_PLANNER.md — update WizardStepStructure
  description to reflect the new expandedRecipeId state, auto-$ price
  behavior, and visual folder/recipe hierarchy cues

Commit:
fix(wizard): structure step UX — folder clarity, auto-$ price, recipe expand on click, collapse on add
