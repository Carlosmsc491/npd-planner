import { AlertTriangle, Clock } from 'lucide-react'

interface DeadlineWidgetProps {
  dueDate: string | null
  doneCount: number
  totalCount: number
  projectCreatedAt: Date
}

export default function DeadlineWidget({
  dueDate,
  doneCount,
  totalCount,
  projectCreatedAt,
}: DeadlineWidgetProps) {
  // Días transcurridos desde que se creó el proyecto
  const daysElapsed = Math.max(
    1,
    (Date.now() - projectCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  
  // Velocidad actual: recetas por día
  const velocity = doneCount / daysElapsed
  
  // Recetas pendientes
  const pending = totalCount - doneCount
  
  // Días necesarios al ritmo actual
  const daysNeeded = velocity > 0 ? Math.ceil(pending / velocity) : null
  const projectedEnd = daysNeeded
    ? new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000)
    : null
  
  // Días hasta el deadline
  const due = dueDate ? new Date(dueDate) : null
  const daysUntilDue = due
    ? Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  
  // Estado: on_track | at_risk | late | no_deadline
  const status = !due ? 'no_deadline'
    : daysUntilDue !== null && daysUntilDue < 0 ? 'late'
    : daysNeeded !== null && daysNeeded > (daysUntilDue ?? 0) ? 'at_risk'
    : 'on_track'
  
  // Si no hay deadline, solo mostrar velocidad
  if (status === 'no_deadline') {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Clock size={14} />
        <span>{velocity.toFixed(1)} recipes/day</span>
      </div>
    )
  }
  
  const statusConfig = {
    on_track: {
      textColor: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      icon: null,
      label: `${daysUntilDue} days left`,
    },
    at_risk: {
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      borderColor: 'border-amber-200 dark:border-amber-800',
      icon: <AlertTriangle size={14} className="shrink-0" />,
      label: `${daysUntilDue} days left`,
    },
    late: {
      textColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: <AlertTriangle size={14} className="shrink-0" />,
      label: 'Deadline passed',
    },
  }
  
  const config = statusConfig[status]
  
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border ${config.bgColor} ${config.borderColor} ${config.textColor}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {config.icon}
        <span>{config.label}</span>
      </div>
      {status !== 'late' && projectedEnd && (
        <p className="text-[10px] opacity-80">
          At current pace: done {projectedEnd.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </p>
      )}
      <p className="text-[10px] opacity-60">
        {velocity.toFixed(1)} recipes/day
      </p>
    </div>
  )
}
