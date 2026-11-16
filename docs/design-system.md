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

Authentication and settings extend the same materials rather than introducing an admin template. Setup and login use a focused central card. Settings use calm large navigation cards and a translucent side sheet. Account and user management preserve the established borders, radii, shadows, typography, focus rings, and touch targets. Forms remain single-column at phone width; user actions reflow from a quiet card list instead of a dense table.

The dashboard settings trigger is fixed in the upper-right visual margin. It does not participate in the dashboard grid, so the three top cards and the 1440 × 2560 kiosk allocation remain unchanged.

## Motion

Only functional transitions and a subtle loading-border breath are used. `prefers-reduced-motion` collapses animation durations. There are no spring effects, large scaling, flashing, or permanently moving backgrounds.

## Kiosk and responsive rules

At portrait viewports at least 900 px wide and 1500 px tall, only the dashboard route is fixed to one dynamic viewport. Five bounded grid bands allocate 16/42/18/14/10 percent of available space to top cards, calendar, meal plan, shared lists and information. There is no shopping-count exception. Agenda days have equal height; overflow is exposed through labelled day and full-list dialogs rather than clipped data. Playwright checks document dimensions, day equality, band separation and child containment at 1440 × 2560 and smaller/zoom-equivalent viewports.

At shorter desktop/tablet sizes the dashboard uses natural height and scrolling; top/media and info cards reflow to two columns. At phone widths all main regions stack. The primary kiosk remains the optimization target.

Agenda type, fixed date/time columns, and high-value titles are sized for reading from roughly two to four meters. Secondary metadata is visibly quieter but not essential to understanding the next event.

The meal-plan preview uses contain sizing with no cropping. Its full-screen image dialog supports 100–300% zoom and internal panning. New day, shopping and meal-plan dialogs share keyboard Escape handling, focus trapping/restoration and body scroll locking. File selection and replacement are available directly on the existing dashboard, including smartphone layouts.
