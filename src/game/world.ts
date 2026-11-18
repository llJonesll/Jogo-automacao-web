import {
  BUILDINGS,
  DIR_DX,
  DIR_DY,
  HUB_ORIGIN,
  HUB_SIZE,
  ITEMS,
  RECIPES,
  TECHS,
  WORLD_SIZE,
  createDefaultConfig,
  getRecipesForBuilding,
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
  ResourceType,
  TelemetryState,
  WorldState,
} from '../core/types';

export const TELEMETRY_BUCKETS = 60;

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
      const distSq = dx * dx + dy * dy;
      if (distSq <= r2 * (0.7 + rng() * 0.45)) {
        resources[tileIndex(x, y)] = type;
      }
    }
  }
}

export function createWorld(seed = 42026): WorldState {
  const rng = createRng(seed);
  const resources: ResourceType[] = new Array<ResourceType>(WORLD_SIZE * WORLD_SIZE).fill('none');
  const grid = new Array<number>(WORLD_SIZE * WORLD_SIZE).fill(0);

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

  // Outer resource veins
  const outerTypes: ResourceType[] = ['iron_ore', 'copper_ore', 'coal', 'stone', 'quartz'];
  for (let i = 0; i < 18; i++) {
    const type = outerTypes[i % outerTypes.length];
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
    stockpile: {
      iron_plate: 250,
      copper_wire: 120,
      iron_gear: 80,
      concrete: 60,
      coal: 20,
    },
    unlockedTechs: [],
    activeTechId: TECHS[0].id,
    techProgress: {},
    phaseIndex: 0,
    phaseDelivered: {},
    orbitalLaunches: 0,
    victoryAchieved: false,
    victoryDismissed: false,
    power: {
      generatedMw: 15,
      demandedMw: 0,
      storedMj: 0,
      capacityMj: 0,
      netMw: 15,
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
  for (const techId of world.unlockedTechs) {
    const tech = TECHS.find((t) => t.id === techId);
    if (tech && tech.unlocks_buildings.includes(type)) return true;
  }
  return false;
}

export function isFeatureUnlocked(world: WorldState, feature: string): boolean {
  for (const techId of world.unlockedTechs) {
    const tech = TECHS.find((t) => t.id === techId);
    if (tech && tech.unlocks_features.includes(feature)) return true;
  }
  return false;
}

export function hasResources(world: WorldState, cost: ItemStack[]): boolean {
  for (const stack of cost) {
    if ((world.stockpile[stack.item] ?? 0) < stack.count) return false;
  }
  return true;
}

export function consumeResources(world: WorldState, cost: ItemStack[]): void {
  for (const stack of cost) {
    world.stockpile[stack.item] = Math.max(0, (world.stockpile[stack.item] ?? 0) - stack.count);
  }
}

export function addResources(world: WorldState, cost: ItemStack[]): void {
  for (const stack of cost) {
    world.stockpile[stack.item] = (world.stockpile[stack.item] ?? 0) + stack.count;
  }
}

export function canPlaceBuilding(
  world: WorldState,
  type: BuildingId,
  x: number,
  y: number,
  config: GameConfig = createDefaultConfig()
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
  const dx = DIR_DX[backDir];
  const dy = DIR_DY[backDir];

  for (let dist = 1; dist <= maxSpan; dist++) {
    const tx = tunnel.x + dx * dist;
    const ty = tunnel.y + dy * dist;
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
  tunnel.tunnelMode = 'entrance';
  tunnel.pairedId = undefined;
}

export function placeBuilding(
  world: WorldState,
  type: BuildingId,
  x: number,
  y: number,
  dir: Direction,
  config: GameConfig = createDefaultConfig(),
  options?: { recipeId?: string; clock?: number }
): { ok: boolean; entity?: BuildingEntity; reason?: string } {
  const check = canPlaceBuilding(world, type, x, y, config);
  if (!check.ok) return { ok: false, reason: check.reason };

  const def = BUILDINGS[type];
  if (config.free_build.value < 1) {
    consumeResources(world, def.cost);
  }

  const id = world.nextEntityId++;
  const entity = createBuildingEntity(id, type, x, y, dir);
  entity.geoBonus = hasAdjacentGeothermalVent(world, x, y) ? 0.35 : 0;

  if (options?.recipeId && isProcessorType(type)) {
    if (options.recipeId === 'auto' || RECIPES[options.recipeId]?.building === type) {
      entity.recipeId = options.recipeId;
    }
  }
  if (options?.clock !== undefined) {
    entity.clock = Math.max(0.5, Math.min(2.5, options.clock));
  }

  world.buildings[id] = entity;
  world.grid[tileIndex(x, y)] = id;

  if (type === 'tunnel') {
    pairUndergroundTunnel(world, entity);
  }

  return { ok: true, entity };
}

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
    // Return stored inventory items to Hub on dismantle so players never lose chests
    for (const [k, count] of Object.entries(b.inventory)) {
      if (count && count > 0) {
        const item = k as ItemId;
        world.stockpile[item] = (world.stockpile[item] ?? 0) + count;
      }
    }
  }

  world.grid[tileIndex(x, y)] = 0;
  delete world.buildings[b.id];
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
  recipeId: string
): boolean {
  const b = world.buildings[entityId];
  if (!b || !isProcessorType(b.type)) return false;
  if (recipeId !== 'auto') {
    const valid = getRecipesForBuilding(b.type).some((r) => r.id === recipeId);
    if (!valid) return false;
  }
  b.recipeId = recipeId;
  b.lockedRecipeId = null;
  b.craftProgress = 0;
  // Refund uncommitted input buffers back to stockpile to prevent item loss on recipe swap
  for (const [k, count] of Object.entries(b.inputBuffer)) {
    if (count && count > 0) {
      const item = k as ItemId;
      world.stockpile[item] = (world.stockpile[item] ?? 0) + count;
    }
  }
  b.inputBuffer = {};
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
  b.clock = Math.round(Math.max(0.5, Math.min(2.5, clock)) * 20) / 20;
  return true;
}

export function mineTileManual(world: WorldState, x: number, y: number): ItemId | null {
  if (!inBounds(x, y)) return null;
  const res = world.resources[tileIndex(x, y)];
  if (res === 'none' || res === 'geothermal_vent') return null;
  if (!(res in ITEMS)) return null;
  const item = res as ItemId;
  world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
  world.manualMineCount += 1;
  return item;
}
