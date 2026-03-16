import { useParams } from 'react-router-dom'
import AppLayout from '../components/ui/AppLayout'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  return (
    <AppLayout>
      <div className="p-6">
        <p className="text-gray-400 text-sm">Board ID: {boardId}</p>
      </div>
    </AppLayout>
  )
}
