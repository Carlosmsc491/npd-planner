import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

type SheetState = 'peek' | 'half' | 'full'

const ORDER: SheetState[] = ['peek', 'half', 'full']
const HEIGHTS: Record<SheetState, string> = {
  peek: '16vh',
  half: '48vh',
  full: '88vh',
}
const DRAG_SNAP_THRESHOLD_PX = 40

interface BottomSheetProps {
  children: ReactNode
  initial?: SheetState
}

/**
 * Draggable bottom sheet for the phone-sized Field Check map view (task B) —
 * a phone screen has no room for a sidebar, so the store list slides up from
 * the bottom over the map instead. Drag the handle up/down to snap between
 * peek / half / full; a firm flick past the threshold moves one step.
 */
export default function BottomSheet({ children, initial = 'half' }: BottomSheetProps) {
  const [state, setState] = useState<SheetState>(initial)
  const [dragOffset, setDragOffset] = useState(0)
  const dragStartY = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  function onHandlePointerDown(e: PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragStartY.current == null) return
    setDragOffset(e.clientY - dragStartY.current)
  }

  function onHandlePointerUp() {
    if (dragStartY.current == null) return
    const idx = ORDER.indexOf(state)
    let nextIdx = idx
    if (dragOffset > DRAG_SNAP_THRESHOLD_PX) nextIdx = Math.max(0, idx - 1)
    else if (dragOffset < -DRAG_SNAP_THRESHOLD_PX) nextIdx = Math.min(ORDER.length - 1, idx + 1)
    setState(ORDER[nextIdx])
    setDragOffset(0)
    dragStartY.current = null
    setDragging(false)
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] safe-bottom"
      style={{
        height: HEIGHTS[state],
        transition: dragging ? 'none' : 'height 200ms ease-out',
        transform: dragging && dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
      }}
    >
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        className="flex shrink-0 touch-none justify-center py-2.5"
      >
        <div className="h-1.5 w-12 rounded-full bg-gray-300" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  )
}
