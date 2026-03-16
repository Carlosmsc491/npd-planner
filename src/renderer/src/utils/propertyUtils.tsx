// Property utilities — types, icons, and dynamic icon renderer
import * as LucideIcons from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { PropertyType } from '../types'

type LucideProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number; className?: string }
type LucideIconType = ComponentType<LucideProps>

export function DynamicIcon({ name, size = 14, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (LucideIcons as Record<string, unknown>)[name] as LucideIconType | undefined
  if (!Icon) return <span style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }} />
  return <Icon size={size} className={className} />
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text:        'Text',
  number:      'Number',
  select:      'Select',
  multiselect: 'Multi-select',
  date:        'Date',
  daterange:   'Date Range',
  person:      'Person',
  checkbox:    'Checkbox',
  url:         'URL',
  attachment:  'Attachment',
  tags:        'Tags',
  email:       'Email',
  phone:       'Phone',
}

export const DEFAULT_ICONS: Record<PropertyType, string> = {
  text:        'Type',
  number:      'Hash',
  select:      'ChevronDown',
  multiselect: 'Tags',
  date:        'Calendar',
  daterange:   'CalendarRange',
  person:      'User',
  checkbox:    'CheckSquare',
  url:         'Link',
  attachment:  'Paperclip',
  tags:        'Tags',
  email:       'Mail',
  phone:       'Phone',
}

export const ICON_CATEGORIES: { label: string; icons: string[] }[] = [
  { label: 'General',    icons: ['Hash', 'Type', 'AlignLeft', 'FileText', 'Link', 'Mail', 'Phone', 'Globe'] },
  { label: 'People',     icons: ['User', 'Users', 'UserCircle', 'Contact', 'Building'] },
  { label: 'Date & Time',icons: ['Calendar', 'Clock', 'Timer', 'CalendarDays', 'CalendarRange'] },
  { label: 'Files',      icons: ['Paperclip', 'File', 'FileImage', 'FolderOpen', 'Download'] },
  { label: 'Location',   icons: ['MapPin', 'Map', 'Navigation', 'Plane', 'Car', 'Ship', 'Building2'] },
  { label: 'Business',   icons: ['DollarSign', 'CreditCard', 'Receipt', 'Package', 'Truck', 'Tag', 'Tags', 'Barcode'] },
  { label: 'Status',     icons: ['CheckCircle', 'Circle', 'AlertCircle', 'XCircle', 'Star', 'Flag', 'Bookmark'] },
  { label: 'Numbers',    icons: ['Hash', 'Percent', 'Calculator', 'TrendingUp', 'BarChart2'] },
  { label: 'Selects',    icons: ['ChevronDown', 'List', 'ListFilter', 'ToggleLeft', 'CheckSquare'] },
]

export const ALL_ICONS = [...new Set(ICON_CATEGORIES.flatMap((c) => c.icons))]

export const OPTION_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
]
