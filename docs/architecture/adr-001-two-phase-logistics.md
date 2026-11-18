# ADR-001: Order-Independent Two-Phase Logistics & Zero-Allocation Tick Loop

- **Status:** Accepted
- **Date:** 2026-11-17
- **System Owners:** `src/core/data.ts`, `src/game/simulation.ts`, `src/game/power.ts`, `src/game/progression.ts`

## Context
Row-major or insertion-ordered entity iteration causes directional bias when simulating conveyor logistics in a single pass: items traveling North or West can advance multiple tiles in one tick while items traveling South or East advance only once. Additionally, per-tick object, array, closure, and `Map` allocations in a 20 Hz simulation loop create V8 garbage-collection spikes when scaling toward 1,000+ buildings.

## Decision
1. **Fixed 20 Hz Two-Phase Simulation (`DT = 0.05s`)**:
   - **Phase 0 (Power)**: `stepPower` calculates solar factor, coal burn, geothermal output, accumulator charge/discharge, and grid `satisfaction` (`[0.0, 1.0]`).
   - **Phase 1 (Internal Advance)**: Advances belt slot progress, underground tunnel transit queues, inserter arm swings, miner extraction cycles, lab research, and machine crafting scaled by `clock * (1 + geoBonus) * satisfaction` without moving items between tiles.
   - **Phase 2 (Proposal + Pre-Commit Snapshot + Atomic Commit)**: Every ready source emits at most one transfer proposal evaluated against pre-commit target capacity. Multi-source collisions targeting the same tile resolve deterministically via `(tick + tx * 31 + ty) % candidates.length`, then commit atomically.
2. **Symmetric Bidirectional Tunnel Pairing & Throughput**:
   - Underground tunnel pairing searches both backward (`backDir`) and forward (`dir`) up to `max_span = 5` tiles so build order never creates unpaired traps. Unpaired entrances buffer up to `4` items; paired tunnels queue up to `10` items without `(dist + 1)` speed division penalizing span.
3. **Zero-Allocation Hot Paths**:
   - Cache `RECIPES_BY_BUILDING` and `DEFAULT_CONFIG` at startup; maintain deterministic `id`-sorted entity lists rebuilt only on placement/removal/load; reuse pre-allocated `4096`-tile flat scratch buffers and proposal pools; zero depleted buffer counts in place (`= 0`) instead of `delete` to prevent hidden-class deoptimization; keep explicit `BUILDING_STATUS_TRANSITIONS` state records.

## Consequences
- **Positive:** Conveyor lines facing N, E, S, and W behave identically down to the exact simulation tick. Tick time stays well under the `2.0 ms` budget at high building counts.
- **Negative:** Adding a new logistics entity requires implementing both Phase 1 advancement and Phase 2 capacity/proposal contracts rather than mutating neighbor tiles directly.

## References
- [factory-systems.md](../../design/gdd/factory-systems.md)
- [control-manifest.md](./control-manifest.md)
