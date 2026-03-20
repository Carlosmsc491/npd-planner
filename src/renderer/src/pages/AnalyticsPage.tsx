import { useState, useEffect, useMemo, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import AppLayout from '../components/ui/AppLayout'
import { useAuthStore } from '../store/authStore'
import { useBoardStore } from '../store/boardStore'
import {
  subscribeToAllTasks, subscribeToArchive, getArchiveByYear, subscribeToUsers as subscribeToUsersFn, subscribeToClients
} from '../lib/firestore'
import { exportSummaryToCSV } from '../utils/exportUtils'
import type { Task, AnnualSummary, AppUser, Board, Client } from '../types'
import {
  TrendingUp, TrendingDown, Calendar, Users, Briefcase, LayoutGrid,
  FileText, FileSpreadsheet, Archive, CheckCircle2
} from 'lucide-react'

// Color palette matching the app
const CHART_COLORS = [
  '#1D9E75', '#378ADD', '#D4537E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#EF4444', '#6B7280'
]

type TabType = 'dashboard' | 'annual'

export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const { boards } = useBoardStore()
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')

  if (user?.role !== 'admin' && user?.role !== 'owner') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Insights and reports for NPD Planner
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('annual')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'annual'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Annual Reports
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' ? (
          <DashboardTab boards={boards} currentUser={user} />
        ) : (
          <AnnualReportsTab />
        )}
      </div>
    </AppLayout>
  )
}

// ─────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────

interface DashboardTabProps {
  boards: Board[]
  currentUser: AppUser
}

function DashboardTab({ boards }: DashboardTabProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AppUser[]>([])
  const [, setClients] = useState<Client[]>([])
  const [exporting, setExporting] = useState(false)
  const dashboardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeToAllTasks(
      boards.map(b => b.id),
      (allTasks) => {
        setTasks(allTasks)
        setLoading(false)
      }
    )
    return unsub
  }, [boards])

  // Fetch users for assignee names
  useEffect(() => {
    const unsub = subscribeToUsersFn((allUsers) => {
      setUsers(allUsers)
    })
    return unsub
  }, [])

  // Fetch clients
  useEffect(() => {
    const unsub = subscribeToClients((allClients) => {
      setClients(allClients)
    })
    return unsub
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    // Tasks completed this week
    const thisWeekCompleted = tasks.filter(t => {
      if (!t.completed || !t.completedAt) return false
      const completedDate = t.completedAt.toDate()
      return completedDate >= oneWeekAgo && completedDate <= now
    })

    // Tasks completed last week
    const lastWeekCompleted = tasks.filter(t => {
      if (!t.completed || !t.completedAt) return false
      const completedDate = t.completedAt.toDate()
      return completedDate >= twoWeeksAgo && completedDate < oneWeekAgo
    })

    // Calculate percentage change
    const thisWeekCount = thisWeekCompleted.length
    const lastWeekCount = lastWeekCompleted.length
    let percentChange = 0
    if (lastWeekCount === 0) {
      percentChange = thisWeekCount > 0 ? 100 : 0
    } else {
      percentChange = Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    }

    // Active tasks (not completed)
    const activeTasks = tasks.filter(t => !t.completed)

    return {
      thisWeekCount,
      lastWeekCount,
      percentChange,
      activeTasksCount: activeTasks.length
    }
  }, [tasks])

  // Tasks by assignee
  const assigneeData = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach(task => {
      task.assignees.forEach(uid => {
        counts[uid] = (counts[uid] || 0) + 1
      })
    })

    return Object.entries(counts)
      .map(([uid, count]) => {
        const user = users.find(u => u.uid === uid)
        return {
          name: user?.name || 'Unknown',
          count,
          uid
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [tasks, users])

  // Tasks by client
  const clientData = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach(task => {
      if (task.clientId) {
        counts[task.clientId] = (counts[task.clientId] || 0) + 1
      }
    })

    return Object.entries(counts)
      .map(([clientId, count]) => ({
        clientId,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [tasks])

  // Fetch client names
  const [clientNames, setClientNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const unsub = subscribeToClients((allClients) => {
      const names: Record<string, string> = {}
      allClients.forEach(c => { names[c.id] = c.name })
      setClientNames(names)
    })
    return unsub
  }, [])

  const clientChartData = useMemo(() => {
    return clientData.map(d => ({
      name: clientNames[d.clientId] || 'Unknown',
      count: d.count
    }))
  }, [clientData, clientNames])

  // Tasks by board
  const boardData = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach(task => {
      const board = boards.find(b => b.id === task.boardId)
      if (board) {
        counts[board.name] = (counts[board.name] || 0) + 1
      }
    })

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count
    }))
  }, [tasks, boards])

  // Tasks by month this year
  const monthlyData = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const months = Array(12).fill(0)

    tasks.forEach(task => {
      if (task.createdAt) {
        const date = task.createdAt.toDate()
        if (date.getFullYear() === currentYear) {
          months[date.getMonth()]++
        }
      }
    })

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.map((count, i) => ({
      month: monthNames[i],
      count
    }))
  }, [tasks])

  const exportDashboardPDF = async () => {
    if (!dashboardRef.current) return
    setExporting(true)

    try {
      const htmlEl = document.documentElement
      const wasDark = htmlEl.classList.contains('dark')
      if (wasDark) htmlEl.classList.remove('dark')
      await new Promise(r => setTimeout(r, 100))

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      })

      if (wasDark) htmlEl.classList.add('dark')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      // Header
      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('NPD Planner — Dashboard Report', pageWidth / 2, 15, { align: 'center' })
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(120, 120, 120)
      pdf.text(
        `Elite Flower · Generated ${new Date().toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        })}`,
        pageWidth / 2, 22, { align: 'center' }
      )
      pdf.setTextColor(0, 0, 0)

      // Use same pagination logic as Annual Reports
      const margins = { top: 10, left: 10, right: 10, bottom: 10 }
      const contentWidth = pageWidth - margins.left - margins.right
      const pxPerMm = canvas.width / contentWidth
      const headerOffset = 30
      const firstAvail = pageHeight - headerOffset - margins.bottom
      const otherAvail = pageHeight - margins.top - margins.bottom
      const totalMm = canvas.height / pxPerMm

      let remaining = totalMm
      let srcY = 0
      let page = 0

      while (remaining > 0) {
        const avail = page === 0 ? firstAvail : otherAvail
        const sliceMm = Math.min(remaining, avail)
        const slicePx = sliceMm * pxPerMm

        if (page > 0) pdf.addPage()

        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = Math.ceil(slicePx)
        const ctx = sliceCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(canvas, 0, srcY, canvas.width, Math.ceil(slicePx),
                         0, 0, canvas.width, Math.ceil(slicePx))
        }

        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG',
          margins.left, page === 0 ? headerOffset : margins.top,
          contentWidth, sliceMm)

        srcY += slicePx
        remaining -= sliceMm
        page++
      }

      pdf.save(`NPD-Planner-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('Dashboard PDF export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const exportDashboardCSV = () => {
    const BOM = '\uFEFF'
    const lines: string[] = []
    const esc = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    }

    lines.push(`NPD Planner — Dashboard Snapshot`)
    lines.push(`Generated:,${new Date().toLocaleDateString()}`)
    lines.push('')

    lines.push('Overview')
    lines.push('Metric,Value')
    lines.push(`Tasks Completed This Week,${stats.thisWeekCount}`)
    lines.push(`Tasks Completed Last Week,${stats.lastWeekCount}`)
    lines.push(`Week-over-Week Change,${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}%`)
    lines.push(`Total Active Tasks,${stats.activeTasksCount}`)
    lines.push('')

    lines.push('Tasks by Assignee')
    lines.push('Assignee,Active Tasks')
    assigneeData.forEach(({ name, count }) => {
      lines.push(`${esc(name)},${count}`)
    })
    lines.push('')

    lines.push('Tasks by Client (Top 10)')
    lines.push('Client,Tasks')
    clientChartData.slice(0, 10).forEach(({ name, count }) => {
      lines.push(`${esc(name)},${count}`)
    })
    lines.push('')

    lines.push('Tasks by Board')
    lines.push('Board,Tasks')
    boardData.forEach(({ name, count }) => {
      lines.push(`${esc(name)},${count}`)
    })

    const csv = BOM + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `NPD-Planner-Dashboard-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading analytics...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export Controls */}
      <div className="flex gap-2 justify-end" data-no-export>
        <button
          onClick={exportDashboardPDF}
          disabled={exporting || loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200
                     dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600
                     dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700
                     transition-colors disabled:opacity-50"
        >
          {exporting ? 'Generating...' : <><FileText size={14} /> PDF</>}
        </button>
        <button
          onClick={exportDashboardCSV}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200
                     dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600
                     dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700
                     transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={14} /> CSV
        </button>
      </div>

      <div ref={dashboardRef}>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* This Week vs Last Week */}
          <StatCard
            title="Completed This Week"
            value={stats.thisWeekCount}
            subtitle={`vs ${stats.lastWeekCount} last week`}
            trend={stats.percentChange}
            icon={<Calendar size={20} className="text-green-500" />}
          />

          {/* Active Tasks */}
          <StatCard
            title="Active Tasks"
            value={stats.activeTasksCount}
            subtitle="Across all boards"
            icon={<CheckCircle2 size={20} className="text-blue-500" />}
          />

          {/* Total Tasks */}
          <StatCard
            title="Total Tasks"
            value={tasks.length}
            subtitle="All time"
            icon={<LayoutGrid size={20} className="text-purple-500" />}
          />

          {/* Completion Rate */}
          <StatCard
            title="Completion Rate"
            value={`${tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0}%`}
            subtitle="Overall"
            icon={<TrendingUp size={20} className="text-orange-500" />}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Tasks by Assignee */}
          <ChartCard title="Workload by Team Member" icon={<Users size={16} />}>
            {assigneeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={assigneeData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="#1D9E75" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No assignee data available" />
            )}
          </ChartCard>

          {/* Tasks by Client */}
          <ChartCard title="Top 10 Clients" icon={<Briefcase size={16} />}>
            {clientChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={clientChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="#378ADD" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No client data available" />
            )}
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Tasks by Board */}
          <ChartCard title="Tasks by Project" icon={<LayoutGrid size={16} />}>
            {boardData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={boardData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="name"
                  >
                    {boardData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No board data available" />
            )}
          </ChartCard>

          {/* Tasks by Month */}
          <ChartCard title="Tasks by Month (This Year)" icon={<Calendar size={16} />}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#1D9E75"
                  strokeWidth={2}
                  dot={{ fill: '#1D9E75', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Annual Reports Tab
// ─────────────────────────────────────────

function AnnualReportsTab() {
  const [archives, setArchives] = useState<AnnualSummary[]>([])
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [summary, setSummary] = useState<AnnualSummary | null>(null)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // Fetch available years from archive
  useEffect(() => {
    const unsub = subscribeToArchive((data) => {
      setArchives(data)
      if (data.length > 0 && !selectedYear) {
        setSelectedYear(data[0].year)
      }
    })
    return unsub
  }, [selectedYear])

  // Load selected year summary
  useEffect(() => {
    if (selectedYear) {
      getArchiveByYear(selectedYear).then(setSummary)
    }
  }, [selectedYear])

  const handleExportPDF = async () => {
    if (!reportRef.current || !summary) return
    setExporting(true)

    try {
      // Force light mode for capture
      const htmlEl = document.documentElement
      const wasDark = htmlEl.classList.contains('dark')
      if (wasDark) htmlEl.classList.remove('dark')

      // Small delay for repaint
      await new Promise(r => setTimeout(r, 100))

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        ignoreElements: (el) => el.hasAttribute('data-no-export'),
      })

      // Restore dark mode if it was active
      if (wasDark) htmlEl.classList.add('dark')

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margins = { top: 15, bottom: 15, left: 10, right: 10 }
      const contentWidth = pageWidth - margins.left - margins.right

      // Header (page 1 only)
      const headerHeight = 30
      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('NPD Planner', pageWidth / 2, margins.top, { align: 'center' })
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.text(
        `Annual Summary ${summary.year}`,
        pageWidth / 2, margins.top + 8,
        { align: 'center' }
      )
      pdf.setFontSize(9)
      pdf.setTextColor(120, 120, 120)
      pdf.text('Elite Flower', pageWidth / 2, margins.top + 14, { align: 'center' })
      pdf.text(
        `Generated: ${new Date().toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        })}`,
        pageWidth / 2, margins.top + 19,
        { align: 'center' }
      )
      pdf.setTextColor(0, 0, 0)

      // Separator line
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.3)
      pdf.line(
        margins.left, margins.top + headerHeight - 5,
        pageWidth - margins.right, margins.top + headerHeight - 5
      )

      // Paginated image slicing
      const imgWidthPx = canvas.width
      const imgHeightPx = canvas.height

      const pxPerMm = imgWidthPx / contentWidth

      const firstPageAvail = pageHeight - margins.top - headerHeight - margins.bottom
      const otherPageAvail = pageHeight - margins.top - margins.bottom

      const totalImgHeightMm = imgHeightPx / pxPerMm

      let remainingMm = totalImgHeightMm
      let sourceYPx = 0
      let pageNum = 0

      while (remainingMm > 0) {
        const availMm = pageNum === 0 ? firstPageAvail : otherPageAvail
        const sliceHeightMm = Math.min(remainingMm, availMm)
        const sliceHeightPx = sliceHeightMm * pxPerMm

        if (pageNum > 0) {
          pdf.addPage()
        }

        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = imgWidthPx
        sliceCanvas.height = Math.ceil(sliceHeightPx)
        const ctx = sliceCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, sourceYPx,
            imgWidthPx, Math.ceil(sliceHeightPx),
            0, 0,
            imgWidthPx, Math.ceil(sliceHeightPx)
          )
        }

        const sliceData = sliceCanvas.toDataURL('image/png')
        const yPos = pageNum === 0
          ? margins.top + headerHeight
          : margins.top

        pdf.addImage(
          sliceData, 'PNG',
          margins.left, yPos,
          contentWidth, sliceHeightMm
        )

        // Page number footer
        pdf.setFontSize(8)
        pdf.setTextColor(160, 160, 160)
        pdf.text(
          `Page ${pageNum + 1}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        )
        pdf.setTextColor(0, 0, 0)

        sourceYPx += sliceHeightPx
        remainingMm -= sliceHeightMm
        pageNum++
      }

      pdf.save(`NPD-Planner-Summary-${summary.year}.pdf`)
    } catch (error) {
      console.error('PDF export failed:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCSV = () => {
    if (!summary) return

    const csv = exportSummaryToCSV(summary)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `NPD-Planner-Summary-${summary.year}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  const availableYears = archives.map(a => a.year).sort((a, b) => b - a)

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Year:</label>
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          >
            {availableYears.length === 0 && <option value="">No archives</option>}
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {summary && (
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Export PDF
                </>
              )}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={16} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Report Content */}
      {!summary && availableYears.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-12 flex flex-col items-center justify-center text-center">
          <Archive size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No annual reports yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
            Reports are generated when tasks older than 12 months are archived.
            You can trigger archiving from Settings → Archive.
          </p>
        </div>
      ) : summary ? (
        <div ref={reportRef} className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Tasks"
              value={summary.totalTasks}
              subtitle="All boards"
              icon={<LayoutGrid size={20} className="text-green-500" />}
            />
            <StatCard
              title="Total Trips"
              value={summary.totalTrips}
              subtitle="Business trips"
              icon={<Briefcase size={20} className="text-blue-500" />}
            />
            <StatCard
              title="Total Vacations"
              value={summary.totalVacations}
              subtitle="Time off"
              icon={<Calendar size={20} className="text-pink-500" />}
            />
            <StatCard
              title="Completion Rate"
              value={`${(summary.completionRate * 100).toFixed(1)}%`}
              subtitle="Of all tasks"
              icon={<TrendingUp size={20} className="text-orange-500" />}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Board */}
            <ChartCard title="Tasks by Project" icon={<LayoutGrid size={16} />}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={Object.entries(summary.byBoard).map(([name, count]) => ({ name, count }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="name"
                  >
                    {Object.entries(summary.byBoard).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* By Month */}
            <ChartCard title="Tasks by Month" icon={<Calendar size={16} />}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart
                  data={summary.byMonth.map((count, i) => ({
                    month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
                    count
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#1D9E75"
                    strokeWidth={2}
                    dot={{ fill: '#1D9E75', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Top Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Clients */}
            <ChartCard title="Top Clients" icon={<Briefcase size={16} />}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {summary.topClients.map((client, i) => (
                  <div
                    key={client.clientId}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500 w-6">#{i + 1}</span>
                      <span className="text-sm text-gray-900 dark:text-white">{client.clientName}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {client.count} tasks
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Top Assignees */}
            <ChartCard title="Top Contributors" icon={<Users size={16} />}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {summary.topAssignees.map((assignee, i) => (
                  <div
                    key={assignee.uid}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-500 w-6">#{i + 1}</span>
                      <span className="text-sm text-gray-900 dark:text-white">{assignee.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {assignee.count} tasks
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-400">Select a year to view the report.</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────

interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  trend?: number
  icon?: React.ReactNode
}

function StatCard({ title, value, subtitle, trend, icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            {trend !== undefined && (
              <span className={`text-xs font-medium flex items-center ${
                trend > 0
                  ? 'text-green-600 dark:text-green-400'
                  : trend < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {trend > 0 ? (
                  <TrendingUp size={12} className="mr-0.5" />
                ) : trend < 0 ? (
                  <TrendingDown size={12} className="mr-0.5" />
                ) : null}
                {trend > 0 ? '+' : ''}{trend}%
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}

function ChartCard({ title, icon, children }: ChartCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
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
