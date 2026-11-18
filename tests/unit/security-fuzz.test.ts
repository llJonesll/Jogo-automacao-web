import { describe, expect, it } from 'vitest';
import { ORBITAL_PHASES, createDefaultConfig } from '../../src/core/data';
import {
  STARTER_BLUEPRINTS,
  decodeBlueprint,
  encodeBlueprint,
  placeBlueprint,
} from '../../src/game/blueprints';
import { deserializeWorld, serializeWorld } from '../../src/game/save';
import { createWorld, placeBuilding } from '../../src/game/world';

describe('trust-boundary security & fuzz tests (save.ts & blueprints.ts)', () => {
  it('rejects malformed, root-array, oversized, and prototype-pollution save payloads', () => {
    const base = createWorld(600);
    const baseObj = JSON.parse(serializeWorld(base)) as Record<string, unknown>;

    expect(deserializeWorld('[]').ok).toBe(false);
    expect(deserializeWorld('[{}]').ok).toBe(false);
    expect(deserializeWorld('null').ok).toBe(false);
    expect(deserializeWorld('12345').ok).toBe(false);
    expect(deserializeWorld('x'.repeat(4_000_005)).ok).toBe(false);

    // Prototype pollution attempts in root, stockpile, buildings, inputBuffer, telemetry
    const protoRoot = '{"version":1,"size":64,"__proto__":{"polluted":true}}';
    expect(deserializeWorld(protoRoot).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const protoStockpile = serializeWorld(base).replace(
      '"stockpile":{',
      '"stockpile":{"__proto__":{"polluted":true},"constructor":5,'
    );
    expect(deserializeWorld(protoStockpile).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // Constructor key inside buildings map should be rejected, while type:"constructor" entity works
    const protoBuildingKey = serializeWorld(base).replace(
      '"buildings":{',
      '"buildings":{"constructor":{"type":"belt_mk1","x":1,"y":1,"dir":0,"clock":1},'
    );
    expect(deserializeWorld(protoBuildingKey).ok).toBe(false);

    const cfg = createDefaultConfig();
    cfg.free_build.value = 1;
    const withConstructor = createWorld(601);
    placeBuilding(withConstructor, 'constructor', 5, 5, 1, cfg);
    expect(deserializeWorld(serializeWorld(withConstructor)).ok).toBe(true);

    // Invalid resources entry
    const badRes = structuredClone(baseObj);
    (badRes.resources as string[])[0] = 'lava_monster';
    expect(deserializeWorld(JSON.stringify(badRes)).ok).toBe(false);

    // Invalid phaseIndex and telemetry bounds
    expect(deserializeWorld(JSON.stringify({ ...baseObj, phaseIndex: ORBITAL_PHASES.length + 1 })).ok).toBe(false);
    expect(deserializeWorld(JSON.stringify({ ...baseObj, phaseIndex: -1 })).ok).toBe(false);

    const badTelIdx = structuredClone(baseObj) as { telemetry: { bucketIndex: number } };
    badTelIdx.telemetry.bucketIndex = 999;
    expect(deserializeWorld(JSON.stringify(badTelIdx)).ok).toBe(false);

    const badTelTick = structuredClone(baseObj) as { telemetry: { bucketTick: number } };
    badTelTick.telemetry.bucketTick = 20;
    expect(deserializeWorld(JSON.stringify(badTelTick)).ok).toBe(false);
  });

  it('validates slots, tunnelQueue, buffers, buildings cap, and 1:1 grid consistency in deserializeWorld', () => {
    const cfg = createDefaultConfig();
    cfg.free_build.value = 1;
    const world = createWorld(602);
    placeBuilding(world, 'belt_mk1', 5, 5, 1, cfg);
    placeBuilding(world, 'tunnel', 8, 8, 1, cfg);
    placeBuilding(world, 'smelter', 10, 10, 1, cfg, { recipeId: 'smelt_iron' });

    const obj = JSON.parse(serializeWorld(world)) as {
      grid: number[];
      buildings: Record<string, Record<string, unknown>>;
    };

    // Slots > 2 or invalid progress
    const badSlots = structuredClone(obj);
    badSlots.buildings['2'].slots = [
      { item: 'iron_ore', progress: 0.1 },
      { item: 'iron_ore', progress: 0.5 },
      { item: 'iron_ore', progress: 0.9 },
    ];
    expect(deserializeWorld(JSON.stringify(badSlots)).ok).toBe(false);

    const badSlotProg = structuredClone(obj);
    badSlotProg.buildings['2'].slots = [{ item: 'iron_ore', progress: 2.5 }];
    expect(deserializeWorld(JSON.stringify(badSlotProg)).ok).toBe(false);

    // TunnelQueue > 10 or invalid item
    const badQueue = structuredClone(obj);
    badQueue.buildings['3'].tunnelQueue = Array.from({ length: 11 }, () => ({
      item: 'iron_ore',
      progress: 0.2,
    }));
    expect(deserializeWorld(JSON.stringify(badQueue)).ok).toBe(false);

    // Invalid outputBuffer or negative inputBuffer or invalid inserterItem
    const badOut = structuredClone(obj);
    badOut.buildings['4'].outputBuffer = { item: 'fake_item', count: 1 };
    expect(deserializeWorld(JSON.stringify(badOut)).ok).toBe(false);

    const badIn = structuredClone(obj);
    badIn.buildings['4'].inputBuffer = { iron_ore: -3 };
    expect(deserializeWorld(JSON.stringify(badIn)).ok).toBe(false);

    const badIns = structuredClone(obj);
    badIns.buildings['2'].inserterItem = 'not_an_item';
    expect(deserializeWorld(JSON.stringify(badIns)).ok).toBe(false);

    // Recipe mismatch on building
    const badRecipe = structuredClone(obj);
    badRecipe.buildings['4'].recipeId = 'assemble_quantum';
    expect(deserializeWorld(JSON.stringify(badRecipe)).ok).toBe(false);

    // Grid <-> buildings mismatch: grid tile 0 where building 2 exists
    const badGridZero = structuredClone(obj);
    badGridZero.grid[5 * 64 + 5] = 0;
    expect(deserializeWorld(JSON.stringify(badGridZero)).ok).toBe(false);

    // Grid tile pointing to building at wrong coordinate
    const badGridWrong = structuredClone(obj);
    badGridWrong.grid[6 * 64 + 6] = 2;
    expect(deserializeWorld(JSON.stringify(badGridWrong)).ok).toBe(false);

    // Too many buildings (> 4096)
    const tooMany = structuredClone(obj);
    for (let k = 10; k <= 4107; k++) {
      tooMany.buildings[String(k)] = {
        id: k,
        type: 'belt_mk1',
        x: 0,
        y: 0,
        dir: 0,
        clock: 1,
      };
    }
    expect(deserializeWorld(JSON.stringify(tooMany)).ok).toBe(false);
  });

  it('rejects root arrays, bad UTF-8, duplicate coords, invalid recipes in decodeBlueprint & clamps clock on stamp', () => {
    // Root array
    expect(decodeBlueprint('AFBP1:' + btoa('[]')).ok).toBe(false);

    // Invalid UTF-8 byte sequence (0xFF 0xFE)
    expect(decodeBlueprint('AFBP1:' + btoa('\xff\xfe\x00')).ok).toBe(false);

    // Duplicate (dx, dy) entries
    const dupBp = {
      name: 'Dup',
      width: 2,
      height: 2,
      entries: [
        { dx: 0, dy: 0, type: 'belt_mk1', dir: 1 },
        { dx: 0, dy: 0, type: 'belt_mk2', dir: 1 },
      ],
    };
    expect(decodeBlueprint('AFBP1:' + btoa(JSON.stringify(dupBp))).ok).toBe(false);

    // Recipe on non-processor
    const nonProcRecipe = {
      name: 'NonProc',
      width: 1,
      height: 1,
      entries: [{ dx: 0, dy: 0, type: 'belt_mk1', dir: 1, recipeId: 'smelt_iron' }],
    };
    expect(decodeBlueprint('AFBP1:' + btoa(JSON.stringify(nonProcRecipe))).ok).toBe(false);

    // Mismatched processor recipe
    const mismatchRecipe = {
      name: 'Mismatch',
      width: 1,
      height: 1,
      entries: [{ dx: 0, dy: 0, type: 'smelter', dir: 1, recipeId: 'assemble_quantum' }],
    };
    expect(decodeBlueprint('AFBP1:' + btoa(JSON.stringify(mismatchRecipe))).ok).toBe(false);

    // Starter blueprints including 'constructor' all encode & decode cleanly
    for (const bp of STARTER_BLUEPRINTS) {
      const res = decodeBlueprint(encodeBlueprint(bp));
      expect(res.ok).toBe(true);
    }

    // Overclock clamping when Tier 4 is locked and free_build = 0
    const world = createWorld(603);
    const cfg = createDefaultConfig();
    const ocBp = {
      name: 'Overclocked',
      width: 1,
      height: 1,
      entries: [{ dx: 0, dy: 0, type: 'smelter' as const, dir: 1 as const, clock: 2.5 }],
    };
    const stamp = placeBlueprint(world, ocBp, 10, 10, cfg);
    expect(stamp.placed).toBe(1);
    const placedSmelter = Object.values(world.buildings).find((b) => b.x === 10 && b.y === 10)!;
    expect(placedSmelter.clock).toBe(1.0);
  });
});
