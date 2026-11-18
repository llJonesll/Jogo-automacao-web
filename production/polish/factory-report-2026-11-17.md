# Polish & Performance Report — AETHERFORGE: Orbital Foundry v1.1.0

- **Date:** 2026-11-17
- **Budgets (`project.yaml`):** `60 FPS` (`16.67 ms` frame budget), `<= 2.0 ms` sim tick budget (`20 Hz`), `<= 1500` draw calls/frame, `<= 128 MB` memory ceiling

---

## 1. Measured Performance & Bundle Comparison (`v1.0.0` vs. `v1.1.0`)

| Metric | `v1.0.0` Baseline (`20288dd`) | `v1.1.0` Integrated | Notes |
|---|---|---|---|
| **545-Entity Megafactory Sim Tick** | `NOT ASSESSED` (no `soak.test.ts`; 4x/tick `Object.values()`, `new Map()`, `.sort()`, `delete`) | **`0.0951 ms/tick`** (`114.09 ms` over `1,200` ticks) | Measured directly via Vite SSR bench on `soak.test.ts` 545-building layout; **4.75% of `2.0 ms` budget** |
| **78-Entity Showcase Demo Sim Tick** | `NOT ASSESSED` | **`0.0162 ms/tick`** (`58.22 ms` over `3,600` ticks) | Full 180s day/night cycle simulated in `58.22 ms` |
| **Vitest Suite Coverage & Duration** | `4` files, `15/15` tests (`692 ms`) | **`7` files, `32/32` tests (`1.15 s`)** | Added `data-schema` (6), `security-fuzz` (3), and `soak` (8) |
| **Production Build (`npm run build`)** | `24` modules, `344 ms` | **`26` modules, `502 ms`** | Zero runtime dependencies |
| **`dist/index.html`** | `0.46 kB` (`0.31 kB` gzip) | **`0.57 kB` (`0.34 kB` gzip)** | — |
| **`dist/assets/*.css`** | `7.94 kB` (`2.29 kB` gzip) | **`12.34 kB` (`3.12 kB` gzip)** | Added scalable `--ui-scale`, 4 colorblind themes, `:focus-visible`, reduced-motion rules |
| **`dist/assets/*.js`** | `116.71 kB` (`35.62 kB` gzip) | **`206.65 kB` (`61.68 kB` gzip)** | Added `ParticlePool`, offscreen caches/atlas, Web Audio bus + ambient, `GamepadController`, non-destructive DOM patching, strict save/blueprint validation |

---

## 2. Simulation Hot-Path Optimizations (`src/game/`)

- Eliminated 4x/tick `Object.values(world.buildings)` allocations via WeakMap-cached `id`-sorted entity lists (`getWorldBuildingLists`) rebuilt only on `placeBuilding` / `removeBuilding` / `deserializeWorld`.
- Replaced per-tick `new Map()` allocations with fixed `4096`-tile flat indexable arrays and reusable `BeltSlot` / `TunnelItem` / `PushProposal` / `PullProposal` / `tickEvents` pools.
- Startup-cached `RECIPES_BY_BUILDING`, `TECH_BY_ID`, `VALID_*_IDS`, and frozen `DEFAULT_CONFIG` (`src/core/data.ts`), eliminating per-tick `JSON.parse(JSON.stringify(...))` and `.filter()` calls.
- Replaced `delete` on item maps with zeroing counts (`= 0`) to preserve V8 hidden classes and updated `telemetry` buckets in place.

---

## 3. Rendering & VFX Architecture (`src/render/`)

- **Offscreen Caching:** Static basalt terrain + weighted ore deposits pre-baked onto an offscreen canvas keyed by `(seed, size, colorblindMode)` (`1` `drawImage` blit/frame + animated viewport geothermal vents); `64x64` `ImageData` minimap cache rebuilt only on dirty state; `3` pre-baked radial glow canvases (`cyan`, `orange`, `indigo`) with smooth dawn/dusk twilight transitions; pre-baked `19`-item sprite atlas (`drawItemFromAtlas`) for both normal and colorblind modes.
- **Zero-GC Pooled Particles (`src/render/particles.ts`):** `512`-slot Struct-of-Arrays TypedArray ring buffer (`ParticlePool`) driving build/dismantle/mine bursts, smelter/foundry/coal embers & wisps, miner ore chips, assembler/lab cyan & indigo sparks, geothermal steam, and multi-stage orbital rocket exhaust + shockwave rings.
- **2.5D & Interpolation Polish:** Sub-tick `simAlpha` smoothing on conveyor items and 2-segment articulated inserter arms; south-facing 2.5D chassis bevels; curved corner belt rails; `devicePixelRatio` HiDPI canvas scaling; `reducedMotion` clamping.

---

## 4. Audio Mix & UX/Accessibility Polish (`src/audio/`, `src/ui/`, `src/input/`)

- **Web Audio Event Bus & Mix (`src/audio/synth.ts`):** Routed all `20` `AudioEventId` events through `uiGain` / `sfxGain` / `ambientGain` -> `masterGain` -> `DynamicsCompressorNode` -> optional `ChannelMergerNode` (`Mono`), with per-event cooldowns, LCG pitch jitter, adaptive exoplanet wind + machine hum (`updateAmbient`), and persisted Mix sliders + Mono toggle in the Settings (`G`) modal.
- **UX & A11y (`src/ui/hud.ts`, `src/input/gamepad.ts`, `src/style.css`):** Full command decoupling behind `HudActions`, non-destructive in-place DOM patching preserving focus/scroll across 250ms telemetry ticks, FIFO queued toast stack (`<= 3` visible) captioning critical audio events, Keyboard grid cursor (`I/J/K/L`, `Enter`, `Delete`, `Home`, `[`/`]`), `GamepadController` (`navigator.getGamepads()`, deadzone `0.18`), `--ui-scale` (`100%–150%`), `4` colorblind themes with shape/glyph cues, skippable rocket launch animation, and `100%` `PT-BR`/`EN` localization parity.
