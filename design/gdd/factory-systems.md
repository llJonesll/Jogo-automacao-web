# Factory Systems GDD — AETHERFORGE: Orbital Foundry

## Overview
This document specifies the simulation, logistics, power, thermal resonance, overclocking, and orbital progression rules for **AETHERFORGE: Orbital Foundry**. Every numeric rate, power draw, recipe duration, and world tuning knob lives in `data/*.json` and runs inside a deterministic 20 Hz fixed-timestep engine (`DT = 0.05s`).

## Player Fantasy
As an orbital pioneer dropped onto a mineral-rich volcanic exoplanet, you turn raw craters and magma rifts into a synchronized clockwork metropolis. Every belt smoothly routes gleaming ingots into splitters, underground tunnels, articulated inserters, and overclocked assemblers until the central Orbital Tether launches five colossal cargo rockets skyward.

## Detailed Rules
1. **Grid & Coordinates**: The planet playfield is a `64x64` orthogonal grid (`x, y` in `0..63`). Directions are `0=North (0,-1)`, `1=East (1,0)`, `2=South (0,1)`, `3=West (-1,0)`.
2. **Orbital Hub**: Occupies the immutable `3x3` center (`x: 31..33, y: 31..33`, anchor `(31,31)`). Provides a `15 MW` starter RTG, stores construction materials in the global stockpile, and accepts item deliveries on all 9 tiles from adjacent belts, inserters, or direct machine outputs.
3. **Two-Phase Order-Independent Transfer**:
   - Phase A advances belt slot progress, underground tunnel travel timers, and inserter arm swings.
   - Phase B collects at most one transfer proposal per ready source against the pre-commit target snapshot, resolves competing incoming transfers fairly per `(tick + tx * 31 + ty) % candidates.length`, and commits transfers atomically.
   - Four isolated belt lines facing North, East, South, and West must behave identically without scan-order bias.
4. **Conveyor Belts & Logistics**:
   - Standard belts hold up to 2 item slots (`progress` in `[0, 1]`); the trailing slot is clamped to `<= front.progress - 0.5`.
   - Underground Tunnels pair an entrance and exit facing the same direction up to `5` tiles apart, crossing underneath belts and structures.
   - Splitters cycle outputs `[left, front, right]` round-robin; Mergers cycle inputs `[left, back, right]` round-robin.
   - Articulated Inserters pull from the tile behind them and drop onto the tile ahead, respecting machine input compatibility and storage limits.
5. **Production & Auto-Recipe**:
   - Miners placed over `iron_ore`, `copper_ore`, `coal`, `stone`, or `quartz` veins extract ore automatically and eject onto the front tile or internal buffer.
   - `smelter`, `constructor`, `foundry`, and `assembler` default to `recipeId: "auto"`, locking onto compatible incoming items automatically, or allow explicit recipe selection in the Inspector.
   - Machines accept valid inputs from Back, Left, or Right (`fromSide !== b.dir`) and auto-eject crafted outputs straight ahead (`b.dir`).
6. **Power Grid, Day/Night & Thermal Resonance**:
   - `orbital_hub` provides `15 MW`; `coal_generator` burns `1 coal` every `4s` for `25 MW`; `solar_panel` outputs up to `8 MW` during daylight (`dayTime < 0.70`); `geothermal_plant` placed on a `geothermal_vent` outputs `60 MW` continuously.
   - `accumulator` units (`120 MJ` capacity, `10 MW` max charge/discharge rate) absorb surplus grid MW and discharge during deficits.
   - Machines orthogonally or diagonally adjacent (`max(|dx|, |dy|) == 1`) to a `geothermal_vent` gain `+35%` free processing speed (`geo_bonus = 0.35`).
7. **Tech Tree & Orbital Phases**:
   - Research Labs (`research_lab`) consume hub/delivered items at `2x` efficiency toward `activeTechId`, or players may invest directly from the hub stockpile.
   - Five Orbital Phases consume delivered items automatically when matching the active phase requirements, triggering an orbital rocket launch on completion.

## Formulas

### 1. Belt Throughput
Named expression:
`throughput_items_per_sec = base_belt_speed * belt_speed_mult`

| Symbol | Type | Range | Description |
|---|---|---|---|
| `base_belt_speed` | float | `2.0–8.0` | Base items/s (`Mk.I=2`, `Mk.II=4`, `Mk.III=8`) |
| `belt_speed_mult` | float | `0.5–4.0` | Global tuning multiplier from `data/config.json` |
| `throughput_items_per_sec` | float | `1.0–32.0` | Effective belt throughput clamped per slot gap `0.5` |

- **Output range**: Bounded between `1.0` and `32.0` items/s over tuning bounds (`min` at `Mk.I * 0.5`, `max` at `Mk.III * 4.0`). Each tick advances `progress += throughput_items_per_sec * DT`.
- **Worked example**: `belt_mk2` (`4.0/s`) with `belt_speed_mult = 1.5` gives `6.0 items/s`, advancing `0.30` tile progress per `0.05s` tick.

### 2. Overclock Power & Cycle Speed
Named expression:
`power_draw_mw = base_power_mw * (clock ^ 1.6)`
`effective_craft_rate = (1 / recipe_seconds) * clock * (1 + geo_bonus) * craft_speed_mult * satisfaction`

| Symbol | Type | Range | Description |
|---|---|---|---|
| `base_power_mw` | float | `2.0–12.0` | Nominal active power draw from `factory_buildings.json` |
| `clock` | float | `0.50–2.50` | Player-set overclock ratio (unlocked at Tier 4) |
| `geo_bonus` | float | `0.00` or `0.35` | `+0.35` when adjacent to a `geothermal_vent` |
| `craft_speed_mult` | float | `0.25–5.0` | Global tuning knob in `data/config.json` |
| `satisfaction` | float | `0.0–1.0` | Grid power satisfaction ratio `eta` |
| `power_draw_mw` | float | `0.66–51.96` | Active power draw in MW (idle machine draws `0.05 * base_power_mw`) |
| `effective_craft_rate` | float | `0.0–inf` | Crafts completed per second (`0` if `satisfaction == 0`) |

- **Output range**: `power_draw_mw` is positive and bounded (`min` at `base=2.0, clock=0.5` -> `0.66 MW`; `max` at `base=12.0, clock=2.5` -> `51.96 MW`). Division by zero is prevented since `recipe_seconds >= 1.0`.
- **Worked example**: An `assembler` (`base_power_mw = 12`, `recipe_seconds = 2.0`) at `clock = 2.0`, adjacent to a magma vent (`geo_bonus = 0.35`), `craft_speed_mult = 1.0`, `satisfaction = 1.0` draws `12 * 2^1.6 = 36.37 MW` and crafts at `0.5 * 2.0 * 1.35 = 1.35 items/s`.

### 3. Grid Satisfaction & Accumulator Balance
Named expression:
`solar_factor = day_ratio < 0.70 ? sin(pi * (day_ratio / 0.70)) : 0`
`satisfaction = demanded_mw > 0 ? min(1.0, (generated_mw + discharge_mw) / demanded_mw) : 1.0`

| Symbol | Type | Range | Description |
|---|---|---|---|
| `day_ratio` | float | `0.0–1.0` | Normalized progress through `day_cycle_seconds` |
| `solar_factor` | float | `0.0–1.0` | Instantaneous solar output curve (`0` at night) |
| `generated_mw` | float | `>= 15.0` | Total Hub RTG + Coal + Solar + Geothermal MW |
| `discharge_mw` | float | `>= 0.0` | Total accumulator discharge covering deficit (`<= 10 MW` per unit) |
| `demanded_mw` | float | `>= 0.0` | Total active + idle power demand |
| `satisfaction` | float | `0.0–1.0` | Clamped ratio scaling machine and inserter speed |

- **Output range**: `satisfaction` is strictly clamped to `[0.0, 1.0]`. Zero demand cleanly returns `1.0`.
- **Worked example**: During night (`solar_factor = 0`), Hub (`15 MW`) + 1 Coal Gen (`25 MW`) = `40 MW` generated. Demand is `60 MW` with 3 Accumulators (`max 30 MW` discharge). Accumulators supply `20 MW` deficit (`satisfaction = 1.0`) while draining `20 MJ/s`.

## Edge Cases
- **Multi-way Belt Intersection**: When 2 or 3 belts push into one destination belt tile on the same tick, the destination accepts strictly 1 item chosen by deterministic modulo rotation `(tick + tx * 31 + ty) % candidates.length`; rejected items hold at `progress = 1.0` without loss.
- **Unpaired Underground Tunnel**: An unpaired entrance holds up to 4 buffered items cleanly without destroying them until an exit tunnel is built within 5 tiles or the tunnel is dismantled (refunding nothing extra beyond building cost).
- **Orbital Hub Dismantle Attempt**: Attempting to dismantle `(31..33, 31..33)` is silently ignored; the Hub is indestructible.
- **Corrupt Blueprint / Save Import**: Malformed JSON, unknown item/building IDs, non-finite numbers, or out-of-bounds coordinates return structured validation errors and leave live game state untouched.

## Dependencies
- **Upstream**: `data/*.json` schemas, `src/core/rng.ts`, `src/core/types.ts`
- **Downstream**: `src/game/simulation.ts`, `src/game/power.ts`, `src/game/progression.ts`, `src/game/blueprints.ts`, `src/render/renderer.ts`, `src/ui/hud.ts`

## Tuning Knobs
All global multipliers live in `data/config.json` (`seed`, `mining_speed_mult`, `belt_speed_mult`, `craft_speed_mult`, `power_output_mult`, `day_cycle_seconds`, `free_build`) and can be modified live via the Studio Tweak Panel (`G`). Safe bounds are enforced by `min`/`max`/`step` metadata.

## Acceptance Criteria
- [ ] Four symmetric 5-tile conveyor lines (`N`, `E`, `S`, `W`) deliver ore into chests on the exact same simulation tick.
- [ ] Overclocking at `2.0x` produces `2.0x` output speed and `2^1.6` (~`3.03x`) active power draw.
- [ ] Accumulators absorb daytime solar surplus and prevent brownouts during the night cycle (`dayTime >= 0.70`).
- [ ] All 19 items in `data/factory_items.json` are both produced and consumed across mining, smelting, crafting, power, construction, or Orbital Phases.
- [ ] Blueprint rotation by 90° CW updates relative offsets and building directions consistently across all 4 quadrants.
