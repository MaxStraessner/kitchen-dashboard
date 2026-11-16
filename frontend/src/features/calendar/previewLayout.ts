export const agendaDensities = [
  { density: 'normal', fontSize: 17, rowHeight: 26, minColumnWidth: 250 },
  { density: 'compact', fontSize: 16, rowHeight: 24, minColumnWidth: 220 },
  { density: 'dense', fontSize: 14, rowHeight: 20, minColumnWidth: 190 },
] as const

export interface AgendaPreviewLayout {
  density: (typeof agendaDensities)[number]['density']
  fontSize: number
  rowHeight: number
  minColumnWidth: number
  columns: number
  capacity: number
}

/** Prefer the largest type that fits every event; otherwise expose the densest preview. */
export function calculateAgendaLayout(
  total: number,
  width: number,
  height: number,
  gap = 12,
): AgendaPreviewLayout {
  let fallback: AgendaPreviewLayout = { ...agendaDensities[2], columns: 1, capacity: 0 }
  for (const tier of agendaDensities) {
    const columns = Math.max(
      1,
      Math.floor((Math.max(0, width) + gap) / (tier.minColumnWidth + gap)),
    )
    const layout = {
      ...tier,
      columns,
      capacity: columns * Math.max(0, Math.floor(Math.max(0, height) / tier.rowHeight)),
    }
    if (total <= layout.capacity) return layout
    fallback = layout
  }
  return fallback
}
