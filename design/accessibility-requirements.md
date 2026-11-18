# Accessibility Requirements — AETHERFORGE: Orbital Foundry

**Status:** Approved
**Target Accessibility Tier:** Standard (WCAG 2.1 Level AA)
**Last Updated:** 2026-11-17
**Owner:** UX & Accessibility Architecture (`src/ui/`, `src/input/`, `src/render/`, `src/audio/`, `src/style.css`)

---

## 1. Accessibility Tier Definition

AETHERFORGE commits to the **Standard Tier (WCAG 2.1 Level AA)** across all Web target viewports (`1024x600` to `3840x2160`). Every core gameplay loop—mining, conveyor routing, machine inspection, overclocking, tech unlocks, orbital launches, blueprint sharing, config tuning, and save management—must remain fully operable across Visual, Motor, Cognitive, and Auditory profiles without relying on color alone, audio alone, or mouse-only input.

---

## 2. Visual Accessibility

| Requirement | Standard / Target | Implementation Specification |
|---|---|---|
| Text Contrast Ratio | `>= 4.5:1` normal text, `>= 3.0:1` large text (`>= 18px` / `14px` bold) | Dark basalt surfaces (`#090d16` / `#0f172a`) paired with `#e2e8f0` text (`> 13:1`). Accent buttons use `#0369a1` with `#ffffff` (`> 5.8:1`). Locked/unaffordable slots avoid sub-4.5:1 low opacity (`opacity: 0.35` banned) and instead use solid muted slate/crimson styles with explicit lock/cost icons. |
| Non-Text UI Contrast | `>= 3.0:1` interactive borders, focus rings, icons | `:focus-visible` outlines use `>= 2px` solid `#38bdf8` / `#fbbf24` with `2px` offset. Active selections combine border highlight, background elevation, and icon indicator. |
| Scalable Text & UI Zoom | Base `14–16px` compact HUD, `18px` modal/body standard at 1080p, scalable via `--ui-scale` (`1.0`, `1.15`, `1.30`, `1.50`) + browser 200% zoom | CSS uses `rem` and `calc(... * var(--ui-scale, 1))`. `#game-canvas` backing dimensions scale by `window.devicePixelRatio` for crisp HiDPI rendering. Title screen and HUD expose persistent UI Scale selector. |
| Colorblind Support (4 Modes + High Contrast) | Never use color as the sole differentiator (WCAG 1.4.1) | Support `default`, `protanopia`, `deuteranopia`, and `tritanopia` profiles (plus High Contrast UI) accessible from both Title Screen and in-game HUD, persisted in `localStorage` and mirrored to `data-theme-cb` on `<html>`. |
| Mandatory Non-Color Shape Cues | Every color signal paired with shape, pattern, or text | (1) `BuildingStatus` LEDs pair color with distinct inner glyphs (`working`: check/dot, `idle`: pause bars, `no_power`: lightning bolt, `input_starved`: minus/empty ring, `output_full`: upward arrow/exclamation, `no_resource`: cross, `unpaired`: broken link); (2) Belt tiers display `1`, `2`, or `3` chevron pips for Mk.I/II/III; (3) Blocked placement ghosts overlay diagonal cross-hatch `X`; (4) Resource veins render unique crystal/fleck geometry + tile-hover mineral name tooltip; (5) Hotbar slots show explicit lock/deficit indicators. |

---

## 3. Motor & Input Accessibility

| Requirement | Standard / Target | Implementation Specification |
|---|---|---|
| Complete Keyboard Playability | 100% of world and UI actions reachable via keyboard alone (WCAG 2.1.1) | Grid tile cursor (`I/J/K/L`), primary place/mine/inspect (`Enter`), dismantle (`Delete` / `Backspace`), rotate (`R` / `Shift+R`), pipette (`Q`), center Hub (`Home`), hotbar slots (`1-0`), category switch (`Tab` / `[` `]`), modals (`T/P/B/G/H/Esc`). |
| Full Web Gamepad Support | Standard Xbox / PlayStation / Switch controller mapping | `GamepadController` polls `navigator.getGamepads()` (`deadzone: 0.18`, per-button edge + repeat): Left Stick pans camera, Right Stick / D-Pad moves tile cursor (or navigates modal controls when open), `LT`/`RT` zoom, `A` confirm/place/mine, `B` cancel/dismantle/close modal, `X` rotate, `Y` pipette, `LB`/`RB` cycle slots, `View` Alt-Mode, `Menu` Help/Save. Localized connection/disconnection toasts. |
| Focus Management & Order | Logical traversal, zero focus traps on main HUD, strict trap inside modals (WCAG 2.4.3, 2.4.7) | DOM elements update in place (no 250 ms `textContent = ''` destruction) so focus, active button, and scroll state survive live simulation ticks. Open modals trap `Tab`/`Shift+Tab` inside the dialog and restore focus to the triggering element on close. `Esc` closes modals even when focused inside `INPUT`/`TEXTAREA`/`SELECT`. |
| No Rapid Timing Gates | Zero reflex QTEs or short timeout penalties | Simulation can be paused (`Space`) at any moment without blocking construction, inspection, blueprints, or orbital cargo loading. |

---

## 4. Cognitive & Motion Accessibility

| Requirement | Standard / Target | Implementation Specification |
|---|---|---|
| Reduced Motion Preference | Respect OS `prefers-reduced-motion: reduce` + explicit in-game toggle (`system | on | off`) | When active: freeze or step down continuous belt chevron scrolling, drill/turbine/lab rotations, scanner sweeps, and vent pulses; replace the `~7.16 Hz` rocket thruster strobe with a steady smooth fade (preventing photosensitive triggers); disable camera screen shake and smooth-glide easing. |
| Skippable Animations | All non-trivial blocking/cinematic sequences skippable | Rocket launch visual sequence (`rocketTimer = 4.5s`) can be skipped at any moment via `Space`, `Enter`, `A` (Gamepad), or the HUD Skip action without altering deterministic simulation ticks. |
| Localization & Plain Language | 100% localized `pt-BR` (default) and `en` via `src/ui/i18n.ts` | `<html lang>` dynamically updates on toggle, `?lang=en|pt-BR` URL override supported, locale persists in `localStorage`, and slots accommodate +40% PT-BR text expansion without mid-word breaks. |
| Uncluttered Progressive HUD | Zero panel overlaps across `1024x600`..`3840x2160` | Topbar, Inspector, Toast stack, Minimap, and Hotbar use responsive bounds so wrapped header pills never collide with the Inspector or Toasts. |

---

## 5. Auditory Accessibility

| Requirement | Standard / Target | Implementation Specification |
|---|---|---|
| Visual Captions for Critical Audio | Every gameplay-critical sound triggers a visual toast/caption (WCAG 1.2) | `tech_unlock`, `rocket_launch`, `power_brownout`, `power_restored`, `bp_copy`, `ui_save`, and `ui_error` all dispatch queued `aria-live="polite"` HUD toasts with explicit localized messages. |
| Independent Bus Volume & Mute | `Master`, `SFX`, `UI`, and `Ambient` volume controls + instant `M` Mute | Persisted in `localStorage`; safe peak limiting via `DynamicsCompressorNode`. |
| Mono Audio Downmix | Single-ear / mono hardware support | `SoundEngine.setMono(enabled)` mixes stereo channels down via Web Audio channel merger. |

---

## 6. Platform API Integration

- `window.matchMedia('(prefers-reduced-motion: reduce)')` with change listener synced to `'system'` mode.
- `navigator.getGamepads()`, `gamepadconnected`, `gamepaddisconnected` events.
- `window.devicePixelRatio` backing store multiplier on `#game-canvas`.
- Semantic ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-pressed` on toggles, `aria-live="polite"` on queued toast container, `<html lang>`.

---

## 7. Per-Feature Accessibility Matrix

| Feature / Surface | Keyboard | Gamepad | Colorblind + Shape | Reduced Motion | Screen Reader / ARIA | Audio + Caption |
|---|---|---|---|---|---|---|
| Title Screen | Tab / Enter / Space | Stick / D-Pad + A | Palette + HC toggle | Static backdrop | Heading hierarchy + `aria-pressed` | `ui_tick` |
| Topbar Telemetry | Tab / T / P / B / G / H / M | Start / View / Nav | Warning icon + text | No pulse flicker | Status text + `aria-pressed` | Brownout toast + SFX |
| Hotbar & Tools | `1-0`, `Tab`, `[ ]` | `LB`/`RB`, D-Pad | Lock/cost badges | Static selection | `aria-pressed`, `title`/label | `ui_tick` / `ui_error` |
| World Tile Grid | `I/J/K/L`, `Enter`, `Del` | Right Stick + `A`/`B`/`X`/`Y` | Ghost X hatch, chevron pips | Static gears/belts | Hover mineral & status badge | Build/Mine/Remove SFX |
| Machine Inspector | Tab / Arrows / `R` / `Esc` | D-Pad + `A`/`B` | Status symbol + text | Static progress bar | `<label>` bindings, `Esc` close | `ui_tick` / `build_rotate` |
| Modals (Tech/Stats/BP/Tweak/Save/Help/Victory) | Trapped `Tab`, `Esc` | D-Pad + `A`/`B` | Badges + text labels | Instant open/close | `role="dialog"`, `aria-modal` | `ui_modal_open`/`close` |
| Rocket Launch VFX | `Space`/`Enter` skip | `A` skip | High-contrast fuselage | No 7 Hz strobe | Queued launch toast | `rocket_launch` + toast |

---

## 8. Test Plan & Verification

1. **Automated Unit/Integration Checks**: Verify `src/ui/i18n.ts` 100% key parity (`PT_BR` vs `EN`), modal focus trap & restore, non-destructive DOM key preservation across 250 ms updates, `file.size` guard, and `window.game` hook step bounds.
2. **Visual Audit (`?scene=figures` & `?scene=figures&lang=en`)**: Inspect all 19 items and 20 buildings in normal and colorblind modes verifying distinct silhouettes and zero emojis.
3. **Keyboard-Only & Gamepad Playthrough**: Complete Tier 1 unlock and Phase 1 launch using keyboard-only (`I/J/K/L`, `Enter`, `1-0`, `T`, `Esc`) and via Gamepad API without touching a mouse.
4. **Contrast & Zoom Audit**: Inspect rendered CSS at `1024x600`, `1920x1080`, `150%` `--ui-scale`, and `200%` browser zoom with zero overlapping panels or clipped labels.

---

## 9. Known Intentional Limitations

- **Touchscreen Multi-Tile Dragging (`Partial`)**: AETHERFORGE targets desktop browsers with Keyboard+Mouse and Gamepad as primary inputs (`project.yaml`). On touch devices, HUD menus and single taps operate normally, while continuous belt curve dragging and hover-pipette remain desktop/gamepad workflows.

---

## 10. Audit History

| Date | Reviewer / Scope | Status | Key Outcome |
|---|---|---|---|
| 2026-11-17 | `ux-audio-audit` (#8) + `studio-docs` | Baseline Defined | Identified 250 ms DOM rebuilds, missing `:focus-visible`/ARIA/Gamepad/Reduced Motion/UI Scale/Captions; codified WCAG 2.1 AA requirements above. |
