# Design system

## Direction

The interface aims for a quiet, native-quality family surface rather than a SaaS or smart-home control panel. It uses layered near-black materials, restrained translucency, thin light borders, large radii, soft depth, and a small number of semantic accents. The calendar is visually dominant and individual appointments are rows, not colorful cards.

## Tokens

All foundational values live in `frontend/src/styles/tokens.css`:

- Background: `#080c11` with subtle blue/green ambient fields
- Cards: dark translucent surfaces around `rgba(20, 27, 36, .82)`
- Primary text: `#f5f7fa`; secondary and tertiary levels are deliberately quieter
- Accents: green for family/current state, blue/violet/amber/rose for source and information cues
- Large cards: 34 px; smaller cards: 25 px; controls: 16 px
- Spacing: a named 6–48 px scale plus viewport-aware clamps
- Shadow: broad low-opacity depth and a faint inset highlight
- Transitions: 180–230 ms ease

## Typography

The licensed stack is `Inter Variable`, `Inter`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`. No Apple font files are bundled. The clock uses weight 300; supporting content 400; event/list content 500; section headings 600. Sizes use `clamp()` for consistent reading distance and window scaling.

## Components

Cards share material, border, radius, and shadow primitives. Eyebrows provide small context labels. Status pills are secondary and never displace content. Interactive preparations use visible focus rings; disabled future controls remain legible but cannot open broken views.

Lucide icons use consistent fine strokes and only reinforce key concepts. The media cover is an original local SVG with no external rights or network dependency.

## Motion

Only functional transitions and a subtle loading-border breath are used. `prefers-reduced-motion` collapses animation durations. There are no spring effects, large scaling, flashing, or permanently moving backgrounds.

## Kiosk and responsive rules

At viewports at least 900 px wide and 1800 px tall, the root is fixed to exactly one viewport and cannot scroll. The four dashboard bands are sized by a constrained grid, and card internals clip only controlled surplus such as far-future agenda events. Playwright checks document dimensions, visibility, band separation, and the calendar-to-header height ratio at exactly 1440 × 2560.

At shorter desktop/tablet sizes the dashboard uses natural height and scrolling; top/media and info cards reflow to two columns. At phone widths all main regions stack. The primary kiosk remains the optimization target.

Agenda type, fixed date/time columns, and high-value titles are sized for reading from roughly two to four meters. Secondary metadata is visibly quieter but not essential to understanding the next event.

