/**
 * Blueprint capture, 90-degree rotation, stamping, and Base64 (`AFBP1:`) trust-boundary codec.
 * Architecture: `docs/architecture/architecture.md` (zero DOM imports; strict input validation).
 */
import {
  RECIPES,
  VALID_BUILDING_IDS,
  VALID_RECIPE_IDS,
  isProcessorType,
  rotateDirCW,
} from '../core/data';
import type {
  BlueprintData,
  BlueprintEntry,
  BuildingId,
  Direction,
  GameConfig,
  WorldState,
} from '../core/types';
import {
  CLOCK_MAX,
  CLOCK_MIN,
  getBuildingAt,
  inBounds,
  isFeatureUnlocked,
  isHubTile,
  placeBuilding,
} from './world';

const BP_PREFIX = 'AFBP1:';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function isSafeKey(k: string): boolean {
  return !FORBIDDEN_KEYS.has(k);
}

export function createBlueprint(
  world: WorldState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  name = 'Projeto'
): BlueprintData {
  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(world.size - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(world.size - 1, Math.max(y1, y2));

  const entries: BlueprintEntry[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (isHubTile(x, y)) continue;
      const b = getBuildingAt(world, x, y);
      if (!b) continue;
      const entry: BlueprintEntry = {
        dx: x - minX,
        dy: y - minY,
        type: b.type,
        dir: b.dir,
      };
      if (b.recipeId && b.recipeId !== 'auto') entry.recipeId = b.recipeId;
      if (b.clock !== 1.0) entry.clock = b.clock;
      entries.push(entry);
    }
  }

  return {
    name: name.slice(0, 48) || 'Projeto',
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    entries,
  };
}

export function rotateBlueprint(bp: BlueprintData, steps = 1): BlueprintData {
  const norm = ((steps % 4) + 4) % 4;
  let current: BlueprintData = {
    name: bp.name,
    width: bp.width,
    height: bp.height,
    entries: bp.entries.map((e) => ({ ...e })),
  };

  for (let s = 0; s < norm; s++) {
    const oldH = current.height;
    const rotated: BlueprintEntry[] = current.entries.map((e) => ({
      ...e,
      dx: oldH - 1 - e.dy,
      dy: e.dx,
      dir: rotateDirCW(e.dir, 1),
    }));
    current = {
      name: current.name,
      width: current.height,
      height: current.width,
      entries: rotated,
    };
  }

  return current;
}

export function placeBlueprint(
  world: WorldState,
  bp: BlueprintData,
  originX: number,
  originY: number,
  config: GameConfig
): { placed: number; skipped: number } {
  // Place non-tunnels first, and place tunnels sorted along their direction so exits always follow entrances
  const ordered = [...bp.entries].sort((a, b) => {
    if (a.type === 'tunnel' && b.type !== 'tunnel') return 1;
    if (a.type !== 'tunnel' && b.type === 'tunnel') return -1;
    const scoreA = a.dir === 1 ? a.dx : a.dir === 3 ? -a.dx : a.dir === 2 ? a.dy : -a.dy;
    const scoreB = b.dir === 1 ? b.dx : b.dir === 3 ? -b.dx : b.dir === 2 ? b.dy : -b.dy;
    return scoreA - scoreB;
  });

  const canClock = config.free_build.value >= 1 || isFeatureUnlocked(world, 'overclock');
  let placed = 0;
  let skipped = 0;

  for (const e of ordered) {
    const tx = originX + e.dx;
    const ty = originY + e.dy;
    if (!inBounds(tx, ty)) {
      skipped++;
      continue;
    }
    const safeClock =
      e.clock !== undefined ? (canClock ? Math.max(CLOCK_MIN, Math.min(CLOCK_MAX, e.clock)) : 1.0) : undefined;
    const res = placeBuilding(world, e.type, tx, ty, e.dir, config, {
      recipeId: e.recipeId,
      clock: safeClock,
    });
    if (res.ok) placed++;
    else skipped++;
  }

  return { placed, skipped };
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeBlueprint(bp: BlueprintData): string {
  return BP_PREFIX + utf8ToBase64(JSON.stringify(bp));
}

/**
 * Strictly validates an untrusted `AFBP1:` Base64 blueprint string.
 * Rejects root arrays, malformed UTF-8, duplicate `(dx, dy)` coords, and building-recipe mismatches.
 */
export function decodeBlueprint(
  raw: string
): { ok: true; blueprint: BlueprintData } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'invalid_type' };
  const trimmed = raw.trim();
  if (!trimmed.startsWith(BP_PREFIX) || trimmed.length > 64000) {
    return { ok: false, error: 'invalid_prefix_or_size' };
  }

  let parsed: unknown;
  try {
    const json = base64ToUtf8(trimmed.slice(BP_PREFIX.length));
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'malformed_payload' };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'invalid_object' };
  }

  const obj = parsed;
  const width = obj.width;
  const height = obj.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    width > 64 ||
    height < 1 ||
    height > 64 ||
    !Array.isArray(obj.entries)
  ) {
    return { ok: false, error: 'invalid_dimensions' };
  }

  if (obj.entries.length > width * height) {
    return { ok: false, error: 'too_many_entries' };
  }

  const entries: BlueprintEntry[] = [];
  const seenCoords = new Set<number>();

  for (const item of obj.entries) {
    if (!isPlainObject(item)) return { ok: false, error: 'invalid_entry' };
    const e = item;
    if (
      typeof e.dx !== 'number' ||
      typeof e.dy !== 'number' ||
      !Number.isInteger(e.dx) ||
      !Number.isInteger(e.dy) ||
      e.dx < 0 ||
      e.dx >= width ||
      e.dy < 0 ||
      e.dy >= height
    ) {
      return { ok: false, error: 'entry_out_of_bounds' };
    }

    const coordKey = e.dy * width + e.dx;
    if (seenCoords.has(coordKey)) {
      return { ok: false, error: 'duplicate_entry' };
    }
    seenCoords.add(coordKey);

    if (
      typeof e.type !== 'string' ||
      !VALID_BUILDING_IDS.has(e.type) ||
      e.type === 'orbital_hub'
    ) {
      return { ok: false, error: 'unknown_building' };
    }
    if (typeof e.dir !== 'number' || ![0, 1, 2, 3].includes(e.dir)) {
      return { ok: false, error: 'invalid_direction' };
    }

    const bType = e.type as BuildingId;
    const entry: BlueprintEntry = {
      dx: e.dx,
      dy: e.dy,
      type: bType,
      dir: e.dir as Direction,
    };

    if (e.recipeId !== undefined) {
      if (!isProcessorType(bType)) {
        return { ok: false, error: 'recipe_on_non_processor' };
      }
      if (typeof e.recipeId !== 'string' || !isSafeKey(e.recipeId)) {
        return { ok: false, error: 'unknown_recipe' };
      }
      if (e.recipeId !== 'auto') {
        if (!VALID_RECIPE_IDS.has(e.recipeId) || RECIPES[e.recipeId].building !== bType) {
          return { ok: false, error: 'recipe_building_mismatch' };
        }
      }
      entry.recipeId = e.recipeId;
    }

    if (e.clock !== undefined) {
      if (typeof e.clock !== 'number' || !Number.isFinite(e.clock)) {
        return { ok: false, error: 'invalid_clock' };
      }
      entry.clock = Math.max(CLOCK_MIN, Math.min(CLOCK_MAX, e.clock));
    }

    entries.push(entry);
  }

  return {
    ok: true,
    blueprint: {
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 48) : 'Importado',
      width,
      height,
      entries,
    },
  };
}

export const STARTER_BLUEPRINTS: BlueprintData[] = [
  {
    name: 'Linha Fundição + Prensa 2x',
    width: 4,
    height: 3,
    entries: [
      { dx: 0, dy: 0, type: 'smelter', dir: 1, recipeId: 'smelt_iron' },
      { dx: 1, dy: 0, type: 'constructor', dir: 1, recipeId: 'press_plate' },
      { dx: 2, dy: 0, type: 'belt_mk1', dir: 1 },
      { dx: 3, dy: 0, type: 'belt_mk1', dir: 2 },
      { dx: 0, dy: 2, type: 'smelter', dir: 1, recipeId: 'smelt_iron' },
      { dx: 1, dy: 2, type: 'constructor', dir: 1, recipeId: 'press_plate' },
      { dx: 2, dy: 2, type: 'belt_mk1', dir: 1 },
      { dx: 3, dy: 2, type: 'belt_mk1', dir: 0 },
      { dx: 3, dy: 1, type: 'merger', dir: 1 },
    ],
  },
  {
    name: 'Manifold de Circuitos',
    width: 5,
    height: 3,
    entries: [
      { dx: 0, dy: 0, type: 'smelter', dir: 1, recipeId: 'smelt_iron' },
      { dx: 1, dy: 0, type: 'constructor', dir: 1, recipeId: 'press_plate' },
      { dx: 2, dy: 0, type: 'belt_mk2', dir: 1 },
      { dx: 3, dy: 0, type: 'belt_mk2', dir: 2 },
      { dx: 0, dy: 2, type: 'smelter', dir: 1, recipeId: 'smelt_copper' },
      { dx: 1, dy: 2, type: 'constructor', dir: 1, recipeId: 'draw_wire' },
      { dx: 2, dy: 2, type: 'belt_mk2', dir: 1 },
      { dx: 3, dy: 2, type: 'belt_mk2', dir: 0 },
      { dx: 3, dy: 1, type: 'assembler', dir: 1, recipeId: 'assemble_circuit' },
      { dx: 4, dy: 1, type: 'belt_mk2', dir: 1 },
    ],
  },
  {
    name: 'Bloco Solar + Acumulador',
    width: 3,
    height: 2,
    entries: [
      { dx: 0, dy: 0, type: 'solar_panel', dir: 0 },
      { dx: 1, dy: 0, type: 'solar_panel', dir: 0 },
      { dx: 2, dy: 0, type: 'solar_panel', dir: 0 },
      { dx: 0, dy: 1, type: 'solar_panel', dir: 0 },
      { dx: 1, dy: 1, type: 'accumulator', dir: 0 },
      { dx: 2, dy: 1, type: 'solar_panel', dir: 0 },
    ],
  },
];
