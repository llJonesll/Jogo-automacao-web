# Game Concept — AETHERFORGE: Orbital Foundry

- **Status:** Approved
- **Last Updated:** 2026-11-17
- **Supersedes:** [design/game-brief.md](../game-brief.md)
- **System Index:** [systems-index.md](./systems-index.md)

---

## 1. Core Identity

| Attribute | Specification |
|---|---|
| **Title** | AETHERFORGE: Orbital Foundry |
| **Genre** | Top-Down 2.5D Factory Automation & Logistics Sandbox |
| **Platform** | Web (`HTML5 Canvas 2D`, `Web Audio API`, `Gamepad API`, static Vite bundle) |
| **Target Audience** | Automation/logistics strategy fans, systems optimizers, and browser sandbox players |
| **Visual Style** | Procedural 2.5D Dark Sci-Fi Industrial Vector Art (Basalt Slate, Amber, Plasma Cyan, Zero Emoji Art) |
| **Input Support** | Keyboard + Mouse (Primary), Full Gamepad API, Partial Touch |
| **Localization** | `pt-BR` (Default) and `en` (`100%` parity) |
| **Session Scope** | 15–45 min full 5-Phase campaign or instant 1-click Demo Showcase sandbox |

---

## 2. Elevator Pitch

Drop onto a volcanic exoplanet around an indestructible 3x3 Orbital Tether Hub, carve deterministic conveyor networks across mineral veins and magma vents, balance solar day/night cycles against coal and geothermal power with `c^1.6` overclocking, and feed five escalating orbital rocket launches directly in any modern browser with zero downloads or external dependencies.

---

## 3. Core Fantasy & Unique Hook

- **Core Fantasy**: Transform dark volcanic craters and scattered ore seams into a living, synchronized clockwork metropolis where every belt segment, articulated inserter, glowing smelter, and geothermal turbine hums in lockstep toward orbital ascension.
- **Unique Hook**:
  1. **Zero-Bias 20 Hz Two-Phase Clockwork**: Every conveyor line facing North, East, South, or West runs with mathematically identical tick parity—never warped by row-major scan order.
  2. **Geothermal Resonance Spatial Puzzle**: Volcanic `geothermal_vent` tiles double as 60 MW power anchors and `+35%` free-speed resonance halos for adjacent extractors, processors, and labs, forcing genuine spatial routing trade-offs.
  3. **Instant Zero-Footprint Browser Craft**: Pure TypeScript + procedural Canvas 2D + Web Audio loads instantaneously offline, ships with `AFBP1:` shareable Base64 blueprints, live Studio Tuning knobs (`G`), and a 1-click Showcase megafactory.

---

## 4. MDA & SDT Player Motivation

### MDA Framework (Mechanics -> Dynamics -> Aesthetics)
- **Mechanics**: Deterministic 20 Hz two-phase item transfer, directional `1->3` splitters and `3->1` mergers, `5`-tile underground tunnels, articulated inserters, auto-locking multi-input recipes, `c^1.6` overclocking, day/night solar + accumulator grid balancing, 6-tier tech DAG, and 5 orbital cargo phases.
- **Dynamics**: Balancing belt throughput ceilings against machine clock ratios; positioning high-draw Assemblers beside magma vents to bypass `c^1.6` power spikes; routing compact manifolds using underground tunnels; recovering gracefully from night brownouts via accumulators.
- **Aesthetics**: *Challenge* (bottleneck and power optimization), *Creation & Expression* (clean manifold blueprints), *Discovery* (unlocking silicon/quantum chains), and *Sensation* (watching synchronized item streams glide at 60 FPS with responsive particle embers and orbital launches).

### Self-Determination Theory (SDT)
- **Autonomy**: Open `64x64` layout around the Hub, auto-recipe or locked-recipe control, free-build sandbox mode, and live `data/config.json` multipliers.
- **Competence**: Immediate visual feedback (status LEDs + symbols, 60s/min rolling telemetry, Alt-Mode recipe/clock overlays, zero-penalty 100% dismantle refunds).
- **Relatedness**: Exportable/importable `AFBP1:` Base64 blueprint strings (`Ctrl+C`) and shareable `.json` factory saves.

---

## 5. Game Pillars, Design Tests & Anti-Pillars

### Pillar 1: Deterministic Clockwork Logistics
- **Promise**: Layout topology—not traversal order or frame jitter—governs factory throughput.
- **Design Test**: Do four identical 5-tile conveyor lines facing N, E, S, and W deliver ore into storage on the exact same simulation tick?
- **Anti-Pillar**: Never introduce random belt jitter, frame-rate-dependent simulation physics, or directional scan-order bias.

### Pillar 2: Spatial Thermal & Grid Tension
- **Promise**: Power generation and terrain placement create interlocking engineering puzzles rather than passive busywork.
- **Design Test**: Does placing machines near `geothermal_vent` tiles create a meaningful spatial choice between `+35%` free speed, belt clearance, and `60 MW` Geothermal Plant occupancy, while day/night solar shifts incentivize Accumulators?
- **Anti-Pillar**: Never allow infinite free energy anywhere on the map or trivially cheap starter stockpiles that skip early power/extraction tiers.

### Pillar 3: Frictionless Blueprint & Feedback Iteration
- **Promise**: Redesigning, scaling, and diagnosing a factory is fast, transparent, and punishment-free.
- **Design Test**: Can a player drag Manhattan belt corners, pipette (`Q`), capture/rotate/stamp `AFBP1:` blueprints (`Ctrl+C`/`R`), inspect bottlenecks via 60s telemetry (`P`) and Alt-Mode, and dismantle with 100% resource + buffer refund?
- **Anti-Pillar**: Never destroy buffered items on dismantle or recipe swap, and never bury bottlenecks behind opaque counters.

### Pillar 4: Zero-Footprint Accessible Precision
- **Promise**: Every visual icon, sound cue, and interaction is built procedurally in pure TypeScript with WCAG 2.1 AA accessibility and zero external runtime assets.
- **Design Test**: Does the game boot cleanly with zero runtime dependencies, zero emojis (`?scene=figures`), full Keyboard + Gamepad parity, scalable UI text, 4 colorblind modes with non-color shapes, reduced-motion safety, and `PT-BR`/`EN` localization?
- **Anti-Pillar**: Never ship Unicode emoji placeholders, color-only status cues, or unskippable strobe sequences.

---

## 6. Visual Identity Anchor

> **One-Line Rule:** High-contrast volcanic basalt dark mode illuminated by FICSIT industrial amber logistics, plasma-cyan high-tech telemetry, and unmistakable procedural silhouettes with zero emojis.

- **Principles**: Instant icon legibility at `24px–48px`; strict silhouette hierarchy (raw jagged ores vs beveled ingots vs precision cogs/wafers/cores); persistent non-color cues paired with every semantic status/tier color; responsive 2.5D depth via south chassis bevels and pooled particle feedback. See [art-bible.md](../art/art-bible.md).

---

## 7. Core Loops

1. **Micro Loop (30 seconds)**: Spot a vein or bottleneck -> drag belts or place an extractor/processor -> watch ore enter and refined plates/components stream toward the Hub.
2. **Meso Loop (5 minutes)**: Wire a new multi-input production line (`foundry` or `assembler`) -> expand Coal/Solar+Accumulator/Geothermal capacity to match demand -> feed Research Labs (`2x` efficiency) to unlock the next Tech Tier.
3. **Macro Session Loop (15–45 minutes)**: Escalate from basic iron/copper/stone smelting (Phase 1) through steel/circuits/rotors (Phase 2), modular frames/concrete (Phase 3), silicon/processors (Phase 4), to Quantum Cores & Orbital Ascension (Phase 5) -> trigger 5 Orbital Rocket Launches -> reach Victory screen -> continue megafactory scaling or share `AFBP1:` blueprints.

---

## 8. Player Types

- **Systems Optimizer**: Tunes exact `1:2` / `2:1` ratios, harvests `+35%` Geothermal Resonance clusters, maximizes `c^1.6` overclock efficiency, and audits `stats` (`P`) production/consumption balance.
- **Modular Architect**: Builds compact tileable manifolds, captures `AFBP1:` blueprints, rotates and stamps symmetric arrays.
- **Sandbox Experimenter**: Launches the 1-click Showcase Demo or toggles `free_build` and speed multipliers in the Studio Tweak Panel (`G`).

---

## 9. Scope & Platform Tiers

- **In Scope (`v1.0` Web Standard)**: `64x64` seeded grid (`mulberry32`), 19 items, 14 recipes, 20 buildings, 6 tech tiers, 5 orbital phases, two-phase 20 Hz engine, procedural Canvas 2D + pooled particles, Web Audio event bus + adaptive ambience, `AFBP1:` blueprints, validated `localStorage`/`.json` saves, Keyboard+Mouse+Gamepad, WCAG 2.1 AA, `pt-BR`/`en`.
- **Out of Scope**: Real-time multiplayer netcode, enemy combat/tower defense, infinite multi-chunk streaming beyond `64x64`, third-party runtime asset pipelines.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Per-tick/frame GC churn at 500+ buildings | Drops below `60 FPS` or `2.0 ms` tick budget | Cached sorted building lists, flat `4096` scratch pools, offscreen terrain/minimap/item-atlas caches, typed `ParticlePool` |
| Economy / power progression traps | Tick-0 stockpile skips Tier 1–2; Coal dominates Solar; Iron scarcity on default seed | Rebalanced bootstrap stockpile, Solar/Accumulator buff, weighted outer iron veins, strict recipe `required_tech` gates |
| Untrusted save JSON / `AFBP1:` tampering | Crashes renderer or bypasses tech gates | Fail-closed structural validation (`save.ts`, `blueprints.ts`), `data/schemas/*.schema.json`, security fuzz suite, zero `innerHTML` |
| Accessibility barriers | Mouse-only, color-only statuses, focus loss on 250 ms refresh, 7 Hz rocket strobe | In-place DOM diffing, keyboard cursor + Gamepad API, 4 colorblind palettes + shape cues, `prefers-reduced-motion` + skip launch |
