// src/components/settings/ImportHistoryPanel.tsx
// Microsoft Planner History Import Wizard
// 4 steps: Upload → Client Matching → Confirm → Done

import { useState, useRef, useMemo, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ChevronRight, ChevronLeft, Loader2, Users, Calendar, LayoutGrid, Trash2, X } from 'lucide-react'
import { parsePlannerExport, autoMatchClients, getImportPreview } from '../../lib/plannerImporter'
import { createHistoricalTasks, createImportBatch, createClient, getImportBatches, deleteImportBatch } from '../../lib/firestore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import type { RawPlannerTask, MatchResult, Client, HistoricalTask, ImportBatch } from '../../types'
import { nanoid } from 'nanoid'

type Step = 'upload' | 'matching' | 'confirm' | 'done'

export default function ImportHistoryPanel() {
  const { user } = useAuthStore()
  const { clients, setClients } = useSettingsStore()
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('upload')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Data state
  const [rawTasks, setRawTasks] = useState<RawPlannerTask[]>([])
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])
  const [fileName, setFileName] = useState('')
  
  // New client inline state (per task row)
  const [newClientInputs, setNewClientInputs] = useState<Record<number, { name: string; saving: boolean }>>({})
  
  // Bulk assign state
  const [applyToSimilar, setApplyToSimilar] = useState(true)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Import batches state
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  
  // Load import batches on mount
  useEffect(() => {
    loadImportBatches()
  }, [])
  
  async function loadImportBatches() {
    try {
      const batches = await getImportBatches()
      setImportBatches(batches)
    } catch (err) {
      console.error('Failed to load import batches:', err)
    }
  }
  
  async function handleDeleteBatch(batchId: string) {
    setDeletingBatchId(batchId)
    try {
      await deleteImportBatch(batchId)
      setImportBatches(prev => prev.filter(b => b.id !== batchId))
      setShowDeleteConfirm(null)
    } catch (err) {
      setError('Failed to delete import batch')
    } finally {
      setDeletingBatchId(null)
    }
  }
  
  // Computed values
  const autoMatchedCount = matchResults.filter(r => r.confidence === 'auto').length
  const unassignedCount = matchResults.filter(r => r.confidence === 'none').length
  const allAssigned = unassignedCount === 0
  
  const preview = useMemo(() => {
    if (rawTasks.length === 0) return null
    return getImportPreview(rawTasks)
  }, [rawTasks])
  
  // ─────────────────────────────────────────
  // STEP 1: File Upload
  // ─────────────────────────────────────────
  
  async function handleFileSelect(file: File) {
    setIsLoading(true)
    setError('')
    setFileName(file.name)
    
    try {
      const tasks = await parsePlannerExport(file)
      setRawTasks(tasks)
      
      // Auto-match clients
      const matches = autoMatchClients(tasks, clients)
      setMatchResults(matches)
      
      setCurrentStep('matching')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setFileName('')
    } finally {
      setIsLoading(false)
    }
  }
  
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      handleFileSelect(file)
    } else {
      setError('Please upload an .xlsx or .csv file')
    }
  }
  
  // ─────────────────────────────────────────
  // STEP 2: Client Matching
  // ─────────────────────────────────────────
  
  /**
   * Extract keywords from a task title for similarity matching
   * Returns significant words (excluding common words)
   */
  function extractSimilarityKeywords(title: string): string[] {
    const commonWords = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'NEW', 'BQTS', 'ROSES', 'WEEKLY', 'EVENT', 'HOUSE'])
    return title
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !commonWords.has(w))
  }
  
  /**
   * Calculate similarity score between two strings (0-1)
   * Uses Levenshtein distance for fuzzy matching
   */
  function getSimilarityScore(str1: string, str2: string): number {
    const s1 = str1.toUpperCase()
    const s2 = str2.toUpperCase()
    
    // Exact match
    if (s1 === s2) return 1.0
    
    // One contains the other (e.g., "WEGMAN" vs "WEGMANS")
    if (s1.includes(s2) || s2.includes(s1)) return 0.9
    
    // Check for plural/singular differences
    if (s1 + 'S' === s2 || s2 + 'S' === s1) return 0.85
    if (s1.endsWith('S') && s1.slice(0, -1) === s2) return 0.85
    if (s2.endsWith('S') && s2.slice(0, -1) === s1) return 0.85
    
    // Levenshtein distance for typos
    const maxLen = Math.max(s1.length, s2.length)
    if (maxLen === 0) return 1.0
    
    const distance = levenshteinDistance(s1, s2)
    return 1 - distance / maxLen
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }
  
  /**
   * Find similar unassigned tasks based on keyword overlap
   */
  function findSimilarTasks(sourceIndex: number, sourceTitle: string): number[] {
    const sourceKeywords = extractSimilarityKeywords(sourceTitle)
    if (sourceKeywords.length === 0) {
      // If no keywords extracted, try matching the full title
      return findSimilarByFullTitle(sourceIndex, sourceTitle)
    }
    
    const similar: number[] = []
    
    matchResults.forEach((result, idx) => {
      if (idx === sourceIndex) return // Skip the source task
      if (result.clientId) return // Skip already assigned tasks
      
      const targetTitle = result.task.title
      const targetKeywords = extractSimilarityKeywords(targetTitle)
      
      // Check keyword overlap with similarity scoring
      let bestScore = 0
      
      for (const sk of sourceKeywords) {
        for (const tk of targetKeywords) {
          const score = getSimilarityScore(sk, tk)
          if (score > bestScore) bestScore = score
        }
        
        // Also check against full target title
        const fullTitleScore = getSimilarityScore(sk, targetTitle)
        if (fullTitleScore > bestScore) bestScore = fullTitleScore
      }
      
      // Also compare full titles
      const fullScore = getSimilarityScore(sourceTitle, targetTitle)
      if (fullScore > bestScore) bestScore = fullScore
      
      // Threshold for similarity (0.7 = 70% similar)
      if (bestScore >= 0.7) {
        similar.push(idx)
      }
    })
    
    return similar
  }
  
  /**
   * Fallback: find similar tasks by comparing full titles
   */
  function findSimilarByFullTitle(sourceIndex: number, sourceTitle: string): number[] {
    const similar: number[] = []
    
    matchResults.forEach((result, idx) => {
      if (idx === sourceIndex) return
      if (result.clientId) return
      
      const score = getSimilarityScore(sourceTitle, result.task.title)
      if (score >= 0.7) {
        similar.push(idx)
      }
    })
    
    return similar
  }
  
  function handleClientChange(index: number, clientId: string) {
    if (clientId === '__new__') {
      // Show inline new client input for this row
      setNewClientInputs(prev => ({
        ...prev,
        [index]: { name: '', saving: false }
      }))
      return
    }
    
    const client = clients.find(c => c.id === clientId)
    if (!client) return
    
    // Update the selected task
    setMatchResults(prev => {
      const updated = [...prev]
      updated[index] = { 
        ...updated[index], 
        clientId: client.id, 
        clientName: client.name, 
        confidence: 'auto' 
      }
      
      // If applyToSimilar is enabled, find and update similar tasks
      if (applyToSimilar) {
        const similarIndices = findSimilarTasks(index, updated[index].task.title)
        similarIndices.forEach(similarIdx => {
          updated[similarIdx] = {
            ...updated[similarIdx],
            clientId: client.id,
            clientName: client.name,
            confidence: 'auto'
          }
        })
      }
      
      return updated
    })
  }
  
  async function handleCreateClientForRow(index: number, name: string) {
    if (!name.trim() || !user) return
    
    setNewClientInputs(prev => ({
      ...prev,
      [index]: { ...prev[index], saving: true }
    }))
    
    try {
      const id = await createClient(name.trim(), user.uid)
      const newClient: Client = {
        id,
        name: name.trim(),
        active: true,
        createdBy: user.uid,
        createdAt: Timestamp.now() as unknown as import('firebase/firestore').Timestamp
      }
      
      // Add to store
      setClients([...clients, newClient].sort((a, b) => a.name.localeCompare(b.name)))
      
      // Update match result
      setMatchResults(prev => prev.map((r, i) => 
        i === index 
          ? { ...r, clientId: newClient.id, clientName: newClient.name, confidence: 'auto' }
          : r
      ))
      
      // Clear input
      setNewClientInputs(prev => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    } catch {
      setError('Failed to create client')
    }
  }
  
  // ─────────────────────────────────────────
  // STEP 3: Confirm & Import
  // ─────────────────────────────────────────
  
  async function handleImport() {
    if (!user || !allAssigned) return
    
    setIsLoading(true)
    setError('')
    
    try {
      // Create import batch first
      const batchData = {
        fileName,
        taskCount: matchResults.length,
        dateRange: {
          earliest: Timestamp.fromDate(preview?.dateRange.earliest ?? new Date()),
          latest: Timestamp.fromDate(preview?.dateRange.latest ?? new Date()),
        },
        importedAt: Timestamp.now(),
        importedBy: user.uid,
        source: 'planner' as const,
      }
      
      const batchId = await createImportBatch(batchData)
      
      // Create historical tasks
      const historicalTasks: HistoricalTask[] = matchResults.map((result) => {
        const dateRef = result.task.dateEnd ?? result.task.createdAt
        const year = dateRef.getFullYear()
        const month = dateRef.getMonth() + 1
        
        return {
          id: nanoid(), // Generate unique ID for each task
          title: result.task.title,
          clientId: result.clientId!,
          clientName: result.clientName!,
          bucket: result.task.bucket,
          assigneeNames: result.task.assigneeNames,
          dateStart: result.task.dateStart ? Timestamp.fromDate(result.task.dateStart) : null,
          dateEnd: result.task.dateEnd ? Timestamp.fromDate(result.task.dateEnd) : null,
          createdAt: Timestamp.fromDate(result.task.createdAt),
          notes: result.task.notes.slice(0, 2000), // Truncate to 2000 chars
          source: 'planner',
          importedAt: Timestamp.now(),
          importedBy: user.uid,
          importBatchId: batchId,
          year,
          month,
        }
      })
      
      await createHistoricalTasks(historicalTasks)
      
      setCurrentStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import tasks')
    } finally {
      setIsLoading(false)
    }
  }
  
  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Import Microsoft Planner History
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Import historical task data from Microsoft Planner exports for analytics and reporting.
        </p>
      </div>
      
      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}
      
      {/* Import Batches List (when on upload step) */}
      {currentStep === 'upload' && importBatches.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            Previous Imports
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {importBatches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-900 dark:text-white">{batch.fileName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {batch.taskCount} tasks • {batch.dateRange.earliest.toDate().toLocaleDateString()} — {batch.dateRange.latest.toDate().toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(batch.id)}
                  disabled={deletingBatchId === batch.id}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete import"
                >
                  {deletingBatchId === batch.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delete Import?
              </h3>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              This will permanently delete this import and all {importBatches.find(b => b.id === showDeleteConfirm)?.taskCount} associated historical tasks.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBatch(showDeleteConfirm)}
                disabled={deletingBatchId === showDeleteConfirm}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deletingBatchId === showDeleteConfirm ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Upload */}
      {currentStep === 'upload' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800/50"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-700">
            <Upload className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            Upload Microsoft Planner Export
          </h3>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Drag and drop your .xlsx or .csv file here, or click to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing...
              </span>
            ) : (
              'Browse Files'
            )}
          </button>
          
          <div className="mt-6 text-xs text-gray-400 dark:text-gray-500">
            <p>Expected columns: Task Name, Bucket Name, Assigned To, Created Date, Start date, Due date, Description</p>
          </div>
        </div>
      )}
      
      {/* STEP 2: Client Matching */}
      {currentStep === 'matching' && preview && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{preview.taskCount} tasks</span>
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{preview.bucketCount} buckets</span>
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{preview.assigneeCount} assignees</span>
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {preview.dateRange.earliest?.toLocaleDateString()} — {preview.dateRange.latest?.toLocaleDateString()}
              </span>
            </div>
          </div>
          
          {/* Match Stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-gray-600 dark:text-gray-400">Auto-matched: {autoMatchedCount}/{matchResults.length}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-gray-600 dark:text-gray-400">Needs assignment: {unassignedCount}/{matchResults.length}</span>
              </span>
            </div>
            
            {/* Apply to similar checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToSimilar}
                onChange={(e) => setApplyToSimilar(e.target.checked)}
                className="rounded border-gray-300 text-green-500 focus:ring-green-500"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Auto-assign similar tasks
              </span>
            </label>
          </div>
          
          {/* Matching Table */}
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Task Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Bucket</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Client</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {matchResults.map((result, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/50'}>
                      <td className="px-4 py-2 text-gray-900 dark:text-white truncate max-w-xs" title={result.task.title}>
                        {result.task.title}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{result.task.bucket}</td>
                      <td className="px-4 py-2">
                        {newClientInputs[index] ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={newClientInputs[index].name}
                              onChange={(e) => setNewClientInputs(prev => ({
                                ...prev,
                                [index]: { ...prev[index], name: e.target.value }
                              }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleCreateClientForRow(index, newClientInputs[index].name)
                                }
                                if (e.key === 'Escape') {
                                  setNewClientInputs(prev => {
                                    const next = { ...prev }
                                    delete next[index]
                                    return next
                                  })
                                }
                              }}
                              placeholder="Client name"
                              className="w-40 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            />
                            <button
                              onClick={() => handleCreateClientForRow(index, newClientInputs[index].name)}
                              disabled={newClientInputs[index].saving}
                              className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600 disabled:opacity-50"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => setNewClientInputs(prev => {
                                const next = { ...prev }
                                delete next[index]
                                return next
                              })}
                              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={result.clientId ?? ''}
                              onChange={(e) => handleClientChange(index, e.target.value)}
                              className={`rounded border px-2 py-1 text-xs focus:outline-none focus:border-green-500 ${
                                result.confidence === 'auto'
                                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                              }`}
                            >
                              <option value="">
                                {result.confidence === 'none' ? '— Select client —' : result.clientName}
                              </option>
                              {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                              <option value="__new__">+ New Client</option>
                            </select>
                            {result.confidence === 'auto' && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {result.confidence === 'none' && !result.clientId && (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => {
                setCurrentStep('upload')
                setRawTasks([])
                setMatchResults([])
                setFileName('')
              }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={() => setCurrentStep('confirm')}
              disabled={!allAssigned}
              className="flex items-center gap-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          {!allAssigned && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
              Please assign a client to all tasks before continuing
            </p>
          )}
        </div>
      )}
      
      {/* STEP 3: Confirm */}
      {currentStep === 'confirm' && preview && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
              Ready to Import
            </h3>
            
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Tasks</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{preview.taskCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Buckets</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{preview.bucketCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Team Members</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{preview.assigneeCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Period</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {preview.dateRange.earliest?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} — 
                  {preview.dateRange.latest?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            
            <div className="mt-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Note:</strong> This data will appear in Analytics as historical records. 
                It will NOT create active tasks on any board.
              </p>
            </div>
          </div>
          
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('matching')}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-green-500 px-6 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {matchResults.length} Tasks</>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* STEP 4: Done */}
      {currentStep === 'done' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            Import Complete!
          </h3>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {matchResults.length} historical tasks imported successfully
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                // Navigate to analytics with historical tab
                window.location.href = '/analytics?tab=historical'
              }}
              className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
            >
              View in Analytics
            </button>
            <button
              onClick={() => {
                setCurrentStep('upload')
                setRawTasks([])
                setMatchResults([])
                setFileName('')

                setError('')
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
