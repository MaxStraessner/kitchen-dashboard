import { useEffect, useRef, useState } from 'react'

/** Measures bounded previews; inline overflow labels do not consume event slots. */
export function usePreviewCapacity(
  total: number,
  rowHeight: number,
  fallback = 2,
  inlineOverflow = false,
) {
  const ref = useRef<HTMLDivElement>(null)
  const [capacity, setCapacity] = useState(fallback)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      if (node.clientHeight === 0) return
      const style = getComputedStyle(node)
      const columns =
        style.gridTemplateColumns === 'none'
          ? 1
          : Math.max(1, style.gridTemplateColumns.split(' ').length)
      const gap = Number.parseFloat(style.rowGap) || 0
      const height =
        node.clientHeight -
        (Number.parseFloat(style.paddingTop) || 0) -
        (Number.parseFloat(style.paddingBottom) || 0)
      const slots = (available: number) =>
        Math.max(0, Math.floor((available + gap) / (rowHeight + gap))) * columns
      const full = slots(height)
      setCapacity(inlineOverflow || total <= full ? full : slots(height - 44 - gap))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [total, rowHeight, inlineOverflow])
  return { ref, capacity }
}
