# Workspace Standards — AETHERFORGE: Orbital Foundry

This repository applies **Ponytail** engineering discipline alongside **Claude Code Game Studio** standards for Web (`TypeScript` + `Canvas 2D` + `Web Audio`).

## Engineering & Ponytail Rules
- **Zero runtime dependencies**: Ship pure TypeScript/Canvas/Web Audio with zero external runtime npm packages.
- **Minimum complete solution**: No speculative abstractions, wrapper classes, or single-implementation interfaces.
- **Shortcuts documented**: Any intentional ceiling or simplification carries `// shortcut: <ceiling>, <upgrade path>` and is tracked in `PONYTAIL-DEBT.md`.
- **Trust boundaries**: All imported save JSON and Base64 blueprint strings must be strictly validated before mutating world state; never pass user-controlled strings to `innerHTML`.

## Game Studio Web Rules
- **Zero emoji art**: Never use emojis or font icon glyphs in `src/`, `data/`, or `index.html`. Draw every item, machine, and HUD icon procedurally using Canvas 2D vector silhouettes or inline SVG. Support `?scene=figures` to render the complete entity catalog side by side.
- **Data-driven tuning (`data/*.json`)**: Use `[system]_[name].json` filenames with `snake_case` keys. Keep `data/config.json` tuning entries formatted as `{ "value", "min", "max", "step" }`. Zero orphaned items or recipes.
- **Deterministic simulation**: Fixed 20 Hz simulation tick (`DT = 0.05`), order-independent two-phase logistics transfer, and seeded `mulberry32` PRNG (`src/core/rng.ts`) — never `Math.random()` inside gameplay/world generation.
- **Decoupled UI & Localization**: Gameplay state lives in `src/game/` with zero DOM imports. UI reads snapshots and emits commands through `src/ui/i18n.ts` (`pt-BR` default + `EN`).
