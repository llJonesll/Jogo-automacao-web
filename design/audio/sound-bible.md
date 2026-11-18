# Sound Bible — AETHERFORGE: Orbital Foundry

**Status:** Approved
**Audio Engine:** Zero-Dependency Web Audio API (`src/audio/synth.ts`)
**Last Updated:** 2026-11-17
**References:** [ADR-005](../../docs/architecture/adr-005-audio-event-bus.md), [accessibility-requirements.md](../accessibility-requirements.md)

---

## 1. Sonic Direction & Identity

AETHERFORGE sounds like an isolated volcanic orbital foundry powered by precision clockwork machinery: crisp metallic transients for UI and logistics placement, weighty bass thuds for heavy smelters and dismantling, harmonic synth chimes for research breakthroughs, and a subtle filtered exoplanet wind/hum floor that responds dynamically to factory activity and power brownouts. All audio is generated 100% procedurally via Web Audio nodes (`OscillatorNode`, `BiquadFilterNode`, `AudioBufferSourceNode`) with zero external `.wav`/`.mp3` assets.

---

## 2. Mix Hierarchy & Loudness Targets

```text
  [ uiGain ]  (default 0.8) ──+
  [ sfxGain ] (default 0.85) ─┼─> [ masterGain ] ─> [ DynamicsCompressorNode ] ─> [ Optional Mono Merger ] ─> ctx.destination
  [ ambientGain ] (default 0.5)+
```

- **Dynamics Limiter**: `DynamicsCompressorNode` (`threshold: -12 dB`, `knee: 10`, `ratio: 12`, `attack: 0.003s`, `release: 0.15s`) guards against clipping during rapid belt drags or simultaneous launches.
- **Target Loudness Balance**:
  - `ambientGain`: subtle floor (`~ -24 LUFS` nominal, swells gently with active machines).
  - `uiGain`: crisp, short transients (`~ -16 LUFS` peak, never fatiguing).
  - `sfxGain`: grounded tactile placement (`~ -14 LUFS`), orbital launch & fanfare (`~ -11 LUFS` peak).
- **Mono Downmix**: `setMono(true)` sums output cleanly for single-ear or mono hardware accessibility.
- **Persistence**: `master`, `sfx`, `ui`, `ambient` volumes, `muted`, and `mono` states persist in `localStorage`.

---

## 3. Canonical Event Bus (`AudioEventId`)

Every UI widget, input handler, and simulation hook triggers audio strictly through `SoundEngine.emit(event: AudioEventId)`:

| `AudioEventId` | Asset Convention Name | Bus | Synthesis Profile | Duration | Cooldown | Pitch Var | Visual Caption / Toast |
|---|---|---|---|---|---|---|---|
| `ui_tick` | `ui_nav_tick_01` | `ui` | Sine `680 Hz` fast decay | `40 ms` | `30 ms` | `+/- 3%` | N/A (focus/button state) |
| `ui_error` | `ui_alert_error_01` | `ui` | Saw/Triangle `190 -> 130 Hz` double pulse | `140 ms` | `120 ms` | `0%` | **Mandatory**: Error toast (`no_materials`, `locked`, `needs_ore`, `needs_vent`, invalid import) |
| `ui_modal_open` | `ui_panel_open_01` | `ui` | Triangle `340 -> 520 Hz` | `75 ms` | `60 ms` | `0%` | Modal dialog opens (`role="dialog"`) |
| `ui_modal_close` | `ui_panel_close_01` | `ui` | Triangle `460 -> 280 Hz` | `75 ms` | `60 ms` | `0%` | Modal closes |
| `ui_save` | `ui_sys_save_01` | `ui` | Sine dual-tone `587 -> 880 Hz` | `160 ms` | `200 ms` | `0%` | **Mandatory**: `msg_saved` / `msg_loaded` toast |
| `build_place` | `sfx_build_place_01` | `sfx` | Triangle `220 -> 95 Hz` mechanical snap | `85 ms` | `40 ms` | `+/- 6%` | Building silhouette + particles |
| `build_rotate` | `sfx_build_rotate_01` | `sfx` | Triangle `310 -> 410 Hz` ratchet click | `60 ms` | `35 ms` | `+/- 4%` | Port arrow rotates 90 deg |
| `build_remove` | `sfx_build_dismantle_01` | `sfx` | Sawtooth `170 -> 70 Hz` low-passed | `110 ms` | `45 ms` | `+/- 5%` | Building cleared + refund |
| `belt_drag_step` | `sfx_belt_snap_01` | `sfx` | High-pass tick `480 -> 300 Hz` | `45 ms` | `45 ms` | `+/- 8%` | Belt drag preview path |
| `mine_hit` | `sfx_laser_mine_01` | `sfx` | Square `420 -> 180 Hz` pulse | `65 ms` | `80 ms` | `+/- 8%` | Cyan mining laser beam |
| `bp_copy` | `sfx_bp_capture_01` | `sfx` | Dual sine ping `740 + 1110 Hz` | `140 ms` | `150 ms` | `0%` | **Mandatory**: `msg_bp_copied` toast |
| `bp_stamp` | `sfx_bp_stamp_01` | `sfx` | Chorded mechanical thump `240 -> 110 Hz` | `130 ms` | `100 ms` | `+/- 3%` | Stamped blueprint buildings |
| `hub_load` | `sfx_hub_cargo_load_01` | `sfx` | Ascending pneumatic chime `330 -> 660 Hz` | `180 ms` | `120 ms` | `0%` | **Mandatory**: `msg_phase_loaded` toast |
| `tech_unlock` | `sfx_prog_tech_unlock_01` | `sfx` | 4-note arpeggio `[523.25, 659.25, 783.99, 1046.5] Hz` | `480 ms` | `300 ms` | `0%` | **Mandatory**: Localized tech unlock toast (`BLOCKING` WCAG parity) |
| `rocket_launch` | `sfx_orbital_launch_01` | `sfx` | Deterministic LCG filtered noise sweep (`160 -> 1200 -> 220 Hz`) + chime | `1600 ms` | `800 ms` | `0%` | **Mandatory**: `msg_rocket_launch` toast + rocket ascent VFX |
| `victory_fanfare` | `sfx_prog_victory_01` | `sfx` | Major harmonic brass-triangle swell `[523, 659, 784, 1047, 1319] Hz` | `1100 ms` | `1000 ms` | `0%` | **Mandatory**: Victory modal opens |
| `power_brownout` | `sfx_grid_brownout_01` | `sfx` | Descending saw `220 -> 82 Hz` low-passed droop | `320 ms` | `3000 ms` | `0%` | **Mandatory**: Power warning pill + brownout toast |
| `power_restored` | `sfx_grid_restored_01` | `sfx` | Rising sine hum `140 -> 440 Hz` | `260 ms` | `2000 ms` | `0%` | **Mandatory**: Power restored toast |
| `sim_pause` | `ui_sim_pause_01` | `ui` | Soft sine `392 -> 294 Hz` | `90 ms` | `80 ms` | `0%` | `||` active speed pill |
| `alt_mode` | `ui_alt_toggle_01` | `ui` | Crisp sine `540 -> 640 Hz` | `55 ms` | `60 ms` | `0%` | Alt-Mode recipe/clock overlays |

---

## 4. Concurrency, Cooldowns & Determinism

- Per-event cooldown timestamps (`lastPlayedMs`) prevent rapid mouse-drag belt placement or continuous dismantle sweeps from stacking >1 voice per `40–45 ms`.
- Pitch variation uses deterministic phase/counter stepping (`((counter++ % 5) - 2) * step`), keeping simulation and audio decoupled without using `Math.random()` inside gameplay state.

---

## 5. Adaptive Ambient Factory Layer (`updateAmbient`)

- **Exoplanet Wind Bed**: Filtered deterministic noise loop (`lowpass ~280 Hz`), continuously audible at low gain while unmuted in `'play'` scene.
- **Industrial Machine Hum**: Dual-detuned low triangle oscillators (`55 Hz` + `110 Hz`, low-pass `~190 Hz`), gain proportional to `min(1, activeMachines / 24)` and pitch/filter subtly sagging when `satisfaction < 0.99`.
- **Lifecycle**: Fades smoothly (`setTargetAtTime`) to `0` when `paused`, `muted`, or on `title` / `?scene=figures`.

---

## 6. Acceptance Criteria

1. **GIVEN** the player drags a 12-tile belt or dismantles 10 belts rapidly, **WHEN** `belt_drag_step` or `build_remove` fires, **THEN** per-event cooldown throttling limits overlapping voices and `DynamicsCompressorNode` prevents output clipping.
2. **GIVEN** a Research Lab completes a technology while sound is muted (`muted === true`), **WHEN** `tech_unlock` fires, **THEN** the HUD emits a queued visual toast naming the unlocked tech so deaf/muted players receive identical state awareness.
3. **GIVEN** grid `satisfaction` drops below `0.99` and later recovers to `1.0`, **WHEN** `stepSimulation` updates, **THEN** `power_brownout` and `power_restored` emit on edge transitions (subject to cooldowns) with matching visual notifications and ambient hum droop/recovery.
4. **GIVEN** the user adjusts `SFX`, `UI`, `Ambient`, or `Mono` settings, **WHEN** reloading the browser session, **THEN** audio mix preferences restore cleanly from `localStorage`.
