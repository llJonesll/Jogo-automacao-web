import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/core/data';
import { stepSimulation } from '../../src/game/simulation';
import { createWorld, placeBuilding, tileIndex } from '../../src/game/world';

describe('production chains', () => {
  it('mines ore, smelts ingots, presses plates, and delivers them to the Orbital Hub', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(200);

    // Place a deterministic iron_ore vein next to Orbital Hub at (26, 31)
    world.resources[tileIndex(26, 31)] = 'iron_ore';

    placeBuilding(world, 'miner_mk1', 26, 31, 1, config);
    placeBuilding(world, 'smelter', 27, 31, 1, config, { recipeId: 'auto' });
    placeBuilding(world, 'constructor', 28, 31, 1, config, { recipeId: 'press_plate' });
    placeBuilding(world, 'belt_mk2', 29, 31, 1, config);
    placeBuilding(world, 'belt_mk2', 30, 31, 1, config);

    const startPlates = world.stockpile.iron_plate ?? 0;

    // Run 300 ticks (15 seconds of sim time)
    for (let t = 0; t < 300; t++) {
      stepSimulation(world, config);
    }

    const endPlates = world.stockpile.iron_plate ?? 0;
    expect(endPlates - startPlates).toBeGreaterThanOrEqual(5);
  });

  it('auto-locks Foundry recipes cleanly regardless of ingredient arrival order and supports Assemblers', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(201);

    const inCoal = placeBuilding(world, 'storage', 10, 10, 0, config).entity!;
    const inGlass = placeBuilding(world, 'storage', 10, 12, 0, config).entity!;
    placeBuilding(world, 'inserter', 11, 10, 1, config);
    placeBuilding(world, 'inserter', 11, 12, 1, config);
    placeBuilding(world, 'belt_mk2', 12, 10, 2, config);
    placeBuilding(world, 'belt_mk2', 12, 12, 0, config);

    const foundry = placeBuilding(world, 'foundry', 12, 11, 1, config, {
      recipeId: 'auto',
    }).entity!;
    const outWafer = placeBuilding(world, 'storage', 13, 11, 0, config).entity!;

    // Deliver Coal BEFORE Glass Crystal to test non-ambiguous auto-lock
    inCoal.inventory.coal = 4;
    for (let t = 0; t < 30; t++) stepSimulation(world, config);
    expect(foundry.lockedRecipeId).toBeNull();

    inGlass.inventory.glass_crystal = 4;
    for (let t = 0; t < 180; t++) stepSimulation(world, config);

    expect(foundry.lockedRecipeId).toBe('dope_silicon');
    expect(outWafer.inventory.silicon_wafer).toBeGreaterThanOrEqual(2);
  });

  it('crafts full tier-5 Quantum Cores in an Assembler chain', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(202);

    const assembler = placeBuilding(world, 'assembler', 15, 15, 1, config, {
      recipeId: 'assemble_quantum',
    }).entity!;
    const out = placeBuilding(world, 'storage', 16, 15, 0, config).entity!;

    assembler.inputBuffer.modular_frame = 2;
    assembler.inputBuffer.processor = 4;

    for (let t = 0; t < 260; t++) {
      stepSimulation(world, config);
    }

    expect(out.inventory.quantum_core).toBe(2);
  });
});
