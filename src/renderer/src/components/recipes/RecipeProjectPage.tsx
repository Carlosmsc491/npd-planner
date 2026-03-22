// src/renderer/src/components/recipes/RecipeProjectPage.tsx
// Placeholder — full implementation in Prompt 3

import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function RecipeProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Project not found
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/recipes')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back to Projects
      </button>

      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Loading project {projectId}…</span>
      </div>
    </div>
  )
}
