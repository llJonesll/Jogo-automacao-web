# ADR-002: Zero-Dependency Procedural Canvas 2D & Cached Render Pipeline

- **Status:** Accepted
- **Date:** 2026-11-17
- **System Owners:** `src/render/renderer.ts`, `src/render/sprites.ts`, `src/render/particles.ts`, `src/style.css`

## Context
External sprite sheets, icon fonts, or third-party WebGL/game frameworks increase bundle size, introduce supply-chain/network dependencies, and violate the Zero Emoji Art rule (`AGENTS.md`). Conversely, drawing thousands of uncached Canvas paths, gradients, and string allocations per frame at 60 FPS exceeds the `16.67 ms` frame budget and `1500` draw call limit.

## Decision
1. **Zero Runtime Dependencies & Zero Emoji Art**:
   - Ship pure TypeScript + HTML5 Canvas 2D + inline SVG (`document.createElementNS`) with zero runtime npm packages and zero Unicode emoji or icon-font glyphs anywhere in code, data, or HTML.
   - Support `?scene=figures` to render every item (`19`) and building (`20`) side-by-side for visual and colorblind audits.
2. **Offscreen Caching & Zero-Allocation Render Frame**:
   - Bake static basalt terrain and mineral veins onto an offscreen canvas keyed by `world.seed`, drawing only animated `geothermal_vent` tiles per frame.
   - Cache the `64x64` minimap onto an offscreen canvas refreshed on world change/throttle; pre-bake `3` radial glow sprites (cyan, amber, indigo) and a `19`-item sprite atlas (`normal` and `colorblind` variants) for fast `drawImage` blits on conveyor belts.
   - Pre-allocate `ParticlePool` using flat `TypedArray` buffers (`cap = 512`) and reuse scratch structs for belt item projection and glyph options.
   - Scale `#game-canvas` by `window.devicePixelRatio` for crisp HiDPI typography and line art.
3. **Strict Layer Isolation**:
   - `src/render/` imports only from `src/core/` and `src/game/` (read-only state); localized labels for `?scene=figures` are injected via optional parameters from `src/main.ts` so `src/render/` never imports `src/ui/`.

## Consequences
- **Positive:** Instant startup, offline static hosting, crisp HiDPI procedural 2.5D silhouettes with south-facing bevels and articulated inserters, and draw call counts well below `1500` per frame.
- **Negative:** Every new item or building requires procedural Canvas 2D vector code in `src/render/sprites.ts` and an offscreen atlas update.

## References
- [art-bible.md](../../design/art/art-bible.md)
- [VERSION.md](../engine-reference/web/VERSION.md)
