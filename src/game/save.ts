/**
 * Trust-boundary validated JSON save serialization and local browser persistence.
 * Architecture: `docs/architecture/architecture.md` (zero DOM imports; strict input validation).
 */
import {
  BUILDINGS,
  HUB_ORIGIN,
  ORBITAL_PHASES,
  RECIPES,
  TECHS,
  TICK_HZ,
  TILE_COUNT,
  VALID_BUILDING_IDS,
  VALID_ITEM_IDS,
  VALID_RECIPE_IDS,
  WORLD_SIZE,
  isProcessorType,
} from '../core/data';
import type {
  BeltSlot,
  BuildingEntity,
  BuildingId,
  BuildingStatus,
  Direction,
  ItemId,
  ItemStack,
  PowerStats,
  ResourceType,
  TelemetryBucket,
  TunnelItem,
  WorldState,
} from '../core/types';
import {
  CLOCK_MAX,
  CLOCK_MIN,
  TELEMETRY_BUCKETS,
  isHubTile,
  tileIndex,
} from './world';

// shortcut: single localStorage autosave slot (~4 MB browser quota), migrate to IndexedDB multi-slot if saves exceed 2 MB
export const SAVE_KEY = 'aetherforge_save_v1';
export const SAVE_VERSION = 1;
export const MAX_SAVE_PAYLOAD_BYTES = 4_000_000;

const VALID_RESOURCES = new Set<ResourceType>([
  'none',
  'iron_ore',
  'copper_ore',
  'coal',
  'stone',
  'quartz',
  'geothermal_vent',
]);

const VALID_STATUSES = new Set<BuildingStatus>([
  'working',
  'idle',
  'no_power',
  'input_starved',
  'output_full',
  'no_resource',
  'unpaired',
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function isSafeKey(k: string): boolean {
  return !FORBIDDEN_KEYS.has(k);
}

function isValidNumber(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

function isValidDirection(d: unknown): d is Direction {
  return d === 0 || d === 1 || d === 2 || d === 3;
}

function isValidItemId(k: unknown): k is ItemId {
  return typeof k === 'string' && isSafeKey(k) && VALID_ITEM_IDS.has(k);
}

function sanitizeItemMap(rawMap: unknown, maxVal = 1e9): Partial<Record<ItemId, number>> | null {
  if (rawMap === undefined) return {};
  if (!isPlainObject(rawMap)) return null;
  const out: Partial<Record<ItemId, number>> = {};
  for (const [k, v] of Object.entries(rawMap)) {
    if (!isValidItemId(k)) return null;
    if (!isValidNumber(v, 0, maxVal) || !Number.isInteger(v)) return null;
    if (v > 0) out[k] = v;
  }
  return out;
}

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

/**
 * Strictly validates an untrusted JSON save string and constructs a clean `WorldState`.
 * Rejects root arrays, prototype-pollution keys, invalid items/resources, out-of-range
 * telemetry/phase indices, and 1:1 `grid` <-> `buildings` mismatches.
 */
export function deserializeWorld(
  raw: string
): { ok: true; world: WorldState } | { ok: false; error: string } {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_PAYLOAD_BYTES) {
    return { ok: false, error: 'invalid_payload_size' };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (!isPlainObject(data)) return { ok: false, error: 'not_an_object' };
  const w = data;

  if (w.version !== SAVE_VERSION) return { ok: false, error: 'unsupported_version' };
  if (w.size !== WORLD_SIZE) return { ok: false, error: 'invalid_world_size' };
  if (!isValidNumber(w.seed, 1, 999_999_999)) return { ok: false, error: 'invalid_seed' };
  if (!isValidNumber(w.tick, 0, 1e12)) return { ok: false, error: 'invalid_tick' };
  if (!isValidNumber(w.dayTime, 0, 1)) return { ok: false, error: 'invalid_daytime' };

  if (!Array.isArray(w.resources) || w.resources.length !== TILE_COUNT) {
    return { ok: false, error: 'invalid_resources' };
  }
  const resources: ResourceType[] = new Array<ResourceType>(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    const r = w.resources[i];
    if (typeof r !== 'string' || !VALID_RESOURCES.has(r as ResourceType)) {
      return { ok: false, error: 'invalid_resources' };
    }
    resources[i] = r as ResourceType;
  }

  if (!Array.isArray(w.grid) || w.grid.length !== TILE_COUNT) {
    return { ok: false, error: 'invalid_grid' };
  }
  if (!isPlainObject(w.buildings)) {
    return { ok: false, error: 'invalid_buildings' };
  }

  const buildingEntries = Object.entries(w.buildings);
  // shortcut: capped at 4096 buildings matching 64x64 grid, raise cap if sparse chunk worlds are added
  if (buildingEntries.length > TILE_COUNT) {
    return { ok: false, error: 'too_many_buildings' };
  }

  const validatedBuildings: Record<number, BuildingEntity> = {};
  const tileBuildingId = new Int32Array(TILE_COUNT);
  let hasHub = false;
  let maxId = 1;

  for (const [key, val] of buildingEntries) {
    if (!isSafeKey(key)) return { ok: false, error: 'unsafe_key' };
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0 || id > 1e9 || !isPlainObject(val)) {
      return { ok: false, error: 'invalid_building_entry' };
    }
    const b = val;
    if (b.id !== undefined && b.id !== id) {
      return { ok: false, error: 'invalid_building_id' };
    }
    if (typeof b.type !== 'string' || !VALID_BUILDING_IDS.has(b.type)) {
      return { ok: false, error: 'unknown_building_type' };
    }
    const bType = b.type as BuildingId;
    if (
      !isValidNumber(b.x, 0, WORLD_SIZE - 1) ||
      !isValidNumber(b.y, 0, WORLD_SIZE - 1) ||
      !Number.isInteger(b.x) ||
      !Number.isInteger(b.y)
    ) {
      return { ok: false, error: 'building_out_of_bounds' };
    }
    if (!isValidDirection(b.dir)) {
      return { ok: false, error: 'invalid_direction' };
    }
    if (!isValidNumber(b.clock, CLOCK_MIN, CLOCK_MAX)) {
      return { ok: false, error: 'invalid_clock' };
    }

    if (bType === 'orbital_hub') {
      if (id !== 1 || b.x !== HUB_ORIGIN || b.y !== HUB_ORIGIN || hasHub) {
        return { ok: false, error: 'invalid_orbital_hub' };
      }
      hasHub = true;
    } else {
      if (id === 1 || isHubTile(b.x, b.y)) {
        return { ok: false, error: 'hub_overlap' };
      }
      const tIdx = tileIndex(b.x, b.y);
      if (tileBuildingId[tIdx] !== 0) {
        return { ok: false, error: 'overlapping_buildings' };
      }
      tileBuildingId[tIdx] = id;
    }

    // Validate slots
    const slots: BeltSlot[] = [];
    if (b.slots !== undefined) {
      if (!Array.isArray(b.slots) || b.slots.length > 2) {
        return { ok: false, error: 'invalid_slots' };
      }
      for (const rawSlot of b.slots) {
        if (!isPlainObject(rawSlot)) return { ok: false, error: 'invalid_slots' };
        if (!isValidItemId(rawSlot.item) || !isValidNumber(rawSlot.progress, 0, 1)) {
          return { ok: false, error: 'invalid_slots' };
        }
        if (rawSlot.sourceDir !== undefined && !isValidDirection(rawSlot.sourceDir)) {
          return { ok: false, error: 'invalid_slots' };
        }
        const cleanSlot: BeltSlot = { item: rawSlot.item, progress: rawSlot.progress };
        if (rawSlot.sourceDir !== undefined) cleanSlot.sourceDir = rawSlot.sourceDir;
        slots.push(cleanSlot);
      }
    }

    // Validate tunnelQueue
    const tunnelQueue: TunnelItem[] = [];
    if (b.tunnelQueue !== undefined) {
      if (!Array.isArray(b.tunnelQueue) || b.tunnelQueue.length > 10) {
        return { ok: false, error: 'invalid_tunnel_queue' };
      }
      for (const rawQ of b.tunnelQueue) {
        if (!isPlainObject(rawQ)) return { ok: false, error: 'invalid_tunnel_queue' };
        if (!isValidItemId(rawQ.item) || !isValidNumber(rawQ.progress, 0, 1)) {
          return { ok: false, error: 'invalid_tunnel_queue' };
        }
        tunnelQueue.push({ item: rawQ.item, progress: rawQ.progress });
      }
    }

    let tunnelMode: 'entrance' | 'exit' | undefined;
    if (b.tunnelMode !== undefined) {
      if (b.tunnelMode !== 'entrance' && b.tunnelMode !== 'exit') {
        return { ok: false, error: 'invalid_tunnel_mode' };
      }
      tunnelMode = b.tunnelMode;
    }

    let pairedId: number | undefined;
    if (b.pairedId !== undefined) {
      if (!isValidNumber(b.pairedId, 2, 1e9) || !Number.isInteger(b.pairedId) || b.pairedId === id) {
        return { ok: false, error: 'invalid_tunnel_pair' };
      }
      pairedId = b.pairedId;
    }

    const splitterIndex = b.splitterIndex === undefined ? 0 : b.splitterIndex;
    const mergerIndex = b.mergerIndex === undefined ? 0 : b.mergerIndex;
    if (
      !isValidNumber(splitterIndex, 0, 2) ||
      !Number.isInteger(splitterIndex) ||
      !isValidNumber(mergerIndex, 0, 2) ||
      !Number.isInteger(mergerIndex)
    ) {
      return { ok: false, error: 'invalid_router_index' };
    }

    let inserterItem: ItemId | null = null;
    if (b.inserterItem !== undefined && b.inserterItem !== null) {
      if (!isValidItemId(b.inserterItem)) return { ok: false, error: 'invalid_inserter_item' };
      inserterItem = b.inserterItem;
    }

    const inserterProgress = b.inserterProgress === undefined ? 0 : b.inserterProgress;
    if (!isValidNumber(inserterProgress, 0, 1)) {
      return { ok: false, error: 'invalid_inserter_progress' };
    }

    const inserterPhase = b.inserterPhase === undefined ? 'to_source' : b.inserterPhase;
    if (inserterPhase !== 'to_source' && inserterPhase !== 'to_target') {
      return { ok: false, error: 'invalid_inserter_phase' };
    }

    const rawRecipeId = b.recipeId === undefined ? '' : b.recipeId;
    if (typeof rawRecipeId !== 'string' || !isSafeKey(rawRecipeId)) {
      return { ok: false, error: 'invalid_recipe' };
    }
    if (rawRecipeId !== '') {
      if (!isProcessorType(bType)) return { ok: false, error: 'invalid_recipe' };
      if (
        rawRecipeId !== 'auto' &&
        (!VALID_RECIPE_IDS.has(rawRecipeId) || RECIPES[rawRecipeId].building !== bType)
      ) {
        return { ok: false, error: 'invalid_recipe' };
      }
    }

    let lockedRecipeId: string | null = null;
    if (b.lockedRecipeId !== undefined && b.lockedRecipeId !== null) {
      if (
        typeof b.lockedRecipeId !== 'string' ||
        !isSafeKey(b.lockedRecipeId) ||
        !isProcessorType(bType) ||
        !VALID_RECIPE_IDS.has(b.lockedRecipeId) ||
        RECIPES[b.lockedRecipeId].building !== bType
      ) {
        return { ok: false, error: 'invalid_locked_recipe' };
      }
      lockedRecipeId = b.lockedRecipeId;
    }

    const craftProgress = b.craftProgress === undefined ? 0 : b.craftProgress;
    if (!isValidNumber(craftProgress, 0, 10)) {
      return { ok: false, error: 'invalid_craft_progress' };
    }

    const inputBuffer = sanitizeItemMap(b.inputBuffer, 1e6);
    const inventory = sanitizeItemMap(b.inventory, 1e6);
    if (!inputBuffer || !inventory) {
      return { ok: false, error: 'invalid_buffer' };
    }

    let outputBuffer: ItemStack | null = null;
    if (b.outputBuffer !== undefined && b.outputBuffer !== null) {
      if (!isPlainObject(b.outputBuffer)) return { ok: false, error: 'invalid_output_buffer' };
      if (
        !isValidItemId(b.outputBuffer.item) ||
        !isValidNumber(b.outputBuffer.count, 1, 1e6) ||
        !Number.isInteger(b.outputBuffer.count)
      ) {
        return { ok: false, error: 'invalid_output_buffer' };
      }
      outputBuffer = { item: b.outputBuffer.item, count: b.outputBuffer.count };
    }

    const energyMj = b.energyMj === undefined ? 0 : b.energyMj;
    const fuelTimer = b.fuelTimer === undefined ? 0 : b.fuelTimer;
    const activePowerMw = b.activePowerMw === undefined ? 0 : b.activePowerMw;
    const geoBonus = b.geoBonus === undefined ? 0 : b.geoBonus;
    if (
      !isValidNumber(energyMj, 0, 10_000) ||
      !isValidNumber(fuelTimer, 0, 1_000) ||
      !isValidNumber(activePowerMw, 0, 1e6) ||
      !isValidNumber(geoBonus, 0, 10)
    ) {
      return { ok: false, error: 'invalid_building_metrics' };
    }

    const status = b.status === undefined ? 'idle' : b.status;
    if (typeof status !== 'string' || !VALID_STATUSES.has(status as BuildingStatus)) {
      return { ok: false, error: 'invalid_building_status' };
    }

    const entity: BuildingEntity = {
      id,
      type: bType,
      x: b.x,
      y: b.y,
      dir: b.dir,
      slots,
      tunnelQueue,
      splitterIndex,
      mergerIndex,
      inserterItem,
      inserterProgress,
      inserterPhase,
      recipeId: rawRecipeId,
      lockedRecipeId,
      craftProgress,
      clock: b.clock,
      inputBuffer,
      outputBuffer,
      inventory,
      energyMj,
      fuelTimer,
      status: status as BuildingStatus,
      activePowerMw,
      geoBonus,
    };
    if (tunnelMode !== undefined) entity.tunnelMode = tunnelMode;
    if (pairedId !== undefined) entity.pairedId = pairedId;

    validatedBuildings[id] = entity;
    if (id > maxId) maxId = id;
  }

  if (!hasHub) return { ok: false, error: 'missing_orbital_hub' };

  // Verify tunnel pair references point to valid tunnel entities
  for (const key in validatedBuildings) {
    const entity = validatedBuildings[key as unknown as number];
    if (entity.pairedId !== undefined) {
      const partner = validatedBuildings[entity.pairedId];
      if (!partner || partner.type !== 'tunnel' || entity.type !== 'tunnel') {
        return { ok: false, error: 'invalid_tunnel_pair' };
      }
    }
  }

  // Enforce 1:1 grid <-> buildings consistency
  const grid = new Array<number>(TILE_COUNT);
  for (let idx = 0; idx < TILE_COUNT; idx++) {
    const gid = w.grid[idx];
    if (typeof gid !== 'number' || !Number.isInteger(gid) || gid < 0) {
      return { ok: false, error: 'inconsistent_grid' };
    }
    const gx = idx % WORLD_SIZE;
    const gy = Math.floor(idx / WORLD_SIZE);
    if (isHubTile(gx, gy)) {
      if (gid !== 1) return { ok: false, error: 'inconsistent_grid' };
      grid[idx] = 1;
    } else if (gid === 0) {
      if (tileBuildingId[idx] !== 0) return { ok: false, error: 'inconsistent_grid' };
      grid[idx] = 0;
    } else {
      const b = validatedBuildings[gid];
      if (!b || gid === 1 || b.x !== gx || b.y !== gy) {
        return { ok: false, error: 'inconsistent_grid' };
      }
      grid[idx] = gid;
    }
  }

  const stockpile = sanitizeItemMap(w.stockpile);
  if (!stockpile) return { ok: false, error: 'invalid_stockpile' };

  const validTechIds = new Set(TECHS.map((t) => t.id));
  if (w.unlockedTechs !== undefined && !Array.isArray(w.unlockedTechs)) {
    return { ok: false, error: 'invalid_unlocked_techs' };
  }
  const unlockedSet = new Set<string>();
  const unlockedTechs: string[] = [];
  if (Array.isArray(w.unlockedTechs)) {
    for (const t of w.unlockedTechs) {
      if (typeof t !== 'string' || !isSafeKey(t) || !validTechIds.has(t)) {
        return { ok: false, error: 'invalid_unlocked_techs' };
      }
      if (!unlockedSet.has(t)) {
        unlockedSet.add(t);
        unlockedTechs.push(t);
      }
    }
  }

  let activeTechId: string | null = null;
  if (w.activeTechId !== undefined && w.activeTechId !== null) {
    if (typeof w.activeTechId !== 'string' || !isSafeKey(w.activeTechId) || !validTechIds.has(w.activeTechId)) {
      return { ok: false, error: 'invalid_active_tech' };
    }
    activeTechId = w.activeTechId;
  }

  const techProgress: Record<string, Partial<Record<ItemId, number>>> = {};
  if (w.techProgress !== undefined) {
    if (!isPlainObject(w.techProgress)) return { ok: false, error: 'invalid_tech_progress' };
    for (const [tKey, tVal] of Object.entries(w.techProgress)) {
      if (!isSafeKey(tKey) || !validTechIds.has(tKey)) {
        return { ok: false, error: 'invalid_tech_progress' };
      }
      const cleanMap = sanitizeItemMap(tVal, 1e6);
      if (!cleanMap) return { ok: false, error: 'invalid_tech_progress' };
      techProgress[tKey] = cleanMap;
    }
  }

  if (
    w.phaseIndex !== undefined &&
    (!isValidNumber(w.phaseIndex, 0, ORBITAL_PHASES.length) || !Number.isInteger(w.phaseIndex))
  ) {
    return { ok: false, error: 'invalid_phase_index' };
  }
  const phaseIndex = w.phaseIndex === undefined ? 0 : w.phaseIndex;

  const phaseDelivered = sanitizeItemMap(w.phaseDelivered, 1e6);
  if (!phaseDelivered) return { ok: false, error: 'invalid_phase_delivered' };

  if (
    w.orbitalLaunches !== undefined &&
    (!isValidNumber(w.orbitalLaunches, 0, 999) || !Number.isInteger(w.orbitalLaunches))
  ) {
    return { ok: false, error: 'invalid_orbital_launches' };
  }
  const orbitalLaunches = w.orbitalLaunches === undefined ? 0 : w.orbitalLaunches;

  const hubGenMw = BUILDINGS.orbital_hub.generates_mw;
  let power: PowerStats = {
    generatedMw: hubGenMw,
    demandedMw: 0,
    storedMj: 0,
    capacityMj: 0,
    netMw: hubGenMw,
    satisfaction: 1,
    solarFactor: 0.5,
  };
  if (w.power !== undefined) {
    if (!isPlainObject(w.power)) return { ok: false, error: 'invalid_power' };
    const p = w.power;
    if (
      !isValidNumber(p.generatedMw, 0, 1e7) ||
      !isValidNumber(p.demandedMw, 0, 1e7) ||
      !isValidNumber(p.storedMj, 0, 1e7) ||
      !isValidNumber(p.capacityMj, 0, 1e7) ||
      !isValidNumber(p.netMw, -1e7, 1e7) ||
      !isValidNumber(p.satisfaction, 0, 1) ||
      !isValidNumber(p.solarFactor, 0, 1)
    ) {
      return { ok: false, error: 'invalid_power' };
    }
    power = {
      generatedMw: p.generatedMw,
      demandedMw: p.demandedMw,
      storedMj: p.storedMj,
      capacityMj: p.capacityMj,
      netMw: p.netMw,
      satisfaction: p.satisfaction,
      solarFactor: p.solarFactor,
    };
  }

  if (!isPlainObject(w.telemetry)) return { ok: false, error: 'invalid_telemetry' };
  const rawTel = w.telemetry;
  if (
    !Array.isArray(rawTel.buckets) ||
    rawTel.buckets.length !== TELEMETRY_BUCKETS ||
    !isValidNumber(rawTel.bucketIndex, 0, TELEMETRY_BUCKETS - 1) ||
    !Number.isInteger(rawTel.bucketIndex) ||
    !isValidNumber(rawTel.bucketTick, 0, TICK_HZ - 1) ||
    !Number.isInteger(rawTel.bucketTick)
  ) {
    return { ok: false, error: 'invalid_telemetry' };
  }
  const cleanBuckets: TelemetryBucket[] = [];
  for (let i = 0; i < TELEMETRY_BUCKETS; i++) {
    const rb = rawTel.buckets[i];
    if (!isPlainObject(rb)) return { ok: false, error: 'invalid_telemetry' };
    const produced = sanitizeItemMap(rb.produced, 1e7);
    const consumed = sanitizeItemMap(rb.consumed, 1e7);
    if (!produced || !consumed) return { ok: false, error: 'invalid_telemetry' };
    cleanBuckets.push({ produced, consumed });
  }
  const totalsProduced = sanitizeItemMap(rawTel.totalsProduced, 1e10);
  const totalsConsumed = sanitizeItemMap(rawTel.totalsConsumed, 1e10);
  if (!totalsProduced || !totalsConsumed) return { ok: false, error: 'invalid_telemetry' };

  const minNextId = maxId + 1;
  const nextEntityId =
    w.nextEntityId !== undefined && isValidNumber(w.nextEntityId, minNextId, 1e9) && Number.isInteger(w.nextEntityId)
      ? w.nextEntityId
      : Math.max(1000, minNextId);

  const manualMineCount =
    w.manualMineCount !== undefined && isValidNumber(w.manualMineCount, 0, 1e9)
      ? Math.floor(w.manualMineCount)
      : 0;
  const rocketTimer =
    w.rocketTimer !== undefined && isValidNumber(w.rocketTimer, 0, 10) ? w.rocketTimer : 0;

  const restored: WorldState = {
    version: SAVE_VERSION,
    seed: Math.floor(w.seed),
    size: WORLD_SIZE,
    tick: Math.floor(w.tick),
    dayTime: w.dayTime,
    nextEntityId,
    resources,
    grid,
    buildings: validatedBuildings,
    stockpile,
    unlockedTechs,
    activeTechId,
    techProgress,
    phaseIndex,
    phaseDelivered,
    orbitalLaunches,
    victoryAchieved: Boolean(w.victoryAchieved),
    victoryDismissed: Boolean(w.victoryDismissed),
    power,
    telemetry: {
      buckets: cleanBuckets,
      bucketIndex: rawTel.bucketIndex,
      bucketTick: rawTel.bucketTick,
      totalsProduced,
      totalsConsumed,
    },
    manualMineCount,
    rocketTimer,
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
