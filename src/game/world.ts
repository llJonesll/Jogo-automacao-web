/**
 * World generation, spatial queries, building placement/dismantling, and tunnel pairing.
 * Game rules: `design/gdd/factory-systems.md`.
 * Architecture: `docs/architecture/architecture.md` (zero DOM dependencies).
 * Threading contract: single-threaded deterministic execution; cached entity lists use a
 * WeakMap keyed by `WorldState` and assume mutations happen via world helpers.
 */
import {
  BUILDINGS,
  DEFAULT_CONFIG,
  DIR_DX,
  DIR_DY,
  HUB_ORIGIN,
  HUB_SIZE,
  RECIPES,
  TECH_BY_ID,
  TECHS,
  TILE_COUNT,
  VALID_ITEM_IDS,
  WORLD_SIZE,
  isProcessorType,
} from '../core/data';
import { createRng } from '../core/rng';
import type {
  BuildingEntity,
  BuildingId,
  Direction,
  GameConfig,
  ItemId,
  ItemStack,
  RecipeDef,
  ResourceType,
  TelemetryState,
  WorldState,
} from '../core/types';

export const TELEMETRY_BUCKETS = 60;
export const GEOTHERMAL_SPEED_BONUS = 0.35;
export const CLOCK_MIN = 0.5;
export const CLOCK_MAX = 2.5;

export const STARTER_STOCKPILE: Readonly<Partial<Record<ItemId, number>>> = {
  iron_plate: 60,
  copper_wire: 30,
  iron_gear: 25,
  concrete: 20,
  coal: 10,
};

// Weighted outer vein table (~41% iron_ore, ~18% copper_ore, ~18% coal, ~14% quartz, ~9% stone)
// Ordered with iron_ore last so early stone/quartz patches never overwrite iron deposits.
const OUTER_VEIN_WEIGHTS: readonly ResourceType[] = [
  'stone',
  'stone',
  'quartz',
  'quartz',
  'quartz',
  'coal',
  'coal',
  'coal',
  'coal',
  'copper_ore',
  'copper_ore',
  'copper_ore',
  'copper_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
  'iron_ore',
];

export interface WorldBuildingLists {
  readonly all: readonly BuildingEntity[];
  readonly inserters: readonly BuildingEntity[];
  readonly powerNodes: readonly BuildingEntity[];
  readonly accumulators: readonly BuildingEntity[];
}

interface WorldBuildingCache {
  all: BuildingEntity[];
  inserters: BuildingEntity[];
  powerNodes: BuildingEntity[];
  accumulators: BuildingEntity[];
  dirty: boolean;
  lastNextId: number;
  lastBuildingsRef: Record<number, BuildingEntity>;
}

const worldBuildingCaches = new WeakMap<WorldState, WorldBuildingCache>();

/**
 * Marks the cached building lists for `world` dirty so the next simulation/power step rebuilds them.
 */
export function markWorldBuildingsDirty(world: WorldState): void {
  const cache = worldBuildingCaches.get(world);
  if (cache) cache.dirty = true;
}

function rebuildBuildingCache(world: WorldState, cache: WorldBuildingCache): void {
  cache.all.length = 0;
  cache.inserters.length = 0;
  cache.powerNodes.length = 0;
  cache.accumulators.length = 0;

  for (const key in world.buildings) {
    const b = world.buildings[key as unknown as number];
    if (b) cache.all.push(b);
  }

  cache.all.sort((a, b) => a.id - b.id);

  for (let i = 0; i < cache.all.length; i++) {
    const b = cache.all[i];
    if (b.type === 'inserter') {
      cache.inserters.push(b);
    }
    const def = BUILDINGS[b.type];
    if (
      b.type === 'orbital_hub' ||
      b.type === 'solar_panel' ||
      b.type === 'geothermal_plant' ||
      b.type === 'coal_generator' ||
      b.type === 'accumulator' ||
      (def && def.power_mw > 0)
    ) {
      cache.powerNodes.push(b);
    }
    if (b.type === 'accumulator') {
      cache.accumulators.push(b);
    }
  }

  cache.dirty = false;
  cache.lastNextId = world.nextEntityId;
  cache.lastBuildingsRef = world.buildings;
}

/**
 * Returns deterministic `id`-sorted cached building arrays for zero-allocation hot-path scans.
 */
export function getWorldBuildingLists(world: WorldState): WorldBuildingLists {
  let cache = worldBuildingCaches.get(world);
  if (!cache) {
    cache = {
      all: [],
      inserters: [],
      powerNodes: [],
      accumulators: [],
      dirty: true,
      lastNextId: -1,
      lastBuildingsRef: world.buildings,
    };
    worldBuildingCaches.set(world, cache);
  }
  if (
    cache.dirty ||
    cache.lastNextId !== world.nextEntityId ||
    cache.lastBuildingsRef !== world.buildings
  ) {
    rebuildBuildingCache(world, cache);
  }
  return cache;
}

export function createTelemetryState(): TelemetryState {
  return {
    buckets: Array.from({ length: TELEMETRY_BUCKETS }, () => ({
      produced: {},
      consumed: {},
    })),
    bucketIndex: 0,
    bucketTick: 0,
    totalsProduced: {},
    totalsConsumed: {},
  };
}

export function createBuildingEntity(
  id: number,
  type: BuildingId,
  x: number,
  y: number,
  dir: Direction
): BuildingEntity {
  return {
    id,
    type,
    x,
    y,
    dir,
    slots: [],
    tunnelQueue: [],
    splitterIndex: 0,
    mergerIndex: 0,
    inserterItem: null,
    inserterProgress: 0,
    inserterPhase: 'to_source',
    recipeId: isProcessorType(type) ? 'auto' : '',
    lockedRecipeId: null,
    craftProgress: 0,
    clock: 1.0,
    inputBuffer: {},
    outputBuffer: null,
    inventory: {},
    energyMj: 0,
    fuelTimer: 0,
    status: 'idle',
    activePowerMw: 0,
    geoBonus: 0,
  };
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;
}

export function tileIndex(x: number, y: number): number {
  return y * WORLD_SIZE + x;
}

export function isHubTile(x: number, y: number): boolean {
  return (
    x >= HUB_ORIGIN &&
    x < HUB_ORIGIN + HUB_SIZE &&
    y >= HUB_ORIGIN &&
    y < HUB_ORIGIN + HUB_SIZE
  );
}

export function getBuildingAt(world: WorldState, x: number, y: number): BuildingEntity | null {
  if (!inBounds(x, y)) return null;
  const id = world.grid[tileIndex(x, y)];
  return id > 0 ? world.buildings[id] ?? null : null;
}

export function hasAdjacentGeothermalVent(world: WorldState, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && world.resources[tileIndex(nx, ny)] === 'geothermal_vent') {
        return true;
      }
    }
  }
  return false;
}

function paintPatch(
  resources: ResourceType[],
  cx: number,
  cy: number,
  radius: number,
  type: ResourceType,
  rng: () => number
): void {
  const r2 = radius * radius;
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(x, y)) continue;
      // Keep central 9x9 plaza around Orbital Hub clean for starting belts
      if (Math.abs(x - (HUB_ORIGIN + 1)) <= 4 && Math.abs(y - (HUB_ORIGIN + 1)) <= 4) {
        continue;
      }
      const idx = tileIndex(x, y);
      // Protect geothermal vents from being overwritten by mineral patches
      if (resources[idx] === 'geothermal_vent') continue;
      const distSq = dx * dx + dy * dy;
      if (distSq <= r2 * (0.7 + rng() * 0.45)) {
        resources[idx] = type;
      }
    }
  }
}

/**
 * Generates a fresh deterministic 64x64 exoplanet world from `seed`.
 * @example const world = createWorld(42026);
 */
export function createWorld(seed = 42026): WorldState {
  const rng = createRng(seed);
  const resources: ResourceType[] = new Array<ResourceType>(TILE_COUNT).fill('none');
  const grid = new Array<number>(TILE_COUNT).fill(0);

  const hubCenter = HUB_ORIGIN + 1;

  // Guaranteed starter veins around Hub at friendly building distance
  const starterAngles: Array<{ type: ResourceType; angle: number; dist: number; r: number }> = [
    { type: 'iron_ore', angle: Math.PI * 0.95, dist: 10, r: 3 },
    { type: 'copper_ore', angle: Math.PI * 0.12, dist: 10, r: 3 },
    { type: 'coal', angle: Math.PI * 1.48, dist: 11, r: 2.6 },
    { type: 'stone', angle: Math.PI * 0.55, dist: 10, r: 2.5 },
  ];

  for (const s of starterAngles) {
    const jitter = (rng() - 0.5) * 0.35;
    const cx = Math.round(hubCenter + Math.cos(s.angle + jitter) * s.dist);
    const cy = Math.round(hubCenter + Math.sin(s.angle + jitter) * s.dist);
    paintPatch(resources, cx, cy, Math.ceil(s.r), s.type, rng);
  }

  // Mid-ring quartz and starter geothermal vents
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng() * 0.6;
    const qx = Math.round(hubCenter + Math.cos(a) * (17 + rng() * 4));
    const qy = Math.round(hubCenter + Math.sin(a) * (17 + rng() * 4));
    paintPatch(resources, qx, qy, 2, 'quartz', rng);
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4 + rng() * 0.4;
    const vx = Math.round(hubCenter + Math.cos(a) * (14 + rng() * 6));
    const vy = Math.round(hubCenter + Math.sin(a) * (14 + rng() * 6));
    if (inBounds(vx, vy) && Math.abs(vx - hubCenter) > 5) {
      resources[tileIndex(vx, vy)] = 'geothermal_vent';
    }
  }

  // Outer resource veins weighted toward iron_ore demand
  for (let i = 0; i < OUTER_VEIN_WEIGHTS.length; i++) {
    const type = OUTER_VEIN_WEIGHTS[i];
    const cx = Math.floor(4 + rng() * (WORLD_SIZE - 8));
    const cy = Math.floor(4 + rng() * (WORLD_SIZE - 8));
    if (Math.hypot(cx - hubCenter, cy - hubCenter) < 13) continue;
    paintPatch(resources, cx, cy, 2 + Math.floor(rng() * 2), type, rng);
  }

  for (let i = 0; i < 6; i++) {
    const vx = Math.floor(3 + rng() * (WORLD_SIZE - 6));
    const vy = Math.floor(3 + rng() * (WORLD_SIZE - 6));
    if (Math.hypot(vx - hubCenter, vy - hubCenter) > 15) {
      resources[tileIndex(vx, vy)] = 'geothermal_vent';
    }
  }

  const hubGenMw = BUILDINGS.orbital_hub.generates_mw;
  const world: WorldState = {
    version: 1,
    seed,
    size: WORLD_SIZE,
    tick: 0,
    dayTime: 0.15,
    nextEntityId: 2,
    resources,
    grid,
    buildings: {},
    stockpile: { ...STARTER_STOCKPILE },
    unlockedTechs: [],
    activeTechId: TECHS[0].id,
    techProgress: {},
    phaseIndex: 0,
    phaseDelivered: {},
    orbitalLaunches: 0,
    victoryAchieved: false,
    victoryDismissed: false,
    power: {
      generatedMw: hubGenMw,
      demandedMw: 0,
      storedMj: 0,
      capacityMj: 0,
      netMw: hubGenMw,
      satisfaction: 1,
      solarFactor: 0.62,
    },
    telemetry: createTelemetryState(),
    manualMineCount: 0,
    rocketTimer: 0,
  };

  // Place indestructible 3x3 Orbital Tether Hub at center
  const hub = createBuildingEntity(1, 'orbital_hub', HUB_ORIGIN, HUB_ORIGIN, 0);
  world.buildings[1] = hub;
  for (let dy = 0; dy < HUB_SIZE; dy++) {
    for (let dx = 0; dx < HUB_SIZE; dx++) {
      world.grid[tileIndex(HUB_ORIGIN + dx, HUB_ORIGIN + dy)] = 1;
    }
  }

  return world;
}

export function isBuildingUnlocked(world: WorldState, type: BuildingId): boolean {
  const def = BUILDINGS[type];
  if (!def || def.tier === 0) return true;
  for (let i = 0; i < world.unlockedTechs.length; i++) {
    const tech = TECH_BY_ID[world.unlockedTechs[i]];
    if (tech && tech.unlocks_buildings.includes(type)) return true;
  }
  return false;
}

export function isFeatureUnlocked(world: WorldState, feature: string): boolean {
  for (let i = 0; i < world.unlockedTechs.length; i++) {
    const tech = TECH_BY_ID[world.unlockedTechs[i]];
    if (tech && tech.unlocks_features.includes(feature)) return true;
  }
  return false;
}

/**
 * Checks whether a recipe is permitted by unlocked technologies or sandbox `free_build`.
 */
export function isRecipeUnlocked(
  world: WorldState,
  recipe: RecipeDef,
  config: GameConfig = DEFAULT_CONFIG
): boolean {
  if (config.free_build.value >= 1) return true;
  if (!recipe.required_tech) return true;
  return world.unlockedTechs.includes(recipe.required_tech);
}

export function hasResources(world: WorldState, cost: ItemStack[]): boolean {
  for (let i = 0; i < cost.length; i++) {
    const stack = cost[i];
    if ((world.stockpile[stack.item] ?? 0) < stack.count) return false;
  }
  return true;
}

export function consumeResources(world: WorldState, cost: ItemStack[]): void {
  for (let i = 0; i < cost.length; i++) {
    const stack = cost[i];
    world.stockpile[stack.item] = Math.max(0, (world.stockpile[stack.item] ?? 0) - stack.count);
  }
}

export function addResources(world: WorldState, cost: ItemStack[]): void {
  for (let i = 0; i < cost.length; i++) {
    const stack = cost[i];
    world.stockpile[stack.item] = (world.stockpile[stack.item] ?? 0) + stack.count;
  }
}

export function canPlaceBuilding(
  world: WorldState,
  type: BuildingId,
  x: number,
  y: number,
  config: GameConfig = DEFAULT_CONFIG
): { ok: boolean; reason?: string } {
  if (type === 'orbital_hub') return { ok: false, reason: 'hub_unique' };
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: 'unknown_building' };
  if (!inBounds(x, y)) return { ok: false, reason: 'out_of_bounds' };
  if (world.grid[tileIndex(x, y)] !== 0) return { ok: false, reason: 'occupied' };

  const freeBuild = config.free_build.value >= 1;
  if (!freeBuild && !isBuildingUnlocked(world, type)) {
    return { ok: false, reason: 'locked' };
  }

  const res = world.resources[tileIndex(x, y)];
  if (def.requires_resource === 'ore') {
    if (res === 'none' || res === 'geothermal_vent') {
      return { ok: false, reason: 'needs_ore' };
    }
  } else if (def.requires_resource === 'geothermal_vent') {
    if (res !== 'geothermal_vent') {
      return { ok: false, reason: 'needs_vent' };
    }
  }

  if (!freeBuild && !hasResources(world, def.cost)) {
    return { ok: false, reason: 'no_materials' };
  }

  return { ok: true };
}

function pairUndergroundTunnel(world: WorldState, tunnel: BuildingEntity): void {
  const maxSpan = BUILDINGS.tunnel.max_span ?? 5;
  const backDir = ((tunnel.dir + 2) & 3) as Direction;
  const bdx = DIR_DX[backDir];
  const bdy = DIR_DY[backDir];

  // Search backward for an unpaired upstream entrance (tunnel becomes exit)
  for (let dist = 1; dist <= maxSpan; dist++) {
    const tx = tunnel.x + bdx * dist;
    const ty = tunnel.y + bdy * dist;
    if (!inBounds(tx, ty)) break;
    const other = getBuildingAt(world, tx, ty);
    if (
      other &&
      other.type === 'tunnel' &&
      other.dir === tunnel.dir &&
      other.tunnelMode === 'entrance' &&
      !other.pairedId
    ) {
      tunnel.tunnelMode = 'exit';
      tunnel.pairedId = other.id;
      other.pairedId = tunnel.id;
      return;
    }
  }

  // Search forward along tunnel.dir for an unpaired downstream exit placed earlier
  const fdx = DIR_DX[tunnel.dir];
  const fdy = DIR_DY[tunnel.dir];
  for (let dist = 1; dist <= maxSpan; dist++) {
    const tx = tunnel.x + fdx * dist;
    const ty = tunnel.y + fdy * dist;
    if (!inBounds(tx, ty)) break;
    const other = getBuildingAt(world, tx, ty);
    if (other && other.type === 'tunnel' && other.dir === tunnel.dir && !other.pairedId) {
      tunnel.tunnelMode = 'entrance';
      tunnel.pairedId = other.id;
      other.tunnelMode = 'exit';
      other.pairedId = tunnel.id;
      // Preserve any buffered items if the downstream tile previously defaulted to entrance
      if (other.tunnelQueue.length > 0) {
        for (let i = 0; i < other.tunnelQueue.length; i++) {
          const entry = other.tunnelQueue[i];
          if (tunnel.tunnelQueue.length < 10) {
            tunnel.tunnelQueue.push(entry);
          } else {
            world.stockpile[entry.item] = (world.stockpile[entry.item] ?? 0) + 1;
          }
        }
        other.tunnelQueue.length = 0;
      }
      return;
    }
  }

  tunnel.tunnelMode = 'entrance';
  tunnel.pairedId = undefined;
}

/**
 * Places a building at `(x, y)` facing `dir`, validating tech/resource constraints.
 * @example const res = placeBuilding(world, 'belt_mk1', 28, 31, 1, config);
 */
export function placeBuilding(
  world: WorldState,
  type: BuildingId,
  x: number,
  y: number,
  dir: Direction,
  config: GameConfig = DEFAULT_CONFIG,
  options?: { recipeId?: string; clock?: number }
): { ok: boolean; entity?: BuildingEntity; reason?: string } {
  const check = canPlaceBuilding(world, type, x, y, config);
  if (!check.ok) return { ok: false, reason: check.reason };

  const def = BUILDINGS[type];
  const freeBuild = config.free_build.value >= 1;
  if (!freeBuild) {
    consumeResources(world, def.cost);
  }

  const id = world.nextEntityId++;
  const entity = createBuildingEntity(id, type, x, y, dir);
  entity.geoBonus = hasAdjacentGeothermalVent(world, x, y) ? GEOTHERMAL_SPEED_BONUS : 0;

  if (options?.recipeId && isProcessorType(type)) {
    if (options.recipeId === 'auto') {
      entity.recipeId = 'auto';
    } else {
      const recipe = RECIPES[options.recipeId];
      if (recipe && recipe.building === type && isRecipeUnlocked(world, recipe, config)) {
        entity.recipeId = options.recipeId;
      }
    }
  }
  if (options?.clock !== undefined && Number.isFinite(options.clock)) {
    const canClock = freeBuild || isFeatureUnlocked(world, 'overclock');
    entity.clock = canClock ? Math.max(CLOCK_MIN, Math.min(CLOCK_MAX, options.clock)) : 1.0;
  }

  world.buildings[id] = entity;
  world.grid[tileIndex(x, y)] = id;
  markWorldBuildingsDirty(world);

  if (type === 'tunnel') {
    pairUndergroundTunnel(world, entity);
  }

  return { ok: true, entity };
}

function refundItemMap(world: WorldState, map: Partial<Record<ItemId, number>>): void {
  for (const k in map) {
    const count = map[k as ItemId];
    if (count && count > 0) {
      const item = k as ItemId;
      world.stockpile[item] = (world.stockpile[item] ?? 0) + count;
    }
  }
}

/**
 * Removes the building at `(x, y)` and optionally refunds construction costs and buffered items.
 */
export function removeBuilding(
  world: WorldState,
  x: number,
  y: number,
  refund = true
): boolean {
  if (!inBounds(x, y) || isHubTile(x, y)) return false;
  const b = getBuildingAt(world, x, y);
  if (!b) return false;

  if (b.type === 'tunnel' && b.pairedId) {
    const partner = world.buildings[b.pairedId];
    if (partner) {
      partner.pairedId = undefined;
    }
  }

  if (refund) {
    addResources(world, BUILDINGS[b.type].cost);
    refundItemMap(world, b.inventory);
    refundItemMap(world, b.inputBuffer);
    for (let i = 0; i < b.slots.length; i++) {
      const item = b.slots[i].item;
      world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
    }
    for (let i = 0; i < b.tunnelQueue.length; i++) {
      const item = b.tunnelQueue[i].item;
      world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
    }
    if (b.inserterItem !== null) {
      world.stockpile[b.inserterItem] = (world.stockpile[b.inserterItem] ?? 0) + 1;
    }
    if (b.outputBuffer && b.outputBuffer.count > 0) {
      const outItem = b.outputBuffer.item;
      world.stockpile[outItem] = (world.stockpile[outItem] ?? 0) + b.outputBuffer.count;
    }
  }

  world.grid[tileIndex(x, y)] = 0;
  delete world.buildings[b.id];
  markWorldBuildingsDirty(world);
  return true;
}

export function rotateBuilding(world: WorldState, x: number, y: number, dir?: Direction): boolean {
  const b = getBuildingAt(world, x, y);
  if (!b || b.type === 'orbital_hub') return false;
  b.dir = dir !== undefined ? dir : (((b.dir + 1) & 3) as Direction);
  if (b.type === 'tunnel') {
    if (b.pairedId) {
      const partner = world.buildings[b.pairedId];
      if (partner) partner.pairedId = undefined;
      b.pairedId = undefined;
    }
    pairUndergroundTunnel(world, b);
  }
  return true;
}

export function setMachineRecipe(
  world: WorldState,
  entityId: number,
  recipeId: string,
  config: GameConfig = DEFAULT_CONFIG
): boolean {
  const b = world.buildings[entityId];
  if (!b || !isProcessorType(b.type)) return false;
  if (recipeId !== 'auto') {
    const recipe = RECIPES[recipeId];
    if (!recipe || recipe.building !== b.type || !isRecipeUnlocked(world, recipe, config)) {
      return false;
    }
  }
  b.recipeId = recipeId;
  b.lockedRecipeId = null;
  b.craftProgress = 0;
  // Refund uncommitted input buffers back to stockpile to prevent item loss on recipe swap
  refundItemMap(world, b.inputBuffer);
  for (const k in b.inputBuffer) {
    b.inputBuffer[k as ItemId] = 0;
  }
  return true;
}

export function setMachineClock(
  world: WorldState,
  entityId: number,
  clock: number,
  bypassTech = false
): boolean {
  const b = world.buildings[entityId];
  if (!b) return false;
  if (!bypassTech && !isFeatureUnlocked(world, 'overclock')) return false;
  if (!Number.isFinite(clock)) return false;
  b.clock = Math.round(Math.max(CLOCK_MIN, Math.min(CLOCK_MAX, clock)) * 20) / 20;
  return true;
}

export function mineTileManual(world: WorldState, x: number, y: number): ItemId | null {
  if (!inBounds(x, y)) return null;
  const res = world.resources[tileIndex(x, y)];
  if (res === 'none' || res === 'geothermal_vent') return null;
  if (!VALID_ITEM_IDS.has(res)) return null;
  const item = res as ItemId;
  world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
  world.manualMineCount += 1;
  return item;
}
