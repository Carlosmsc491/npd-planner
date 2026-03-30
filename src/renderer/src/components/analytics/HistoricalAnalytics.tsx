// src/components/analytics/HistoricalAnalytics.tsx
// Historical Analytics tab - displays imported Planner data

import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { Calendar, Users, Briefcase, LayoutGrid, Search, ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react'
import { useHistoricalTasks, useHistoricalStats } from '../../hooks/useHistoricalTasks'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { HistoricalTask } from '../../types'

// Color palette matching the app
const CHART_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280'
]

interface HistoricalAnalyticsProps {
  availableYears: number[]
}

export default function HistoricalAnalytics({ availableYears }: HistoricalAnalyticsProps) {
  const { user } = useAuthStore()
  const { clients } = useSettingsStore()
  const isOwner = user?.role === 'owner'
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedBucket, setSelectedBucket] = useState<string>('all')
  const [hasInitializedYear, setHasInitializedYear] = useState(false)
  
  // Update selected year ONLY on initial load (not when user manually selects 'all')
  useEffect(() => {
    if (!hasInitializedYear && availableYears.length > 0) {
      setSelectedYear(availableYears[0])
      setHasInitializedYear(true)
    }
  }, [availableYears, hasInitializedYear])
  
  // Table state
  const [showTable, setShowTable] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [tablePage, setTablePage] = useState(1)
  const [sortField, setSortField] = useState<keyof HistoricalTask>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const PAGE_SIZE = 20
  
  // Edit client state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editClientId, setEditClientId] = useState('')
  const [updating, setUpdating] = useState(false)
  
  // Fetch data
  const { tasks, loading, error, refetch } = useHistoricalTasks({
    year: selectedYear === 'all' ? undefined : selectedYear,
  })
  
  // Filter by client and bucket
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (selectedClient !== 'all' && t.clientId !== selectedClient) return false
      if (selectedBucket !== 'all' && t.bucket !== selectedBucket) return false
      return true
    })
  }, [tasks, selectedClient, selectedBucket])
  
  // Calculate stats
  const stats = useHistoricalStats(filteredTasks)
  
  // Get unique clients and buckets for filters
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>()
    tasks.forEach(t => map.set(t.clientId, t.clientName))
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [tasks])
  
  const uniqueBuckets = useMemo(() => {
    return Array.from(new Set(tasks.map(t => t.bucket))).sort()
  }, [tasks])
  
  // Prepare chart data
  const monthChartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    return months.map((month, idx) => {
      const monthTasks = filteredTasks.filter(t => t.month === idx + 1)
      const bucketCounts: Record<string, number> = {}
      
      monthTasks.forEach(t => {
        bucketCounts[t.bucket] = (bucketCounts[t.bucket] || 0) + 1
      })
      
      return {
        month,
        total: monthTasks.length,
        ...bucketCounts,
      }
    })
  }, [filteredTasks])
  
  const bucketChartData = useMemo(() => {
    return stats.tasksByBucket
  }, [stats.tasksByBucket])
  
  const clientChartData = useMemo(() => {
    return stats.tasksByClient.slice(0, 10).map(c => ({
      name: c.name.length > 18 ? c.name.slice(0, 16) + '...' : c.name,
      fullName: c.name,
      count: c.count,
    }))
  }, [stats.tasksByClient])
  
  const assigneeChartData = useMemo(() => {
    return stats.tasksByAssignee.slice(0, 10)
  }, [stats.tasksByAssignee])
  
  // Table data
  const sortedTableData = useMemo(() => {
    let data = [...filteredTasks]
    
    if (tableSearch) {
      const searchLower = tableSearch.toLowerCase()
      data = data.filter(t =>
        t.title.toLowerCase().includes(searchLower) ||
        t.clientName.toLowerCase().includes(searchLower) ||
        t.bucket.toLowerCase().includes(searchLower) ||
        t.assigneeNames.some(a => a.toLowerCase().includes(searchLower))
      )
    }
    
    data.sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      
      // Handle null values
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return sortDirection === 'asc' ? -1 : 1
      if (bVal === null) return sortDirection === 'asc' ? 1 : -1
      
      // Compare string values case-insensitive
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase())
        return sortDirection === 'asc' ? comparison : -comparison
      }
      
      // Compare other values
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    
    return data
  }, [filteredTasks, tableSearch, sortField, sortDirection])
  
  const paginatedTableData = useMemo(() => {
    const start = (tablePage - 1) * PAGE_SIZE
    return sortedTableData.slice(start, start + PAGE_SIZE)
  }, [sortedTableData, tablePage])
  
  const totalPages = Math.ceil(sortedTableData.length / PAGE_SIZE)
  
  // Update task client (owner only)
  async function handleUpdateClient(taskId: string, newClientId: string, newClientName: string) {
    if (!isOwner) return
    setUpdating(true)
    try {
      console.log('Updating task:', taskId, 'to client:', newClientName)
      await updateDoc(doc(db, 'historicalTasks', taskId), {
        clientId: newClientId,
        clientName: newClientName
      })
      console.log('Update successful for task:', taskId)
      // Refresh data from Firestore
      await refetch()
      setEditingTaskId(null)
    } catch (err) {
      console.error('Failed to update client:', err)
      alert('Failed to update client')
    } finally {
      setUpdating(false)
    }
  }
  
  function handleSort(field: keyof HistoricalTask) {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading historical data...</div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    )
  }
  
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 px-6 py-12 text-center">
        <Calendar className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          No historical data found
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
          {selectedYear !== 'all' 
            ? `No data for year ${selectedYear}. Try selecting "All Years" or check Settings → Import History.`
            : "Go to Settings → Import History to import your Microsoft Planner data."
          }
        </p>
        {selectedYear !== 'all' && (
          <button
            onClick={() => setSelectedYear('all')}
            className="mt-4 text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            Show all years
          </button>
        )}
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Years</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Client:</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Clients</option>
            {uniqueClients.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Bucket:</label>
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Buckets</option>
            {uniqueBuckets.map(bucket => (
              <option key={bucket} value={bucket}>{bucket}</option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Source:</label>
          <select
            value="planner"
            disabled
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="planner">Planner</option>
          </select>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Tasks"
          value={stats.totalTasks}
          icon={<LayoutGrid className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          title="Clients"
          value={stats.uniqueClients}
          icon={<Briefcase className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          title="Buckets"
          value={stats.uniqueBuckets}
          icon={<LayoutGrid className="h-5 w-5 text-purple-500" />}
        />
        <StatCard
          title="Team Members"
          value={stats.uniqueAssignees}
          icon={<Users className="h-5 w-5 text-orange-500" />}
        />
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Month */}
        <ChartCard title="Tasks by Month" icon={<Calendar className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [value, name === 'total' ? 'Total' : name]}
              />
              <Bar dataKey="total" fill="#1D9E75" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        
        {/* Tasks by Client */}
        <ChartCard title="Tasks by Client (Top 10)" icon={<Briefcase className="h-4 w-4" />}>
          {clientChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(300, clientChartData.length * 32)}>
              <BarChart data={clientChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(_value, _name, props) => [props.payload.count, props.payload.fullName]}
                />
                <Bar dataKey="count" fill="#1D9E75" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No client data available" />
          )}
        </ChartCard>
      </div>
      
      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks by Bucket */}
        <ChartCard title="Tasks by Bucket" icon={<LayoutGrid className="h-4 w-4" />}>
          {bucketChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={bucketChartData}
                  cx="50%"
                  cy="40%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="name"
                  label={({ name, percent }) => `${(name as string).length > 12 ? (name as string).slice(0, 10) + '...' : name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {bucketChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '10px', lineHeight: '16px' }}
                  formatter={(value) => (value as string).length > 22 ? (value as string).slice(0, 20) + '...' : value}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No bucket data available" />
          )}
        </ChartCard>
        
        {/* Team Workload */}
        <ChartCard title="Team Workload" icon={<Users className="h-4 w-4" />}>
          {assigneeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(300, assigneeChartData.length * 40)}>
              <BarChart data={assigneeChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 11 }}
                  interval={0}
                  tickFormatter={(v) => (v as string).length > 20 ? (v as string).slice(0, 18) + '...' : v}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#378ADD" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No assignee data available" />
          )}
        </ChartCard>
      </div>
      
      {/* Tasks Table (Collapsible) */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <button
          onClick={() => setShowTable(!showTable)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Tasks Table ({filteredTasks.length} tasks)
          </span>
          {showTable ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
        
        {showTable && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {/* Search */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => { setTableSearch(e.target.value); setTablePage(1) }}
                  placeholder="Search tasks, clients, buckets, assignees..."
                  className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <Th onClick={() => handleSort('title')} sortable>Task</Th>
                    <Th onClick={() => handleSort('clientName')} sortable>Client</Th>
                    <Th onClick={() => handleSort('bucket')} sortable>Bucket</Th>
                    <Th>Assignees</Th>
                    <Th onClick={() => handleSort('dateStart')} sortable>Start</Th>
                    <Th onClick={() => handleSort('dateEnd')} sortable>Due</Th>
                    <Th onClick={() => handleSort('createdAt')} sortable>Created</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedTableData.map((task, rowIndex) => {
                    // Use a unique key combining task.id and rowIndex to handle potential duplicate IDs
                    const uniqueRowKey = `${task.id || 'no-id'}-${rowIndex}`
                    const isEditing = editingTaskId === uniqueRowKey
                    
                    return (
                    <tr key={uniqueRowKey} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2 text-gray-900 dark:text-white max-w-xs truncate" title={task.title}>
                        {task.title}
                      </td>
                      <td className="px-4 py-2">
                        {isOwner && isEditing ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editClientId}
                              onChange={(e) => setEditClientId(e.target.value)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                              <option value="">Select client...</option>
                              {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const client = clients.find(c => c.id === editClientId)
                                if (client) handleUpdateClient(task.id, client.id, client.name)
                              }}
                              disabled={!editClientId || updating}
                              className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600 disabled:opacity-50"
                            >
                              {updating ? '...' : <Check className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={() => setEditingTaskId(null)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 dark:text-gray-400">{task.clientName}</span>
                            {isOwner && (
                              <button
                                onClick={() => {
                                  setEditingTaskId(uniqueRowKey)
                                  setEditClientId(task.clientId)
                                }}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{task.bucket}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {task.assigneeNames.join(', ')}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-500 text-xs">
                        {task.dateStart?.toDate().toLocaleDateString() || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-500 text-xs">
                        {task.dateEnd?.toDate().toLocaleDateString() || '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-500 text-xs">
                        {task.createdAt.toDate().toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing {((tablePage - 1) * PAGE_SIZE) + 1} - {Math.min(tablePage * PAGE_SIZE, sortedTableData.length)} of {sortedTableData.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                    disabled={tablePage === 1}
                    className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Page {tablePage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                    disabled={tablePage === totalPages}
                    className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────

interface StatCardProps {
  title: string
  value: number
  icon: React.ReactNode
}

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">{icon}</div>
      </div>
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}

function ChartCard({ title, icon, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
      {message}
    </div>
  )
}

interface ThProps {
  children: React.ReactNode
  sortable?: boolean
  onClick?: () => void
}

function Th({ children, sortable, onClick }: ThProps) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 ${
        sortable ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200' : ''
      }`}
    >
      {children}
    </th>
  )
}
