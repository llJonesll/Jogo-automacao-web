# Interaction Patterns — AETHERFORGE: Orbital Foundry

**Status:** Approved
**Rigor Tier:** Standard
**Last Updated:** 2026-11-17
**References:** [hud.md](./hud.md), [accessibility-requirements.md](../accessibility-requirements.md), [sound-bible.md](../audio/sound-bible.md)

This document defines reusable interaction patterns and WCAG 2.1 Level AA component contracts across all AETHERFORGE UI screens and overlays.

---

## 1. Button

- **Variants**:
  - `btn-primary`: Amber fill (`#d97706` / `#fbbf24` border, `#090d16` text, `>= 6.0:1` contrast) for primary progression/confirm actions.
  - `btn-accent`: High-contrast cyan-blue (`#0369a1`, `#ffffff` text, `>= 5.8:1` contrast) for active toggles and cargo/stamp actions.
  - `btn-secondary`: Slate (`#1e293b`, `#e2e8f0` text) for neutral secondary actions.
  - `btn-danger`: Crimson (`#991b1b`, `#ffffff` text) for destructive actions (Dismantle, New Seed).
  - `btn-ghost`: Translucent basalt for utility bar toggles.
- **States**: Default, Hover (border highlight; no forced `translateY` shift when `reduced-motion` is active), `:focus-visible` (`2px solid #38bdf8`, `2px` offset), Active/Pressed (`aria-pressed="true"` on toggles), Disabled (solid desaturated muted color `>= 4.5:1` contrast, `cursor: not-allowed`, no low-opacity drop).
- **Audio & Command**: Every interactive click routes through `HudActions` and emits `ui_tick` (or `ui_error` when blocked).

## 2. Toggle

- **Instances**: Alt-Mode (`Alt`), Power Overlay (`V`), Mute (`M`), Colorblind/High Contrast (`data-theme-cb`), Reduced Motion, Mono Audio.
- **Contract**: Uses `<button aria-pressed="true|false">` with clear text/icon state difference (never color-only border change). Persists visual/audio preferences to `localStorage`.

## 3. Slider (`<input type="range">`)

- **Instances**: Inspector Overclock (`50%`–`250%`, step `25%`), Studio Tweak Panel (`data/config.json` min/max/step), Audio Bus Volume sliders (`0%`–`100%`).
- **Contract**:
  - Paired `<label for="...">` displaying live formatted numeric readout and units (`MW`, `%`, `s`).
  - Supports keyboard `ArrowLeft`/`ArrowRight`/`Home`/`End` and `input` live updates without losing DOM identity during 250 ms HUD refreshes.
  - Overclock slider displays explicit lock reason (`Tier 4`) when disabled (`free_build === 0`).

## 4. Dropdown / Select (`<select>`)

- **Instances**: Inspector Recipe selector (`Auto` + building recipes).
- **Contract**:
  - Tech-gated recipes (e.g., `assemble_processor`, `assemble_quantum`) show disabled/locked indicators until prerequisite Tech unlocks (`free_build` bypasses).
  - Pressing `Esc` while focused inside a `<select>` blurs or closes cleanly without getting trapped in keyboard suppression.

## 5. Modal Dialog

- **Instances**: `tech`, `stats`, `blueprints`, `tweak`, `save`, `help`, `victory`.
- **Contract**:
  - Root dialog element carries `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the modal `<h2>`.
  - Opening saves `document.activeElement`, focuses the first interactive element inside the modal, traps `Tab`/`Shift+Tab` within modal bounds, blocks canvas world hotkeys behind the backdrop, and emits `ui_modal_open`.
  - Closing via `X` button, backdrop click, `Esc`, or Gamepad `B` restores focus to the invoker element and emits `ui_modal_close`.

## 6. Queued Toast Notification

- **Contract**:
  - Container uses `aria-live="polite"` (`role="alert"` on critical error banners).
  - Displays up to `3` non-overlapping banners stacked cleanly below the Topbar, queuing overflow FIFO (`3.2s` default duration, `4.5s` critical/milestone).
  - Never blocks pointer interaction with the world (`pointer-events: none` on non-interactive banners; `pointer-events: auto` only on interactive Skip/Dismiss buttons).

## 7. Tooltip & World Hover Readout

- **Contract**:
  - Hotbar buttons expose building name, description, and exact item cost in `title` / accessible label.
  - Hovering world terrain or buildings provides non-color mineral/status identification (e.g., ore type name + tile coordinates + status text) so colorblind players can verify ore veins effortlessly.

## 8. Hotbar Building Slot

- **Contract**:
  - Minimum width accommodates PT-BR 40% text expansion without mid-word `break-word` slicing (`overflow-wrap: normal`, `hyphens: none`).
  - Displays procedural building silhouette (`<img>` from `getBuildingIconDataUrl`), localized name, keycap badge (`1..9, 0`), and distinct visual badges for `locked` (lock glyph) and `unaffordable` (cost deficit border + indicator) at `>= 4.5:1` label contrast.

## 9. Inspector Drawer

- **Contract**:
  - Slides/opens on the right margin below the measured Topbar height whenever `selectedBuildingId !== null`.
  - `X` close button explicitly invokes `HudActions.onCloseInspector()`, clearing `selectedBuildingId = null`.
  - Buffers (`IN`, `OUT`, `Storage`, `MJ`), `geoBonus` (`+35%`), and `Rotate`/`Dismantle` actions remain keyboard and gamepad navigable.

## 10. Sound & Motion Standardization

- Zero direct `SoundEngine.play*` calls inside UI widgets: UI interactions emit `AudioEventId` via `HudActions`.
- All CSS hover/toast/modal transitions obey `@media (prefers-reduced-motion: reduce)` and `:root[data-reduced-motion="true"]` (setting transition/animation durations to `0.01ms` and suppressing positional hops).
