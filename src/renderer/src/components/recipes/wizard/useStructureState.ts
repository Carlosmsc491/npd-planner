// src/renderer/src/components/recipes/wizard/useStructureState.ts
// State hook for WizardStep3Structure - manages folder tree, drag, clipboard, filter

import { useState, useCallback, useMemo, useRef } from 'react'
import { nanoid } from 'nanoid'
import type { RecipeSpec, RecipeDistribution } from '../../../types'

// ── Internal tree node types ───────────────────────────────────────────────

export type FolderNode = {
  id: string
  type: 'folder'
  name: string
  open: boolean
  children: TreeNode[]
}

export type RecipeNode = {
  id: string
  type: 'recipe'
  name: string
  option: string // 'A'|'B'|'C'|'D'|'E'|'F'|'G'
  price: string
  fileName: string
  expanded: boolean
  overrideOpen: boolean
  // Override fields
  customerOverride: string
  holidayOverride: string
  wetPackOverride: string
  boxTypeOverride: string
  pickNeededOverride: string
  distributionOverride: RecipeDistribution
  specData: Partial<RecipeSpec> // original spec passthrough
}

export type TreeNode = FolderNode | RecipeNode

// Flattened node with depth info for rendering
export type FlatNode = (FolderNode | RecipeNode) & { depth: number; visible: boolean }

// ── Helper types ───────────────────────────────────────────────────────────

interface Defaults {
  customerDefault: string
  holidayDefault: string
  wetPackDefault: boolean
  distributionDefault: RecipeDistribution
}

// ── Helper functions ───────────────────────────────────────────────────────

function createNewRecipe(defaults: Defaults): RecipeNode {
  return {
    id: nanoid(),
    type: 'recipe',
    name: '',
    option: '',
    price: '',
    fileName: '',
    expanded: true, // Auto-expand on creation
    overrideOpen: false,
    customerOverride: defaults.customerDefault,
    holidayOverride: defaults.holidayDefault,
    wetPackOverride: defaults.wetPackDefault ? 'Y' : 'N',
    boxTypeOverride: 'QUARTER',
    pickNeededOverride: 'N',
    distributionOverride: { ...defaults.distributionDefault },
    specData: {},
  }
}

function createNewFolder(): FolderNode {
  return {
    id: nanoid(),
    type: 'folder',
    name: 'NEW FOLDER',
    open: true,
    children: [],
  }
}

// Deep clone a tree node (for duplicate)
function cloneNode(node: TreeNode, defaults: Defaults): TreeNode {
  if (node.type === 'folder') {
    return {
      id: nanoid(),
      type: 'folder',
      name: `${node.name} (copy)`,
      open: node.open,
      children: node.children.map((c) => cloneNode(c, defaults) as RecipeNode),
    }
  } else {
    return {
      id: nanoid(),
      type: 'recipe',
      name: `${node.name} (copy)`,
      option: node.option,
      price: node.price,
      fileName: node.fileName,
      expanded: false,
      overrideOpen: false,
      customerOverride: node.customerOverride,
      holidayOverride: node.holidayOverride,
      wetPackOverride: node.wetPackOverride,
      boxTypeOverride: node.boxTypeOverride,
      pickNeededOverride: node.pickNeededOverride,
      distributionOverride: { ...node.distributionOverride },
      specData: { ...node.specData },
    }
  }
}

// Recursively flatten tree with depth info
function flattenNodes(nodes: TreeNode[], depth: number, filterQuery: string, parentMatches: boolean): FlatNode[] {
  const result: FlatNode[] = []
  const query = filterQuery.toLowerCase().trim()

  for (const node of nodes) {
    const nameMatches = query.length === 0 || node.name.toLowerCase().includes(query)
    const shouldShow = nameMatches || parentMatches

    if (node.type === 'folder') {
      // Folder is visible if its name matches OR any descendant matches
      const folderVisible = shouldShow || hasDescendantMatch(node, query)
      result.push({ ...node, depth, visible: folderVisible })

      if (node.open && folderVisible) {
        result.push(...flattenNodes(node.children, depth + 1, filterQuery, nameMatches || parentMatches))
      }
    } else {
      // Recipe is visible if its name matches OR parent folder matches
      result.push({ ...node, depth, visible: shouldShow })
    }
  }

  return result
}

function hasDescendantMatch(folder: FolderNode, query: string): boolean {
  if (query.length === 0) return true
  for (const child of folder.children) {
    if (child.name.toLowerCase().includes(query)) return true
    if (child.type === 'folder' && hasDescendantMatch(child, query)) return true
  }
  return false
}

// Find node by id recursively
function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'folder') {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Find parent folder of a node
function findParent(nodes: TreeNode[], childId: string): FolderNode | null {
  for (const node of nodes) {
    if (node.type === 'folder') {
      if (node.children.some((c) => c.id === childId)) return node
      const found = findParent(node.children, childId)
      if (found) return found
    }
  }
  return null
}

// Remove node from tree (returns new tree and removed node)
function removeNode(nodes: TreeNode[], id: string): { tree: TreeNode[]; removed: TreeNode | null } {
  // Check if node is at this level
  const removedNode = nodes.find((n) => n.id === id)
  if (removedNode) {
    return { tree: nodes.filter((n) => n.id !== id), removed: removedNode }
  }

  // Search deeper in folders
  for (const n of nodes) {
    if (n.type === 'folder') {
      const result = removeNode(n.children, id)
      if (result.removed) {
        return { tree: nodes.map((node) => (node.id === n.id ? { ...n, children: result.tree } : node)), removed: result.removed }
      }
    }
  }

  return { tree: nodes, removed: null }
}

// Add node to folder
function addToFolder(nodes: TreeNode[], folderId: string, nodeToAdd: TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === folderId && n.type === 'folder') {
      return { ...n, children: [...n.children, nodeToAdd], open: true }
    }
    if (n.type === 'folder') {
      return { ...n, children: addToFolder(n.children, folderId, nodeToAdd) }
    }
    return n
  })
}

// Convert tree back to RecipeSpec[]
function collectSpecs(nodes: TreeNode[]): RecipeSpec[] {
  const specs: RecipeSpec[] = []

  function traverse(currentNodes: TreeNode[], pathParts: string[]) {
    for (const node of currentNodes) {
      if (node.type === 'folder') {
        traverse(node.children, [...pathParts, node.name])
      } else {
        const fileName = node.fileName || `${node.price} ${node.option} ${node.name}`.trim()
        const relativePath = [...pathParts, `${fileName}.xlsx`].join('/')
        specs.push({
          recipeId: node.id,
          relativePath,
          displayName: fileName,
          price: node.price,
          option: node.option,
          name: node.name,
          projectName: '', // Filled by parent
          holidayOverride: node.holidayOverride,
          customerOverride: node.customerOverride,
          wetPackOverride: node.wetPackOverride,
          boxTypeOverride: node.boxTypeOverride,
          pickNeededOverride: node.pickNeededOverride,
          distributionOverride: node.distributionOverride,
          requiresManualUpdate: false,
          ...node.specData,
        })
      }
    }
  }

  traverse(nodes, [])
  return specs
}

// ── Hook ───────────────────────────────────────────────────────────────────

interface UseStructureStateOptions {
  initialFolders?: TreeNode[]
  defaults: Defaults
  onChange?: (specs: RecipeSpec[]) => void
  onValidityChange?: (valid: boolean, message: string) => void
}

export function useStructureState({ initialFolders = [], defaults, onChange, onValidityChange }: UseStructureStateOptions) {
  const [nodes, setNodes] = useState<TreeNode[]>(initialFolders)
  const [filterQuery, setFilterQuery] = useState('')
  const [clipboard, setClipboard] = useState<TreeNode | null>(null)
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null)
  const draggedIdRef = useRef<string | null>(null)

  // Undo / Redo history stacks
  const pastRef = useRef<TreeNode[][]>([])
  const futureRef = useRef<TreeNode[][]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Call before any mutation that should be undoable
  const pushHistory = useCallback((currentNodes: TreeNode[]) => {
    pastRef.current = [...pastRef.current, currentNodes]
    futureRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    const previous = pastRef.current[pastRef.current.length - 1]
    pastRef.current = pastRef.current.slice(0, -1)
    setNodes((current) => {
      futureRef.current = [...futureRef.current, current]
      setCanUndo(pastRef.current.length > 0)
      setCanRedo(true)
      return previous
    })
  }, [])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current[futureRef.current.length - 1]
    futureRef.current = futureRef.current.slice(0, -1)
    setNodes((current) => {
      pastRef.current = [...pastRef.current, current]
      setCanUndo(true)
      setCanRedo(futureRef.current.length > 0)
      return next
    })
  }, [])

  // Flattened list for rendering
  const flattenedNodes = useMemo(() => {
    return flattenNodes(nodes, 0, filterQuery, false)
  }, [nodes, filterQuery])

  // Check validity
  const hasAtLeastOneRecipe = useMemo(() => {
    function countRecipes(n: TreeNode[]): number {
      return n.reduce((acc, node) => {
        if (node.type === 'recipe') return acc + 1
        return acc + countRecipes(node.children)
      }, 0)
    }
    return countRecipes(nodes) > 0
  }, [nodes])

  // Notify parent of changes
  const notifyChange = useCallback(
    (newNodes: TreeNode[]) => {
      if (onChange) {
        const specs = collectSpecs(newNodes)
        onChange(specs)
      }
      if (onValidityChange) {
        const count = (function countRecipes(n: TreeNode[]): number {
          return n.reduce((acc, node) => {
            if (node.type === 'recipe') return acc + 1
            return acc + countRecipes(node.children)
          }, 0)
        })(newNodes)
        onValidityChange(count > 0, count > 0 ? '' : 'Add at least one recipe')
      }
    },
    [onChange, onValidityChange]
  )

  // Add folder
  const addFolder = useCallback(
    (parentId?: string) => {
      const newFolder = createNewFolder()
      setNodes((prev) => {
        pushHistory(prev)
        let updated: TreeNode[]
        if (parentId) {
          updated = addToFolder(prev, parentId, newFolder)
        } else {
          updated = [...prev, newFolder]
        }
        notifyChange(updated)
        return updated
      })
      return newFolder.id
    },
    [notifyChange, pushHistory]
  )

  // Add recipe
  const addRecipe = useCallback(
    (parentId?: string) => {
      const newRecipe = createNewRecipe(defaults)
      setNodes((prev) => {
        pushHistory(prev)
        let updated: TreeNode[]
        if (parentId) {
          updated = addToFolder(prev, parentId, newRecipe)
        } else {
          updated = [...prev, newRecipe]
        }
        notifyChange(updated)
        return updated
      })
      setExpandedRecipeId(newRecipe.id) // auto-expand new, collapse all others
      return newRecipe.id
    },
    [defaults, notifyChange, pushHistory]
  )

  // Toggle folder open/close
  const toggleFolder = useCallback((id: string) => {
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id === id && n.type === 'folder') {
          return { ...n, open: !n.open }
        }
        if (n.type === 'folder') {
          return { ...n, children: toggleFolderInTree(n.children, id) }
        }
        return n
      })
      return updated
    })
  }, [])

  function toggleFolderInTree(nodes: TreeNode[], id: string): TreeNode[] {
    return nodes.map((n) => {
      if (n.id === id && n.type === 'folder') {
        return { ...n, open: !n.open }
      }
      if (n.type === 'folder') {
        return { ...n, children: toggleFolderInTree(n.children, id) }
      }
      return n
    })
  }

  // Toggle recipe expanded
  const toggleRecipe = useCallback((id: string) => {
    setNodes((prev) => {
      return updateNodeInTree(prev, id, (n) =>
        n.type === 'recipe' ? { ...n, expanded: !n.expanded } : n
      )
    })
  }, [])

  // Toggle override section
  const toggleOverride = useCallback((id: string) => {
    setNodes((prev) => {
      return updateNodeInTree(prev, id, (n) =>
        n.type === 'recipe' ? { ...n, overrideOpen: !n.overrideOpen } : n
      )
    })
  }, [])

  // Update recipe field
  const updateRecipeField = useCallback(
    (id: string, field: 'name' | 'option' | 'price', value: string) => {
      setNodes((prev) => {
        const updated = updateNodeInTree(prev, id, (n) => {
          if (n.type !== 'recipe') return n
          return { ...n, [field]: value }
        })
        notifyChange(updated)
        return updated
      })
    },
    [notifyChange]
  )

  // Update recipe override field
  const updateRecipeOverride = useCallback(
    (id: string, field: keyof RecipeNode, value: unknown) => {
      setNodes((prev) => {
        const updated = updateNodeInTree(prev, id, (n) => {
          if (n.type !== 'recipe') return n
          return { ...n, [field]: value }
        })
        notifyChange(updated)
        return updated
      })
    },
    [notifyChange]
  )

  // Helper to update a node in the tree
  function updateNodeInTree(nodes: TreeNode[], id: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
    return nodes.map((n) => {
      if (n.id === id) {
        return updater(n)
      }
      if (n.type === 'folder') {
        return { ...n, children: updateNodeInTree(n.children, id, updater) }
      }
      return n
    })
  }

  // Move item into folder
  const moveInto = useCallback(
    (draggedId: string, targetFolderId: string) => {
      setNodes((prev) => {
        const nodeToMove = findNode(prev, draggedId)
        if (!nodeToMove || nodeToMove.id === targetFolderId) return prev
        pushHistory(prev)
        const { tree: withoutNode } = removeNode(prev, draggedId)
        const updated = addToFolder(withoutNode, targetFolderId, nodeToMove)
        notifyChange(updated)
        return updated
      })
    },
    [notifyChange, pushHistory]
  )

  // Rename item
  const renameItem = useCallback(
    (id: string, newName: string) => {
      setNodes((prev) => {
        pushHistory(prev)
        const updated = updateNodeInTree(prev, id, (n) => ({ ...n, name: newName }))
        notifyChange(updated)
        return updated
      })
    },
    [notifyChange, pushHistory]
  )

  // Duplicate item
  const duplicateItem = useCallback(
    (id: string) => {
      setNodes((prev) => {
        const nodeToClone = findNode(prev, id)
        if (!nodeToClone) return prev
        pushHistory(prev)
        const cloned = cloneNode(nodeToClone, defaults)

        // Find parent and add after original
        const parent = findParent(prev, id)
        let updated: TreeNode[]

        if (parent) {
          const parentIndex = prev.findIndex((n) => n.id === parent.id)
          if (parentIndex >= 0) {
            // It's at root level - need to find in parent's children
            updated = prev.map((n) => {
              if (n.id === parent.id && n.type === 'folder') {
                const childIndex = n.children.findIndex((c) => c.id === id)
                const newChildren = [...n.children]
                newChildren.splice(childIndex + 1, 0, cloned)
                return { ...n, children: newChildren }
              }
              return n
            })
          } else {
            updated = addToFolder(prev, parent.id, cloned)
          }
        } else {
          // At root level
          const index = prev.findIndex((n) => n.id === id)
          const newNodes = [...prev]
          newNodes.splice(index + 1, 0, cloned)
          updated = newNodes
        }

        notifyChange(updated)
        return updated
      })
    },
    [defaults, notifyChange, pushHistory]
  )

  // Copy item to clipboard
  const copyItem = useCallback((id: string) => {
    const node = findNode(nodes, id)
    if (node) {
      setClipboard(node)
    }
  }, [nodes])

  // Paste item from clipboard
  const pasteItem = useCallback(
    (targetId: string) => {
      if (!clipboard) return

      setNodes((prev) => {
        const target = findNode(prev, targetId)
        if (!target) return prev
        pushHistory(prev)
        const cloned = cloneNode(clipboard, defaults)
        let updated: TreeNode[]

        if (target.type === 'folder') {
          updated = addToFolder(prev, targetId, cloned)
        } else {
          // Paste into parent of target
          const parent = findParent(prev, targetId)
          if (parent) {
            updated = addToFolder(prev, parent.id, cloned)
          } else {
            // At root level, paste after target
            const index = prev.findIndex((n) => n.id === targetId)
            const newNodes = [...prev]
            newNodes.splice(index + 1, 0, cloned)
            updated = newNodes
          }
        }

        notifyChange(updated)
        return updated
      })
    },
    [clipboard, defaults, notifyChange, pushHistory]
  )

  // Delete item
  const deleteItem = useCallback(
    (id: string) => {
      setNodes((prev) => {
        pushHistory(prev)
        const { tree: updated } = removeNode(prev, id)
        notifyChange(updated)
        return updated
      })
    },
    [notifyChange, pushHistory]
  )

  // Collect specs for output
  const collectSpecsOutput = useCallback(() => {
    return collectSpecs(nodes)
  }, [nodes])

  // Drag ref
  const setDraggedId = useCallback((id: string | null) => {
    draggedIdRef.current = id
  }, [])

  const getDraggedId = useCallback(() => draggedIdRef.current, [])

  return {
    nodes,
    setNodes,
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
    collectSpecs: collectSpecsOutput,
    hasClipboard: !!clipboard,
    setDraggedId,
    getDraggedId,
    hasAtLeastOneRecipe,
    expandedRecipeId,
    setExpandedRecipeId,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
