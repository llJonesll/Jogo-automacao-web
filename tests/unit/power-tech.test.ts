import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/core/data';
import { computeOverclockPower, computeSolarFactor, stepPower } from '../../src/game/power';
import {
  getRollingRates,
  tickWorld,
  unlockTechFromStockpile,
} from '../../src/game/progression';
import {
  createWorld,
  hasAdjacentGeothermalVent,
  placeBuilding,
  setMachineClock,
  tileIndex,
} from '../../src/game/world';

describe('power grid, overclocking, and tech progression', () => {
  it('applies c^1.6 overclock power scaling and linear craft speed boost', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(300);

    // Unlock Tier 4 Overclocking
    world.unlockedTechs = [
      'tier_1_logistics',
      'tier_2_metallurgy',
      'tier_3_electronics',
      'tier_4_overclock',
    ];

    const smelter = placeBuilding(world, 'smelter', 10, 10, 1, config, {
      recipeId: 'smelt_iron',
    }).entity!;
    expect(setMachineClock(world, smelter.id, 2.0)).toBe(true);

    // Power draw at 2.0x clock is 3 * (2^1.6) = ~9.094 MW
    expect(computeOverclockPower(3, 2.0, true)).toBeCloseTo(3 * Math.pow(2, 1.6), 3);

    smelter.inputBuffer.iron_ore = 10;
    // 1.5s craft at 2.0x clock = 0.75s (15 ticks)
    for (let t = 0; t < 16; t++) {
      tickWorld(world, config);
    }

    expect(smelter.outputBuffer?.item).toBe('iron_ingot');
    expect(smelter.outputBuffer?.count).toBe(1);
    expect(world.power.demandedMw).toBeGreaterThan(8.5);
  });

  it('scales machine speed proportionally during power brownouts (eta = 0.5)', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(301);

    // Ensure clean terrain without geothermal resonance around test row
    for (let y = 9; y <= 11; y++) {
      for (let x = 9; x <= 20; x++) {
        if (world.resources[tileIndex(x, y)] === 'geothermal_vent') {
          world.resources[tileIndex(x, y)] = 'none';
        }
      }
    }

    // Hub supplies 20 MW; place 10 active constructors (4 MW each = 40 MW) -> 20 / 40 = 0.5 satisfaction
    const constructors = [];
    for (let i = 0; i < 10; i++) {
      const c = placeBuilding(world, 'constructor', 10 + i, 10, 0, config, {
        recipeId: 'press_plate',
      }).entity!;
      c.inputBuffer.iron_ingot = 5;
      constructors.push(c);
    }

    // Run 20 ticks (1.0s wall time): at full power (eta=1), 1.0s completes 1 plate; at eta=0.5, progress should be ~0.5
    for (let t = 0; t < 20; t++) {
      tickWorld(world, config);
    }

    expect(world.power.satisfaction).toBeCloseTo(0.5, 2);
    expect(constructors[0].outputBuffer).toBeNull();
    expect(constructors[0].craftProgress).toBeCloseTo(0.5, 1);
  });

  it('charges accumulators in daylight and discharges cleanly during night', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(302);
    world.unlockedTechs = ['tier_1_logistics', 'tier_2_metallurgy', 'tier_3_electronics'];

    // 4 Solar panels (+56 MW peak at midday) + 1 Accumulator (180 MJ) + Hub (20 MW)
    for (let i = 0; i < 4; i++) placeBuilding(world, 'solar_panel', 10 + i, 10, 0, config);
    const acc = placeBuilding(world, 'accumulator', 14, 10, 0, config).entity!;

    world.dayTime = 0.35; // Peak solar
    expect(computeSolarFactor(world.dayTime)).toBeCloseTo(1.0, 2);

    for (let i = 0; i < 20; i++) stepPower(world, config, 0.5); // 10 seconds charge
    expect(acc.energyMj).toBeGreaterThan(80);

    // Switch to night (solar = 0) with 24 MW load (Hub gives 20 MW, deficit = 4 MW -> accumulator fills gap)
    world.dayTime = 0.85;
    expect(computeSolarFactor(world.dayTime)).toBe(0);
    for (let i = 0; i < 8; i++) {
      const s = placeBuilding(world, 'smelter', 10 + i, 12, 0, config, {
        recipeId: 'smelt_iron',
      }).entity!;
      s.status = 'working';
      s.craftProgress = 0.2;
    }

    const energyBeforeNight = acc.energyMj;
    stepPower(world, config, 1.0);
    expect(world.power.satisfaction).toBe(1.0);
    expect(acc.energyMj).toBeLessThan(energyBeforeNight);
  });

  it('grants +35% geothermal thermal resonance and unlocks techs + orbital phases + rolling telemetry', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(303);

    world.resources[tileIndex(15, 15)] = 'geothermal_vent';
    const smelter = placeBuilding(world, 'smelter', 16, 15, 1, config, {
      recipeId: 'smelt_iron',
    }).entity!;
    expect(hasAdjacentGeothermalVent(world, 16, 15)).toBe(true);
    expect(smelter.geoBonus).toBeCloseTo(0.35, 3);

    // Unlock Tier 1 from stockpile
    expect(unlockTechFromStockpile(world, 'tier_1_logistics')).toBe(true);
    expect(world.unlockedTechs).toContain('tier_1_logistics');

    // Feed Phase 1 orbital requirements into Hub via belt
    const feed = placeBuilding(world, 'belt_mk2', 30, 31, 1, config).entity!;
    const reqs: Array<[keyof typeof world.stockpile, number]> = [
      ['iron_plate', 40],
      ['iron_gear', 20],
      ['copper_wire', 40],
      ['concrete', 20],
    ];
    for (const [item, count] of reqs) {
      for (let i = 0; i < count; i++) {
        feed.slots = [{ item, progress: 1.0 }];
        tickWorld(world, config);
      }
    }

    expect(world.orbitalLaunches).toBe(1);
    expect(world.phaseIndex).toBe(1);

    smelter.inputBuffer.iron_ore = 2;
    for (let t = 0; t < 30; t++) tickWorld(world, config);
    const rates = getRollingRates(world);
    expect(rates.producedPerMin.iron_ingot ?? 0).toBeGreaterThanOrEqual(1);
  });
});
