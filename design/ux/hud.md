# HUD Design — AETHERFORGE: Orbital Foundry

**Status:** Approved
**System:** HUD & Feedback (`hud-feedback`)
**Rigor Tier:** Standard
**Last Updated:** 2026-11-17
**References:** [accessibility-requirements.md](../accessibility-requirements.md), [interaction-patterns.md](./interaction-patterns.md), [art-bible.md](../art/art-bible.md)

---

## 1. HUD Philosophy

The HUD acts as an industrial telemetry visor over the live `64x64` exoplanet canvas. Players spend 90% of their session observing conveyor flow and spatial layouts, so peripheral chrome must stay compact, high-contrast (`>= 4.5:1`), strictly non-occluding across `1024x600` to `3840x2160`, and completely non-destructive—updating numeric readouts in place every `250 ms` without stealing keyboard focus or scroll offsets.

---

## 2. Information Architecture

| Priority | Category | Elements | Visibility Rule |
|---|---|---|---|
| Always Visible | Orbital Objective | Active Phase chip counts + `[Load Rocket]` button when stockpile can contribute | Top-Left Topbar |
| Always Visible | Active Research | Current `activeTechId` pill (opens Tech modal on click) | Top-Left Topbar |
| Always Visible | Power & Planetary Clock | `Generated / Demanded MW (satisfaction%)`, Accumulator `MJ`, `Day / Night` state | Top-Center Topbar |
| Always Visible | Simulation Pace | Speed controls (`||`, `1x`, `2x`, `4x`) | Top-Center Topbar |
| Always Visible | System & Modal Bar | `Tech [T]`, `Stats [P]`, `Blueprints [B]`, `Config [G]`, `Alt-Mode`, `Power [V]`, `Save`, `Mute [M]`, `Help [H]`, `Lang` | Top-Right Topbar |
| Always Visible | Build & Tool Dock | Category tabs (`All`, `Logistics`, `Extraction`, `Production`, `Power`), Utility tools (`Cursor`, `Mine`, `Deconstruct`, `Copy BP`), `1..0` building slots | Bottom-Center Hotbar |
| Always Visible | Spatial Awareness | `64x64` tile minimap (`144x144 px`) with camera viewport box | Bottom-Left (dynamically anchored above Hotbar height) |
| Contextual | Machine Inspector | Selected building icon, status symbol + MW, `+35%` Geo badge, Recipe dropdown, Overclock slider (`50..250%`), IN/OUT/Inventory chips, Rotate & Dismantle buttons | Right Drawer (only when `selectedBuildingId !== null`) |
| Transient | Toast Notification Stack | Up to 3 queued notifications (`info`, `milestone`, `error`), plus Rocket Skip prompt during launch | Top-Center Safe Band below Topbar |
| On-Demand | Full Modals | `tech`, `stats`, `blueprints`, `tweak`, `save`, `help`, `victory` | Centered Modal Backdrop (`z-index: 40`) |

---

## 3. Layout Zones & Safe Margins

```text
+-------------------------------------------------------------------------+
| [Phase + Load] [Active Tech]   [Power/Day + 0|1|2|4x]   [T P B G V M H] |  <- Topbar (Flex Wrap)
+-------------------------------------------------------------------------+
|                           [ Queued Toasts (<=3) ]            +--------+ |
|                                                              |Machine | |
|                                                              |Inspect | |  <- Right Drawer
|                     64x64 Orbital Foundry Canvas             |Drawer  | |     (Dynamic top below Topbar)
|                                                              +--------+ |
| +-------+                                                               |
| |Minimap|        [ Categories | Cursor | Mine | Copy ]                  |  <- Bottom-Left Minimap
| |144x144|      [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ][ 9 ][ 0 ]       |     + Bottom-Center Hotbar
+-------------------------------------------------------------------------+
```

### Safe Margin & Non-Overlap Rules
- Outer viewport safe padding: `8px–12px` across all edges.
- **No hardcoded pixel offsets between dynamic regions**: `.hud-inspector` and `.hud-toast` are positioned dynamically below `.hud-topbar` (using grid/flex regions or measured `--topbar-h`) so narrow `1024x600` wrapping or `--ui-scale: 1.5` never overlaps Inspector controls or Toasts.
- Bottom-left Minimap `y` position clears the bounding box of `.hud-hotbar` when scaled up so hotbar tooltips and minimap hit-testing never collide.

---

## 4. HUD States

| State | Trigger | Visible HUD Elements | Input & Behavior |
|---|---|---|---|
| **Title Screen** | Initial boot (`scene === 'title'`) | Centered `.title-card` (SVG Emblem, Title, `New Factory`, `Continue Save`, `Demo Showcase`, `Language`, `Colorblind Mode`, `UI Scale`, `Reduced Motion`, Hint) | World canvas renders idle background; `Enter` / `A` starts factory |
| **Active Play / Build** | `scene === 'play'`, `activeModal === 'none'` | Topbar, Hotbar, Minimap, optional Inspector, Canvas hover ghost + tile cursor | Full Mouse/Keyboard/Gamepad world editing; 250 ms keyed DOM diff |
| **Belt Drag / Blueprint Copy & Stamp** | `dragPath.length > 0` or `bp_copy`/`bp_stamp` | Active slot highlight + canvas preview ghosts (amber/cyan valid, red + X blocked) | `R`/`X` rotates blueprint; `Esc`/`Right-Click`/`B` cancels back to `cursor` |
| **Brownout Warning** | `world.power.satisfaction < 0.99` | `.power-pill.warn` border + warning icon + one-shot queued warning toast on transition | Machines scale proportionally; toast visually captions `power_brownout` |
| **Modal Open** | `activeModal !== 'none'` | Dimmed backdrop + centered `.hud-modal` (`role="dialog"`, `aria-modal="true"`) | Focus trapped in modal; canvas hotkeys blocked; `Esc`/`B` closes and restores focus |
| **Paused** | `simSpeed === 0` (`Space` or `||`) | Active highlight on `||` speed button + paused indicator badge | Simulation ticks stop cleanly; player can still build, inspect, pan, and open modals |
| **Rocket Launch & Victory** | `rocketTimer > 0` / Phase 5 complete | Queued `msg_rocket_launch` toast + Rocket Skip button (`Space`/`Enter`/`A`); Victory modal opens on Phase 5 completion (`!victoryDismissed`) whether triggered by belt delivery OR Topbar `[Load Rocket]` button | Dismissing Victory via `Continue Megafactory` sets `victoryDismissed = true` via `HudActions` |

---

## 5. Visual Budget

| Metric | Budget Ceiling | Enforcement |
|---|---|---|
| Simultaneous HUD Panels | `<= 4` active panels (`Topbar`, `Hotbar`, `Minimap`, `Inspector` or `Modal`) | Single modal slot; Inspector auto-hides when `selectedBuildingId === null` |
| Viewport Occlusion (1920x1080 at `1.0x` scale) | `<= 18%` screen area | Compact flex pills, single-row category + slot hotbar, collapsible modal overlays |
| Simultaneous Toasts | `<= 3` stacked vertically | Overflow queues FIFO behind active toasts |
| HUD Update Frequency | `4 Hz` (`250 ms` interval) + immediate on user action | Keyed state diffing updates only changed nodes; zero wholesale `textContent = ''` wipes |
| Draw Calls for HUD Canvas Elements | `<= 10` (Minimap cached blit + 1 viewport rect) | Offscreen `64x64` minimap canvas |

---

## 6. Toast Queue & Priority Specification

Previous single-timer toast overwrote active alerts silently. HUD toasts MUST use a bounded FIFO queue:

- **Queue Capacity**: Up to `12` pending messages; maximum `3` displayed simultaneously.
- **Priority Tiers**:
  1. `critical` (Error / Power Brownout / Save Failure / Invalid Import): Uses `toast-error` style (`#fecaca` text, `#ef4444` border, warning icon, `role="alert"`).
  2. `milestone` (Tech Unlock, Rocket Launch, Power Restored): Cyan/Amber highlight (`role="status"`).
  3. `info` (Game Saved, Blueprint Copied/Imported, Gamepad Connected/Disconnected): Standard panel styling (`role="status"`).
- **Deduplication**: Identical consecutive messages within `1000 ms` refresh duration instead of flooding the stack.
- **Timing**: Default `3.2s` auto-dismiss (`4.5s` for `milestone` / `critical`), with CSS transition disabled when Reduced Motion is active.

---

## 7. Platform Adaptation & Accessibility

- **Keyboard + Gamepad**: Every Topbar button, Hotbar slot, Inspector field, and Modal control is reachable via `Tab`, directional modal focus (`D-Pad`/Arrows), and direct hotkey bindings (`docs/control-manifest.md`).
- **Scalable Text & Colorblind**: `--ui-scale` (`1.0`, `1.15`, `1.30`, `1.50`) scales text and padding smoothly; `4` colorblind themes (`default`, `protanopia`, `deuteranopia`, `tritanopia`) sync to `<html>` `data-theme-cb` and renderer options.
- **Localization**: 100% of labels, tooltips, diagnostics, victory metrics, and help lists read from `LocalizationBundle` (`pt-BR` / `en`), accommodating +40% PT-BR string length without mid-word clipping.

---

## 8. UX Tuning Knobs

| Parameter | Default | Range | Description |
|---|---|---|---|
| `hud_refresh_ms` | `250` | `100–500 ms` | Periodic HUD telemetry diff cadence |
| `toast_duration_ms` | `3200` | `2000–6000 ms` | Active toast lifetime before dequeue |
| `max_visible_toasts` | `3` | `1–4` | Max simultaneous non-overlapping toast banners |
| `ui_scale` | `1.0` | `1.0–1.5` | Persisted CSS font & widget scale multiplier |
| `gamepad_deadzone` | `0.18` | `0.05–0.35` | Analog stick deadzone for camera/cursor movement |

---

## 9. Acceptance Criteria

1. **GIVEN** the player is dragging the Overclock slider or navigating a Tech card via keyboard inside a modal, **WHEN** 250 ms HUD telemetry refresh ticks fire repeatedly, **THEN** existing DOM controls update in place without losing keyboard focus, active slider drag state, or modal scroll position.
2. **GIVEN** Phase 5 cargo requirements can be fulfilled from the global stockpile, **WHEN** the player clicks Topbar `[Load Rocket]` (`load_stockpile`), **THEN** Phase 5 completes via `HudActions.onLoadPhaseStockpile`, triggers `rocket_launch`, displays the queued launch toast, AND opens the Victory modal.
3. **GIVEN** the Machine Inspector is open on a building, **WHEN** the user clicks the Inspector `X` close button, **THEN** `HudActions.onCloseInspector()` sets `selectedBuildingId = null` and hides the Inspector drawer without changing the active tool unexpectedly.
4. **GIVEN** `tech_unlock` and `power_brownout` events fire within the same second, **WHEN** toasts are dispatched, **THEN** both messages appear in the queued stack (up to 3 visible) without overwriting each other and announce via `aria-live`.
5. **GIVEN** the viewport is resized to `1024x600` with `--ui-scale: 1.5` and PT-BR locale, **WHEN** the Topbar wraps onto multiple lines and the Inspector + Toast are active, **THEN** zero HUD regions overlap each other or clip hotbar building names mid-word.
6. **GIVEN** the player uses only a keyboard (`I/J/K/L`, `Enter`, `1-0`, `T`, `Esc`) or a standard Gamepad, **WHEN** constructing a belt line, inspecting a smelter, and unlocking a tech, **THEN** all actions succeed without mouse input.
