# Internal & Player-Facing Changelog: v1.0.0

Date: 2026-11-17
Commits: `0540b60..HEAD` (tags `v0.1.0` -> `v0.2.0` -> `v0.3.0` -> `v0.4.0` -> `v1.0.0`)

## New Features
- **Core World & Data Engine (`v0.1.0`)**: Seeded `64x64` exoplanet generator (`mulberry32`), 19 interconnected items, 14 recipes, 20 buildings, 6 tech tiers, 5 orbital phases, and live `data/config.json` tuning schema.
- **Order-Independent Logistics & Production (`v0.2.0`)**: Two-phase transfer staging eliminates scan-order bias across `N/E/S/W`, supporting splitters, mergers, 5-tile underground tunnels, articulated inserters, and auto-locking multi-input foundries/assemblers.
- **Power, Overclock, Progression & Blueprints (`v0.3.0`)**: `c^1.6` overclocking, `+35%` geothermal vent adjacency bonus, day/night solar + accumulators, 60s rolling throughput telemetry, `AFBP1:` Base64 blueprints with 90° rotation, validated JSON/localStorage saves, and pre-built Showcase factory.
- **Procedural 2.5D Canvas, Web Audio & HUD (`v0.4.0`)**: Zero-emoji procedural icons/machines, night glow blooms, orbital rocket launch VFX, Web Audio synth, PT-BR/EN localization, colorblind mode, smart drag-belt cornering, and `window.game` automation hook.
- **GitHub Pages, Templates & QA Polish (`v1.0.0`)**: Published static build via `gh-pages` branch, GitHub Actions CI & Pages templates under `docs/github-workflows/`, issue/PR templates, and full `?scene=figures` + hotbar readability fixes.

## Improvements
- Localized all Studio Tuning Panel (`G`) descriptions into PT-BR.
- Widened `?scene=figures` catalog cards with wrapped labels and set `width: max-content` on `.hud-hotbar` to eliminate overflow clipping.

## Bug Fixes
- Fixed North-facing belt acceptance for Inserters in `src/game/simulation.ts` (`fromSide` passed properly instead of hardcoded `0`).
- Fixed `?scene=figures` label clipping in `src/render/sprites.ts`.

## Metrics
- Source files (`src/`): 18 (17 TypeScript + 1 CSS)
- Unit tests (`tests/unit/`): 4 suites, 15 passing tests
- Runtime dependencies: 0
