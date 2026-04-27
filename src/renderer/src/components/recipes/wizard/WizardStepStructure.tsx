// src/renderer/src/components/recipes/wizard/WizardStep3Structure.tsx
// Step 3: File manager table layout for folder/recipe structure

import React, { useState, useEffect, useMemo } from 'react'
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Copy,
  Search,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useStructureState, type TreeNode, type FolderNode, type RecipeNode } from './useStructureState'
import { DistributionEditor } from './WizardStepRules'
import {
  RECIPE_CUSTOMER_OPTIONS,
  RECIPE_HOLIDAY_OPTIONS,
  DEFAULT_RECIPE_DISTRIBUTION,
} from '../../../types'
import type { RecipeDistribution } from '../../../types'

// ── Public types (re-export for compatibility) ─────────────────────────────

export interface WizardRecipe {
  id: string
  price: string
  option: string
  name: string
  customerOverride: string
  holidayOverride: string
  wetPackOverride: string
  boxTypeOverride: string
  pickNeededOverride: string
  distributionOverride: RecipeDistribution
}

export interface WizardFolder {
  id: string
  name: string
  recipes: WizardRecipe[]
}

export interface WizardDefaults {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distributionDefault: RecipeDistribution
}

// ── Component props ────────────────────────────────────────────────────────

interface WizardStep3StructureProps {
  folders?: WizardFolder[]
  defaults?: WizardDefaults
  projectDefaults?: WizardDefaults  // Alias for defaults (backward compatibility)
  sourceMode?: 'from_scratch' | 'import'
  onChange?: (folders: WizardFolder[]) => void
  onValidityChange?: (valid: boolean, message: string) => void
}

// Re-export TreeNode from useStructureState for convenience
export type { TreeNode } from './useStructureState'

// ── Constants ─────────────────────────────────────────────────────────────

const OPTION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

// ── Main component ─────────────────────────────────────────────────────────

export default function WizardStep3Structure({
  folders = [],
  defaults: defaultsProp,
  projectDefaults,
  sourceMode: _sourceMode = 'from_scratch',
  onChange,
  onValidityChange,
}: WizardStep3StructureProps) {
  const defaults: WizardDefaults = defaultsProp ?? projectDefaults ?? {
    customerDefault: RECIPE_CUSTOMER_OPTIONS[0],
    holidayDefault: 'EVERYDAY',
    wetPackDefault: false,
    distributionDefault: { ...DEFAULT_RECIPE_DISTRIBUTION },
  }

  // Convert WizardFolder[] to TreeNode[] for initial state
  const initialNodes = convertFoldersToNodes(folders, defaults)

  const {
    nodes,
    // setNodes is available for future use if direct tree manipulation is needed
    flattenedNodes,
    filterQuery,
    setFilterQuery,
    addFolder,
    addRecipe,
    toggleFolder,
    toggleOverride,
    updateRecipeField,
    updateRecipeOverride,
    moveInto,
    renameItem,
    duplicateItem,
    copyItem,
    pasteItem,
    deleteItem,
    hasClipboard,
    setDraggedId,
    getDraggedId,
    expandedRecipeId,
    setExpandedRecipeId,
    undo,
    redo,
    canUndo,
    canRedo,
    // hasAtLeastOneRecipe is tracked by onValidityChange
  } = useStructureState({
    initialFolders: initialNodes,
    defaults,
    onChange: undefined,
    onValidityChange,
  })

  // Sync nodes back to WizardFolder[] for parent
  useEffect(() => {
    if (!onChange) return
    const wizardFolders = convertTreeToFolders(nodes)
    const currentFoldersStr = JSON.stringify(folders)
    const newFoldersStr = JSON.stringify(wizardFolders)
    if (currentFoldersStr !== newFoldersStr) {
      onChange(wizardFolders)
    }
  }, [nodes, onChange, folders])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    nodeId: string
    nodeType: 'folder' | 'recipe'
  } | null>(null)

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Close context menu on outside click
  useEffect(() => {
    function handleClick() {
      if (contextMenu) setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  // Keyboard handler for inline editing
  const handleEditingKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') { renameItem(id, editingValue); setEditingId(null) }
    else if (e.key === 'Escape') { setEditingId(null) }
  }

  function openContextMenu(e: React.MouseEvent, nodeId: string, nodeType: 'folder' | 'recipe') {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 200),
      nodeId,
      nodeType,
    })
  }

  // Split root nodes
  const folderNodes = nodes.filter((n): n is FolderNode => n.type === 'folder')
  const rootRecipes = nodes.filter((n): n is RecipeNode => n.type === 'recipe')

  // Visibility set for filter support
  const visibleIds = useMemo(
    () => new Set(flattenedNodes.filter((n) => n.visible).map((n) => n.id)),
    [flattenedNodes]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <button
          onClick={() => {
            const newId = addFolder()
            setEditingId(newId)
            setEditingValue('')
          }}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Plus size={14} />
          Add Folder
        </button>

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo"
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 size={14} />
        </button>

        <div className="flex-1" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-8 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900/40 space-y-2">
        {nodes.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Folder size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No folders yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Start by adding a folder, then add recipes inside it.
            </p>
            <button
              onClick={() => {
                const newId = addFolder()
                setEditingId(newId)
                setEditingValue('')
              }}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
            >
              <Plus size={14} />
              Add First Folder
            </button>
          </div>
        ) : (
          <>
            {/* Root-level recipes (uncategorized) */}
            {rootRecipes.filter((r) => visibleIds.has(r.id)).length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Uncategorized
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50 bg-white dark:bg-gray-900">
                  {rootRecipes.filter((r) => visibleIds.has(r.id)).map((recipe) => (
                    <RecipeRow
                      key={recipe.id}
                      recipe={recipe}
                      isExpanded={expandedRecipeId === recipe.id}
                      editingId={editingId}
                      editingValue={editingValue}
                      defaults={defaults}
                      onToggle={() => setExpandedRecipeId(expandedRecipeId === recipe.id ? null : recipe.id)}
                      onStartEditing={() => { setEditingId(recipe.id); setEditingValue(recipe.name) }}
                      onEditingChange={setEditingValue}
                      onEditingKeyDown={(e) => handleEditingKeyDown(e, recipe.id)}
                      onEditingBlur={() => { renameItem(recipe.id, editingValue); setEditingId(null) }}
                      onDuplicate={() => duplicateItem(recipe.id)}
                      onContextMenu={(e) => openContextMenu(e, recipe.id, 'recipe')}
                      onDragStart={(e) => { setDraggedId(recipe.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => setDraggedId(null)}
                      onUpdateField={updateRecipeField}
                      onUpdateOverride={updateRecipeOverride}
                      onToggleOverride={() => toggleOverride(recipe.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Folder cards */}
            {folderNodes
              .filter((f) => visibleIds.has(f.id) || f.children.some((c) => visibleIds.has(c.id)))
              .map((folder) => {
                const folderRecipes = folder.children.filter(
                  (c): c is RecipeNode => c.type === 'recipe' && visibleIds.has(c.id)
                )
                return (
                  <div
                    key={folder.id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragId = getDraggedId()
                      if (dragId && dragId !== folder.id) moveInto(dragId, folder.id)
                      setDraggedId(null)
                    }}
                  >
                    {/* Folder header — matches RecipeFolderSection exactly */}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors group"
                      onContextMenu={(e) => openContextMenu(e, folder.id, 'folder')}
                    >
                      <button
                        onClick={() => toggleFolder(folder.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <ChevronRight
                          size={14}
                          className={`shrink-0 text-gray-400 transition-transform duration-200 ${folder.open ? 'rotate-90' : ''}`}
                        />
                        {editingId === folder.id ? (
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleEditingKeyDown(e, folder.id)}
                            onBlur={() => { renameItem(folder.id, editingValue); setEditingId(null) }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-green-500 rounded px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300 focus:outline-none"
                          />
                        ) : (
                          <span
                            className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1 truncate"
                            onDoubleClick={(e) => { e.stopPropagation(); setEditingId(folder.id); setEditingValue(folder.name === 'NEW FOLDER' ? '' : folder.name) }}
                          >
                            📁 {folder.name}
                          </span>
                        )}
                      </button>

                      {/* Recipe count badge */}
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium shrink-0">
                        {folder.children.length} recipe{folder.children.length !== 1 ? 's' : ''}
                      </span>

                      {/* Add recipe — always visible */}
                      <button
                        onClick={(e) => { e.stopPropagation(); addRecipe(folder.id) }}
                        title="Add recipe"
                        className="shrink-0 flex items-center justify-center w-6 h-6 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                      >
                        <Plus size={13} />
                      </button>

                      {/* More options — hover only */}
                      <button
                        onClick={(e) => openContextMenu(e, folder.id, 'folder')}
                        className="shrink-0 flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>

                    {/* Recipe list — animated collapse */}
                    <div className={`transition-all duration-200 overflow-hidden ${folder.open ? '' : 'max-h-0'}`}>
                      {folderRecipes.length === 0 ? (
                        <div className="px-4 py-4 text-center">
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No recipes yet</p>
                          <button
                            onClick={() => addRecipe(folder.id)}
                            className="mt-1.5 text-xs text-green-600 dark:text-green-400 hover:underline font-medium"
                          >
                            + Add first recipe
                          </button>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700/50 bg-white dark:bg-gray-900">
                          {folderRecipes.map((recipe) => (
                            <RecipeRow
                              key={recipe.id}
                              recipe={recipe}
                              isExpanded={expandedRecipeId === recipe.id}
                              editingId={editingId}
                              editingValue={editingValue}
                              defaults={defaults}
                              onToggle={() => setExpandedRecipeId(expandedRecipeId === recipe.id ? null : recipe.id)}
                              onStartEditing={() => { setEditingId(recipe.id); setEditingValue(recipe.name) }}
                              onEditingChange={setEditingValue}
                              onEditingKeyDown={(e) => handleEditingKeyDown(e, recipe.id)}
                              onEditingBlur={() => { renameItem(recipe.id, editingValue); setEditingId(null) }}
                              onDuplicate={() => duplicateItem(recipe.id)}
                              onContextMenu={(e) => openContextMenu(e, recipe.id, 'recipe')}
                              onDragStart={(e) => { setDraggedId(recipe.id); e.dataTransfer.effectAllowed = 'move' }}
                              onDragEnd={() => setDraggedId(null)}
                              onUpdateField={updateRecipeField}
                              onUpdateOverride={updateRecipeOverride}
                              onToggleOverride={() => toggleOverride(recipe.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeType={contextMenu.nodeType}
          hasClipboard={hasClipboard}
          onRename={() => {
            const node = flattenedNodes.find((n) => n.id === contextMenu.nodeId)
            if (node) {
              setEditingId(node.id)
              setEditingValue(node.name === 'NEW FOLDER' ? '' : node.name)
            }
            setContextMenu(null)
          }}
          onDuplicate={() => { duplicateItem(contextMenu.nodeId); setContextMenu(null) }}
          onCopy={() => { copyItem(contextMenu.nodeId); setContextMenu(null) }}
          onPaste={() => { pasteItem(contextMenu.nodeId); setContextMenu(null) }}
          onDelete={() => { deleteItem(contextMenu.nodeId); setContextMenu(null) }}
        />
      )}
    </div>
  )
}

// ── Recipe row component ───────────────────────────────────────────────────

interface RecipeRowProps {
  recipe: RecipeNode
  isExpanded: boolean
  editingId: string | null
  editingValue: string
  defaults: WizardDefaults
  onToggle: () => void
  onStartEditing: () => void
  onEditingChange: (v: string) => void
  onEditingKeyDown: (e: React.KeyboardEvent) => void
  onEditingBlur: () => void
  onDuplicate: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onUpdateField: (id: string, field: 'name' | 'option' | 'price', value: string) => void
  onUpdateOverride: (id: string, field: keyof RecipeNode, value: unknown) => void
  onToggleOverride: () => void
}

function RecipeRow({
  recipe,
  isExpanded,
  editingId,
  editingValue,
  defaults,
  onToggle,
  onStartEditing,
  onEditingChange,
  onEditingKeyDown,
  onEditingBlur,
  onDuplicate,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onUpdateField,
  onUpdateOverride,
  onToggleOverride,
}: RecipeRowProps) {
  const isEditing = editingId === recipe.id

  return (
    <>
      {/* Row — matches RecipeRowItem layout */}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onToggle}
        onContextMenu={onContextMenu}
        className={`group flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
          isExpanded
            ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
      >
        {/* State icon — circle placeholder (matches RecipeRowItem's status icon slot) */}
        <span className="shrink-0 h-3.5 w-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />

        {/* Name */}
        {isEditing ? (
          <input
            type="text"
            value={editingValue}
            onChange={(e) => onEditingChange(e.target.value)}
            onKeyDown={onEditingKeyDown}
            onBlur={onEditingBlur}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-green-500 rounded px-2 py-0.5 text-sm text-gray-900 dark:text-white focus:outline-none"
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate"
            onDoubleClick={(e) => { e.stopPropagation(); onStartEditing() }}
          >
            {recipe.name || (
              <span className="italic font-normal text-gray-400 dark:text-gray-500">new recipe...</span>
            )}
          </span>
        )}

        {/* Price */}
        {recipe.price && (
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 shrink-0 w-14 text-right tabular-nums">
            {recipe.price}
          </span>
        )}

        {/* Option */}
        {recipe.option && (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0 w-6 text-center">
            {recipe.option}
          </span>
        )}

        {/* Chevron + hover actions */}
        <div className="flex items-center gap-1 shrink-0">
          <ChevronDown
            size={13}
            className={`text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
          />
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate() }}
              title="Duplicate"
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            >
              <MoreHorizontal size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded edit panel */}
      {isExpanded && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <RecipeEditPanel
            recipe={recipe}
            defaults={defaults}
            onUpdateField={onUpdateField}
            onUpdateOverride={onUpdateOverride}
            onToggleOverride={onToggleOverride}
          />
        </div>
      )}
    </>
  )
}

// ── Recipe edit panel component ────────────────────────────────────────────

interface RecipeEditPanelProps {
  recipe: RecipeNode
  defaults: WizardDefaults
  onUpdateField: (id: string, field: 'name' | 'option' | 'price', value: string) => void
  onUpdateOverride: (id: string, field: keyof RecipeNode, value: unknown) => void
  onToggleOverride: () => void
}

function RecipeEditPanel({
  recipe,
  defaults,
  onUpdateField,
  onUpdateOverride,
  onToggleOverride,
}: RecipeEditPanelProps) {
  const fileName = recipe.fileName || `${recipe.price} ${recipe.option} ${recipe.name}`.trim()

  // Detect overrides
  const hasCustomerOverride = recipe.customerOverride !== defaults.customerDefault
  const hasHolidayOverride = recipe.holidayOverride !== defaults.holidayDefault
  const hasWetPackOverride = recipe.wetPackOverride !== (defaults.wetPackDefault ? 'Y' : 'N')
  const hasDistribOverride =
    JSON.stringify(recipe.distributionOverride) !== JSON.stringify(defaults.distributionDefault)

  const overrideCount = [hasCustomerOverride, hasHolidayOverride, hasWetPackOverride, hasDistribOverride].filter(
    Boolean
  ).length

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Basic fields */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
            Name
          </label>
          <input
            type="text"
            value={recipe.name}
            onChange={(e) => onUpdateField(recipe.id, 'name', e.target.value)}
            placeholder="Recipe name"
            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="w-20">
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
            Price
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={recipe.price}
            onChange={(e) => onUpdateField(recipe.id, 'price', e.target.value)}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              if (raw && !raw.startsWith('$')) {
                onUpdateField(recipe.id, 'price', `$${raw}`)
              }
            }}
            placeholder="e.g. $12.99"
            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="w-20">
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
            Option
          </label>
          <select
            value={recipe.option}
            onChange={(e) => onUpdateField(recipe.id, 'option', e.target.value)}
            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
          >
            <option value="">—</option>
            {OPTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filename preview */}
      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
        → {fileName || 'filename'}.xlsx
      </p>

      {/* Override section */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={onToggleOverride}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
        >
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Override Project Rules
          </span>
          <div className="flex items-center gap-2">
            {overrideCount > 0 && (
              <span className="text-[10px] text-blue-500">{overrideCount} changed</span>
            )}
            <ChevronRight
              size={14}
              className={`text-gray-400 transition-transform duration-150 ${recipe.overrideOpen ? 'rotate-90' : ''}`}
            />
          </div>
        </button>

        {recipe.overrideOpen && (
          <div className="px-3 py-3 space-y-3 bg-white dark:bg-gray-900">
            {/* Customer */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                Customer
              </span>
              <select
                value={recipe.customerOverride}
                onChange={(e) => onUpdateOverride(recipe.id, 'customerOverride', e.target.value)}
                className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
              >
                {RECIPE_CUSTOMER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                    {opt === defaults.customerDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              {hasCustomerOverride && (
                <span className="text-[10px] text-blue-500 italic shrink-0">(overriding)</span>
              )}
            </div>

            {/* Holiday */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                Holiday
              </span>
              <select
                value={recipe.holidayOverride}
                onChange={(e) => onUpdateOverride(recipe.id, 'holidayOverride', e.target.value)}
                className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-green-500"
              >
                {RECIPE_HOLIDAY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                    {opt === defaults.holidayDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              {hasHolidayOverride && (
                <span className="text-[10px] text-blue-500 italic shrink-0">(overriding)</span>
              )}
            </div>

            {/* Wet Pack */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                Wet Pack
              </span>
              <button
                onClick={() =>
                  onUpdateOverride(recipe.id, 'wetPackOverride', recipe.wetPackOverride === 'Y' ? 'N' : 'Y')
                }
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  recipe.wetPackOverride === 'Y' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    recipe.wetPackOverride === 'Y' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {recipe.wetPackOverride === 'Y' ? 'Yes' : 'No'}
              </span>
              {hasWetPackOverride && (
                <span className="text-[10px] text-blue-500 italic shrink-0">(overriding)</span>
              )}
            </div>

            {/* Distribution */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">
                  Distribution
                </span>
                {hasDistribOverride && (
                  <span className="text-[10px] text-blue-500 italic">(overriding default)</span>
                )}
              </div>
              <DistributionEditor
                value={recipe.distributionOverride}
                onChange={(dist) => onUpdateOverride(recipe.id, 'distributionOverride', dist)}
              />
              <button
                onClick={() =>
                  onUpdateOverride(recipe.id, 'distributionOverride', { ...DEFAULT_RECIPE_DISTRIBUTION })
                }
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
              >
                Reset to default
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Context menu component ─────────────────────────────────────────────────

interface ContextMenuProps {
  x: number
  y: number
  nodeType: 'folder' | 'recipe'
  hasClipboard: boolean
  onRename: () => void
  onDuplicate: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

function ContextMenu({ x, y, nodeType: _nodeType, hasClipboard, onRename, onDuplicate, onCopy, onPaste, onDelete }: ContextMenuProps) {
  return (
    <div
      className="fixed z-50 w-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={onRename}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Rename
      </button>
      <button
        onClick={onDuplicate}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Duplicate
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button
        onClick={onCopy}
        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Copy
      </button>
      {hasClipboard && (
        <button
          onClick={onPaste}
          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Paste
        </button>
      )}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        Delete
      </button>
    </div>
  )
}

// ── Helper functions ───────────────────────────────────────────────────────

function convertFoldersToNodes(folders: WizardFolder[], _defaults: WizardDefaults): TreeNode[] {
  return folders.map(
    (folder): TreeNode => ({
      id: folder.id,
      type: 'folder',
      name: folder.name,
      open: true,
      children: folder.recipes.map(
        (recipe): TreeNode => ({
          id: recipe.id,
          type: 'recipe',
          name: recipe.name,
          option: recipe.option,
          price: recipe.price,
          fileName: '',
          expanded: false,
          overrideOpen: false,
          customerOverride: recipe.customerOverride,
          holidayOverride: recipe.holidayOverride,
          wetPackOverride: recipe.wetPackOverride,
          boxTypeOverride: recipe.boxTypeOverride,
          pickNeededOverride: recipe.pickNeededOverride,
          distributionOverride: recipe.distributionOverride,
          specData: {},
        })
      ),
    })
  )
}

function convertTreeToFolders(nodes: TreeNode[]): WizardFolder[] {
  return nodes
    .filter((n): n is Extract<TreeNode, { type: 'folder' }> => n.type === 'folder')
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      recipes: folder.children
        .filter((c): c is Extract<TreeNode, { type: 'recipe' }> => c.type === 'recipe')
        .map((recipe) => ({
          id: recipe.id,
          price: recipe.price,
          option: recipe.option,
          name: recipe.name,
          customerOverride: recipe.customerOverride,
          holidayOverride: recipe.holidayOverride,
          wetPackOverride: recipe.wetPackOverride,
          boxTypeOverride: recipe.boxTypeOverride,
          pickNeededOverride: recipe.pickNeededOverride,
          distributionOverride: recipe.distributionOverride,
        })),
    }))
}
