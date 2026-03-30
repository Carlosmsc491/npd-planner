// src/renderer/src/components/recipes/wizard/WizardStep3Structure.tsx
// Step 3: File manager table layout for folder/recipe structure

import React, { useState, useEffect } from 'react'
import {
  Folder,
  FileSpreadsheet,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Copy,
  Search,
} from 'lucide-react'
import { useStructureState, type FlatNode, type TreeNode } from './useStructureState'
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
    toggleRecipe,
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
    // Only call onChange if folders actually changed (to avoid loops)
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
    if (e.key === 'Enter') {
      renameItem(id, editingValue)
      setEditingId(null)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  // Start inline editing
  const startEditing = (node: FlatNode) => {
    setEditingId(node.id)
    setEditingValue(node.name)
  }

  // Handle context menu
  const handleContextMenu = (event: React.MouseEvent, node: FlatNode) => {
    event.preventDefault()
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 200),
      y: Math.min(event.clientY, window.innerHeight - 200),
      nodeId: node.id,
      nodeType: node.type,
    })
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedId(null)
  }

  const handleDragOver = (e: React.DragEvent, node: FlatNode) => {
    if (node.type !== 'folder') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const draggedId = getDraggedId()
    if (draggedId && draggedId !== targetId) {
      moveInto(draggedId, targetId)
    }
    setDraggedId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={() => addFolder()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Plus size={14} />
          Add Folder
        </button>
        <button
          onClick={() => addRecipe()}
          className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 transition-colors"
        >
          <Plus size={14} />
          Add Recipe
        </button>
        <div className="flex-1" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by name..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-48 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-8 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Name
              </th>
              <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-16">
                Option
              </th>
              <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">
                Price
              </th>
              <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {flattenedNodes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <Folder size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No folders yet. Add your first folder.
                  </p>
                </td>
              </tr>
            ) : (
              flattenedNodes.map((node) => {
                if (!node.visible) return null

                const isEditing = editingId === node.id
                const namePaddingLeft = node.depth * 20 + 16

                if (node.type === 'folder') {
                  return (
                    <React.Fragment key={node.id}>
                      <tr
                        draggable
                        onDragStart={(e) => handleDragStart(e, node.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, node)}
                        onDrop={(e) => handleDrop(e, node.id)}
                        onContextMenu={(e) => handleContextMenu(e, node)}
                        className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50"
                      >
                        <td className="py-2.5 px-4" style={{ paddingLeft: namePaddingLeft }}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleFolder(node.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              <ChevronRight
                                size={16}
                                className={`transition-transform duration-150 ${node.open ? 'rotate-90' : ''}`}
                              />
                            </button>
                            <Folder size={16} className="text-amber-500 shrink-0" />
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => handleEditingKeyDown(e, node.id)}
                                onBlur={() => {
                                  renameItem(node.id, editingValue)
                                  setEditingId(null)
                                }}
                                autoFocus
                                className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-green-500 rounded px-2 py-0.5 text-sm text-gray-900 dark:text-white focus:outline-none"
                              />
                            ) : (
                              <>
                                <span
                                  className="font-medium text-gray-900 dark:text-white cursor-pointer"
                                  onDoubleClick={() => startEditing(node)}
                                >
                                  {node.name}
                                </span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
                                  {node.children.length}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-gray-400 dark:text-gray-500">—</td>
                        <td className="py-2.5 px-4 text-gray-400 dark:text-gray-500">—</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => addRecipe(node.id)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                              title="Add recipe"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={(e) => handleContextMenu(e as unknown as React.MouseEvent, node)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                } else {
                  // Recipe row
                  const recipe = node as Extract<TreeNode, { type: 'recipe' }> & { depth: number }
                  return (
                    <React.Fragment key={node.id}>
                      <tr
                        draggable
                        onDragStart={(e) => handleDragStart(e, node.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => toggleRecipe(node.id)}
                        onContextMenu={(e) => handleContextMenu(e, node)}
                        className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
                      >
                        <td className="py-2.5 px-4" style={{ paddingLeft: namePaddingLeft }}>
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet size={16} className="text-gray-400 shrink-0" />
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => handleEditingKeyDown(e, node.id)}
                                onBlur={() => {
                                  renameItem(node.id, editingValue)
                                  setEditingId(null)
                                }}
                                autoFocus
                                className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-green-500 rounded px-2 py-0.5 text-sm text-gray-900 dark:text-white focus:outline-none"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="text-gray-700 dark:text-gray-300"
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  startEditing(node)
                                }}
                              >
                                {node.name || (
                                  <span className="text-gray-400 dark:text-gray-500 italic">new recipe...</span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          {recipe.option && (
                            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                              {recipe.option}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-sm text-gray-700 dark:text-gray-300">
                          {recipe.price}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                duplicateItem(node.id)
                              }}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                              title="Duplicate"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={(e) => handleContextMenu(e as unknown as React.MouseEvent, node)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded recipe panel */}
                      {recipe.expanded && (
                        <tr>
                          <td colSpan={4} className="p-0">
                            <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                              <RecipeEditPanel
                                recipe={recipe}
                                defaults={defaults}
                                onUpdateField={updateRecipeField}
                                onUpdateOverride={updateRecipeOverride}
                                onToggleOverride={() => toggleOverride(node.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                }
              })
            )}
          </tbody>
        </table>
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
            if (node) startEditing(node)
            setContextMenu(null)
          }}
          onDuplicate={() => {
            duplicateItem(contextMenu.nodeId)
            setContextMenu(null)
          }}
          onCopy={() => {
            copyItem(contextMenu.nodeId)
            setContextMenu(null)
          }}
          onPaste={() => {
            pasteItem(contextMenu.nodeId)
            setContextMenu(null)
          }}
          onDelete={() => {
            deleteItem(contextMenu.nodeId)
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}

// ── Recipe edit panel component ────────────────────────────────────────────

type RecipeNode = Extract<TreeNode, { type: 'recipe' }>

interface RecipeEditPanelProps {
  recipe: RecipeNode & { depth: number }
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
            value={recipe.price}
            onChange={(e) => onUpdateField(recipe.id, 'price', e.target.value)}
            placeholder="$12.99"
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
