// src/main/services/trashCleanupService.ts
// Background service to permanently delete trash items after retention period

import { ipcMain } from 'electron'
import * as fs from 'fs'

interface TrashItem {
  id: string
  sharePointFolderPath: string
}

let cleanupInterval: NodeJS.Timeout | null = null

/**
 * Start the trash cleanup service
 * Runs every 24 hours to check for items due for deletion
 */
export function startTrashCleanupService(): void {
  // Run immediately on startup, then every 24 hours
  runCleanup()
  
  cleanupInterval = setInterval(() => {
    runCleanup()
  }, 24 * 60 * 60 * 1000) // 24 hours
  
  console.log('[TrashCleanup] Service started - will run every 24 hours')
}

/**
 * Stop the cleanup service
 */
export function stopTrashCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    console.log('[TrashCleanup] Service stopped')
  }
}

/**
 * Run the cleanup process
 * Called by the interval and can also be triggered manually
 */
async function runCleanup(): Promise<void> {
  console.log('[TrashCleanup] Running cleanup check...')
  
  try {
    // Get items due for deletion from renderer via IPC
    const items = await getTrashItemsDueForDeletion()
    
    if (items.length === 0) {
      console.log('[TrashCleanup] No items due for deletion')
      return
    }
    
    console.log(`[TrashCleanup] Found ${items.length} items to delete`)
    
    for (const item of items) {
      await deleteTrashItem(item)
    }
    
    console.log('[TrashCleanup] Cleanup completed')
  } catch (err) {
    console.error('[TrashCleanup] Error during cleanup:', err)
  }
}

/**
 * Get trash items that are due for deletion
 * This will be populated by the renderer process
 */
let pendingTrashItems: TrashItem[] = []

export function setPendingTrashItems(items: TrashItem[]): void {
  pendingTrashItems = items
}

async function getTrashItemsDueForDeletion(): Promise<TrashItem[]> {
  // Request items from renderer process via IPC
  return new Promise((resolve) => {
    // The renderer will call setPendingTrashItems before we check
    // This is a simplified approach - in practice, the renderer should
    // push items to the main process
    resolve(pendingTrashItems)
    pendingTrashItems = [] // Clear after reading
  })
}

/**
 * Delete a trash item permanently
 */
async function deleteTrashItem(item: TrashItem): Promise<void> {
  try {
    const folderPath = item.sharePointFolderPath
    
    // Safety check: ensure path contains the verification folder
    if (!folderPath.includes('REPORTS (NPD-SECURE)')) {
      console.error(`[TrashCleanup] Invalid path rejected: ${folderPath}`)
      await markItemFailed(item.id, 'Invalid path')
      return
    }
    
    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      console.log(`[TrashCleanup] Folder already deleted: ${folderPath}`)
      await markItemDeleted(item.id)
      return
    }
    
    // Delete the folder recursively
    await fs.promises.rm(folderPath, { recursive: true, force: true })
    console.log(`[TrashCleanup] Deleted folder: ${folderPath}`)
    
    await markItemDeleted(item.id)
  } catch (err) {
    console.error(`[TrashCleanup] Failed to delete ${item.sharePointFolderPath}:`, err)
    await markItemFailed(item.id, String(err))
  }
}

/**
 * Mark item as deleted in Firestore
 */
async function markItemDeleted(trashId: string): Promise<void> {
  try {
    // This will be called from renderer - we'll emit an event
    // For now, just log it
    console.log(`[TrashCleanup] Marked as deleted: ${trashId}`)
  } catch (err) {
    console.error(`[TrashCleanup] Failed to mark item as deleted:`, err)
  }
}

/**
 * Mark item as failed
 */
async function markItemFailed(trashId: string, error: string): Promise<void> {
  try {
    console.error(`[TrashCleanup] Marked as failed: ${trashId} - ${error}`)
  } catch (err) {
    console.error(`[TrashCleanup] Failed to mark item as failed:`, err)
  }
}

/**
 * Manually trigger cleanup (for testing or admin use)
 */
export function triggerManualCleanup(): void {
  console.log('[TrashCleanup] Manual cleanup triggered')
  runCleanup()
}

/**
 * Delete a specific folder immediately (called from renderer)
 */
export async function deleteFolderImmediately(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Safety check
    if (!folderPath.includes('REPORTS (NPD-SECURE)')) {
      return { success: false, error: 'Invalid path' }
    }
    
    if (!fs.existsSync(folderPath)) {
      return { success: true } // Already deleted
    }
    
    await fs.promises.rm(folderPath, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// Register IPC handlers
export function registerTrashCleanupHandlers(): void {
  ipcMain.handle('trash:cleanup-now', async () => {
    triggerManualCleanup()
    return { success: true }
  })
  
  ipcMain.handle('trash:delete-folder', async (_event, folderPath: string) => {
    return deleteFolderImmediately(folderPath)
  })
}
