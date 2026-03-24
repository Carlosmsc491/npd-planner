import { useRef, useEffect, useCallback } from 'react'

/**
 * Enables click-and-drag horizontal scrolling on a container.
 * Only activates when the user clicks on empty space (background),
 * not on interactive children (buttons, cards, inputs, links).
 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  const isInteractiveElement = useCallback((el: HTMLElement): boolean => {
    // Walk up from target to container — if we hit an interactive element, don't drag
    let current: HTMLElement | null = el
    const container = ref.current
    while (current && current !== container) {
      const tag = current.tagName.toLowerCase()
      if (
        tag === 'button' || tag === 'a' || tag === 'input' ||
        tag === 'textarea' || tag === 'select' ||
        current.getAttribute('role') === 'button' ||
        current.draggable ||
        current.dataset.noDragScroll !== undefined
      ) {
        return true
      }
      current = current.parentElement
    }
    return false
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      // Only left-click
      if (e.button !== 0) return
      // Don't activate if clicking on an interactive element
      if (isInteractiveElement(e.target as HTMLElement)) return

      isDragging.current = true
      startX.current = e.pageX - el.offsetLeft
      scrollLeft.current = el.scrollLeft
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX.current) * 1.5  // scroll speed multiplier
      el.scrollLeft = scrollLeft.current - walk
    }

    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isInteractiveElement])

  return ref
}
