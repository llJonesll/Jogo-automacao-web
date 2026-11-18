import { BUILDINGS, HUB_ORIGIN, ITEMS, RECIPES, TECHS, WORLD_SIZE } from '../core/data';
import type { BuildingEntity, BuildingId, Direction, ItemId, WorldState } from '../core/types';
import { TELEMETRY_BUCKETS, createTelemetryState, isHubTile } from './world';

// shortcut: single localStorage autosave slot (~4 MB browser quota), migrate to IndexedDB multi-slot if saves exceed 2 MB
export const SAVE_KEY = 'aetherforge_save_v1';
export const SAVE_VERSION = 1;

function safeStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeWorld(world: WorldState): string {
  return JSON.stringify(world);
}

function isValidNumber(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

export function deserializeWorld(
  raw: string
): { ok: true; world: WorldState } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.length > 4_000_000) {
    return { ok: false, error: 'invalid_payload_size' };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (!data || typeof data !== 'object') return { ok: false, error: 'not_an_object' };
  const w = data as Record<string, unknown>;

  if (w.version !== SAVE_VERSION) return { ok: false, error: 'unsupported_version' };
  if (w.size !== WORLD_SIZE) return { ok: false, error: 'invalid_world_size' };
  if (!isValidNumber(w.seed, 1, 999_999_999)) return { ok: false, error: 'invalid_seed' };
  if (!isValidNumber(w.tick, 0, 1e12)) return { ok: false, error: 'invalid_tick' };
  if (!isValidNumber(w.dayTime, 0, 1)) return { ok: false, error: 'invalid_daytime' };

  const expectedLen = WORLD_SIZE * WORLD_SIZE;
  if (!Array.isArray(w.resources) || w.resources.length !== expectedLen) {
    return { ok: false, error: 'invalid_resources' };
  }
  if (!Array.isArray(w.grid) || w.grid.length !== expectedLen) {
    return { ok: false, error: 'invalid_grid' };
  }
  if (!w.buildings || typeof w.buildings !== 'object') {
    return { ok: false, error: 'invalid_buildings' };
  }

  // Validate building entities and ensure no out-of-bounds references
  const validatedBuildings: Record<number, BuildingEntity> = {};
  let hasHub = false;
  for (const [key, val] of Object.entries(w.buildings as Record<string, unknown>)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0 || !val || typeof val !== 'object') {
      return { ok: false, error: 'invalid_building_entry' };
    }
    const b = val as Record<string, unknown>;
    if (typeof b.type !== 'string' || !(b.type in BUILDINGS)) {
      return { ok: false, error: 'unknown_building_type' };
    }
    if (!isValidNumber(b.x, 0, WORLD_SIZE - 1) || !isValidNumber(b.y, 0, WORLD_SIZE - 1)) {
      return { ok: false, error: 'building_out_of_bounds' };
    }
    if (typeof b.dir !== 'number' || ![0, 1, 2, 3].includes(b.dir)) {
      return { ok: false, error: 'invalid_direction' };
    }
    if (!isValidNumber(b.clock, 0.5, 2.5)) {
      return { ok: false, error: 'invalid_clock' };
    }
    if (b.type === 'orbital_hub' && b.x === HUB_ORIGIN && b.y === HUB_ORIGIN) {
      hasHub = true;
    }

    const recipeId =
      typeof b.recipeId === 'string' &&
      (b.recipeId === '' || b.recipeId === 'auto' || b.recipeId in RECIPES)
        ? b.recipeId
        : '';

    validatedBuildings[id] = {
      ...(b as unknown as BuildingEntity),
      id,
      type: b.type as BuildingId,
      x: Math.floor(b.x),
      y: Math.floor(b.y),
      dir: b.dir as Direction,
      recipeId,
      slots: Array.isArray(b.slots) ? b.slots : [],
      tunnelQueue: Array.isArray(b.tunnelQueue) ? b.tunnelQueue : [],
      inputBuffer:
        b.inputBuffer && typeof b.inputBuffer === 'object'
          ? (b.inputBuffer as Partial<Record<ItemId, number>>)
          : {},
      inventory:
        b.inventory && typeof b.inventory === 'object'
          ? (b.inventory as Partial<Record<ItemId, number>>)
          : {},
    };
  }

  if (!hasHub) return { ok: false, error: 'missing_orbital_hub' };

  const stockpile: Partial<Record<ItemId, number>> = {};
  if (w.stockpile && typeof w.stockpile === 'object') {
    for (const [k, v] of Object.entries(w.stockpile as Record<string, unknown>)) {
      if (k in ITEMS && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        stockpile[k as ItemId] = Math.floor(v);
      }
    }
  }

  const validTechIds = new Set(TECHS.map((t) => t.id));
  const unlockedTechs = Array.isArray(w.unlockedTechs)
    ? w.unlockedTechs.filter((t): t is string => typeof t === 'string' && validTechIds.has(t))
    : [];

  const telemetry =
    w.telemetry &&
    typeof w.telemetry === 'object' &&
    Array.isArray((w.telemetry as { buckets?: unknown }).buckets) &&
    (w.telemetry as { buckets: unknown[] }).buckets.length === TELEMETRY_BUCKETS
      ? (w.telemetry as WorldState['telemetry'])
      : createTelemetryState();

  // Verify grid points only to existing buildings or hub
  const grid = (w.grid as number[]).map((gid, idx) => {
    const gx = idx % WORLD_SIZE;
    const gy = Math.floor(idx / WORLD_SIZE);
    if (isHubTile(gx, gy)) return 1;
    return typeof gid === 'number' && validatedBuildings[gid] ? gid : 0;
  });

  const restored: WorldState = {
    version: SAVE_VERSION,
    seed: Math.floor(w.seed),
    size: WORLD_SIZE,
    tick: Math.floor(w.tick),
    dayTime: w.dayTime,
    nextEntityId: isValidNumber(w.nextEntityId, 2, 1e9) ? Math.floor(w.nextEntityId) : 1000,
    resources: w.resources as WorldState['resources'],
    grid,
    buildings: validatedBuildings,
    stockpile,
    unlockedTechs,
    activeTechId:
      typeof w.activeTechId === 'string' && validTechIds.has(w.activeTechId)
        ? w.activeTechId
        : null,
    techProgress:
      w.techProgress && typeof w.techProgress === 'object'
        ? (w.techProgress as WorldState['techProgress'])
        : {},
    phaseIndex: isValidNumber(w.phaseIndex, 0, 10) ? Math.floor(w.phaseIndex) : 0,
    phaseDelivered:
      w.phaseDelivered && typeof w.phaseDelivered === 'object'
        ? (w.phaseDelivered as Partial<Record<ItemId, number>>)
        : {},
    orbitalLaunches: isValidNumber(w.orbitalLaunches, 0, 999)
      ? Math.floor(w.orbitalLaunches)
      : 0,
    victoryAchieved: Boolean(w.victoryAchieved),
    victoryDismissed: Boolean(w.victoryDismissed),
    power:
      w.power && typeof w.power === 'object'
        ? (w.power as WorldState['power'])
        : {
            generatedMw: 15,
            demandedMw: 0,
            storedMj: 0,
            capacityMj: 0,
            netMw: 15,
            satisfaction: 1,
            solarFactor: 0.5,
          },
    telemetry,
    manualMineCount: isValidNumber(w.manualMineCount, 0, 1e9)
      ? Math.floor(w.manualMineCount)
      : 0,
    rocketTimer: isValidNumber(w.rocketTimer, 0, 10) ? w.rocketTimer : 0,
  };

  return { ok: true, world: restored };
}

export function saveToStorage(world: WorldState): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serializeWorld(world));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(): WorldState | null {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  const res = deserializeWorld(raw);
  return res.ok ? res.world : null;
}

export function hasSavedGame(): boolean {
  const storage = safeStorage();
  return storage !== null && storage.getItem(SAVE_KEY) !== null;
}
