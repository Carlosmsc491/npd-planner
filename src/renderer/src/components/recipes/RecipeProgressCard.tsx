// src/renderer/src/components/recipes/RecipeProgressCard.tsx

interface Props {
  label: string
  count: number
  color: string          // Tailwind text color class
  bgColor: string        // Tailwind bg color class
}

export default function RecipeProgressCard({ label, count, color, bgColor }: Props) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 flex flex-col gap-1`}>
      <span className={`text-2xl font-bold ${color}`}>{count}</span>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${bgColor}`} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
    </div>
  )
}
