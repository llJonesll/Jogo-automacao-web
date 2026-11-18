# ADR-004: UI Command Dispatch, Non-Destructive DOM & WCAG 2.1 AA Accessibility

- **Status:** Accepted
- **Date:** 2026-11-17
- **System Owners:** `src/main.ts`, `src/ui/hud.ts`, `src/ui/i18n.ts`, `src/input/gamepad.ts`, `src/style.css`

## Context
Previous HUD code mutated `WorldState` and `GameConfig` directly inside `src/ui/hud.ts`, rebuilt entire DOM subtrees every `250 ms` (`textContent = ''`)—destroying keyboard focus and button states—lacked keyboard grid placement and Web Gamepad API support, used fixed pixel font sizes below readable thresholds, lacked `prefers-reduced-motion` and skippable animations, relied on color-only status/ore/ghost signals, and hardcoded mixed PT-BR/EN strings.

## Decision
1. **Unidirectional Command Dispatch (`HudActions`)**:
   - `src/ui/` is strictly read-only toward `WorldState` and `GameConfig`. Every mutation (recipe swap, overclock, rotate, dismantle, active tech, stockpile unlock, phase load, blueprint import, config tuning, victory dismiss, category select, accessibility toggles) routes through typed `HudActions` callbacks handled in `src/main.ts`.
   - `src/game/` maintains zero DOM or `window` imports (save adapter excluded).
2. **Non-Destructive DOM Diffing & Queued Feedback**:
   - Patch HUD pills, hotbar slots, inspector fields, and modals via keyed state signatures so keyboard focus, slider drags, and scroll positions remain intact across 250 ms refresh ticks.
   - Implement a queued `aria-live="polite"` toast stack (up to 3 simultaneous non-overlapping alerts) covering placement errors, tech unlocks, brownouts, save outcomes, and gamepad connection changes.
3. **Full Multi-Input Parity (Mouse + Keyboard + Gamepad)**:
   - Support keyboard grid cursor (`I/J/K/L`, `Enter`, `Delete`/`Backspace`, `Home`), hotbar/modal shortcuts (`1-0`, `T`, `P`, `B`, `G`, `H`, `V`, `Alt`, `Space`, `Esc`), and full `GamepadController` polling (`deadzone: 0.18`) for world cursor, camera pan/zoom, build/dismantle, and modal focus navigation.
   - Enforce modal focus trapping, return-focus on close, `:focus-visible` outlines (`>= 2px`), and background canvas hotkey suppression while modals are open.
4. **WCAG 2.1 Level AA Visual, Motion & Localization Compliance**:
   - Meet `>= 4.5:1` text and `>= 3:1` UI component contrast; expose `--ui-scale` scaling (`100%`–`150%`/`200%`), `4` color modes (`default`, `protanopia`, `deuteranopia`, `tritanopia`) paired with mandatory shape/chevron/glyph cues, `prefers-reduced-motion` + explicit toggle + skippable rocket launch animation, and 100% localized strings in `src/ui/i18n.ts` (`pt-BR` default + `en`, syncing `<html lang>` and `?lang=`).

## Consequences
- **Positive:** Consistent game state transitions regardless of input method, zero focus loss during live play, full keyboard/gamepad playability, and verifiable WCAG 2.1 AA compliance.
- **Negative:** All new UI controls must be wired through `HudActions`, `LocalizationBundle`, and focus/gamepad traversal tests.

## References
- [accessibility-requirements.md](../../design/accessibility-requirements.md)
- [hud.md](../../design/ux/hud.md)
- [interaction-patterns.md](../../design/ux/interaction-patterns.md)
