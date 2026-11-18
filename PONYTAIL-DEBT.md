# Ponytail Shortcut Debt Ledger

All intentional ceilings and simplifications follow `shortcut: <ceiling>, <upgrade path>`.

## `src/audio/synth.ts`
- `src/audio/synth.ts:123`, deterministic LCG noise buffer for orbital launch SFX. **ceiling:** capped at 1.6s launch SFX. **upgrade:** move to AudioWorklet if continuous procedural music is added.

## `src/core/data.ts`
- `src/core/data.ts:18`, flat typed world grid layout. **ceiling:** fixed 64x64 flat grid (4096 tiles). **upgrade:** switch to sparse chunk map if world exceeds 128x128.

## `src/game/save.ts`
- `src/game/save.ts:5`, browser local persistence slot. **ceiling:** single localStorage autosave slot (~4 MB browser quota). **upgrade:** migrate to IndexedDB multi-slot if saves exceed 2 MB.

3 markers, 0 with no trigger.
