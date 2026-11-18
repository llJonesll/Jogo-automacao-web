# ADR-005: Procedural Web Audio Event Bus, Mix Graph & Adaptive Ambience

- **Status:** Accepted
- **Date:** 2026-11-17
- **System Owners:** `src/audio/synth.ts`, `src/main.ts`

## Context
Calling raw `SoundEngine.play*()` methods directly from UI callbacks and input handlers leads to unthrottled audio clipping during rapid belt drags, missing feedback on modal/error/pause interactions, no independent volume sliders (`Master / SFX / UI / Ambient`), no mono downmix option for single-ear accessibility, and no visual caption parity when important gameplay events (e.g., research unlock or brownout) trigger sound.

## Decision
1. **Typed Audio Event Bus (`SoundEngine.emit(event: AudioEventId)`)**:
   - All gameplay, UI, and simulation feedback emits typed `AudioEventId` events (`ui_tick`, `ui_error`, `ui_modal_open`, `ui_modal_close`, `ui_save`, `build_place`, `build_rotate`, `build_remove`, `belt_drag_step`, `mine_hit`, `bp_copy`, `bp_stamp`, `hub_load`, `tech_unlock`, `rocket_launch`, `victory_fanfare`, `power_brownout`, `power_restored`, `sim_pause`, `alt_mode`) rather than coupling callers directly to oscillator synthesis.
   - Maintain backward-compatible helper methods (`playPlace`, `playRemove`, etc.) delegating directly to `emit()`.
2. **Web Audio Bus Graph & Safety Limiting**:
   - Route voices into three sub-mix buses (`uiGain`, `sfxGain`, `ambientGain`) -> `masterGain` -> `DynamicsCompressorNode` (peak limiter preventing multi-voice distortion) -> optional mono `ChannelMergerNode` (`setMono(enabled)`) -> `ctx.destination`.
   - Enforce per-event cooldown throttling (preventing drag-build clipping) and subtle deterministic micro-pitch variation; persist bus volumes, mute state, and mono toggle in `localStorage`.
3. **Adaptive Industrial Ambient Layer & Mandatory Visual Captions**:
   - Synthesize a low-cpu continuous exoplanet wind + machine hum modulated by active machine count, grid `satisfaction`, and pause state (`updateAmbient`).
   - Pair every gameplay-critical audio event (`tech_unlock`, `rocket_launch`, `power_brownout`, `power_restored`, `bp_copy`) with a queued visual toast/caption in the HUD so deaf or muted players receive full state parity.

## Consequences
- **Positive:** Clean non-clipping procedural mix, accessible audio controls and mono support, dynamic factory soundscape, and 100% caption parity.
- **Negative:** Any new gameplay or HUD feedback event must register an `AudioEventId`, cooldown threshold, bus assignment, and visual caption mapping in `design/audio/sound-bible.md`.

## References
- [sound-bible.md](../../design/audio/sound-bible.md)
- [accessibility-requirements.md](../../design/accessibility-requirements.md)
