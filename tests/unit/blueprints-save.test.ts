import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/core/data';
import {
  STARTER_BLUEPRINTS,
  createBlueprint,
  decodeBlueprint,
  encodeBlueprint,
  placeBlueprint,
  rotateBlueprint,
} from '../../src/game/blueprints';
import { createDemoWorld } from '../../src/game/demo';
import { deserializeWorld, serializeWorld } from '../../src/game/save';
import { createWorld, getBuildingAt, placeBuilding } from '../../src/game/world';

describe('blueprints, save persistence, and demo showcase', () => {
  it('rotates blueprints 90 degrees CW across 4 steps back to original geometry and pairs tunnels', () => {
    const config = createDefaultConfig();
    config.free_build.value = 1;
    const world = createWorld(400);

    placeBuilding(world, 'tunnel', 10, 10, 1, config);
    placeBuilding(world, 'belt_mk2', 11, 10, 1, config);
    placeBuilding(world, 'tunnel', 12, 10, 1, config);

    const bp0 = createBlueprint(world, 10, 10, 12, 10, 'Tunnel Run');
    expect(bp0.width).toBe(3);
    expect(bp0.height).toBe(1);

    const bp1 = rotateBlueprint(bp0, 1);
    expect(bp1.width).toBe(1);
    expect(bp1.height).toBe(3);
    expect(bp1.entries.every((e) => e.dir === 2)).toBe(true);

    const bp4 = rotateBlueprint(bp0, 4);
    expect(bp4.entries).toEqual(bp0.entries);

    // Stamp rotated blueprint onto clean tiles and confirm tunnel pairing works
    const res = placeBlueprint(world, bp1, 15, 15, config);
    expect(res.placed).toBe(3);
    const entrance = getBuildingAt(world, 15, 15)!;
    const exit = getBuildingAt(world, 15, 17)!;
    expect(entrance.tunnelMode).toBe('entrance');
    expect(exit.tunnelMode).toBe('exit');
    expect(entrance.pairedId).toBe(exit.id);
  });

  it('encodes/decodes valid Base64 blueprints and rejects corrupt/malformed payloads', () => {
    const encoded = encodeBlueprint(STARTER_BLUEPRINTS[0]);
    const decoded = decodeBlueprint(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.blueprint.entries.length).toBe(STARTER_BLUEPRINTS[0].entries.length);
    }

    expect(decodeBlueprint('bad-prefix').ok).toBe(false);
    expect(decodeBlueprint('AFBP1:not-base64!!!').ok).toBe(false);
    const tampered =
      'AFBP1:' +
      btoa(
        JSON.stringify({
          name: 'Evil',
          width: 4,
          height: 4,
          entries: [{ dx: 99, dy: 0, type: 'belt_mk1', dir: 0 }],
        })
      );
    expect(decodeBlueprint(tampered).ok).toBe(false);
  });

  it('round-trips world state cleanly through save serialization and rejects corrupt saves', () => {
    const world = createDemoWorld();
    const raw = serializeWorld(world);
    const parsed = deserializeWorld(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.world.tick).toBe(world.tick);
      expect(Object.keys(parsed.world.buildings).length).toBe(Object.keys(world.buildings).length);
      expect(parsed.world.power.generatedMw).toBeGreaterThan(50);
    }

    expect(deserializeWorld('not json').ok).toBe(false);
    expect(deserializeWorld(JSON.stringify({ version: 99 })).ok).toBe(false);
    expect(
      deserializeWorld(JSON.stringify({ ...world, buildings: { 999: { type: 'fake', x: 1, y: 1, dir: 0, clock: 1 } } }))
        .ok
    ).toBe(false);
  });

  it('builds a healthy demo showcase world with zero stalled power and active logistics', () => {
    const world = createDemoWorld();
    expect(world.power.satisfaction).toBe(1.0);
    expect(world.power.generatedMw).toBeGreaterThan(80);
    expect((world.telemetry.totalsProduced.circuit ?? 0) + (world.telemetry.totalsProduced.iron_plate ?? 0)).toBeGreaterThan(0);
  });
});
