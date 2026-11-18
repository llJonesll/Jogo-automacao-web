# Architectural Control Manifest — AETHERFORGE: Orbital Foundry

**Status:** Active Governance
**Last Verified:** 2026-11-17
**Derived From:** [ADR-001](./adr-001-two-phase-logistics.md), [ADR-002](./adr-002-zero-dep-procedural.md), [ADR-003](./adr-003-trust-boundary-validation.md), [ADR-004](./adr-004-ui-command-accessibility.md), [ADR-005](./adr-005-audio-event-bus.md), [Web Engine Reference](../engine-reference/web/VERSION.md)

---

## 1. Layer Hierarchy & Dependency Direction

Dependency flow is strictly unidirectional from Foundation inward to Presentation:

```text
data/*.json & data/schemas/*.schema.json
        ^
   src/core/*         (types, data, seeded rng — pure TS, zero DOM/game imports)
        ^
   src/game/*         (world, simulation, power, progression, blueprints, save, demo)
        ^
  +-----+-----+-----+
  |           |     |
src/render/*  src/audio/*  src/ui/* & src/input/*
  ^           ^            ^
  +-----------+------------+
              |
   src/main.ts & src/hook.ts  (orchestrator, RAF loop, HudActions, window.game)
```

### Forbidden Dependency Edges
- `src/core/**` MUST NOT import from `src/game/**`, `src/render/**`, `src/audio/**`, `src/ui/**`, `src/input/**`, or DOM globals.
- `src/game/**` MUST NOT import DOM, Canvas, Web Audio, or `src/ui/**` (except `src/game/save.ts` safe `localStorage` adapter with null fallback).
- `src/render/**` MUST NOT import from `src/ui/**` or mutate `WorldState` (localized labels pass via optional arguments from `src/main.ts`).
- `src/ui/**` MUST NOT mutate `WorldState` or `GameConfig` directly; every mutation passes through `HudActions` callbacks in `src/main.ts`.
- External runtime packages in `package.json` `dependencies` are **strictly forbidden** (zero runtime dependencies).

---

## 2. Foundation & Data Rules (`src/core/**`, `data/**`)

| Rule ID | Mandate | Source |
|---|---|---|
| FND-01 | Simulation runs deterministically at `20 Hz` (`DT = 0.05s`) on a `64x64` orthogonal grid (`WORLD_SIZE = 64`, Hub `(31..33, 31..33)`). | ADR-001 |
| FND-02 | Gameplay and world generation MUST use seeded `mulberry32` (`src/core/rng.ts`); `Math.random()` is forbidden inside `src/core/` and `src/game/`. | AGENTS.md |
| FND-03 | All `data/*.json` files use `snake_case` keys, conform to `data/schemas/*.schema.json`, and contain zero orphaned items, recipes, or feature flags. | AGENTS.md |
| FND-04 | All tuning knobs in `data/config.json` strictly follow `{ value, min, max, step, description }` bounds (`min <= value <= max`, `step > 0`). | AGENTS.md |
| FND-05 | Intentional architectural ceilings MUST carry `// shortcut: <ceiling>, <upgrade path>` and be registered in `PONYTAIL-DEBT.md`. | AGENTS.md |

---

## 3. Simulation & Progression Rules (`src/game/**`)

| Rule ID | Mandate | Source |
|---|---|---|
| SIM-01 | `stepSimulation` MUST preserve order-independent two-phase semantics: Phase 1 internal advance, Phase 2 pre-commit capacity check + deterministic tie-break `(tick + tx * 31 + ty) % candidates.length` + atomic commit. | ADR-001 |
| SIM-02 | Hot-path tick functions (`stepSimulation`, `stepPower`, `stepResearchLab`) MUST avoid per-tick heap churn: reuse cached sorted building arrays, pre-allocated `4096`-tile scratch buffers, zeroed buffer slots (`= 0` instead of `delete`), and startup-cached `RECIPES_BY_BUILDING` + `DEFAULT_CONFIG`. | ADR-001 |
| SIM-03 | Building state changes MUST align with explicit `BUILDING_STATUS_TRANSITIONS` (`working`, `idle`, `no_power`, `input_starved`, `output_full`, `no_resource`, `unpaired`). | ADR-001 |
| SIM-04 | Tunnel pairing (`pairUndergroundTunnel`) MUST pair symmetrically in both backward and forward directions up to `max_span = 5`; unpaired entrances buffer up to `4` items, paired tunnels up to `10`. | ADR-001 |
| SIM-05 | Tech gates (`required_tech`, `overclock`, `orbital_overdrive`) MUST be enforced unless `config.free_build.value >= 1`. | Design Consistency |
| SIM-06 | Dismantling buildings (`removeBuilding`) MUST refund building cost and internal buffered/stored items (`slots`, `tunnelQueue`, `inserterItem`, `inputBuffer`, `outputBuffer`, `inventory`) to `world.stockpile`. | Conservation Invariant |

---

## 4. Security & Trust Boundaries (`save.ts`, `blueprints.ts`, `hud.ts`, `main.ts`)

| Rule ID | Mandate | Source |
|---|---|---|
| SEC-01 | Never pass user-supplied, save-derived, or blueprint-derived strings to `innerHTML`, `outerHTML`, or `eval`. Construct all DOM via `createElement`, `createElementNS`, and `textContent`. | ADR-003 |
| SEC-02 | `deserializeWorld` MUST reject root arrays (`Array.isArray`), ignore prototype keys (`__proto__`, `constructor`, `prototype`), validate every `resources` entry, building array/buffer cap (`buildings <= 4096`, `slots <= 2`, `tunnelQueue <= 10`), `telemetry.bucketIndex` (`0..59`), and 1:1 `grid` <-> `buildings` bijection before returning `ok: true`. | ADR-003 |
| SEC-03 | `decodeBlueprint` MUST validate `AFBP1:` prefix, `<= 64,000` byte cap, strict UTF-8 (`TextDecoder('utf-8', { fatal: true })`), non-array root, unique `(dx, dy)` entries, `RECIPES[recipeId].building === type`, and forbid `recipeId` on non-processors. | ADR-003 |
| SEC-04 | File upload in HUD MUST verify `file.size <= 4_000_000` before `file.text()`; `window.game.step(sec)` MUST cap step duration (`<= 3600s`). | ADR-003 |

---

## 5. Presentation, Accessibility & Audio Rules (`src/render/**`, `src/ui/**`, `src/input/**`, `src/audio/**`)

| Rule ID | Mandate | Source |
|---|---|---|
| VIS-01 | Zero emojis or icon font glyphs anywhere in `src/`, `data/`, `index.html`, or docs. Every item (`19`) and building (`20`) renders procedurally and appears in `?scene=figures`. | ADR-002 |
| VIS-02 | Render frame uses cached offscreen terrain, 64x64 minimap cache, pre-baked glow sprites, 19-item sprite atlas, typed `ParticlePool`, and DPR-scaled canvas within `<= 1500` draw calls and `< 16.67 ms`. | ADR-002 |
| UX-01 | HUD patches existing DOM elements in place without wiping focus/scroll; modals trap focus, restore focus on close, support `Esc` from inputs, and block background canvas hotkeys while open. | ADR-004 |
| UX-02 | Full input parity across Mouse, Keyboard (`WASD`, `I/J/K/L` cursor, `Enter`, `Delete`, `1-0`, `T/P/B/G/H/V/R/Q/Alt/Space/Esc`), and Gamepad (`navigator.getGamepads()`, deadzone `0.18`). | ADR-004 |
| UX-03 | WCAG 2.1 Level AA compliance: `>= 4.5:1` text contrast, `--ui-scale` scalable text, 4 colorblind modes paired with mandatory non-color shape cues, `prefers-reduced-motion` + skippable rocket launch animation, and 100% `pt-BR`/`en` localization via `src/ui/i18n.ts`. | ADR-004 |
| AUD-01 | All UI/gameplay SFX emit through `SoundEngine.emit(AudioEventId)` routed via `uiGain` / `sfxGain` / `ambientGain` -> `masterGain` -> `DynamicsCompressorNode` -> optional mono downmix, with cooldown throttling and paired visual toast captions for critical events. | ADR-005 |

---

## 6. Global Naming & Performance Budgets (`project.yaml`)

- **Naming**: Classes `PascalCase`, variables/methods `camelCase`, constants `SCREAMING_SNAKE`, signals/events `on_event_name` / `snake_case` `AudioEventId`, files `kebab-case` (existing TS modules kept aligned).
- **Performance Budgets**: `60 FPS` (`16.67 ms` frame budget), `<= 2.0 ms` sim tick budget at `20 Hz`, `<= 1500` draw calls/frame, `<= 128 MB` memory ceiling.

---

## 7. Verification Gates

1. `npm run typecheck` — passes with `0` TypeScript errors.
2. `npm test` — all unit, schema/orphan, deterministic soak, and security fuzz tests pass.
3. `npm run build` — compiles cleanly into `dist/`.
4. `/?scene=figures` and `/?scene=figures&lang=en` — renders all 19 items and 20 buildings with zero console errors or emojis.
