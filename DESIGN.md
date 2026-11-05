# Justice Leagues — Design Ground Rules

This is the contract for every screen and component in this repo. If a change
violates a rule here, the change is wrong — not the rule. Update this file
deliberately, never silently.

---

## 1. The original brief (verbatim)

> Build me Justice Leagues: A civic-tech app where users form or join local
> "Leagues" dedicated to specific causes (e.g., a "Neighborhood Watch League,"
> or a "Climate Action League"). Each League has its own dashboard for
> coordinating volunteer shifts, sharing resources, and tracking collective
> impact. Leagues earn "Justice Points" for completed projects and a global
> leaderboard highlighting the most effective community coalitions. I want you
> to build the UI for the main page now, clean UI. Editorial, newspaper style UI.
>
> I want you to use visuals whenever you can instead of text, avoid clutter,
> design language must be clean. If you can replace a textual element with some
> form of visual, do that. Neat animations. You don't need to display all the
> info right away either: some data can be neatly tuked under hover states,
> only visible when needed. Have as much colour as you need, must still resemble
> a newspaper while remaining very much usable.
>
> Make this with really good UI. Focus on frontend UI only. Any feature
> additions are welcome!

---

## 2. What that means in practice

### Editorial first, product second

It should read like a printed daily that happens to be interactive — not a
SaaS dashboard wearing a serif font. Masthead, dateline, rules, columns,
kickers, captions, folios. Chrome is print chrome: 1–5px black rules, not
rounded cards and drop shadows.

### Visual before verbal

Before writing a label, ask what could carry the meaning instead:

| Instead of…       | Use…                            |
| ----------------- | ------------------------------- |
| "1,284 members"   | avatar stack + count, or a ring |
| "14% growth"      | sparkline or arrow + delta      |
| "128 spots open"  | dot matrix / capacity bar       |
| "Climate league"  | cause emblem + colour           |
| "3,000 meals"     | pictogram row / unit glyph      |
| "This is a shift" | ticket with perforated stub     |

Text is the caption, not the interface. Short headlines, datelines, units.
Never a paragraph where a glyph, chart, or photo will do.

### Progressive disclosure

Primary information is visible at rest. Secondary data lives one gesture away:
hover, focus, tap, or an expand row. The pattern already used here:

- `.expand` / `.expand-host` — CSS grid-rows reveal (Standings, Dispatch)
- slide-up photo captions (Front)
- hover stat labels (LeadStat)
- drawer for the full league dossier

**Production rule:** anything revealed on hover must also be revealed on
keyboard focus and on tap. Hover-only data is inaccessible and fails review.
Use `data-open="true"` (already wired in `.expand`) or a click toggle.

### Colour is information

Cause owns colour. Same cause = same colour everywhere (emblem, chart, map pin,
ticket stub, leaderboard bar). Accent colours (vermilion, mustard) are
editorial emphasis, not brand decoration. No gradients-as-decoration, no glows,
no glassmorphism, no purple AI gradients.

### Motion is paper physics

Short, eased, physical: stamp, pop, rise, slide, grow. 200–700ms typical.
Nothing loops forever except a deliberate live indicator, and nothing moves
under the reader's eye while they read. Always honour
`prefers-reduced-motion` (already global in `index.css`).

### Clean means air, not emptiness

Generous margins, strong rules, clear hierarchy, 12-column thinking. Air is
part of the composition. Do not fill whitespace with badges, chips, or copy.

### Usable beats clever

Every flourish must survive: keyboard, touch, 320px width, 200% zoom, slow 3G,
and a screen reader.

---

## 3. Tokens

Defined in `src/index.css` under `@theme`. Never hard-code these values.

**Paper / ink**

| Token     | Value     | Use                                 |
| --------- | --------- | ----------------------------------- |
| `paper`   | `#f4eee1` | page                                |
| `paper-2` | `#ebe2cd` | wells, hovers                       |
| `paper-3` | `#ddd1b5` | rules, empty states                 |
| `ink`     | `#14110d` | type, borders                       |
| `ink-2`   | `#4a4338` | secondary                           |
| `ink-3`   | `#605747` | tertiary / captions (AA on paper-3) |

**Editorial accents**

| Token       | Value     | Use                                |
| ----------- | --------- | ---------------------------------- |
| `vermilion` | `#b82d19` | breaking, live, energy (AA text)   |
| `cobalt`    | `#2347c5` | safety / civic                     |
| `mustard`   | `#f2b705` | points, medals, highlights         |
| `forest`    | `#14694d` | climate / positive delta (AA text) |
| `rose`      | `#e0607e` | housing                            |
| `violet`    | `#7a3fb0` | learning                           |
| `teal`      | `#0f8b9d` | health                             |

Cause colours live in `CAUSES` (`src/data.ts`) and must match the palette above.
`onColor(background)` picks paper or ink for type and icons on a cause fill.

**Type**

- Display: `Playfair Display` — headlines, numerals, italic emphasis.
- Text: `Source Serif 4` — body.
- UI: `Libre Franklin` — buttons, labels, kickers.
- Data: `IBM Plex Mono` — numbers, times, metadata, scales.

Rules: display headlines are tight (`leading-[0.95]`, negative tracking);
kickers are 10px / 800 / 0.2em / uppercase; metrics are always `tabular-nums`.

**Surface**

- Border: 2px solid ink for components, 1px for internal rules, 4–5px for
  section breaks.
- Shadow: hard offset only — `3px 3px 0 ink` (rest), `5px 5px 0 ink` (hover).
- Radius: full pills for actions/filters; square for editorial containers.
- Photo: halftone/engraved at rest (grayscale + dot screen), full colour on
  hover. One consistent treatment.

---

## 4. Component checklist

Every new component must pass all of these before review.

- [ ] Semantic element first (`article`, `section`, `nav`, `button`, `ol`).
- [ ] Keyboard reachable; visible focus (`:focus-visible`), logical tab order.
- [ ] Hover-only content also available on focus and tap.
- [ ] `aria-pressed` / `aria-expanded` / `aria-label` where state is visual.
- [ ] Contrast ≥ 4.5:1 for text, ≥ 3:1 for large text and UI edges.
- [ ] Type on a cause colour uses `onColor()`; never assume paper reads on mustard.
- [ ] Colour never the only signal — pair with icon, shape, or label.
- [ ] Contact details for a young neighbour never render; use `handleLabel()`.
- [ ] Images have `alt`; decorative SVG is `aria-hidden`.
- [ ] Fixed aspect ratios; no layout shift; lazy images below the fold.
- [ ] Numbers use `tabular-nums` and `toLocaleString`.
- [ ] Empty, loading, and error states designed — not afterthoughts.
- [ ] Works at 320px, 768px, 1440px, and 200% zoom.
- [ ] Reduced motion respected.
- [ ] No horizontal scroll except intentional, scrollbar-hidden strips.

---

## 5. Reusable patterns

| Pattern             | Source                     | Notes                                   |
| ------------------- | -------------------------- | --------------------------------------- |
| Masthead / dateline | `Masthead.tsx`             | date left, volume right, thick rule     |
| Section head        | `lib.tsx → SectionHead`    | double rule, kicker, italic title       |
| Cause emblem        | `lib.tsx → Emblem`         | roundel default; shield / hex variants  |
| Halftone photo      | `lib.tsx → Photo`          | hover colour reveal                     |
| Count-up            | `lib.tsx → CountUp`        | in-view triggered, `tabular-nums`       |
| Sparkline           | `lib.tsx → Sparkline`      | draw-on-play, no axes                   |
| Reveal              | `lib.tsx → Reveal`         | in-view fade/rise, once                 |
| Expand row          | `.expand` + `[data-open]`  | grid-rows, no JS height math            |
| Ticket stub         | `Dispatch.tsx`             | perforated edge + cause colour          |
| Chip filter         | `Masthead.tsx → NavChip`   | icon collapsed, label on hover/active   |
| Hard-shadow button  | `.btn-press`               | press-down physics                      |
| Drawer              | `Drawer.tsx`               | right sheet, ESC + backdrop close       |
| Toast               | `ctx.tsx`                  | bottom-centre, single at a time         |
| Inbox row           | `Inbox.tsx`                | kind icon, unread dot, destination link |
| Report dialog       | `ReportButton.tsx`         | modal, ESC close, focus returns to flag |
| Desk tabs           | `Admin.tsx`                | URL-synced, `aria-pressed`, one panel   |
| Policy page         | `Privacy.tsx`, `Terms.tsx` | plain-language sections, data controls  |

When adding a pattern, add it here and give it one home. No copy-paste variants.

---

## 6. Anti-patterns (do not ship)

- Auto-scrolling marquees / tickers of any kind. **Removed deliberately.**
- Carousels that move on their own.
- Icon-only controls without a tooltip, label, or `aria-label`.
- Hover menus that cannot be opened by touch or keyboard.
- Text inside a chart that could be a label outside it.
- More than two typefaces in one component (display + UI is plenty).
- Decorative motion that loops forever.
- Colour-only status (red/green dots without icon or word).
- Modal on modal; drawer inside drawer.
- Infinite scroll on editorial content — paginate.
- Emoji as interface iconography.
- Placeholder copy in a shipped surface.

---

## 7. Voice

Lowercase-calm, local, specific. Newspaper, not NGO.

- Headline: active verb, concrete number, place. "Marrow Street packs 3,000
  meals for winter pantry shelves."
- Kicker: 1–3 words, uppercase. "Fresh wins", "The Dispatch".
- Unit always attached: `14.2t`, `2h`, `1.2 km`, `+480 JP`.
- Say neighbour, league, shift, steward — not user, organization, event, admin.
- No exclamation marks. No "empower", "leverage", "journey", "impactful".

---

## 8. Review gate

A PR touching UI is not done until:

1. It passes the component checklist.
2. It uses tokens, not raw hex.
3. It has a loading, empty, and error state.
4. It has been looked at at 320px and with keyboard only.
5. It has been screenshotted at 1440px and attached to the PR.
