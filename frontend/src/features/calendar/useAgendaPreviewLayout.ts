import { useEffect, useRef, useState } from 'react'

import { agendaDensities, calculateAgendaLayout, type AgendaPreviewLayout } from './previewLayout'

export function useAgendaPreviewLayout(total: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<AgendaPreviewLayout>({
    ...agendaDensities[0],
    columns: 1,
    capacity: 2,
  })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      if (rect.height <= 0 || rect.width <= 0) return
      const style = getComputedStyle(node)
      const pixels = (value: string) => Number.parseFloat(value) || 0
      const width =
        rect.width -
        pixels(style.paddingLeft) -
        pixels(style.paddingRight) -
        pixels(style.borderLeftWidth) -
        pixels(style.borderRightWidth)
      const height =
        rect.height -
        pixels(style.paddingTop) -
        pixels(style.paddingBottom) -
        pixels(style.borderTopWidth) -
        pixels(style.borderBottomWidth)
      const next = calculateAgendaLayout(total, width, height, pixels(style.columnGap))
      setLayout((current) =>
        current.density === next.density &&
        current.columns === next.columns &&
        current.capacity === next.capacity
          ? current
          : next,
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [total])
  return { ref, layout }
}
