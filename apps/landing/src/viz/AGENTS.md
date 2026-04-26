# Viz pages — style + interaction guide

Each `/viz/<topic>` page is a single-pane scrollable narrative explaining one piece of Codebreaker research. Treat them as research notebooks rendered for the web: confident headers, real data, light interaction, no hype.

## Routing & file layout

- Path-based router lives in `apps/landing/src/router.tsx`. Add a new route by appending an `if (path === ...)` branch.
- Each viz lives at `apps/landing/src/viz/<topic>/`:
  - `page.tsx` — top-level page, sets `document.body.dataset.page = "viz-<topic>"`, sets `document.title`, renders `<Header />` + `<main>` + `<Footer />`.
  - `data.ts` — all numbers, labels, examples. Keep illustrative vs. real data clearly commented.
  - `sections/*.tsx` — one file per narrative section, default-exported as `<TopicSection />`.
- Shared building blocks live in `apps/landing/src/viz/components/` and are reused across vizzes:
  - `Reveal` — scroll-triggered fade/slide-up wrapper. Accepts `delayMs`.
  - `useInView<T>(threshold?)` — hook returning `{ ref, inView }`, fires once.
  - `AnimatedBar` — horizontal bar that grows from 0 → `pct` when in view; props: `pct`, `accent`, `track`, `height`, `durationMs`, `delayMs`.
  - `AnimatedNumber` — count-up number on first viewport entry; props: `value`, `durationMs`, `format`.

## Tokens & palette

CSS variables in `apps/landing/src/styles.css`:

- `--bg` (`14 50 138`) — page background.
- `--bg-deep` (`8 28 82`) — footer / deep wells.
- `--bg-surface` (`22 64 158`) — lighter surface tone if you need elevation.
- `--ink` (`244 248 255`) — body text.

Tailwind exposes these as `bg-bg`, `bg-bg-deep`, `bg-bg-surface`, `text-ink`. Always run text on the dark blue background.

## Typography

- Sans (default body, headings): `var(--font-sans)` — Inter stack.
- Mono (numbers, identifiers, code): `var(--font-mono)` — JetBrains Mono stack. Use `tabular-nums` whenever rendering numbers in a row/column to keep digits aligned.
- Headlines: `font-semibold text-3xl md:text-5xl tracking-tight leading-[1.15] text-balance`.
- Eyebrow labels: `text-[11px] uppercase tracking-[0.16em] text-white/65`.
- Body copy: `text-sm md:text-base text-white/80 leading-relaxed` (or `/85` for primary copy).

## Contrast scale (white-on-blue)

Use these opacity stops only:

- Primary text: `text-white` or `text-white/85`.
- Secondary: `text-white/80`.
- Tertiary / captions: `text-white/65–75`.
- Disabled / placeholder: `text-white/55`.
- Borders: `border-white/15` default, `border-white/25–30` on hover, `border-white/45` for active focal items.
- Card surface: `bg-white/[0.04]` default, `bg-white/[0.06]` on hover, `bg-white/[0.08]` for active.
- Code wells / inset surfaces: `bg-black/30` to `bg-black/40`.

## Layout

- Page width: `max-w-7xl mx-auto px-6 md:px-12`.
- Section padding: `py-24 md:py-32`, divided by `border-white/15 border-t`.
- Section structure:
  1. `SectionLabel` (eyebrow with mono index `01–07` + 1-px hairline + title).
  2. Headline `<h2>`.
  3. Headlines cap at `max-w-5xl`; lede `<p>` caps at `max-w-4xl`.
  4. Visual.
  5. Optional supporting cards/grid.
- Wrap every direct child of a section's content in `<Reveal delayMs={...}>` with delays staggered ~60–120 ms.

## Wrapping & responsiveness

- Every flex/grid card that contains long text or tabular content needs `min-w-0`. Add `truncate` or `break-words` on labels that could exceed their column.
- Tables wider than ~640 px get an `overflow-x-auto` outer wrapper with a `min-w-[…]` inner shell.
- Number-heavy headings use fluid sizing: `text-3xl md:text-4xl` or `text-2xl sm:text-3xl`. Always include `break-words` on mono numbers that may include long values.

## Animation library

- Scroll-triggered fade/slide: wrap in `<Reveal>`.
- Numeric count-up: `<AnimatedNumber value={n} />`.
- Bars (any horizontal progress): `<AnimatedBar pct={…} accent="rgb(244, 248, 255)" delayMs={i * 60} />`. Stagger delays in lists.
- SVG line-draw: animate `stroke-dashoffset` from path length → 0 over 1.2–1.6 s.
- Stacked bar reveal: animate each segment's `width` from 0 → target with sequential delays (~120 ms each).
- Flowing dashes on diagram edges: CSS `@keyframes flow-dash` with `stroke-dasharray: 6 6` and `animation: flow-dash 1.4s linear infinite` — only when `inView` is true.
- Step transitions: re-key the panel (`key={step}`) and apply `@keyframes step-fade-in` (380 ms) for a soft fade-up.
- Auto-advancing walkthroughs:
  - Tick with `setInterval` keyed only on `[playing]`.
  - Render a thin progress bar inside the active rail item using `@keyframes step-progress` over the same duration; re-key on step change so it restarts.
  - `playing = autoplay && inView && !hovered`.
  - Pause on hover via `addEventListener` on a ref (avoids `noStaticElementInteractions` lint).
  - Stop autoplay permanently on any manual interaction (rail click, prev/next).

## SVG gotchas

- Applying CSS `transform` to an SVG `<g>` element overrides the SVG `transform="translate(x, y)"` attribute in WebKit/Blink. To animate SVG groups, only animate `opacity` and stagger via `transition-delay`. Do not combine CSS `transform` with the SVG attribute on the same element.

## Interaction polish defaults

- Card hover: `transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.06]`.
- Table row hover: `transition-colors duration-200 hover:bg-white/[0.05]`.
- Highlight focal rows (e.g., "ours") with `ring-1 ring-white/20 ring-inset` plus a stronger bg.
- Marquees pause on hover: wrap in `group/lane` and toggle via `[animation-play-state:paused]` on `group-hover/lane`.
- Bars/rows that show counts: reveal the percentage on hover (`opacity-0 group-hover/row:opacity-100`) and add a `title=` attribute so the data is keyboard-accessible.
- Buttons:
  - Primary: `rounded-full bg-white px-4 py-2 font-medium text-[rgb(var(--bg-deep))] text-sm hover:bg-white/90 disabled:opacity-30`.
  - Secondary: `rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/45 hover:bg-white/[0.04] hover:text-white disabled:opacity-30`.

## Code voice

- Lower-case eyebrow labels with `uppercase tracking-[0.16em]` styling — let the CSS do the casing.
- Use `·` as a separator in metadata, never `|`. Use `→` for transitions, `←` for back actions, `Δ` for deltas.
- Mono spans for: file paths, identifiers, SHAs, GHSA IDs, numeric formulas. Highlight the meaningful part with `text-white`, leave the surrounding context at `text-white/85`.
- No emojis. No exclamation marks in prose. State the result, then the why.

## Lint hygiene

- `pnpm dlx ultracite fix apps/landing/src` before assuming you're done.
- Avoid the standard traps:
  - Top-level `RegExp` literals (`useTopLevelRegex`).
  - Stable composite keys for arrays that include duplicates (marquees, diff lines).
  - No nested ternaries — extract to `if/else if/else`.
  - Template literals over `+` concatenation.
  - `min-w-0` on flex/grid items before adding `truncate`/`break-words`.
- TypeScript: typecheck via `pnpm --filter @codebreaker/landing tsc --noEmit`.
