# Factory Systems GDD — AETHERFORGE: Orbital Foundry

- **Status:** Approved
- **Author:** AETHERFORGE Studio
- **Last Updated:** 2026-11-17
- **Last Verified:** 2026-11-17
- **Implements Pillar:** Pillar 1 (Deterministic Clockwork Logistics), Pillar 2 (Spatial Thermal & Grid Tension), Pillar 3 (Frictionless Blueprint & Feedback Iteration)
- **CD-GDD-ALIGN:** Verified against [entities.yaml](../registry/entities.yaml), [systems-index.md](./systems-index.md), and `data/schemas/*.schema.json`

---

## Summary

This master simulation GDD specifies the six core gameplay and persistence systems of **AETHERFORGE: Orbital Foundry**—World Generation, Two-Phase Logistics, Production & Auto-Recipe, Power Grid & Geothermal Resonance, Tech & Orbital Progression, and Blueprints & Trust-Boundary Persistence—running inside a deterministic `20 Hz` (`DT = 0.05s`) engine with all tuning constants and definitions driven by `data/*.json`.

> **Quick reference:** `64x64` orthogonal grid (`DT = 0.05s`, `20 Hz`); `3x3` Orbital Hub at `(31..33, 31..33)` (`20 MW` RTG); order-independent two-phase item commit (`N/E/S/W` unbiased); symmetric `5`-tile tunnels (unpaired buffer `4`, paired `10`); `8.0/s` 2-slot splitters/mergers; `c^1.6` overclock (`0.5x–2.5x`, `0.4–12.0 MW` base); `+35%` geothermal vent adjacency bonus; `14 MW` peak Solar + `180 MJ / 15 MW` Accumulators + `25 MW` Coal (`4.0s/coal`) + `60 MW` Geothermal; 6 Tech Tiers + 5 Orbital Rocket Phases.

---

## Overview

Every numeric rate, power draw, recipe duration, and global multiplier lives in `data/*.json` (validated against `data/schemas/*.schema.json`). Gameplay state under `src/game/` maintains zero DOM or Canvas dependencies and communicates exclusively through typed state snapshots, command functions, and audio events.

## Player Fantasy

As an orbital pioneer dropped onto a mineral-rich volcanic exoplanet, you convert raw basalt craters and glowing magma vents into a synchronized clockwork metropolis. Conveyor lines weave smoothly around geothermal clusters, articulated inserters feed overclocked foundries and assemblers, accumulators bridge planetary nightfalls, and the central Orbital Tether launches five colossal cargo rockets skyward.

---

## Detailed Rules

### 1. World Generation & Coordinates {#world-generation}
1. **Grid & Directions**: The playfield is a `64x64` orthogonal grid (`x, y` in `0..63`, `WORLD_SIZE = 64`). Directions are `0 = North (0,-1)`, `1 = East (1,0)`, `2 = South (0,1)`, `3 = West (-1,0)`.
2. **Orbital Hub & Clean Plaza**: The indestructible `3x3` Orbital Hub occupies `(31..33, 31..33)` (`HUB_ORIGIN = 31`, `HUB_SIZE = 3`, `id = 1`). A `9x9` central plaza (`|x - 32| <= 4` and `|y - 32| <= 4`) stays strictly clear of resource patches for clean early manifold routing.
3. **Deterministic Seeded Veins (`mulberry32`)**:
   - Guaranteed starter patches (`iron_ore`, `copper_ore`, `coal`, `stone`) spawn at distance `10–11` tiles around the Hub.
   - Mid-ring `quartz` patches spawn at radius `17–21`; `4` starter `geothermal_vent` tiles spawn at radius `14–20` (`|vx - 32| > 5`).
   - Outer resource patches (`18` patches, `r >= 13`) weight generation toward high-demand `iron_ore` (`~41%`) alongside `copper_ore` (`~18%`), `coal` (`~18%`), `quartz` (`~14%`), and `stone` (`~9%`), and never overwrite existing `geothermal_vent` tiles.
4. **Bootstrap Starter Stockpile**: New worlds initialize the Hub stockpile with bare-bones bootstrap materials (`~60 iron_plate`, `30 copper_wire`, `25 iron_gear`, `20 concrete`, `10 coal`)—sufficient to build early miners, smelters, belts, and storage, while requiring live automated production before unlocking Tier 1, Tier 2, or Phase 1.

### 2. Logistics & Two-Phase Transport {#logistics-transport}
1. **Order-Independent Two-Phase Tick**:
   - **Phase 1 (Internal Advance)**: Advances belt slot positions, tunnel queues, inserter swing arms, miner extraction cycles, lab research, and machine crafting progress.
   - **Phase 2 (Proposal + Pre-Commit Snapshot + Atomic Commit)**: Ready outputs emit at most one transfer proposal against pre-commit target capacity. When multiple sources target the same tile on the same tick, deterministic arbitration selects `candidates[(tick + tx * 31 + ty) % candidates.length]`, committing accepted transfers atomically so `N`, `E`, `S`, and `W` lines perform identically.
2. **Conveyor Belts (`belt_mk1`, `belt_mk2`, `belt_mk3`)**: Hold up to `2` item slots (`progress` in `[0.0, 1.0]`). Target acceptance requires `slots.length === 0` or `slots.length === 1 && slots[0].progress >= 0.5`; trailing slot progress clamps to `<= front.progress - 0.5`.
3. **Splitters & Mergers**:
   - `splitter` accepts from Back (`oppositeDir(dir)`) and cycles outputs `[left, front, right]` round-robin.
   - `merger` accepts from Back, Left, or Right (`fromSide !== dir`) cycling incoming priority `[left, back, right]` round-robin and outputs straight ahead.
   - Both hold up to `2` slots (`0.5` minimum gap) and run at `speed = 8.0` (`10.0 items/s` steady at `1.0x`) so they never throttle `belt_mk2` or `belt_mk3`.
4. **Underground Tunnels (`tunnel`)**:
   - Pair an `entrance` and `exit` facing the same direction up to `max_span = 5` tiles apart. Pairing (`pairUndergroundTunnel`) searches both backward (`backDir`) for an unpaired entrance and forward (`dir`) for an unpaired exit so build order does not matter.
   - Unpaired entrances buffer up to `4` items safely without loss; paired tunnels queue up to `10` items (`tunnel_slot_spacing = 0.25`) advancing at full span-independent `speed = 4.0`.
5. **Articulated Inserters (`inserter`)**: Draw `0.4 MW` active power (`0.02 MW` standby), pull from the tile behind (`oppositeDir(dir)`), and drop onto the tile ahead (`dir`), swinging proportionally to grid `satisfaction`.
6. **Storage & Dismantle Conservation**: `storage` holds `200` items total. Dismantling any non-Hub building (`removeBuilding`) refunds 100% of building `cost` plus all buffered/held items (`inventory`, `slots`, `tunnelQueue`, `inserterItem`, `inputBuffer`, `outputBuffer`) back to `world.stockpile`.

### 3. Production, Extraction & Auto-Recipe {#production-crafting}
1. **Miners (`miner_mk1`, `miner_mk2`)**: Require an underlying ore tile (`iron_ore`, `copper_ore`, `coal`, `stone`, `quartz`). Eject ore onto the front tile or internal `outputBuffer` (cap `10`). Fractional `craftProgress` carries cleanly across completions (`craftProgress -= 1.0`).
2. **Processors (`smelter`, `constructor`, `foundry`, `assembler`)**:
   - Default to `recipeId: "auto"`, automatically locking onto compatible incoming items (respecting unlocked `required_tech` gates unless `free_build >= 1`), or accept explicit Inspector recipe selection (refunding uncommitted `inputBuffer` items on recipe swap).
   - Accept inputs from Back, Left, or Right (`fromSide !== b.dir`, or any side via Inserter) up to `max(8, req.count * 4)` per input item; auto-eject crafted outputs straight ahead (`b.dir`) with output buffer cap `20`.
   - `craftProgress` resets cleanly (`0`) upon output deposit (if output buffer has space; otherwise holds at `1.0` in `output_full`).
3. **Tech-Gated Recipes**: `assemble_processor` (`required_tech: "tier_4_overclock"`) and `assemble_quantum` (`required_tech: "tier_5_quantum"`) remain locked until their respective Tech Tier unlocks (bypassed when `config.free_build.value >= 1`).

### 4. Power Grid, Day/Night & Thermal Resonance {#power-grid}
1. **Generation Sources**:
   - `orbital_hub`: Continuous `20.0 MW` RTG baseline (`0` cost, indestructible).
   - `coal_generator`: Burns solid fuel (`ITEMS[item].fuel_value > 0`, `coal = 100 MJ -> 100 / 25 = 4.0s` per coal) for `25.0 MW` (`inputBuffer` cap `10`).
   - `solar_panel`: Generates up to `14.0 MW` peak during planetary daylight (`dayTime < 0.70`, `solar_factor > 0.02` active threshold).
   - `geothermal_plant`: Placed on `geothermal_vent` tiles to output `60.0 MW` continuously (`no_resource` if not on a vent).
2. **Accumulators (`180.0 MJ`, `15.0 MW`)**: Absorb surplus grid MW (`netMw > 0`) proportionally across remaining capacity and discharge proportionally during deficits (`netMw < 0`) up to `15.0 MW` per unit.
3. **Overclocking (`c^1.6`) & Geothermal Resonance (`+35%`)**:
   - Tier 4 (`tier_4_overclock`) unlocks clock tuning from `0.50` (`50%`) to `2.50` (`250%`, step `0.05` / `25%` UI step). Active machines consume `base_power_mw * clock^1.6`; idle machines draw `0.05 * base_power_mw`.
   - Any building within Chebyshev distance `1` (`max(|dx|, |dy|) == 1`) of a `geothermal_vent` receives `geoBonus = 0.35` (`+35%` free processing/extraction/research speed with zero extra MW draw).
4. **Soft Brownout**: When `demandedMw > generatedMw + dischargeMw`, grid `satisfaction` (`eta` in `[0.0, 1.0]`) scales machine, miner, lab, and inserter speeds proportionally (`<= 0.01` sets `status = 'no_power'`), allowing recovery without soft-locks.
5. **Orbital Overdrive (`tier 6`)**: Researching `orbital_ascension` unlocks `orbital_overdrive`, granting a `+50%` (`1.5x`) global machine, miner, lab, belt, and inserter speed multiplier.

### 5. Tech Tree, Research Labs & Orbital Phases {#tech-orbital-progression}
1. **Tech Tree (6 Tiers)**: Linear/DAG progression (`tier_1_logistics` -> `tier_2_metallurgy` -> `tier_3_electronics` -> `tier_4_overclock` -> `tier_5_quantum` -> `orbital_ascension`). Technologies unlock directly from the Hub stockpile or continuously via `research_lab` units.
2. **Research Labs (`research_lab`, `10.0 MW`, `speed = 2.0`)**: Accept **only** items still needed by `world.activeTechId` (`techProgress + inputBuffer < req.count` and buffer `< 20`), process at `BUILDINGS.research_lab.speed * (1 + geoBonus) * craft_speed_mult * overdrive * clock * satisfaction`, and grant **`2x` science points** per consumed item.
3. **Orbital Cargo Phases (5 Phases)**: Items delivered into any of the 9 Hub tiles add to `world.stockpile` and auto-feed matching requirements of the active Orbital Phase (or players click `[Load Rocket]` in the Topbar). Completing each phase increments `orbitalLaunches`, triggers `rocketTimer = 4.5s`, emits `rocket_launch`, and completing Phase 5 sets `victoryAchieved = true` and opens the Victory modal.

### 6. Blueprints & Save Persistence {#blueprints-persistence}
1. **Blueprints (`AFBP1:`)**: Rectangular region capture excludes the Orbital Hub, stores relative `(dx, dy)` offsets, `type`, `dir`, optional `recipeId`, and optional `clock`. Rotation (`rotateBlueprint`) maps `(dx, dy)` -> `(oldH - 1 - dy, dx)` and rotates `dir` 90 deg CW cleanly across all 4 quadrants.
2. **Blueprint Tech Enforcement**: Stamping (`placeBlueprint`) sorts non-tunnels first and tunnels along flow direction; `clock` values above `1.0` clamp to `1.0` if `overclock` is locked and `free_build < 1`.
3. **Trust-Boundary Validation**: `decodeBlueprint` (`<= 64,000` chars, strict UTF-8 `TextDecoder({ fatal: true })`, unique `(dx, dy)`, valid `RECIPES[id].building === type`) and `deserializeWorld` (`<= 4,000,000` bytes, reject `Array.isArray`, strip prototype keys, validate all tile resources, building caps, `telemetry.bucketIndex` `0..59`, and 1:1 `grid` <-> `buildings` bijection) fail closed on malformed payloads.

### States and Transitions

| State Machine | Valid States | Transitions & Guards |
|---|---|---|
| `BuildingStatus` (`7` states) | `working`, `idle`, `no_power`, `input_starved`, `output_full`, `no_resource`, `unpaired` | Evaluated deterministically via `BUILDING_STATUS_TRANSITIONS`: `no_resource` (miner off ore / geo off vent) -> `no_power` (`satisfaction <= 0.01`) -> `unpaired` (tunnel missing `pairedId`) -> `output_full` (miner >= 10 / processor >= 20 blocked) -> `input_starved` (missing recipe/fuel/tech inputs) -> `working` (active processing/moving/generating) <-> `idle` (no demand/items/daylight). |
| `inserterPhase` | `to_source`, `to_target` | Empty at `progress == 0` pulls item -> sets `to_target`, increments `progress` to `1.0` -> drops item -> sets `to_source`, retracts to `0.0`. |
| `tunnelMode` | `entrance`, `exit` | On place/rotate: pairs `entrance <-> exit` within `max_span = 5` along `dir`/`backDir`; unpairing clears `pairedId` on partner without deleting buffered items (`<= 4`). |
| `RocketLaunch` | `docked` (`rocketTimer == 0`), `ascending` (`rocketTimer > 0`) | Phase completion sets `rocketTimer = 4.5`; decrements each sim/frame until `0`; user Skip (`Space`/`Enter`/`A`) zeros visual timer cleanly without altering `orbitalLaunches`. |
| `SceneMode` | `title`, `play`, `figures` | `?scene=figures` locks catalog view; otherwise boots `title` -> transitions to `play` via `New Factory`, `Continue Save`, or `Demo Showcase`. |

### Interactions with Other Systems

| Upstream / Peer System | Contract & Interface |
|---|---|
| `world-generation` | Supplies `resources[]`, `grid[]`, `starter stockpile`, and `geoBonus` (`0.35`) adjacency map to Logistics, Production, and Power. |
| `power-grid` | `stepPower` executes Phase 0 every tick, publishing `world.power.satisfaction` (`0..1`) consumed by `logistics-transport` (`inserter`), `production-crafting`, and `tech-orbital-progression` (`research_lab`). |
| `logistics-transport` | Moves ore, coal, components, and finished parts into `coal_generator`, processors, `research_lab`, `storage`, and `orbital_hub`. |
| `tech-orbital-progression` | Enforces building/recipe/overclock/overdrive gates checked by `world.ts`, `simulation.ts`, and `blueprints.ts`; emits `launch` and `tech` events. |
| `hud-feedback` | Reads immutable `WorldState` snapshots every `250 ms`, dispatches mutations strictly via `HudActions`, renders `?scene=figures` and colorblind shape cues. |
| `audio-fx` | Receives `SimulationAudioEvent` and UI/grid commands via `SoundEngine.emit(AudioEventId)` with paired visual toast captions. |

---

## Formulas

### 1. Belt & Splitter/Merger Throughput (`belt_throughput`)
Named expressions:
- `raw_step_rate = base_belt_speed * belt_speed_mult * overdrive_mult`
- `step_per_tick = min(1.0, raw_step_rate * DT)`
- `steady_items_per_sec = TICK_HZ / ceil(belt_slot_spacing / step_per_tick)` (bounded by `20.0 items/s` Nyquist ceiling when `step_per_tick >= 0.5`)

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `base_belt_speed` | float | `2.0–8.0` | data file | Nominal speed from `factory_buildings.json` (`belt_mk1=2`, `belt_mk2=4`, `belt_mk3=8`, `splitter=8`, `merger=8`) |
| `belt_speed_mult` | float | `0.5–4.0` | data file | Global tuning multiplier in `data/config.json` |
| `overdrive_mult` | float | `1.0` or `1.5` | calculated | `1.5` if `orbital_overdrive` unlocked, else `1.0` |
| `DT` | float | `0.05` | constant | Fixed simulation timestep (`1 / 20 Hz`) |
| `TICK_HZ` | int | `20` | constant | Simulation ticks per second |
| `belt_slot_spacing` | float | `0.5` | constant | Minimum slot progress gap between 2 items on a tile |
| `steady_items_per_sec` | float | `2.0–20.0` | calculated | Effective discrete item throughput per second |

- **Output range**: At `1.0x` config, discrete stepping yields `4.0/s` (`belt_mk1`, 5 ticks), `6.67/s` (`belt_mk2`, 3 ticks), and `10.0/s` (`belt_mk3`/`splitter`/`merger`, 2 ticks), scaling up to the single-item-per-tick discrete ceiling of `20.0 items/s` when `step_per_tick >= 0.5`.
- **Worked example**: `belt_mk2` (`4.0`) at `belt_speed_mult = 1.0`, `overdrive_mult = 1.0` gives `step_per_tick = 0.20`, taking `ceil(0.5 / 0.20) = 3` ticks (`0.15s`) per item = `6.67 items/s`.

### 2. Underground Tunnel Transit (`tunnel_transit`)
Named expression:
- `tunnel_step_per_tick = base_tunnel_speed * belt_speed_mult * overdrive_mult * DT`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `base_tunnel_speed` | float | `4.0` | data file | Tunnel nominal speed (`factory_buildings.json`) |
| `belt_speed_mult` | float | `0.5–4.0` | data file | Global belt/tunnel multiplier (`data/config.json`) |
| `overdrive_mult` | float | `1.0` or `1.5` | calculated | Tier 6 `orbital_overdrive` multiplier |
| `max_span` | int | `5` | data file | Maximum tile separation between entrance and exit |
| `tunnel_slot_spacing` | float | `0.25` | constant | Minimum queue progress gap (`0..10` items paired; `0..4` unpaired) |

- **Output range**: Span-independent `tunnel_step_per_tick` in `[0.10, 1.0]` delivers `4.0–20.0 items/s` smoothly across spans `1..5`.
- **Worked example**: A `5`-tile paired tunnel at `1.0x` advances `4.0 * 0.05 = 0.20` queue progress/tick, clearing `0.25` spacing in `2` ticks (`<= 10.0 items/s` max, sustaining `>= 4.0 items/s` regardless of span).

### 3. Mining Extraction Rate (`miner_extraction`)
Named expression:
- `effective_mine_rate = base_miner_speed * clock * (1 + geo_bonus) * mining_speed_mult * overdrive_mult * satisfaction`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `base_miner_speed` | float | `0.75` or `1.8` | data file | `miner_mk1 = 0.75/s`, `miner_mk2 = 1.8/s` (`factory_buildings.json`) |
| `clock` | float | `0.50–2.50` | calculated | Player-set overclock ratio (Tier 4+) |
| `geo_bonus` | float | `0.00` or `0.35` | constant | `+0.35` if adjacent to a `geothermal_vent` |
| `mining_speed_mult` | float | `0.25–5.0` | data file | Global multiplier from `data/config.json` |
| `overdrive_mult` | float | `1.0` or `1.5` | calculated | Tier 6 `orbital_overdrive` bonus |
| `satisfaction` | float | `0.0–1.0` | calculated | Grid satisfaction `eta` |

- **Output range**: `0.0` (during blackout) up to `1.8 * 2.5 * 1.35 * 5.0 * 1.5 = 45.56 ores/s` (capped by `10`-item buffer overflow if un-belted).
- **Worked example**: `miner_mk2` (`1.8/s`) at `clock = 1.5`, next to a magma vent (`geo_bonus = 0.35`), `1.0x` config/overdrive, `100%` power extracts `1.8 * 1.5 * 1.35 = 3.645 ores/s`.

### 4. Overclock Power & Cycle Speed (`overclock_power`, `machine_craft_rate`)
Named expressions:
- `power_draw_mw = is_active ? base_power_mw * (clock ^ 1.6) : base_power_mw * 0.05`
- `effective_craft_rate = (1 / recipe_seconds) * clock * (1 + geo_bonus) * craft_speed_mult * overdrive_mult * satisfaction`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `base_power_mw` | float | `0.4–12.0` | data file | Active draw (`inserter=0.4`, `miner_mk1=2`, `smelter=3`, `constructor=4`, `miner_mk2=5`, `foundry=8`, `research_lab=10`, `assembler=12`) |
| `clock` | float | `0.50–2.50` | calculated | Overclock multiplier (default `1.0`; step `0.05`) |
| `idle_power_fraction` | float | `0.05` | constant | Standby draw multiplier when idle |
| `overclock_exponent` | float | `1.6` | constant | Non-linear power scaling exponent |
| `recipe_seconds` | float | `1.0–5.0` | data file | Recipe duration from `factory_recipes.json` |
| `geo_bonus` | float | `0.00` or `0.35` | constant | Magma adjacency bonus |
| `craft_speed_mult` | float | `0.25–5.0` | data file | Global multiplier from `data/config.json` |
| `overdrive_mult` | float | `1.0` or `1.5` | calculated | Tier 6 `orbital_overdrive` bonus |
| `satisfaction` | float | `0.0–1.0` | calculated | Grid satisfaction `eta` |

- **Output range**: `power_draw_mw` spans `0.02 MW` (`inserter` idle) and `0.132 MW` (`inserter` active at `0.5x`) up to `51.96 MW` (`assembler` active at `2.5x`). `effective_craft_rate` is `>= 0.0` with no divide-by-zero (`recipe_seconds >= 1.0`).
- **Worked example**: `assembler` (`base_power_mw = 12`, `recipe_seconds = 2.0`) at `clock = 2.0`, `geo_bonus = 0.35`, `1.0x` config/overdrive, `satisfaction = 1.0` draws `12 * 2^1.6 = 36.37 MW` and completes `0.5 * 2.0 * 1.35 = 1.35 crafts/s`.

### 5. Grid Satisfaction, Solar Factor & Accumulator Balance (`solar_factor`, `grid_satisfaction`)
Named expressions:
- `solar_factor = day_ratio < 0.70 ? sin(pi * (day_ratio / 0.70)) : 0`
- `generated_mw = (hub_rtg + coal_mw + solar_mw + geothermal_mw) * power_output_mult`
- `satisfaction = demanded_mw > 0 ? min(1.0, (generated_mw + discharge_mw) / demanded_mw) : 1.0`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `day_ratio` | float | `0.0–1.0` | calculated | Normalized `world.dayTime` (`< 0.70` daylight, `>= 0.70` night) |
| `day_ratio_threshold` | float | `0.70` | constant | Solar daylight duty fraction |
| `solar_factor` | float | `0.0–1.0` | calculated | Sinusoidal solar multiplier (`0` at night; active LED if `> 0.02`) |
| `power_output_mult` | float | `0.5–5.0` | data file | Global generation multiplier from `data/config.json` |
| `generated_mw` | float | `>= 20.0` | calculated | Sum of Hub (`20 MW`), active Coal (`25 MW`), Solar (`14 MW * solar_factor`), Geothermal (`60 MW`) |
| `discharge_mw` | float | `>= 0.0` | calculated | Total accumulator discharge (`<= 15 MW` and `<= stored_mj / DT` per unit, `cap = 180 MJ`) |
| `demanded_mw` | float | `>= 0.0` | calculated | Sum of active + standby machine/inserter demand |
| `satisfaction` | float | `0.0–1.0` | calculated | Clamped grid ratio scaling mechanical speeds |

- **Output range**: `solar_factor` in `[0.0, 1.0]`; `satisfaction` strictly clamped `[0.0, 1.0]`; zero demand returns `1.0`.
- **Worked example**: At night (`solar_factor = 0`), Hub (`20 MW`) + 1 Coal Gen (`25 MW`) = `45 MW`. Demand is `70 MW` with 2 Accumulators (`max 30 MW` discharge, `360 MJ` total). Accumulators supply the `25 MW` deficit (`satisfaction = 1.0`), draining `25 MJ/s`.

### 6. Coal Generator Fuel Burn (`coal_burn_duration`)
Named expression:
- `burn_seconds = ITEMS[item].fuel_value / coal_generator.generates_mw`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `fuel_value` | float | `100.0` | data file | Fuel energy content in MJ (`data/factory_items.json`, `coal = 100`) |
| `generates_mw` | float | `25.0` | data file | Coal Generator nominal output (`data/factory_buildings.json`) |
| `burn_seconds` | float | `4.0` | calculated | Seconds burned per coal unit (`15 coal/min`) |

- **Output range**: `4.0s` per coal (`0.25 coal/s`, `15 coal/min`), strictly positive (`generates_mw > 0`).
- **Worked example**: `1` `coal` (`100 MJ`) sustains `25 MW` for `100 / 25 = 4.0s`, emitting `25 * 4 = 100 MJ`.

### 7. Research Lab Science Rate (`lab_research_rate`)
Named expression:
- `lab_cycle_rate = base_lab_speed * clock * (1 + geo_bonus) * craft_speed_mult * overdrive_mult * satisfaction`

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `base_lab_speed` | float | `2.0` | data file | `BUILDINGS.research_lab.speed` (`factory_buildings.json`) |
| `clock` | float | `0.50–2.50` | calculated | Overclock multiplier |
| `geo_bonus` | float | `0.00` or `0.35` | constant | `+35%` free speed near `geothermal_vent` |
| `craft_speed_mult` | float | `0.25–5.0` | data file | Global crafting/research multiplier (`data/config.json`) |
| `overdrive_mult` | float | `1.0` or `1.5` | calculated | Tier 6 `orbital_overdrive` multiplier |
| `satisfaction` | float | `0.0–1.0` | calculated | Grid satisfaction `eta` |
| `science_points_per_item` | int | `2` | constant | Tech progress credited per consumed input item |

- **Output range**: `0.0` to `2.0 * 2.5 * 1.35 * 5.0 * 1.5 = 50.625 cycles/s`, crediting `2` tech units per `1` consumed item (halving item cost vs manual stockpile unlocks).
- **Worked example**: A geothermal-adjacent Lab (`geo_bonus = 0.35`, `clock = 1.0`) completes `2.0 * 1.35 = 2.7 cycles/s` (`5.4 tech units/s`).

### 8. World Vein Generation & Starter Stockpile (`vein_generation`)
Named expressions:
- `vein_tile_hit = (dx^2 + dy^2) <= radius^2 * (0.7 + rng() * 0.45)` (excluding central `9x9` plaza `|x - 32| <= 4 && |y - 32| <= 4` and existing `geothermal_vent` tiles)

| Variable | Type | Range | Source | Description |
|---|---|---|---|---|
| `seed` | int | `1–999999` | data file | `mulberry32` deterministic PRNG seed (`data/config.json`) |
| `starter_patches` | count | `4` | constant | Guaranteed near-Hub `iron_ore`, `copper_ore`, `coal`, `stone` patches (`dist 10–11`) |
| `outer_patches` | count | `18` | constant | Outer veins weighted `~41% iron_ore`, `~18% copper_ore`, `~18% coal`, `~14% quartz`, `~9% stone` |
| `geothermal_vents` | count | `4 + 6` | constant | `4` mid-ring + `6` outer vents protected from patch overwrites |
| `starter_stockpile` | stack | `60/30/25/20/10` | constant | `60 iron_plate`, `30 copper_wire`, `25 iron_gear`, `20 concrete`, `10 coal` |

- **Output range**: Deterministic per `seed`; default seed `42026` guarantees clean `9x9` plaza, balanced iron supply matching `~59.5%` campaign ore demand, and non-zero starter automation without skipping Tier 1/2/Phase 1.

---

## Edge Cases

- **Multi-way Belt Intersection**: When 2 or 3 belts push into one destination tile on the same tick, deterministic arbitration picks strictly 1 item via `(tick + tx * 31 + ty) % candidates.length`; rejected items hold at `progress = 1.0` without loss.
- **Unpaired Underground Tunnel**: An unpaired entrance holds up to **`4` buffered items** cleanly without destroying them until an exit tunnel pairs (in either build order) within `5` tiles or the tunnel is dismantled (refunding all buffered items). Paired tunnels expand queue capacity to `10`.
- **Orbital Hub Dismantle Attempt**: Attempting to dismantle `(31..33, 31..33)` returns `false`; the Hub is indestructible.
- **Research Lab Input Filtering**: Items not required by the remaining cost of `world.activeTechId` are rejected at Lab inputs so stray items never jam lab slots.
- **Corrupt Blueprint / Save Import**: Malformed JSON, root arrays, prototype pollution keys (`__proto__`), unknown IDs, recipe-building mismatches, non-finite numbers, invalid tile resources, or out-of-bounds coordinates fail closed with typed errors leaving live state untouched.

---

## Visual/Audio Requirements

- **Procedural Canvas 2D (`?scene=figures`)**: Every building (`20`), terrain feature (`geothermal_vent`), and item (`19`) renders purely with Canvas 2D vector geometry—zero emojis or external textures—backed by offscreen terrain, minimap, glow, and item-atlas caches staying within `60 FPS`, `16.67 ms` frame budget, and `<= 1500` draw calls. See [art-bible.md](../art/art-bible.md).
- **Mandatory Non-Color Signals**: Colorblind modes (`default`, `protanopia`, `deuteranopia`, `tritanopia`) pair every status dot with a geometric symbol, every belt tier with `1/2/3` chevron pips, and blocked ghosts with diagonal `X` cross-hatching.
- **Audio Event Bus & Captions**: All simulation and UI sound effects emit via `SoundEngine.emit(AudioEventId)` routed through `uiGain / sfxGain / ambientGain -> masterGain -> DynamicsCompressorNode -> optional mono`. Critical events (`tech_unlock`, `rocket_launch`, `power_brownout`, `power_restored`, `bp_copy`) ALWAYS pair with a queued visual HUD toast. See [sound-bible.md](../audio/sound-bible.md).

---

## Game Feel

- **Sub-Tick 60 Hz Visual Smoothing**: `simAlpha` interpolates belt items and 2-segment articulated inserter swings smoothly between 20 Hz simulation ticks; rotors, pistons, and belt chevrons respond proportionally to `simSpeed`, `clock`, `belt_speed_mult`, and `satisfaction`.
- **Tactile Building & Curved Drag**: Dragging conveyor lines generates live Manhattan preview corners; placing, rotating, mining, smelting, crafting, and launching fire pooled zero-GC `ParticlePool` embers, ore dust chips, cyan sparks, geothermal steam, and launchpad shockwaves.
- **Responsive Crisis & Milestone Feedback**: Brownouts gently droop ambient machine hum and trigger a warning pill/toast without locking recovery; rocket launches lift the Hub pod with multi-stage plasma exhaust while remaining cleanly skippable (`Space`/`Enter`/`A`) and honoring `prefers-reduced-motion`.

---

## UI Requirements

All gameplay states surface cleanly through the decoupled, WCAG 2.1 Level AA HUD ([hud.md](../ux/hud.md), [interaction-patterns.md](../ux/interaction-patterns.md), [accessibility-requirements.md](../accessibility-requirements.md)):
- **Unidirectional Commands**: UI mutates nothing directly; all actions pass through `HudActions` callbacks in `src/main.ts`.
- **Non-Destructive Telemetry**: 250 ms HUD refreshes patch nodes in place so keyboard focus, slider drags, and scroll offsets persist.
- **Full Multi-Input Parity**: Every build, dismantle, inspect, tech, stats, blueprint, tweak, and save flow works identically across Mouse, Keyboard (`WASD`, `I/J/K/L` cursor, `Enter`, `Delete`, `1-0`, `T/P/B/G/H/V/R/Q/Alt/Space/Esc`), and Gamepad (`navigator.getGamepads()`).
- **100% Bilingual Coverage**: Complete `pt-BR` (default) and `en` localization in `src/ui/i18n.ts` with scalable `--ui-scale`.

---

## Tuning Knobs

All 7 live tuning knobs live in `data/config.json` and follow `{ value, min, max, step, description }`:

| Key | Default | Min | Max | Step | Extreme Low / High Break Behavior & Cross-Knob Interactions |
|---|---|---|---|---|---|
| `seed` | `42026` | `1` | `999999` | `1` | Deterministic layout seed; extremes preserve guaranteed `9x9` clean Hub plaza and 4 starter ore patches. |
| `mining_speed_mult` | `1.0` | `0.25` | `5.0` | `0.25` | At `0.25`, early mining slows `4x`; at `5.0`, `miner_mk2` + `2.5x` overclock hits `22.5/s`, saturating even `belt_mk3` (`10/s–20/s`) unless paired with high `belt_speed_mult`. |
| `belt_speed_mult` | `1.0` | `0.5` | `4.0` | `0.25` | At `>= 2.5` (with `belt_mk2` `4.0`), `step_per_tick >= 0.5`, hitting the 20 Hz single-item-per-tick Nyquist cap (`20.0 items/s`) so `belt_mk2` and `belt_mk3` achieve identical max rate (`20/s`). |
| `craft_speed_mult` | `1.0` | `0.25` | `5.0` | `0.25` | Scales processors AND `research_lab` rate; at `5.0` + `clock 2.5`, 1s recipes finish >1x per tick (`craftProgress` clamps to discrete 1 craft/tick ceiling). |
| `power_output_mult` | `1.0` | `0.5` | `5.0` | `0.25` | At `0.5`, starter Hub RTG drops to `10 MW`, demanding immediate Coal/Solar management; at `5.0`, removes power tension for pure logistics sandboxing. |
| `day_cycle_seconds` | `180` | `30` | `600` | `30` | At `30s`, nights last `9s` (trivial accumulator sizing); at `600s`, nights last `180s`, requiring large Accumulator banks (`180 MJ` each) to avoid prolonged brownouts. |
| `free_build` | `0` | `0` | `1` | `1` | Sandbox mode (`1`): bypasses building cost, tech building/recipe locks, and Tier 4 overclock locks. |

---

## Dependencies

- **Upstream Systems**: [world-generation](./systems-index.md), `data/config.json`, `data/factory_items.json`, `data/factory_buildings.json`, `data/factory_recipes.json`, `data/factory_techs.json`, `data/schemas/*.schema.json`
- **Downstream Systems**: [hud-feedback](../ux/hud.md), [audio-fx](../audio/sound-bible.md), [art-bible](../art/art-bible.md), `tests/unit/*.test.ts`

## Cross-References

| Document / Artifact | Purpose |
|---|---|
| [design/gdd/game-concept.md](./game-concept.md) | Core Identity, 4 Pillars, MDA/SDT, Scope |
| [design/gdd/systems-index.md](./systems-index.md) | 8-System Decomposition, Priority Tiers, Dependency Graph |
| [design/registry/entities.yaml](../registry/entities.yaml) | Canonical Registry (20 buildings + `geothermal_vent`, 19 items, 8 formulas, constants) |
| [design/art/art-bible.md](../art/art-bible.md) | Procedural Silhouettes, Palette, Colorblind Cues, Budgets |
| [design/ux/hud.md](../ux/hud.md) | HUD Zones, States, Visual Budget, Queued Toasts |
| [design/audio/sound-bible.md](../audio/sound-bible.md) | Web Audio Event Bus, Mix Graph, Captions |
| [docs/architecture/control-manifest.md](../../docs/architecture/control-manifest.md) | Architectural Boundaries, ADRs 001–005, Budgets |

---

## Acceptance Criteria

1. **GIVEN** four identical 5-tile conveyor lines (`N`, `E`, `S`, `W`) fed by equal miners, **WHEN** `stepSimulation` runs deterministically at `20 Hz`, **THEN** ore reaches destination storage chests on the exact same simulation tick across all four directions.
2. **GIVEN** an `assembler` (`base_power_mw = 12`) overclocked to `clock = 2.0`, **WHEN** actively crafting, **THEN** power draw equals `12 * 2^1.6 = 36.37 MW` (`+- 0.01 MW`) and crafting speed doubles (`2.0x`), while an idle machine draws `0.05 * 12 = 0.60 MW`.
3. **GIVEN** a newly placed unpaired `tunnel` entrance, **WHEN** `6` items arrive from an upstream belt, **THEN** the entrance safely buffers `4` items (`tunnelQueue.length === 4`) without item loss, and upon placing a matching `tunnel` exit within `5` tiles (in either build order), pairs automatically and delivers items at full `4.0` speed (`>= 4.0/s`) regardless of span `1..5`.
4. **GIVEN** a new factory created with `createWorld(42026)`, **WHEN** inspecting `world.stockpile` at `tick = 0`, **THEN** starter materials suffice to build starter extractors/smelters/belts while remaining insufficient to immediately unlock Tier 1 + Tier 2 or Phase 1 without live factory production.
5. **GIVEN** an `assembler` before `tier_5_quantum` is unlocked (`free_build = 0`), **WHEN** `quantum_core` ingredients or `assemble_quantum` selection are attempted, **THEN** the recipe gate blocks crafting until `tier_5_quantum` unlocks, whereas `free_build = 1` bypasses the gate.
6. **GIVEN** a `research_lab` (`10 MW`, `speed = 2.0`) adjacent to a `geothermal_vent` (`geoBonus = 0.35`) with active tech `tier_1_logistics`, **WHEN** an unrelated item (`stone`) vs a required item (`iron_plate`) arrives, **THEN** `stone` is rejected by `canTargetAccept`, while `iron_plate` processes at `2.0 * 1.35 = 2.7 cycles/s` and credits `2` tech progress points per consumed item.
7. **GIVEN** daytime solar surplus and subsequent night cycle (`dayTime >= 0.70`), **WHEN** `solar_panel` (`14 MW` peak) charges `accumulator` units (`180 MJ`, `15 MW`) during day and discharges at night, **THEN** grid `satisfaction` remains `1.0` while stored energy covers demand, and gracefully scales machines proportionally during deficit (`< 1.0`).
8. **GIVEN** all `19` items in `data/factory_items.json`, **WHEN** running schema and economy integrity checks, **THEN** every item has `>= 1` production source and `>= 1` consumption sink, and zero orphaned recipes or feature flags exist.
9. **GIVEN** malformed JSON, root array `[...]`, `__proto__` payload, invalid tile `ResourceType`, or tampered `AFBP1:` blueprint with mismatched `recipeId` or locked `clock = 2.5`, **WHEN** passed to `deserializeWorld` or `decodeBlueprint` / `placeBlueprint`, **THEN** invalid payloads fail closed without mutating `WorldState`, and locked `clock` clamps to `1.0`.
10. **GIVEN** dismantling a working belt, tunnel, inserter, or processor holding buffered items, **WHEN** `removeBuilding(..., true)` executes, **THEN** both building construction cost and all held/buffered items return cleanly to `world.stockpile` with strict item conservation.
