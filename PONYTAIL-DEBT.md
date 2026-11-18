# Ponytail Shortcut Debt Ledger

All intentional ceilings and simplifications follow `shortcut: <ceiling>, <upgrade path>`.

## `src/audio/synth.ts`
- `src/audio/synth.ts:359`, pre-baked LCG noise buffers (`1.6s` launch + `3.0s` looping wind). **ceiling:** capped at fixed pre-rendered noise buffers (`1.6s` launch SFX + `3.0s` crossfaded wind bed). **upgrade:** move to `AudioWorklet` if continuous procedural music is added.

## `src/core/data.ts`
- `src/core/data.ts:28`, flat typed world grid layout. **ceiling:** fixed `64x64` flat grid (`4096` tiles). **upgrade:** switch to sparse chunk map if world exceeds `128x128`.

## `src/game/save.ts`
- `src/game/save.ts:41`, browser local persistence slot. **ceiling:** single `localStorage` autosave slot (`~4 MB` browser quota). **upgrade:** migrate to IndexedDB multi-slot if saves exceed `2 MB`.
- `src/game/save.ts:163`, deserialization building ceiling. **ceiling:** capped at `4096` buildings matching `64x64` grid. **upgrade:** raise cap if sparse chunk worlds are added.

## `src/game/simulation.ts`
- `src/game/simulation.ts:102`, pre-allocated simulation scratch buffers and pools. **ceiling:** fixed `4096`-tile flat scratch buffers and `8192`-slot pools. **upgrade:** switch to sparse maps/dynamic pools if world exceeds `128x128`.

## `src/render/particles.ts`
- `src/render/particles.ts:77`, Struct-of-Arrays TypedArray particle pool. **ceiling:** fixed `512`-slot SoA ring buffer overwrites oldest slot if saturated. **upgrade:** raise capacity or split layers if megafactory VFX exceeds `512` concurrent particles.

## `src/render/renderer.ts`
- `src/render/renderer.ts:446`, full-planet offscreen terrain canvas cache. **ceiling:** terrain offscreen cache assumes `WORLD_SIZE = 64` (`3072x3072`). **upgrade:** switch to chunked `512px` tile cache if world exceeds `64x64`.

## `src/render/sprites.ts`
- `src/render/sprites.ts:59`, icon dataURL memoization maps. **ceiling:** `256`-entry FIFO dataURL cache cap. **upgrade:** switch to LRU if dynamic skinning is added.

8 markers, 0 with no trigger.
