import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/core/data';
import type { Direction } from '../../src/core/types';
import { stepSimulation } from '../../src/game/simulation';
import { createWorld, getBuildingAt, placeBuilding } from '../../src/game/world';

describe('logistics simulation', () => {
  it('delivers items symmetrically across N, E, S, and W belt lines on the exact same tick', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;

    const dirs: Direction[] = [0, 1, 2, 3];
    const deliveryTicks: number[] = [];

    for (const dir of dirs) {
      const world = createWorld(100);
      // Place 5 belts and a target storage chest along direction `dir` away from center
      const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0;
      const dy = dir === 2 ? 1 : dir === 0 ? -1 : 0;
      const sx = 10;
      const sy = 10;

      for (let i = 0; i < 5; i++) {
        const res = placeBuilding(world, 'belt_mk1', sx + dx * i, sy + dy * i, dir, config);
        expect(res.ok).toBe(true);
      }
      const chestRes = placeBuilding(world, 'storage', sx + dx * 5, sy + dy * 5, 0, config);
      expect(chestRes.ok).toBe(true);

      const firstBelt = getBuildingAt(world, sx, sy)!;
      firstBelt.slots.push({ item: 'iron_ore', progress: 0 });

      let deliveredAt = -1;
      for (let t = 1; t <= 120; t++) {
        stepSimulation(world, config);
        const chest = getBuildingAt(world, sx + dx * 5, sy + dy * 5)!;
        if ((chest.inventory.iron_ore ?? 0) === 1) {
          deliveredAt = t;
          break;
        }
      }
      deliveryTicks.push(deliveredAt);
    }

    expect(deliveryTicks[0]).toBeGreaterThan(0);
    expect(deliveryTicks).toEqual([
      deliveryTicks[0],
      deliveryTicks[0],
      deliveryTicks[0],
      deliveryTicks[0],
    ]);
  });

  it('halts saturated belts cleanly under backpressure without losing items', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(101);

    placeBuilding(world, 'belt_mk1', 5, 5, 1, config);
    placeBuilding(world, 'belt_mk1', 6, 5, 1, config);
    placeBuilding(world, 'belt_mk1', 7, 5, 1, config);

    // Fill 6 items into a dead-end 3-tile belt line (max capacity 2 items per tile = 6)
    const b0 = getBuildingAt(world, 5, 5)!;
    const b1 = getBuildingAt(world, 6, 5)!;
    const b2 = getBuildingAt(world, 7, 5)!;
    b0.slots.push({ item: 'iron_ore', progress: 0.7 }, { item: 'iron_ore', progress: 0.2 });
    b1.slots.push({ item: 'iron_ore', progress: 0.8 }, { item: 'iron_ore', progress: 0.3 });
    b2.slots.push({ item: 'iron_ore', progress: 1.0 }, { item: 'iron_ore', progress: 0.5 });

    for (let t = 0; t < 40; t++) {
      stepSimulation(world, config);
    }

    expect(b0.slots.length + b1.slots.length + b2.slots.length).toBe(6);
  });

  it('distributes items evenly via splitters (1->2 and 1->3) and merges fairly (2->1)', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(102);

    // 1->3 Splitter at (10,10) facing East (1): Left=(10,9), Front=(11,10), Right=(10,11)
    const splitter = placeBuilding(world, 'splitter', 10, 10, 1, config).entity!;
    placeBuilding(world, 'storage', 10, 9, 0, config);
    placeBuilding(world, 'storage', 11, 10, 0, config);
    placeBuilding(world, 'storage', 10, 11, 0, config);

    for (let i = 0; i < 30; i++) {
      splitter.slots = [{ item: 'iron_plate', progress: 1.0 }];
      stepSimulation(world, config);
    }

    expect(getBuildingAt(world, 10, 9)!.inventory.iron_plate).toBe(10);
    expect(getBuildingAt(world, 11, 10)!.inventory.iron_plate).toBe(10);
    expect(getBuildingAt(world, 10, 11)!.inventory.iron_plate).toBe(10);

    // 2->1 Merger at (20,10) facing East (1), receiving from N=(20,9) and S=(20,11), pushing to (21,10)
    placeBuilding(world, 'merger', 20, 10, 1, config);
    const northIn = placeBuilding(world, 'belt_mk2', 20, 9, 2, config).entity!;
    const southIn = placeBuilding(world, 'belt_mk2', 20, 11, 0, config).entity!;
    const mergeOut = placeBuilding(world, 'storage', 21, 10, 0, config).entity!;

    for (let t = 0; t < 80; t++) {
      if (northIn.slots.length === 0) northIn.slots.push({ item: 'iron_ore', progress: 1.0 });
      if (southIn.slots.length === 0) southIn.slots.push({ item: 'copper_ore', progress: 1.0 });
      stepSimulation(world, config);
    }

    const ironCount = mergeOut.inventory.iron_ore ?? 0;
    const copperCount = mergeOut.inventory.copper_ore ?? 0;
    expect(ironCount).toBeGreaterThanOrEqual(6);
    expect(copperCount).toBeGreaterThanOrEqual(6);
    expect(Math.abs(ironCount - copperCount)).toBeLessThanOrEqual(2);
  });

  it('transports items across obstacles using paired underground tunnels and inserters', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(103);

    // Place blocking perpendicular belts between x=11 and x=12
    placeBuilding(world, 'belt_mk1', 11, 10, 2, config);
    placeBuilding(world, 'belt_mk1', 12, 10, 2, config);

    const entrance = placeBuilding(world, 'tunnel', 10, 10, 1, config).entity!;
    const exit = placeBuilding(world, 'tunnel', 13, 10, 1, config).entity!;
    const chestMid = placeBuilding(world, 'storage', 14, 10, 0, config).entity!;
    placeBuilding(world, 'inserter', 15, 10, 1, config);
    const chestFinal = placeBuilding(world, 'storage', 16, 10, 0, config).entity!;

    expect(entrance.tunnelMode).toBe('entrance');
    expect(exit.tunnelMode).toBe('exit');
    expect(entrance.pairedId).toBe(exit.id);

    entrance.tunnelQueue.push({ item: 'circuit', progress: 0 });

    for (let t = 0; t < 80; t++) {
      stepSimulation(world, config);
    }

    expect(chestFinal.inventory.circuit).toBe(1);
    expect(chestMid.inventory.circuit ?? 0).toBe(0);
  });
});
