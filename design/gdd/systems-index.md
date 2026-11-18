# Systems Index — AETHERFORGE: Orbital Foundry

- **Status:** Approved
- **Last Updated:** 2026-11-17
- **Game Concept:** [game-concept.md](./game-concept.md)
- **Rigor Tier:** Standard (`project.yaml`)

---

## 1. Overview

This index decomposes **AETHERFORGE: Orbital Foundry** into 8 discrete, traceable systems with explicit priority tiers, dependency boundaries, and design documentation references. All core simulation systems (`1–6`) are specified in [factory-systems.md](./factory-systems.md); presentation/UX and audio systems (`7–8`) live in dedicated UX and Audio design documents.

---

## 2. Master System Registry

| # | Name | Category | Priority | Status | Design Doc | Depends On |
|---|---|---|---|---|---|---|
| 1 | `world-generation` | World | P0 | Verified | [factory-systems.md#world-generation](./factory-systems.md#world-generation) | `data/config.json`, `src/core/rng.ts` |
| 2 | `logistics-transport` | Gameplay | P0 | Verified | [factory-systems.md#logistics-transport](./factory-systems.md#logistics-transport) | `world-generation`, `power-grid` |
| 3 | `production-crafting` | Gameplay | P0 | Verified | [factory-systems.md#production-crafting](./factory-systems.md#production-crafting) | `world-generation`, `logistics-transport`, `power-grid`, `tech-orbital-progression` |
| 4 | `power-grid` | Economy | P0 | Verified | [factory-systems.md#power-grid](./factory-systems.md#power-grid) | `world-generation`, `logistics-transport` |
| 5 | `tech-orbital-progression` | Progression | P1 | Verified | [factory-systems.md#tech-orbital-progression](./factory-systems.md#tech-orbital-progression) | `logistics-transport`, `production-crafting`, `power-grid` |
| 6 | `blueprints-persistence` | Persistence | P1 | Verified | [factory-systems.md#blueprints-persistence](./factory-systems.md#blueprints-persistence) | `world-generation`, `production-crafting`, `tech-orbital-progression` |
| 7 | `hud-feedback` | UI | P1 | Verified | [hud.md](../ux/hud.md), [interaction-patterns.md](../ux/interaction-patterns.md), [accessibility-requirements.md](../accessibility-requirements.md) | `world-generation`, `power-grid`, `tech-orbital-progression`, `blueprints-persistence` |
| 8 | `audio-fx` | Audio | P2 | Verified | [sound-bible.md](../audio/sound-bible.md) | `power-grid`, `tech-orbital-progression`, `hud-feedback` |

---

## 3. Priority Tiers

- **P0 — Critical Path Core Loop** (`world-generation`, `logistics-transport`, `production-crafting`, `power-grid`): Must compile cleanly, pass deterministic unit + soak conservation invariants, and sustain `< 2.0 ms/tick` at `20 Hz` before higher layers are verified.
- **P1 — Progression, Sharing & Operability** (`tech-orbital-progression`, `blueprints-persistence`, `hud-feedback`): Tech gates, Orbital Victory, fail-closed `AFBP1:`/JSON trust boundaries, non-destructive WCAG 2.1 AA HUD, and Keyboard+Gamepad parity.
- **P2 — Sensory Polish & Feedback** (`audio-fx`): Event-bus audio mix hierarchy, cooldown throttling, adaptive ambient wind/hum, and visual toast caption pairing.

---

## 4. Dependency Map

```text
Layer 0 (Foundation Data & RNG):
  data/*.json + data/schemas/*.schema.json + src/core/rng.ts
       |
       v
Layer 1 (Spatial World):
  [1] world-generation
       |
       +--------------------+--------------------+
       v                    v                    v
Layer 2 (Simulation Core):
  [4] power-grid <----> [2] logistics-transport
       |                    |
       +---------+----------+
                 v
  [3] production-crafting
                 |
                 v
Layer 3 (Meta & Persistence):
  [5] tech-orbital-progression
                 |
                 v
  [6] blueprints-persistence
                 |
       +---------+---------+
       v                   v
Layer 4 (Presentation):
  [7] hud-feedback ----> [8] audio-fx
```

- **Cycle Check**: Strict DAG in code (`core <- game <- render / audio / ui`). Note the functional tick interaction between `power-grid` (`coal_generator` consumes coal delivered by `logistics-transport`) and `logistics-transport` (`inserter` speed scales by `satisfaction` computed in Phase 0 of `stepSimulation`), resolved cleanly without circular module imports via `stepPower` -> `advanceInternals` -> `collectPushProposals` phasing.
- **Bottleneck Node**: `logistics-transport` and `power-grid` are coupled to almost every downstream system; regressions in Phase 0/1/2 contracts immediately invalidate `production-crafting` and `tech-orbital-progression`.

---

## 5. Recommended Design & Verification Order

1. `world-generation` + `data/schemas/*.schema.json` (resource weights, geothermal vents, starter stockpile)
2. `power-grid` (solar curve, coal fuel burn, accumulators, `c^1.6` scaling)
3. `logistics-transport` (two-phase N/E/S/W symmetry, symmetric tunnel pairing, splitters/mergers, inserters)
4. `production-crafting` (miners, auto-recipes, `required_tech` gating, geo resonance)
5. `tech-orbital-progression` (research lab rates/filtering, Tier 1–6 balance, Phase 1–5 launches)
6. `blueprints-persistence` (`AFBP1:` validation, save checksum/bijection, dismantle refunds)
7. `hud-feedback` + `design/art/art-bible.md` + `design/accessibility-requirements.md`
8. `audio-fx` (`sound-bible.md` event bus & captions)

---

## 6. High-Risk Systems

| System | Risk Area | Mitigation Target |
|---|---|---|
| `logistics-transport` | Directional scan bias, tunnel/splitter bottlenecks, per-tick GC allocations | Two-phase commit, `8.0/s` splitter/merger throughput, span-independent tunnel rate, `0`-alloc pools |
| `power-grid` | Coal vs Solar cost dominance (`>11x` gap), tick-0 starter skip | Balanced Solar (`14 MW`) / Accumulator (`180 MJ`), reduced starter stockpile |
| `blueprints-persistence` | Untrusted JSON/Base64 XSS, prototype pollution, tech-gate bypass (`clock: 2.5`) | Fail-closed sanitization (`save.ts`, `blueprints.ts`), security fuzz tests |
| `hud-feedback` | 250 ms DOM focus wipe, mouse-only grid, color-only cues, missed Victory trigger | Keyed DOM diffing, Keyboard+Gamepad cursor, 4 colorblind palettes + shapes, `HudActions` |

---

## 7. Progress Tracker

| Metric | Count / Status |
|---|---|
| Total Indexed Systems | `8 / 8` (`100%`) |
| P0 Systems | `4` (`world-generation`, `logistics-transport`, `production-crafting`, `power-grid`) |
| P1 Systems | `3` (`tech-orbital-progression`, `blueprints-persistence`, `hud-feedback`) |
| P2 Systems | `1` (`audio-fx`) |
| Target GDD Coverage | `100%` documented across `design/gdd/`, `design/ux/`, `design/audio/`, `design/art/` |
| Registry Link | [design/registry/entities.yaml](../registry/entities.yaml) |
