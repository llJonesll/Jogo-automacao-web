# Player Control & Automation Manifest — AETHERFORGE: Orbital Foundry

**Status:** Active Reference
**Last Verified:** 2026-11-17
**Governance Architecture:** See [docs/architecture/control-manifest.md](./architecture/control-manifest.md)

This manifest is the single source of truth for every supported player input (Mouse, Keyboard, Gamepad, Touch fallback), its mapped UI/Simulation command, audio feedback event, and automated test hook surface (`window.game`).

---

## 1. Input Device Coverage (`project.yaml`)

| Platform / Input | Support Tier | Details |
|---|---|---|
| Keyboard + Mouse | Primary (`Full`) | Full camera pan/zoom, drag-belt routing, keyboard grid cursor, modal shortcuts, hotbar slots |
| Gamepad (`Gamepad API`) | Full (`Full`) | `navigator.getGamepads()`, deadzone `0.18`, per-edge press & hold repeat, in-world cursor + modal navigation |
| Touch | Partial (`Partial`) | Basic tap interaction on HUD buttons/title screen; multi-tile drag belts and hover-pipette require mouse/keyboard/gamepad |

---

## 2. World & Camera Controls

| Action | Mouse | Keyboard | Gamepad | Command / Target | Audio Event |
|---|---|---|---|---|---|
| Pan Camera | Middle-Drag / `Space` + Left-Drag / Minimap Click | `W A S D` / Arrow Keys | Left Stick | Updates `cam.x`, `cam.y` (`0..64`) | None |
| Center on Orbital Hub | Minimap Center Click | `Home` | L3 / Stick Click (or HUD button) | Resets `cam.x/y` to Hub `(32.5, 32.5)` | `ui_tick` |
| Zoom Camera | Mouse Wheel (`0.38x..2.2x`) | `+` / `-` (if bound) / Wheel | `LT` (Zoom Out) / `RT` (Zoom In) | Clamped `cam.zoom` (`0.38..2.2`) | None |
| Move Tile Cursor | Mouse Hover | `I / J / K / L` (N/W/S/E tile step) | Right Stick / D-Pad (when modal closed) | Updates `hoverTile` (`0..63`) | None |
| Place Building / Belt Drag | Left Click / Left Drag (belts) | `Enter` (at `hoverTile`) | `A` (South face button) | `placeBuilding` / belt Manhattan drag | `build_place` / `belt_drag_step` / `ui_error` |
| Mine Ore Manually | Left Click (Cursor/Mine tool on ore) | `Enter` (on ore with Cursor/Mine) | `A` (on ore with Cursor/Mine) | `mineTileManual` + laser beam VFX | `mine_hit` |
| Inspect Building | Left Click (Cursor tool on building) | `Enter` (on building with Cursor) | `A` (on building with Cursor) | Sets `view.selectedBuildingId` | `ui_tick` |
| Dismantle Building | Right Click / Right Drag / Deconstruct tool | `Delete` / `Backspace` (at `hoverTile`) | `B` (when cursor mode) | `removeBuilding` (100% + buffer refund) | `build_remove` |
| Clear Active Tool / Cancel | Right Click (when tool selected) | `Esc` | `B` (East face button) | Resets tool to `'cursor'` or closes inspector | `ui_tick` |
| Rotate Building / Blueprint | HUD Rotate Button | `R` (CW) / `Shift+R` (CCW) | `X` (West face button) | `rotateBuilding` / `rotateBlueprint` / `toolDir` | `build_rotate` |
| Pipette Tool | N/A | `Q` (on `hoverTile`) | `Y` (North face button) | Copies building type & dir under cursor | `ui_tick` |
| Start Blueprint Copy | Hotbar `[Copy Blueprint]` | `Ctrl+C` | Hotbar selection | Selects `'bp_copy'` (2-corner box select) | `bp_copy` |

---

## 3. HUD, Modals & Simulation Controls

| Action | Keyboard | Gamepad | Command Callback (`HudActions`) | Audio Event |
|---|---|---|---|---|
| Select Hotbar Building Slot | `1`–`9`, `0` | `LB` / `RB` cycle slots | `onSelectTool(buildingId)` | `ui_tick` / `ui_error` |
| Cycle Hotbar Category | `Tab` / `[` `]` (or HUD bar) | D-Pad Left/Right on category bar | `onSelectCategory(cat)` | `ui_tick` |
| Toggle Alt-Mode Overlay | `Alt` | `View` / `Select` (`button[8]`) | `onToggleAltMode()` | `alt_mode` |
| Toggle Power Grid Overlay | `V` | HUD toggle | `onTogglePowerOverlay()` | `ui_tick` |
| Pause / Resume Simulation | `Space` | HUD speed controls | `onSetSimSpeed(0 \| 1)` | `sim_pause` |
| Toggle Mute | `M` | HUD mute button | `onToggleMute()` | `ui_tick` |
| Toggle Tech & Orbital Phases Modal | `T` | HUD button | `onOpenModal('tech')` | `ui_modal_open` / `ui_modal_close` |
| Toggle Production Stats Modal | `P` | HUD button | `onOpenModal('stats')` | `ui_modal_open` / `ui_modal_close` |
| Toggle Blueprints Modal | `B` | HUD button | `onOpenModal('blueprints')` | `ui_modal_open` / `ui_modal_close` |
| Toggle Studio Config Tweaks Modal | `G` | HUD button | `onOpenModal('tweak')` | `ui_modal_open` / `ui_modal_close` |
| Toggle Help / Controls Modal | `H` or `?` | `Menu` / `Start` (`button[9]`) | `onOpenModal('help')` | `ui_modal_open` / `ui_modal_close` |
| Close Active Modal / Blur Input | `Esc` | `B` | `onOpenModal('none')` | `ui_modal_close` |
| Navigate Modal Controls | `Tab` / `Shift+Tab` / Arrow Keys | D-Pad / Left Stick | Focus-trapped traversal inside dialog | None |
| Skip Rocket Launch Visual Sequence | `Space` / `Enter` / Skip Button | `A` | Sets visual `rocketTimer = 0` (non-sim) | `ui_tick` |

---

## 4. Modal Isolation & Focus Rules

1. When `view.activeModal !== 'none'`, world canvas hotkeys (`WASD`, `1-0`, `R`, `Q`, `I/J/K/L`, `Space` world pan) MUST NOT fire behind the modal.
2. Pressing `Esc` inside any `INPUT`, `TEXTAREA`, or `SELECT` cleanly closes the active modal (or exits the control) and restores focus to the triggering element.
3. Title Screen `Enter` / `A` starts a new factory only when `view.scene === 'title'` and focus is not on a separate toggle button.

---

## 5. Automated QA Hook Interface (`window.game` in `src/hook.ts`)

| Method / Property | Signature | Contract |
|---|---|---|
| `scene()` | `() => 'title' \| 'play' \| 'figures'` | Returns active scene mode |
| `state()` | `() => GameStateSnapshot` | Returns deterministic snapshot (`tick`, `dayTime`, `phase`, `orbitalLaunches`, `buildings`, `generatedMw`, `demandedMw`, `satisfaction`, `unlockedTechs`, `stockpile`, `victory`, plus optional UI/accessibility metrics) |
| `press(key)` | `(key: string) => void` | Dispatches deterministic key action (`handleKeyPress`) |
| `hold(key, sec)` | `(key: string, seconds: number) => void` | Simulates fixed 60 Hz frame holds (`WASD` / arrows) cleanly |
| `step(sec)` | `(seconds: number) => void` | Advances `round(sec / 0.05)` simulation ticks; capped at `<= 3600s` per call to prevent synchronous DoS |

---

## 6. Cross-References
- [docs/architecture/control-manifest.md](./architecture/control-manifest.md) — Architectural boundary enforcement
- [design/accessibility-requirements.md](../design/accessibility-requirements.md) — WCAG 2.1 AA motor & focus compliance
- [design/ux/interaction-patterns.md](../design/ux/interaction-patterns.md) — Standardized component behavior
