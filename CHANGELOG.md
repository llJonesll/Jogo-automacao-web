# Changelog

All notable changes to **AETHERFORGE: Orbital Foundry** are documented in this file following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-17

### Added
- **Engine Performance & Mechanics (`src/core/`, `src/game/`)**: WeakMap-cached sorted entity lists, `4096`-tile flat scratch buffers, bidirectional underground tunnel pairing (`4`-item unpaired entrance buffer, span-independent `4.0/s` speed), `8.0/s` 2-slot splitters/mergers, dismantle buffer/slot refunds, Research Lab speed/geoBonus scaling + active-tech input filtering, explicit `BUILDING_STATUS_TRANSITIONS`, `orbital_overdrive` (`+50%` global speed at Tier 6), and tech-gated `assemble_processor` (`T4`) & `assemble_quantum` (`T5`).
- **2.5D Rendering, VFX & Offscreen Caches (`src/render/`)**: TypedArray SoA `ParticlePool` (`512` cap) for build/dismantle/mine bursts, smelter embers, ore chips, cyan/indigo sparks, geothermal steam, and multi-stage rocket plumes; offscreen terrain/ore cache, `64x64` `ImageData` minimap cache, 3 pre-baked glow sprites with twilight ramp, `19`-item sprite atlas, sub-tick `simAlpha` smoothing, 2-segment articulated inserter arms, curved corner belt rails, Power Grid overlay (`V`), DPR-scaled canvas, and `FiguresGalleryLabels` localization.
- **Web Audio Event Bus & Mix (`src/audio/synth.ts`)**: `AudioEventId` bus (`20` events) routed via `uiGain` / `sfxGain` / `ambientGain` -> `masterGain` -> `DynamicsCompressorNode` -> optional `ChannelMergerNode` (`Mono`), cooldown throttling, adaptive wind + machine hum (`updateAmbient`), and live volume sliders + Mono toggle in Settings (`G`) persisted in `localStorage`.
- **UX, Accessibility & Multi-Input (`src/ui/`, `src/input/`, `src/style.css`)**: Strict `HudActions` command decoupling, non-destructive in-place DOM patching preserving focus/scroll, FIFO queued toast stack with audio captions, Keyboard grid cursor (`I/J/K/L`, `Enter`, `Delete`, `Home`, `[`/`]`), `GamepadController` (`navigator.getGamepads()`, deadzone `0.18`), `--ui-scale` (`100%–150%`), `4` colorblind palettes paired with non-color geometric symbols, `@media (prefers-reduced-motion: reduce)` + skippable rocket launch animation, and `100%` `PT-BR`/`EN` localization.
- **Security & Schema Test Coverage (`tests/unit/`)**: `data-schema.test.ts` (validating all `data/schemas/*.schema.json` + exact `PT-BR`/`EN` key parity), `security-fuzz.test.ts` (root array / `__proto__` / resource / bijection / `AFBP1:` fuzzing), and `soak.test.ts` (`3,600`–`4,000`-tick conservation, `545`-entity `0.0951 ms/tick` stress, save parity, and Phases 1–5 victory).
- **Studio Design & Release Governance (`design/`, `docs/`, `production/`)**: `game-concept.md`, `systems-index.md`, `design/registry/entities.yaml`, `art-bible.md`, `sound-bible.md`, `accessibility-requirements.md`, `ux/hud.md`, `ux/interaction-patterns.md`, `adr-001`..`adr-005`, `control-manifest.md`, `data/schemas/*.schema.json`, QA Plan/Smoke/Soak/Sign-off, Full Security Audit, Polish Report, and `release-checklist-v1.1.0.md`.

### Changed
- Rebalanced starter stockpile (`60 iron_plate, 30 copper_wire, 25 iron_gear, 20 concrete, 10 coal`), Hub RTG (`20 MW`), Solar Panel (`14 MW`), Accumulator (`180 MJ`, `15 MW`), Coal burn wired to `ITEMS.coal.fuel_value / generates_mw` (`4.0s`), Tier 3/4/5 progression costs, and weighted outer `iron_ore` veins (`~41%`) with magma vent protection.
- Fixed Inspector close button (`onCloseInspector`), Topbar `[Load Rocket]` Phase 5 Victory modal trigger, `setMachineRecipe` config forwarding, and removed the unused `"blueprints"` tech feature flag so all tech unlocks are actively enforced.

## [1.0.0] - 2026-11-17

### Added
- Complete GitHub configuration: `gh-pages` static hosting setup, ready-to-enable GitHub Actions CI & Pages workflow templates (`docs/github-workflows/ci.yml`, `docs/github-workflows/deploy.yml`), Issue templates, Pull Request template, and release category config (`.github/release.yml`).
- Release governance artifacts: `PONYTAIL-DEBT.md`, `production/releases/release-checklist-v1.0.0.md`, `docs/CHANGELOG.md`, and complete Portuguese `README.md`.
- Full PT-BR translations for Studio Tuning Panel (`data/config.json`) knob descriptions.

### Fixed
- Fixed `?scene=figures` catalog card label truncation by widening cards dynamically and adding two-line wrapping (`src/render/sprites.ts`).
- Fixed hotbar wrapping layout (`width: max-content` in `src/style.css`) so all 19 building tools remain visible without horizontal clipping.

## [0.4.0] - 2026-11-17

### Added
- Zero-emoji procedural Canvas 2D vector art (`src/render/sprites.ts`, `src/render/renderer.ts`) covering all 19 items and 20 buildings with 2.5D shadows, scrolling belt chevrons, animated drills/presses/arms, night lighting blooms, rocket launch VFX, and `?scene=figures` QA catalog.
- Zero-dependency Web Audio procedural SFX synthesizer (`src/audio/synth.ts`) with mute toggle (`M`).
- Full industrial HUD (`src/ui/hud.ts`) with PT-BR / EN localization (`src/ui/i18n.ts`), high-contrast colorblind toggle, inspector with `50%-250%` overclock slider, Tech/Stats/Blueprints/Tweak/Save/Help/Victory modals, smart drag-belt pathing (`src/main.ts`), and `window.game` test hook (`src/hook.ts`).

## [0.3.0] - 2026-11-17

### Added
- Power grid simulation (`src/game/power.ts`): Hub RTG, Coal Generator fuel burn, day/night Solar curve, 120 MJ Accumulators, Geothermal Power (+60 MW), non-linear `c^1.6` overclocking, and proportional brownout scaling.
- Progression & telemetry (`src/game/progression.ts`): 6-tier Tech Tree, 2x Research Labs, 5 Orbital Cargo Launch Phases, Victory state, and 60-second rolling items/min telemetry.
- Blueprint system (`src/game/blueprints.ts`): Region copy, 90° CW rotation with tunnel re-pairing, 3 starter blueprints, and validated `AFBP1:` Base64 import/export.
- Save persistence (`src/game/save.ts`) with strict trust-boundary validation and 1-click Showcase Demo Factory (`src/game/demo.ts`).
- Unit test suites `tests/unit/power-tech.test.ts` and `tests/unit/blueprints-save.test.ts`.

## [0.2.0] - 2026-11-17

### Added
- Deterministic 20 Hz fixed-timestep simulation (`src/game/simulation.ts`) with order-independent two-phase push/pull transfer resolution, underground tunnel pairing, 1->3 round-robin splitters, 3->1 mergers, articulated inserters, and multi-recipe auto-locking crafters.
- Unit test suites `tests/unit/logistics.test.ts` (including 4-way N/E/S/W symmetry guard) and `tests/unit/production.test.ts`.

## [0.1.0] - 2026-11-17

### Added
- Initial Vite + TypeScript + Vitest workspace scaffold with zero runtime dependencies.
- Game Studio governance docs (`project.yaml`, `AGENTS.md`, `design/game-brief.md`, `design/gdd/factory-systems.md`, `docs/architecture/architecture.md`, `evidence/nearest-game.txt`).
- Data-driven JSON tables (`data/config.json`, `data/factory_items.json`, `data/factory_recipes.json`, `data/factory_buildings.json`, `data/factory_techs.json`) and deterministic seeded world generator (`src/core/rng.ts`, `src/game/world.ts`).
