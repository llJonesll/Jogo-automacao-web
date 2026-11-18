# Architecture — AETHERFORGE: Orbital Foundry

## System Layer Map
Dependency flow is strictly unidirectional (`core` <- `game` <- `render`/`audio`/`ui`/`main`):

```text
+-------------------------------------------------------------------+
|  src/main.ts & src/hook.ts  (Loop, Input, window.game test hook)  |
+-------------------+-----------------------+-----------------------+
                    |                       |
          +---------v---------+   +---------v---------+
          |   src/ui/hud.ts   |   |  src/render/*.ts  |
          |   src/ui/i18n.ts  |   |  src/audio/synth  |
          +---------+---------+   +---------+---------+
                    |                       |
          +---------v-----------------------v---------+
          |                src/game/*                 |
          |  world, simulation, power, progression,   |
          |  blueprints, save, demo                   |
          +---------------------+---------------------+
                                |
          +---------------------v---------------------+
          |                src/core/*                 |
          |  types.ts, rng.ts, data.ts (+ data/*.json)|
          +-------------------------------------------+
```

## Two-Phase Tick Data Flow
1. `stepSimulation(world, config, audioEvents)` runs at fixed `DT = 0.05s` (`20 Hz`).
2. `stepPower(world, config, dt)` computes day/night solar factor, coal fuel burning, geothermal generation, accumulator charge/discharge, and returns `satisfaction` (`0..1`).
3. **Phase 1 (Internal Advance)**: Advances belt item positions, underground tunnel travel queues, inserter swing angles, miner extraction cycles, and machine crafting progress scaled by `clock * (1 + geoBonus) * satisfaction`.
4. **Phase 2 (Proposal + Snapshot + Atomic Commit)**: Emits transfer proposals from ready outputs, evaluates target capacity against pre-commit state with deterministic fair arbitration, commits accepted item moves, updates Orbital Hub stockpile / Tech / Phase progress, and logs 60s rolling telemetry.

## API Boundaries
- `src/game/` contains **zero DOM, Canvas, or `window` dependencies** (except `save.ts` safe localStorage adapter with fallback), enabling pure Node Vitest verification.
- `src/ui/` never mutates simulation internals directly; all actions pass through command functions (`placeBuilding`, `removeBuilding`, `setRecipe`, `setClock`, `unlockTechDirect`, `placeBlueprint`, `mineTileManual`).
- `data/*.json` acts as the single source of truth for items, recipes, buildings, techs, orbital phases, and live tuning defaults.

## Architectural Decisions (ADRs)
- **ADR-001 — Order-Independent Two-Phase Transfer**: Prevents directional conveyor speed bias across `N/E/S/W` during row-major grid scans.
- **ADR-002 — Zero-Dependency Procedural Pipeline**: Pure TypeScript + Canvas 2D + Web Audio API ensures instant startup, offline/static GitHub Pages hosting (`base: './'`), and zero emoji art violations.
- **ADR-003 — Strict Trust-Boundary Validation**: Base64 blueprint strings (`AFBP1:`) and save JSON payloads undergo structural schema and coordinate clamping validation before world creation/mutation.
