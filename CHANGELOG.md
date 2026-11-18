# Changelog

All notable changes to **AETHERFORGE: Orbital Foundry** are documented in this file following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

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
