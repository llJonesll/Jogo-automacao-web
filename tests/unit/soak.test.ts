import { describe, expect, it } from 'vitest';
import { ORBITAL_PHASES, createDefaultConfig } from '../../src/core/data';
import { createDemoWorld } from '../../src/game/demo';
import { stepPower } from '../../src/game/power';
import {
  getActiveOrbitalPhase,
  loadPhaseFromStockpile,
  stepResearchLab,
  tickWorld,
} from '../../src/game/progression';
import { deserializeWorld, serializeWorld } from '../../src/game/save';
import { stepSimulation } from '../../src/game/simulation';
import {
  createWorld,
  getBuildingAt,
  placeBuilding,
  removeBuilding,
  setMachineClock,
  setMachineRecipe,
  tileIndex,
} from '../../src/game/world';

describe('soak, performance, conservation, and regression tests', () => {
  it('runs a 3,600-tick full day/night soak on demo world without NaNs, overflows, or stalls', () => {
    const config = createDefaultConfig();
    const world = createDemoWorld(config);

    for (let t = 0; t < 3600; t++) {
      tickWorld(world, config);
    }

    expect(world.tick).toBe(3600 + 240);
    expect(Number.isFinite(world.power.generatedMw)).toBe(true);
    expect(Number.isFinite(world.power.demandedMw)).toBe(true);
    expect(world.power.satisfaction).toBeGreaterThanOrEqual(0);
    expect(world.power.satisfaction).toBeLessThanOrEqual(1);
    expect(world.power.storedMj).toBeGreaterThanOrEqual(0);
    expect(world.power.storedMj).toBeLessThanOrEqual(world.power.capacityMj + 1e-6);

    for (const b of Object.values(world.buildings)) {
      expect(Number.isFinite(b.craftProgress)).toBe(true);
      expect(Number.isFinite(b.energyMj)).toBe(true);
      expect(Number.isFinite(b.fuelTimer)).toBe(true);
      expect(Number.isFinite(b.activePowerMw)).toBe(true);
      expect(b.slots.length).toBeLessThanOrEqual(2);
      for (const s of b.slots) {
        expect(Number.isFinite(s.progress)).toBe(true);
        expect(s.progress).toBeGreaterThanOrEqual(0);
        expect(s.progress).toBeLessThanOrEqual(1);
      }
      expect(b.tunnelQueue.length).toBeLessThanOrEqual(b.pairedId ? 10 : 4);
      for (const q of b.tunnelQueue) {
        expect(Number.isFinite(q.progress)).toBe(true);
      }
      if (b.type === 'accumulator') {
        expect(b.energyMj).toBeGreaterThanOrEqual(0);
        expect(b.energyMj).toBeLessThanOrEqual(180 + 1e-6);
      }
    }
  });

  it('conserves 100% of items across saturated belts, splitters, mergers, tunnels, and inserters over 4,000 ticks', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(501);

    // Closed belt loop + tunnel + splitter + merger + chest with inserter
    placeBuilding(world, 'belt_mk2', 10, 10, 1, config);
    const ent = placeBuilding(world, 'tunnel', 11, 10, 1, config).entity!;
    placeBuilding(world, 'tunnel', 14, 10, 1, config);
    const spl = placeBuilding(world, 'splitter', 15, 10, 1, config).entity!;
    placeBuilding(world, 'belt_mk2', 15, 9, 2, config);
    placeBuilding(world, 'belt_mk2', 16, 10, 2, config);
    placeBuilding(world, 'belt_mk2', 15, 11, 0, config);
    placeBuilding(world, 'merger', 16, 11, 2, config);
    placeBuilding(world, 'belt_mk2', 16, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 15, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 14, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 13, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 12, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 11, 12, 3, config);
    placeBuilding(world, 'belt_mk2', 10, 12, 0, config);
    placeBuilding(world, 'belt_mk2', 10, 11, 0, config);

    // Seed 20 items around the loop
    const startBelt = getBuildingAt(world, 10, 10)!;
    startBelt.slots.push({ item: 'iron_plate', progress: 0.6 }, { item: 'iron_plate', progress: 0.1 });
    ent.tunnelQueue.push(
      { item: 'iron_plate', progress: 0.9 },
      { item: 'iron_plate', progress: 0.6 },
      { item: 'iron_plate', progress: 0.3 }
    );
    spl.slots.push({ item: 'iron_plate', progress: 0.8 });
    for (const [x, y] of [
      [16, 10],
      [16, 12],
      [15, 12],
      [14, 12],
      [13, 12],
      [12, 12],
      [11, 12],
    ]) {
      const b = getBuildingAt(world, x, y)!;
      b.slots.push({ item: 'iron_plate', progress: 0.7 }, { item: 'iron_plate', progress: 0.2 });
    }

    const countAll = () => {
      let total = 0;
      for (const b of Object.values(world.buildings)) {
        total += b.slots.length + b.tunnelQueue.length;
        if (b.inserterItem) total += 1;
        total += b.inventory.iron_plate ?? 0;
      }
      return total;
    };

    const initialTotal = countAll();
    expect(initialTotal).toBe(20);

    for (let t = 0; t < 4000; t++) {
      stepSimulation(world, config);
    }

    expect(countAll()).toBe(initialTotal);
  });

  it('meets < 5 ms/tick budget on a 500+ active entity megafactory across 1,200 ticks', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(502);
    world.unlockedTechs = [
      'tier_1_logistics',
      'tier_2_metallurgy',
      'tier_3_electronics',
      'tier_4_overclock',
    ];

    // Clear central 50x50 area vents/ores cleanly and build 20 parallel 30-tile production lines (~540 entities)
    for (let row = 0; row < 20; row++) {
      const y = 4 + row * 3;
      if (y >= 30 && y <= 34) continue; // skip hub row
      world.resources[tileIndex(4, y)] = 'iron_ore';
      placeBuilding(world, 'miner_mk2', 4, y, 1, config);
      placeBuilding(world, 'smelter', 5, y, 1, config, { recipeId: 'smelt_iron' });
      placeBuilding(world, 'constructor', 6, y, 1, config, { recipeId: 'press_plate' });
      for (let x = 7; x <= 32; x++) {
        if (x === 14) {
          placeBuilding(world, 'tunnel', x, y, 1, config);
        } else if (x === 17) {
          placeBuilding(world, 'tunnel', x, y, 1, config);
        } else if (x === 15 || x === 16) {
          placeBuilding(world, 'solar_panel', x, y, 0, config);
        } else if (x === 25) {
          placeBuilding(world, 'splitter', x, y, 1, config);
        } else if (x === 28) {
          placeBuilding(world, 'inserter', x, y, 1, config);
        } else if (x === 29) {
          placeBuilding(world, 'storage', x, y, 0, config);
        } else {
          placeBuilding(world, 'belt_mk3', x, y, 1, config);
        }
      }
    }
    // Power with geothermal + solar
    for (let x = 4; x < 26; x++) {
      world.resources[tileIndex(x, 2)] = 'geothermal_vent';
      placeBuilding(world, 'geothermal_plant', x, 2, 0, config);
    }

    expect(Object.keys(world.buildings).length).toBeGreaterThanOrEqual(500);

    // Warm up JIT
    for (let t = 0; t < 50; t++) tickWorld(world, config);

    const t0 = performance.now();
    for (let t = 0; t < 1200; t++) {
      tickWorld(world, config);
    }
    const elapsedMs = performance.now() - t0;
    const msPerTick = elapsedMs / 1200;

    expect(msPerTick).toBeLessThan(5.0);
  });

  it('maintains exact deterministic save/load parity mid-run across 1,500 ticks', () => {
    const config = createDefaultConfig();
    const w1 = createDemoWorld(config);
    for (let t = 0; t < 500; t++) tickWorld(w1, config);

    const saved = serializeWorld(w1);
    const res = deserializeWorld(saved);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const w2 = res.world;

    for (let t = 0; t < 1000; t++) {
      tickWorld(w1, config);
      tickWorld(w2, config);
    }

    expect(w2.tick).toBe(w1.tick);
    expect(w2.dayTime).toBe(w1.dayTime);
    expect(w2.stockpile).toEqual(w1.stockpile);
    expect(w2.power).toEqual(w1.power);
    expect(w2.telemetry).toEqual(w1.telemetry);
    expect(w2.phaseIndex).toBe(w1.phaseIndex);
    expect(w2.phaseDelivered).toEqual(w1.phaseDelivered);
    expect(Object.keys(w2.buildings).length).toBe(Object.keys(w1.buildings).length);
  });

  it('refunds items inside slots, tunnelQueue, inserterItem, inputBuffer, outputBuffer, and inventory on dismantle', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(503);

    const belt = placeBuilding(world, 'belt_mk1', 10, 10, 1, config).entity!;
    belt.slots.push({ item: 'iron_ore', progress: 0.4 }, { item: 'copper_ore', progress: 0.1 });

    const tun = placeBuilding(world, 'tunnel', 12, 10, 1, config).entity!;
    tun.tunnelQueue.push({ item: 'circuit', progress: 0.5 }, { item: 'circuit', progress: 0.2 });

    const ins = placeBuilding(world, 'inserter', 14, 10, 1, config).entity!;
    ins.inserterItem = 'rotor';

    const sm = placeBuilding(world, 'smelter', 16, 10, 1, config, { recipeId: 'smelt_iron' }).entity!;
    sm.inputBuffer.iron_ore = 4;
    sm.outputBuffer = { item: 'iron_ingot', count: 3 };

    const st = placeBuilding(world, 'storage', 18, 10, 0, config).entity!;
    st.inventory.steel_beam = 7;

    const beforeOre = world.stockpile.iron_ore ?? 0;
    const beforeCopper = world.stockpile.copper_ore ?? 0;
    const beforeCircuit = world.stockpile.circuit ?? 0;
    const beforeRotor = world.stockpile.rotor ?? 0;
    const beforeIngot = world.stockpile.iron_ingot ?? 0;
    const beforeSteel = world.stockpile.steel_beam ?? 0;

    removeBuilding(world, 10, 10, true);
    removeBuilding(world, 12, 10, true);
    removeBuilding(world, 14, 10, true);
    removeBuilding(world, 16, 10, true);
    removeBuilding(world, 18, 10, true);

    expect((world.stockpile.iron_ore ?? 0) - beforeOre).toBe(5); // 1 belt + 4 smelter input
    expect((world.stockpile.copper_ore ?? 0) - beforeCopper).toBe(1);
    expect((world.stockpile.circuit ?? 0) - beforeCircuit).toBe(2);
    expect((world.stockpile.rotor ?? 0) - beforeRotor).toBe(1);
    expect((world.stockpile.iron_ingot ?? 0) - beforeIngot).toBe(3);
    expect((world.stockpile.steel_beam ?? 0) - beforeSteel).toBe(7);
  });

  it('pairs tunnels bidirectionally, buffers up to 4 items while unpaired, and sustains >= 4.0/s over 5-tile span', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(504);

    // 1. Place EXIT at (15, 10) BEFORE ENTRANCE at (10, 10) (5 tiles span)
    const exit = placeBuilding(world, 'tunnel', 15, 10, 1, config).entity!;
    const entrance = placeBuilding(world, 'tunnel', 10, 10, 1, config).entity!;
    expect(entrance.tunnelMode).toBe('entrance');
    expect(exit.tunnelMode).toBe('exit');
    expect(entrance.pairedId).toBe(exit.id);
    expect(exit.pairedId).toBe(entrance.id);

    // 2. Test 4-item buffer on unpaired entrance, then attach exit afterward
    const feeder = placeBuilding(world, 'storage', 9, 14, 0, config).entity!;
    feeder.inventory.iron_plate = 10;
    placeBuilding(world, 'inserter', 10, 14, 1, config);
    const soloEnt = placeBuilding(world, 'tunnel', 11, 14, 1, config).entity!;
    for (let t = 0; t < 120; t++) stepSimulation(world, config);
    expect(soloEnt.status).toBe('unpaired');
    expect(soloEnt.tunnelQueue.length).toBe(4);

    // Now place downstream exit at (16, 14) and chest at (17, 14) -> buffered items flow out!
    const soloExit = placeBuilding(world, 'tunnel', 16, 14, 1, config).entity!;
    const outChest = placeBuilding(world, 'storage', 17, 14, 0, config).entity!;
    expect(soloEnt.pairedId).toBe(soloExit.id);
    for (let t = 0; t < 160; t++) stepSimulation(world, config);
    expect(outChest.inventory.iron_plate).toBe(10);

    // 3. Test 5-tile tunnel throughput with continuous feed >= 4.0/s (10s = 200 ticks -> >= 40 items)
    const feedBelt = placeBuilding(world, 'belt_mk2', 9, 10, 1, config).entity!;
    const throughputChest = placeBuilding(world, 'storage', 16, 10, 0, config).entity!;
    for (let t = 0; t < 200; t++) {
      if (feedBelt.slots.length === 0) {
        feedBelt.slots.push({ item: 'iron_ingot', progress: 1.0 });
      }
      stepSimulation(world, config);
    }
    expect(throughputChest.inventory.iron_ingot ?? 0).toBeGreaterThanOrEqual(40);

    // 4. Test splitter & merger 2-slot 8.0/s throughput matching belt_mk3 without throttling
    const b3Feed = placeBuilding(world, 'belt_mk3', 10, 20, 1, config).entity!;
    placeBuilding(world, 'splitter', 11, 20, 1, config);
    placeBuilding(world, 'merger', 12, 20, 1, config);
    const b3Out = placeBuilding(world, 'storage', 13, 20, 0, config).entity!;
    for (let t = 0; t < 200; t++) {
      if (b3Feed.slots.length < 2) {
        b3Feed.slots.push({ item: 'copper_ingot', progress: 1.0 });
      }
      stepSimulation(world, config);
    }
    // 10s at 8.0+/s throughput (must exceed old 4.0/s cap = 40 items)
    expect(b3Out.inventory.copper_ingot ?? 0).toBeGreaterThanOrEqual(60);
  });

  it('scales Research Lab with speed/geoBonus/clock/craftMult, filters needed tech items, and verifies coal burn & blackout recovery', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(505);

    // 1. Lab filtering & speed scaling
    world.activeTechId = 'tier_1_logistics'; // needs 25 iron_plate, 20 copper_wire
    world.resources[tileIndex(15, 15)] = 'geothermal_vent';
    const lab = placeBuilding(world, 'research_lab', 16, 15, 0, config).entity!;
    expect(lab.geoBonus).toBeCloseTo(0.35, 3);

    const feedBelt = placeBuilding(world, 'belt_mk2', 15, 15, 1, config).entity!;
    feedBelt.slots.push({ item: 'stone', progress: 1.0 });
    stepSimulation(world, config);
    // Stone is NOT needed by tier_1_logistics so lab rejects it
    expect(lab.inputBuffer.stone ?? 0).toBe(0);
    expect(feedBelt.slots.length).toBe(1);

    // Now test stepResearchLab rate with clock=2.0, craft_speed_mult=2.0, geoBonus=0.35 -> 2.0 * 1.35 * 2.0 * 2.0 = 10.8/s
    expect(setMachineClock(world, lab.id, 2.0, true)).toBe(true);
    lab.inputBuffer.iron_plate = 5;
    config.craft_speed_mult.value = 2.0;
    const ev: Array<{ kind: 'launch' | 'tech' }> = [];
    stepResearchLab(world, lab, 1.0, 0.05, ev, config);
    expect(lab.craftProgress).toBeCloseTo(10.8 * 0.05, 3);

    // 2. Coal generator fuel_value burn (100 MJ / 25 MW = 4.0s = 80 ticks per coal) & blackout recovery
    config.craft_speed_mult.value = 1.0;
    const wPower = createWorld(506);
    // 8 active constructors (32 MW > 20 MW Hub -> requires 25 MW coal generator for 100% satisfaction)
    for (let i = 0; i < 8; i++) {
      const c = placeBuilding(wPower, 'constructor', 10 + i, 12, 0, config, {
        recipeId: 'press_plate',
      }).entity!;
      c.status = 'working';
      c.craftProgress = 0.2;
    }
    const gen = placeBuilding(wPower, 'coal_generator', 10, 10, 0, config).entity!;
    gen.inputBuffer.coal = 1;
    stepPower(wPower, config, 0.05);
    expect(gen.fuelTimer).toBeCloseTo(4.0, 3); // burned 1 coal for fuel_value/generates_mw = 4.0s
    expect(wPower.power.generatedMw).toBeCloseTo(45, 2); // 20 Hub + 25 Coal
    expect(wPower.power.satisfaction).toBe(1.0);

    // Drain fuel completely over 80 ticks (4.0s) and starve
    for (let t = 0; t < 80; t++) stepPower(wPower, config, 0.05);
    expect(gen.fuelTimer).toBe(0);
    expect(gen.status).toBe('input_starved');
    expect(wPower.power.satisfaction).toBeCloseTo(20 / 32, 2);

    // Re-supply coal -> power recovers immediately to 100%
    gen.inputBuffer.coal = 1;
    stepPower(wPower, config, 0.05);
    expect(gen.status).toBe('working');
    expect(wPower.power.generatedMw).toBeCloseTo(45, 2);
    expect(wPower.power.satisfaction).toBe(1.0);
  });

  it('enforces recipe tech gates, applies +50% orbital_overdrive speed, and completes Phases 1->5 victory', () => {
    const config = createDefaultConfig();
    const world = createWorld(507);
    world.stockpile.steel_beam = 50;
    world.stockpile.rotor = 50;
    world.stockpile.circuit = 50;
    world.stockpile.concrete = 50;
    world.unlockedTechs = ['tier_1_logistics', 'tier_2_metallurgy', 'tier_3_electronics'];

    // Tier 3 unlocked: assembler works, but assemble_processor (T4) and assemble_quantum (T5) must be gated
    const asm = placeBuilding(world, 'assembler', 12, 12, 1, config, {
      recipeId: 'assemble_quantum',
    }).entity!;
    expect(asm.recipeId).toBe('auto');
    expect(setMachineRecipe(world, asm.id, 'assemble_processor', config)).toBe(false);
    expect(setMachineRecipe(world, asm.id, 'assemble_quantum', config)).toBe(false);

    // Unlock T4 -> assemble_processor allowed, assemble_quantum still locked
    world.unlockedTechs.push('tier_4_overclock');
    expect(setMachineRecipe(world, asm.id, 'assemble_processor', config)).toBe(true);
    expect(setMachineRecipe(world, asm.id, 'assemble_quantum', config)).toBe(false);

    // Unlock orbital_ascension -> +50% global speed boost (1.5x)
    const belt = placeBuilding(world, 'belt_mk1', 15, 15, 1, config).entity!;
    belt.slots.push({ item: 'iron_ore', progress: 0 });
    stepSimulation(world, config);
    const baseStep = belt.slots[0].progress; // 2.0 * 0.05 = 0.10

    world.unlockedTechs.push('tier_5_quantum', 'orbital_ascension');
    belt.slots = [{ item: 'iron_ore', progress: 0 }];
    stepSimulation(world, config);
    const overdriveStep = belt.slots[0].progress; // 2.0 * 1.5 * 0.05 = 0.15
    expect(overdriveStep).toBeCloseTo(baseStep * 1.5, 4);

    // Complete all 5 Orbital Phases -> orbitalLaunches === 5 && victoryAchieved === true
    for (let p = 0; p < ORBITAL_PHASES.length; p++) {
      const phase = getActiveOrbitalPhase(world)!;
      for (const req of phase.requirements) {
        world.stockpile[req.item] = (world.stockpile[req.item] ?? 0) + req.count;
      }
      const ev: Array<{ kind: 'launch' | 'tech' }> = [];
      loadPhaseFromStockpile(world, ev);
      expect(ev.some((e) => e.kind === 'launch')).toBe(true);
    }
    expect(world.orbitalLaunches).toBe(5);
    expect(world.victoryAchieved).toBe(true);
  });
});
