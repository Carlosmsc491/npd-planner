// src/renderer/src/components/recipes/wizard/WizardStepStructure.tsx
// Step 3: Build the folder/recipe tree for the new project

import { Plus, Trash2, FolderPlus } from 'lucide-react'
import { nanoid } from 'nanoid'
import { normalizeRecipeName } from '../../../utils/recipeNaming'

export interface WizardRecipe {
  id: string
  price: string
  option: string
  name: string
}

export interface WizardFolder {
  id: string
  name: string
  recipes: WizardRecipe[]
}

interface Props {
  folders: WizardFolder[]
  onChange: (folders: WizardFolder[]) => void
}

export default function WizardStepStructure({ folders, onChange }: Props) {
  function addFolder() {
    onChange([...folders, { id: nanoid(), name: 'New Folder', recipes: [] }])
  }

  function removeFolder(folderId: string) {
    onChange(folders.filter((f) => f.id !== folderId))
  }

  function updateFolder(folderId: string, updates: Partial<WizardFolder>) {
    onChange(folders.map((f) => (f.id === folderId ? { ...f, ...updates } : f)))
  }

  function addRecipe(folderId: string) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              recipes: [
                ...f.recipes,
                { id: nanoid(), price: '', option: '', name: '' },
              ],
            }
          : f
      )
    )
  }

  function removeRecipe(folderId: string, recipeId: string) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? { ...f, recipes: f.recipes.filter((r) => r.id !== recipeId) }
          : f
      )
    )
  }

  function updateRecipe(folderId: string, recipeId: string, updates: Partial<WizardRecipe>) {
    onChange(
      folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              recipes: f.recipes.map((r) =>
                r.id === recipeId ? { ...r, ...updates } : r
              ),
            }
          : f
      )
    )
  }

  return (
    <div className="space-y-4">
      {folders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
          <FolderPlus size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No folders yet. Add your first folder.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {folders.map((folder) => (
            <FolderBlock
              key={folder.id}
              folder={folder}
              onFolderChange={(u) => updateFolder(folder.id, u)}
              onFolderDelete={() => removeFolder(folder.id)}
              onAddRecipe={() => addRecipe(folder.id)}
              onRecipeChange={(rId, u) => updateRecipe(folder.id, rId, u)}
              onRecipeDelete={(rId) => removeRecipe(folder.id, rId)}
            />
          ))}
        </div>
      )}

      <button
        onClick={addFolder}
        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full justify-center"
      >
        <Plus size={14} />
        Add Folder
      </button>
    </div>
  )
}

// ─────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────

interface FolderBlockProps {
  folder: WizardFolder
  onFolderChange: (u: Partial<WizardFolder>) => void
  onFolderDelete: () => void
  onAddRecipe: () => void
  onRecipeChange: (recipeId: string, u: Partial<WizardRecipe>) => void
  onRecipeDelete: (recipeId: string) => void
}

function FolderBlock({
  folder,
  onFolderChange,
  onFolderDelete,
  onAddRecipe,
  onRecipeChange,
  onRecipeDelete,
}: FolderBlockProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm">📁</span>
        <input
          type="text"
          value={folder.name}
          onChange={(e) => onFolderChange({ name: e.target.value })}
          placeholder="Folder name"
          className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-white focus:outline-none placeholder-gray-400"
        />
        <button
          onClick={onFolderDelete}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Delete folder"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Recipe rows */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {folder.recipes.map((recipe) => (
          <RecipeRow
            key={recipe.id}
            recipe={recipe}
            onChange={(u) => onRecipeChange(recipe.id, u)}
            onDelete={() => onRecipeDelete(recipe.id)}
          />
        ))}
      </div>

      {/* Add recipe button */}
      <div className="px-3 py-2 bg-white dark:bg-gray-900">
        <button
          onClick={onAddRecipe}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <Plus size={12} />
          Add Recipe
        </button>
      </div>
    </div>
  )
}

interface RecipeRowProps {
  recipe: WizardRecipe
  onChange: (u: Partial<WizardRecipe>) => void
  onDelete: () => void
}

function RecipeRow({ recipe, onChange, onDelete }: RecipeRowProps) {
  const preview = normalizeRecipeName(recipe.price, recipe.option, recipe.name)

  return (
    <div className="px-3 py-2 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 mb-1">
        {/* Price */}
        <input
          type="text"
          value={recipe.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder="$12.99"
          className="w-20 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
        />
        {/* Option */}
        <select
          value={recipe.option}
          onChange={(e) => onChange({ option: e.target.value })}
          className="w-14 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
        >
          <option value="">—</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        {/* Name */}
        <input
          type="text"
          value={recipe.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Recipe name"
          className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
        />
        {/* Delete */}
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-500 transition-colors"
          title="Remove recipe"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {/* Preview */}
      {preview && (
        <p className="text-[10px] font-mono text-green-600 dark:text-green-400 pl-0.5">
          → {preview}.xlsx
        </p>
      )}
    </div>
  )
}
