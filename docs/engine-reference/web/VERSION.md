# Engine Reference — Web Static Runtime (Vite + TypeScript + Canvas 2D + Web Audio)

**Last Verified:** 2026-11-17
**Project:** AETHERFORGE: Orbital Foundry
**Status:** Active Reference

---

## Toolchain Versions

| Component | SemVer Range (`package.json`) | Locked / Target Baseline | Role |
|---|---|---|---|
| Vite | `^6.2.0` | `6.2` (`6.4.6` in lockfile) | Dev server, ESM bundler, static `dist/` build (`base: './'`) |
| TypeScript | `^5.8.2` | `5.8` (`5.9.3` in lockfile) | Strict static typing (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noEmit`) |
| Vitest | `^3.0.8` | `3.0` (`3.2.7` in lockfile) | Deterministic Node-environment simulation, schema, soak, and fuzz test runner |
| HTML5 Canvas 2D | Living Standard | Browser native | Procedural 2.5D vector tile, sprite atlas, offscreen cache, lighting, and particle rendering |
| Web Audio API | W3C Web Audio | Browser native | Procedural oscillator/noise synthesis, bus gain routing, `DynamicsCompressorNode`, mono downmix |
| Node.js | `>=22.12.0` | `22.12+` | Build and test execution runtime |

## Runtime Dependency Policy
- **Zero runtime dependencies**: `package.json` contains zero `dependencies`. All simulation, procedural graphics, procedural audio, UI DOM construction, localization, and serialization run natively in browser standards.
- **Static Deployment**: Built output (`dist/`) uses relative `./` asset base (`vite.config.ts`) for offline and GitHub Pages compatibility.

## Browser Platform APIs Used
- `CanvasRenderingContext2D` + offscreen `<canvas>` surfaces (`world`, `minimap`, `glow`, and `item` atlases) scaled by `window.devicePixelRatio`.
- `AudioContext` (`uiGain`, `sfxGain`, `ambientGain` -> `masterGain` -> `DynamicsCompressorNode` -> optional mono `ChannelMergerNode` -> `ctx.destination`).
- `Gamepad API` (`navigator.getGamepads()`, `gamepadconnected`, `gamepaddisconnected`) polled in `requestAnimationFrame` with `0.18` stick deadzone.
- `Storage` (`localStorage`) wrapped in try/catch adapter for single-slot save and user accessibility/locale preferences.
- `TextEncoder` / `TextDecoder('utf-8', { fatal: true })` and Base64 (`btoa` / `atob`) for `AFBP1:` blueprint interchange.
- `requestAnimationFrame` decoupled from fixed `20 Hz` (`DT = 0.05s`) simulation accumulator (`simAlpha` interpolation).

## Performance Budgets (`project.yaml`)
- **Target Framerate**: `60 FPS` (`frame_budget_ms: 16.67 ms`)
- **Simulation Tick Budget**: `2.0 ms` max at `20 Hz` (`DT = 0.05s`)
- **Draw Call Limit**: `<= 1500` Canvas 2D draw operations per frame via offscreen terrain/minimap/atlas caching
- **Memory Ceiling**: `128 MB` total JS + Canvas surface heap

## Verification Commands
```bash
npm run typecheck  # tsc --noEmit (strict TypeScript validation)
npm test           # vitest run (deterministic Node unit, schema, soak, and security tests)
npm run build      # tsc --noEmit && vite build (production dist/ bundle)
npm run dev        # local Vite dev server (supports ?scene=figures and ?lang=en|pt-BR)
```
