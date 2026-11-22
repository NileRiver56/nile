# NileLink Design System ("Hairline Grid")

## 1. Visual Philosophy
NileLink uses an editorial **Hairline Grid** system: modular rectangular cells separated by `1px` borders (`--line`) over a neutral canvas (`--ink`), zero heavy drop shadows, corner radii strictly `0–4px`, condensed uppercase display typography in English (`Barlow Condensed`), native Arabic typography (`IBM Plex Sans Arabic`) with zero letter-spacing, a signature `24px` ember dash under section headings, and circular stamp badges.

---

## 2. Color Tokens (Dark Default + Light Mode)

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `--ink` | `#17181B` | `#F3EFE8` | Page background canvas |
| `--graphite` | `#222428` | `#FFFFFF` | Grid cells & surface panels |
| `--line` | `#3A3D44` | `#D9D4CB` | `1px` hairline dividers |
| `--bone` | `#F3EFE8` | `#17181B` | Primary typography |
| `--muted` | `#A9ABB2` | `#5B5E66` | Secondary labels & metadata |
| `--ember` | `#FF5A44` | `#E8452F` | Primary CTA, active rings, heading dash |
| `--ember-fg` | `#17181B` | `#17181B` | High-contrast CTA foreground (`>= 4.5:1`) |
| `--cedar` | `#2FBF8F` | `#1E9A72` | Verified seller, in stock, delivered |
| `--gold` | `#E8B84A` | `#B8860B` | Ratings & curated deals |
| `--sand` | `#D9C3A5` | `#8A6F4B` | Fashion department tint |
| `--cyan` | `#4DD4E6` | `#0E8FA3` | Electronics & Mobiles department tint |
| `--sage` | `#9BC995` | `#4F7F4A` | Home Gadgets department tint |

### WCAG 2.2 AA Contrast Guarantees
- Primary bone text on graphite: `13.7:1` (dark) / `15.8:1` (light).
- Muted metadata text on graphite: `6.7:1` (dark) / `6.4:1` (light).
- Primary CTA foreground (`#17181B`) on `--ember`: `5.81:1` (dark) / `4.56:1` (light).
- Status indicators never rely on hue alone; every status pairs color with an icon or explicit text label.

---

## 3. Typography & Arabic-First RTL Rules
- **English Display**: `Barlow Condensed` (600, 700), uppercase, `letter-spacing: 0.08em`, `text-wrap: balance`.
- **English Body**: `Barlow` (400, 500, 600), `15px–16px`, `line-height: 1.55`.
- **Arabic Display & Body**: `IBM Plex Sans Arabic` (400, 500, 600, 700), **zero letter-spacing** (`letter-spacing: 0` when `[dir="rtl"]` is set so connected Arabic glyphs remain crisp), `line-height: 1.65`.
- **Tabular Figures**: `IBM Plex Mono` with `font-variant-numeric: tabular-nums` for USD/LBP prices, commission percentages, ledger entries, and order IDs.
- All fonts are self-hosted via `@fontsource` with `font-display: swap`.

---

## 4. Spacing Scale (4px / 8px)
- `4px` (`1`): tight inline icon/label gap
- `8px` (`2`): hairline cell micro-padding / meta separator
- `16px` (`4`): minimum cell padding (`p-4`)
- `24px` (`6`): standard desktop bento cell padding (`p-6`)
- `32px` (`8`): section vertical rhythm & feature split padding

---

## 5. Motion Rules
- **Compositor-only**: Only animate `transform` and `opacity` (never `width`, `height`, or `margin`).
- **Routine micro-interactions**: `<= 200ms`, easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Cell reveal**: `420ms` fade + `12px` upward translation with `60ms` stagger.
- **Underline & heading dash**: directional `scaleX`, originating from `left` in LTR and `right` in RTL.
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` collapses animation and transition durations to `0.01ms`.

---

## 6. Approved Seller Storefront Themes
Sellers select from 4 pre-audited themes (`obsidian-ember`, `sand-atelier`, `cyan-lab`, `sage-studio`) instead of arbitrary hex inputs, guaranteeing WCAG AA contrast across dark and light modes.
