// src/components/analytics/AnalyticsTabs.tsx
// Tab navigation wrapper for Analytics page

import type { ReactNode } from 'react'

export type AnalyticsTabType = 'current' | 'historical' | 'annual'

interface AnalyticsTabsProps {
  activeTab: AnalyticsTabType
  onTabChange: (tab: AnalyticsTabType) => void
  children: ReactNode
}

export default function AnalyticsTabs({ activeTab, onTabChange, children }: AnalyticsTabsProps) {
  const tabs: { id: AnalyticsTabType; label: string }[] = [
    { id: 'current', label: 'Current' },
    { id: 'historical', label: 'Historical' },
    { id: 'annual', label: 'Annual Report' },
  ]

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{children}</div>
    </div>
  )
}
