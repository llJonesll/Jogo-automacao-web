/**
 * Fixed 20 Hz two-phase deterministic simulation engine (Phase 1 internals, Phase 2A push, Phase 2B pull).
 * Game rules: `design/gdd/factory-systems.md`.
 * Architecture: `docs/architecture/architecture.md` (zero DOM dependencies).
 * Threading contract: single-threaded synchronous execution only; scratch pools, flat 4096-tile
 * buffers, and returned `SimulationAudioEvent[]` are reused across ticks with zero steady-state GC.
 */
import {
  BUILDINGS,
  DEFAULT_CONFIG,
  DIR_DX,
  DIR_DY,
  DT,
  HUB_ORIGIN,
  ITEMS,
  RECIPES,
  TECH_BY_ID,
  TILE_COUNT,
  getRecipesForBuilding,
  isBeltType,
  isProcessorType,
  oppositeDir,
  transitionBuildingStatus,
} from '../core/data';
import type {
  BeltSlot,
  BuildingEntity,
  Direction,
  GameConfig,
  ItemId,
  ItemStack,
  RecipeDef,
  SimulationAudioEvent,
  TunnelItem,
  WorldState,
} from '../core/types';
import {
  getBuildingAt,
  getWorldBuildingLists,
  inBounds,
  isFeatureUnlocked,
  isHubTile,
  isRecipeUnlocked,
  tileIndex,
} from './world';

export const OVERDRIVE_SPEED_MULT = 1.5;

const SPLITTER_OFFSETS_BY_DIR: readonly (readonly [Direction, Direction, Direction])[] = [
  [3, 0, 1],
  [0, 1, 2],
  [1, 2, 3],
  [2, 3, 0],
];

const MERGER_SIDE_ORDER_BY_DIR: readonly (readonly [Direction, Direction, Direction])[] = [
  [3, 2, 1],
  [0, 3, 2],
  [1, 0, 3],
  [2, 1, 0],
];

const HUB_CANONICAL_TILE = tileIndex(HUB_ORIGIN, HUB_ORIGIN);

interface PushProposal {
  source: BuildingEntity;
  target: BuildingEntity | null;
  targetX: number;
  targetY: number;
  fromSide: Direction;
  item: ItemId;
  viaInserter: boolean;
  splitterIdx: number;
}

interface PullProposal {
  inserter: BuildingEntity;
  source: BuildingEntity;
  item: ItemId;
}

export interface SimulationHooks {
  onPowerStep?: (world: WorldState, config: GameConfig, dt: number) => void;
  onItemProduced?: (world: WorldState, item: ItemId, count: number) => void;
  onItemConsumed?: (world: WorldState, item: ItemId, count: number) => void;
  onHubDelivered?: (
    world: WorldState,
    item: ItemId,
    events: SimulationAudioEvent[]
  ) => void;
  onResearchLabStep?: (
    world: WorldState,
    lab: BuildingEntity,
    satisfaction: number,
    dt: number,
    events: SimulationAudioEvent[],
    config?: GameConfig
  ) => void;
  onTickEnd?: (world: WorldState) => void;
}

// shortcut: fixed 4096-tile flat scratch buffers and 8192-slot pools, switch to sparse maps/dynamic pools if world exceeds 128x128
// --- Pre-allocated object pools & 4096-tile flat scratch buffers ---
const slotPool: BeltSlot[] = [];
const tunnelItemPool: TunnelItem[] = [];
const itemStackPool: ItemStack[] = [];

const pushPool: PushProposal[] = [];
let pushCount = 0;
const pushHead = new Int32Array(TILE_COUNT).fill(-1);
const pushTail = new Int32Array(TILE_COUNT).fill(-1);
const pushNext = new Int32Array(TILE_COUNT).fill(-1);
const dirtyPushTargets = new Int32Array(TILE_COUNT);
let dirtyPushCount = 0;
const acceptedIndices = new Int32Array(TILE_COUNT * 4);
let acceptedCount = 0;
const candPushScratch: PushProposal[] = [];

const pullPool: PullProposal[] = [];
let pullCount = 0;
const pullHead = new Int32Array(TILE_COUNT).fill(-1);
const pullTail = new Int32Array(TILE_COUNT).fill(-1);
const pullNext = new Int32Array(TILE_COUNT).fill(-1);
const dirtyPullSources = new Int32Array(TILE_COUNT);
let dirtyPullCount = 0;
const candPullScratch: PullProposal[] = [];

const tickEvents: SimulationAudioEvent[] = [];

function acquireBeltSlot(item: ItemId, progress: number, sourceDir: Direction): BeltSlot {
  const s = slotPool.pop();
  if (s) {
    s.item = item;
    s.progress = progress;
    s.sourceDir = sourceDir;
    return s;
  }
  return { item, progress, sourceDir };
}

function releaseBeltSlot(slot: BeltSlot): void {
  if (slotPool.length < 8192) {
    slotPool.push(slot);
  }
}

function shiftBeltSlot(b: BuildingEntity): void {
  const len = b.slots.length;
  if (len === 0) return;
  const popped = b.slots[0];
  if (len === 2) {
    b.slots[0] = b.slots[1];
    b.slots.length = 1;
  } else {
    b.slots.length = 0;
  }
  releaseBeltSlot(popped);
}

function acquireTunnelItem(item: ItemId, progress: number): TunnelItem {
  const entry = tunnelItemPool.pop();
  if (entry) {
    entry.item = item;
    entry.progress = progress;
    return entry;
  }
  return { item, progress };
}

function releaseTunnelItem(entry: TunnelItem): void {
  if (tunnelItemPool.length < 8192) {
    tunnelItemPool.push(entry);
  }
}

function shiftTunnelItem(b: BuildingEntity): void {
  const q = b.tunnelQueue;
  const len = q.length;
  if (len === 0) return;
  const popped = q[0];
  for (let i = 0; i < len - 1; i++) {
    q[i] = q[i + 1];
  }
  q.length = len - 1;
  releaseTunnelItem(popped);
}

function acquireItemStack(item: ItemId, count: number): ItemStack {
  const stack = itemStackPool.pop();
  if (stack) {
    stack.item = item;
    stack.count = count;
    return stack;
  }
  return { item, count };
}

function releaseItemStack(stack: ItemStack): void {
  if (itemStackPool.length < 4096) {
    itemStackPool.push(stack);
  }
}

function recordPushProposal(
  source: BuildingEntity,
  targetX: number,
  targetY: number,
  fromSide: Direction,
  item: ItemId,
  viaInserter: boolean,
  splitterIdx: number
): void {
  if (pushCount >= pushPool.length) {
    pushPool.push({
      source,
      target: null,
      targetX,
      targetY,
      fromSide,
      item,
      viaInserter,
      splitterIdx,
    });
  } else {
    const p = pushPool[pushCount];
    p.source = source;
    p.target = null;
    p.targetX = targetX;
    p.targetY = targetY;
    p.fromSide = fromSide;
    p.item = item;
    p.viaInserter = viaInserter;
    p.splitterIdx = splitterIdx;
  }
  pushCount += 1;
}

function recordPullProposal(inserter: BuildingEntity, source: BuildingEntity, item: ItemId): void {
  if (pullCount >= pullPool.length) {
    pullPool.push({ inserter, source, item });
  } else {
    const p = pullPool[pullCount];
    p.inserter = inserter;
    p.source = source;
    p.item = item;
  }
  pullCount += 1;
}

function recipeHasInput(recipe: RecipeDef, item: ItemId): boolean {
  const inputs = recipe.inputs;
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].item === item) return true;
  }
  return false;
}

function recipeAcceptsAllBuffered(
  recipe: RecipeDef,
  buf: Partial<Record<ItemId, number>>
): boolean {
  for (const k in buf) {
    const count = buf[k as ItemId];
    if (count && count > 0 && !recipeHasInput(recipe, k as ItemId)) {
      return false;
    }
  }
  return true;
}

function hasAllRecipeInputs(recipe: RecipeDef, buf: Partial<Record<ItemId, number>>): boolean {
  const inputs = recipe.inputs;
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    if ((buf[inp.item] ?? 0) < inp.count) return false;
  }
  return true;
}

function resolveAutoRecipe(
  world: WorldState,
  b: BuildingEntity,
  config: GameConfig
): RecipeDef | null {
  if (b.recipeId !== 'auto') {
    const r = RECIPES[b.recipeId];
    return r && isRecipeUnlocked(world, r, config) ? r : null;
  }
  if (b.lockedRecipeId) {
    const r = RECIPES[b.lockedRecipeId];
    return r && isRecipeUnlocked(world, r, config) ? r : null;
  }

  let hasAnyBuffered = false;
  for (const k in b.inputBuffer) {
    const count = b.inputBuffer[k as ItemId];
    if (count && count > 0) {
      hasAnyBuffered = true;
      break;
    }
  }
  if (!hasAnyBuffered) return null;

  const candidates = getRecipesForBuilding(b.type);
  let matchCount = 0;
  let firstMatch: RecipeDef | null = null;
  let readyMatch: RecipeDef | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    if (!isRecipeUnlocked(world, r, config)) continue;
    if (!recipeAcceptsAllBuffered(r, b.inputBuffer)) continue;
    matchCount += 1;
    if (!firstMatch) firstMatch = r;
    if (!readyMatch && hasAllRecipeInputs(r, b.inputBuffer)) {
      readyMatch = r;
    }
  }

  if (matchCount === 1 && firstMatch) {
    b.lockedRecipeId = firstMatch.id;
    return firstMatch;
  }
  if (readyMatch) {
    b.lockedRecipeId = readyMatch.id;
    return readyMatch;
  }
  return null;
}

function canAcceptInputItem(
  world: WorldState,
  b: BuildingEntity,
  item: ItemId,
  config: GameConfig
): boolean {
  if (b.recipeId !== 'auto' || b.lockedRecipeId) {
    const id = b.recipeId !== 'auto' ? b.recipeId : b.lockedRecipeId!;
    const recipe = RECIPES[id];
    if (!recipe || !isRecipeUnlocked(world, recipe, config)) return false;
    let reqCount = 0;
    for (let i = 0; i < recipe.inputs.length; i++) {
      if (recipe.inputs[i].item === item) {
        reqCount = recipe.inputs[i].count;
        break;
      }
    }
    if (reqCount <= 0) return false;
    return (b.inputBuffer[item] ?? 0) < Math.max(8, reqCount * 4);
  }

  const candidates = getRecipesForBuilding(b.type);
  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    if (!isRecipeUnlocked(world, r, config)) continue;
    if (recipeHasInput(r, item) && recipeAcceptsAllBuffered(r, b.inputBuffer)) {
      return (b.inputBuffer[item] ?? 0) < 8;
    }
  }
  return false;
}

function totalInventoryCount(inv: Partial<Record<ItemId, number>>): number {
  let sum = 0;
  for (const k in inv) {
    sum += inv[k as ItemId] ?? 0;
  }
  return sum;
}

function canTargetAccept(
  world: WorldState,
  target: BuildingEntity,
  item: ItemId,
  fromSide: Direction,
  viaInserter: boolean,
  config: GameConfig
): boolean {
  if (target.type === 'orbital_hub') return true;

  if (isBeltType(target.type)) {
    if (!viaInserter && fromSide === target.dir) return false;
    if (target.slots.length === 0) return true;
    return target.slots.length === 1 && target.slots[0].progress >= 0.5;
  }

  if (target.type === 'splitter') {
    if (fromSide !== oppositeDir(target.dir)) return false;
    if (target.slots.length === 0) return true;
    return target.slots.length === 1 && target.slots[0].progress >= 0.5;
  }

  if (target.type === 'merger') {
    if (fromSide === target.dir) return false;
    if (target.slots.length === 0) return true;
    return target.slots.length === 1 && target.slots[0].progress >= 0.5;
  }

  if (target.type === 'tunnel') {
    if (target.tunnelMode !== 'entrance' || fromSide !== oppositeDir(target.dir)) {
      return false;
    }
    const cap = target.pairedId === undefined ? 4 : 10;
    return target.tunnelQueue.length < cap;
  }

  if (target.type === 'storage') {
    const cap = BUILDINGS.storage.capacity ?? 200;
    return totalInventoryCount(target.inventory) < cap;
  }

  if (target.type === 'coal_generator') {
    const itemDef = ITEMS[item];
    return Boolean(itemDef && itemDef.fuel_value > 0) && (target.inputBuffer[item] ?? 0) < 10;
  }

  if (target.type === 'research_lab') {
    if (!world.activeTechId) return false;
    const tech = TECH_BY_ID[world.activeTechId];
    if (!tech) return false;
    let reqCount = 0;
    for (let i = 0; i < tech.cost.length; i++) {
      if (tech.cost[i].item === item) {
        reqCount = tech.cost[i].count;
        break;
      }
    }
    if (reqCount <= 0) return false;
    const prog = world.techProgress[tech.id];
    const delivered = prog ? (prog[item] ?? 0) : 0;
    const buffered = target.inputBuffer[item] ?? 0;
    return delivered + buffered < reqCount && buffered < 20;
  }

  if (isProcessorType(target.type)) {
    if (!viaInserter && fromSide === target.dir) return false;
    return canAcceptInputItem(world, target, item, config);
  }

  return false;
}

function insertIntoTarget(
  world: WorldState,
  target: BuildingEntity,
  item: ItemId,
  fromSide: Direction,
  events: SimulationAudioEvent[],
  config: GameConfig,
  hooks?: SimulationHooks
): void {
  if (target.type === 'orbital_hub') {
    world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
    hooks?.onHubDelivered?.(world, item, events);
    return;
  }

  if (isBeltType(target.type) || target.type === 'splitter' || target.type === 'merger') {
    target.slots.push(acquireBeltSlot(item, 0, fromSide));
    return;
  }

  if (target.type === 'tunnel') {
    target.tunnelQueue.push(acquireTunnelItem(item, 0));
    return;
  }

  if (target.type === 'storage') {
    target.inventory[item] = (target.inventory[item] ?? 0) + 1;
    return;
  }

  if (
    target.type === 'coal_generator' ||
    target.type === 'research_lab' ||
    isProcessorType(target.type)
  ) {
    target.inputBuffer[item] = (target.inputBuffer[item] ?? 0) + 1;
    if (isProcessorType(target.type) && target.recipeId === 'auto' && !target.lockedRecipeId) {
      resolveAutoRecipe(world, target, config);
    }
  }
}

function findPullableItemForTarget(
  world: WorldState,
  source: BuildingEntity,
  target: BuildingEntity,
  fromSide: Direction,
  config: GameConfig
): ItemId | null {
  if (source.type === 'storage') {
    for (const k in source.inventory) {
      const count = source.inventory[k as ItemId];
      if (!count || count <= 0) continue;
      const item = k as ItemId;
      if (canTargetAccept(world, target, item, fromSide, true, config)) {
        return item;
      }
    }
    return null;
  }

  if (source.type === 'miner_mk1' || source.type === 'miner_mk2' || isProcessorType(source.type)) {
    if (source.outputBuffer && source.outputBuffer.count > 0) {
      if (canTargetAccept(world, target, source.outputBuffer.item, fromSide, true, config)) {
        return source.outputBuffer.item;
      }
    }
    return null;
  }

  if (isBeltType(source.type) || source.type === 'splitter' || source.type === 'merger') {
    if (source.slots.length > 0 && source.slots[0].progress >= 0.45) {
      const item = source.slots[0].item;
      if (canTargetAccept(world, target, item, fromSide, true, config)) {
        return item;
      }
    }
    return null;
  }

  return null;
}

function removeOneFromPullSource(source: BuildingEntity, item: ItemId): boolean {
  if (source.type === 'miner_mk1' || source.type === 'miner_mk2' || isProcessorType(source.type)) {
    if (!source.outputBuffer || source.outputBuffer.item !== item || source.outputBuffer.count <= 0) {
      return false;
    }
    source.outputBuffer.count -= 1;
    if (source.outputBuffer.count <= 0) {
      releaseItemStack(source.outputBuffer);
      source.outputBuffer = null;
    }
    return true;
  }

  if (isBeltType(source.type) || source.type === 'splitter' || source.type === 'merger') {
    if (source.slots.length === 0 || source.slots[0].item !== item) return false;
    shiftBeltSlot(source);
    return true;
  }

  if (source.type === 'storage') {
    const cur = source.inventory[item] ?? 0;
    if (cur <= 0) return false;
    source.inventory[item] = cur - 1;
    return true;
  }

  return false;
}

function advanceInternals(
  world: WorldState,
  config: GameConfig,
  events: SimulationAudioEvent[],
  overdriveMult: number,
  hooks?: SimulationHooks
): void {
  const satisfaction = world.power.satisfaction;
  const beltMult = config.belt_speed_mult.value * overdriveMult;
  const mineMult = config.mining_speed_mult.value * overdriveMult;
  const craftMult = config.craft_speed_mult.value * overdriveMult;
  const entities = getWorldBuildingLists(world).all;

  for (let i = 0; i < entities.length; i++) {
    const b = entities[i];

    if (isBeltType(b.type) || b.type === 'splitter' || b.type === 'merger') {
      const fallbackSpeed = b.type === 'splitter' || b.type === 'merger' ? 8 : 2;
      const speed = (BUILDINGS[b.type].speed ?? fallbackSpeed) * beltMult;
      const step = speed * DT;
      if (b.slots.length >= 1) {
        b.slots[0].progress = Math.min(1.0, b.slots[0].progress + step);
      }
      if (b.slots.length >= 2) {
        b.slots[1].progress = Math.min(b.slots[0].progress - 0.5, b.slots[1].progress + step);
      }
      transitionBuildingStatus(b, b.slots.length > 0 ? 'working' : 'idle');
      continue;
    }

    if (b.type === 'tunnel') {
      if (b.tunnelMode === 'entrance') {
        const exit = b.pairedId ? world.buildings[b.pairedId] : undefined;
        const speed = (BUILDINGS.tunnel.speed ?? 4) * beltMult;
        const step = speed * DT;
        const q = b.tunnelQueue;
        for (let qi = 0; qi < q.length; qi++) {
          const cap = qi === 0 ? 1.0 : Math.max(0, q[qi - 1].progress - 0.25);
          q[qi].progress = Math.min(cap, q[qi].progress + step);
        }
        if (exit) {
          transitionBuildingStatus(b, q.length > 0 ? 'working' : 'idle');
        } else {
          transitionBuildingStatus(b, 'unpaired');
        }
      } else {
        transitionBuildingStatus(b, b.pairedId ? 'working' : 'unpaired');
      }
      continue;
    }

    if (b.type === 'inserter') {
      if (satisfaction <= 0.01) {
        transitionBuildingStatus(b, 'no_power');
        continue;
      }
      const speed = (BUILDINGS.inserter.speed ?? 1.5) * overdriveMult * satisfaction;
      if (b.inserterItem !== null) {
        b.inserterProgress = Math.min(1.0, b.inserterProgress + speed * 2 * DT);
        transitionBuildingStatus(b, 'working');
      } else if (b.inserterPhase === 'to_source' && b.inserterProgress > 0) {
        b.inserterProgress = Math.max(0, b.inserterProgress - speed * 2 * DT);
        transitionBuildingStatus(b, 'working');
      } else {
        transitionBuildingStatus(b, 'idle');
      }
      continue;
    }

    if (b.type === 'miner_mk1' || b.type === 'miner_mk2') {
      const res = world.resources[tileIndex(b.x, b.y)];
      if (res === 'none' || res === 'geothermal_vent') {
        transitionBuildingStatus(b, 'no_resource');
        continue;
      }
      if (satisfaction <= 0.01) {
        transitionBuildingStatus(b, 'no_power');
        continue;
      }
      if (b.outputBuffer && b.outputBuffer.count >= 10) {
        transitionBuildingStatus(b, 'output_full');
        continue;
      }

      const rate =
        (BUILDINGS[b.type].speed ?? 0.75) *
        b.clock *
        (1 + b.geoBonus) *
        mineMult *
        satisfaction;
      b.craftProgress += rate * DT;
      if (b.craftProgress >= 1.0) {
        b.craftProgress -= 1.0;
        const ore = res as ItemId;
        if (b.outputBuffer && b.outputBuffer.item === ore) {
          b.outputBuffer.count += 1;
        } else {
          if (b.outputBuffer) releaseItemStack(b.outputBuffer);
          b.outputBuffer = acquireItemStack(ore, 1);
        }
        hooks?.onItemProduced?.(world, ore, 1);
      }
      transitionBuildingStatus(b, 'working');
      continue;
    }

    if (isProcessorType(b.type)) {
      if (satisfaction <= 0.01) {
        transitionBuildingStatus(b, 'no_power');
        continue;
      }
      const recipe = resolveAutoRecipe(world, b, config);
      if (!recipe) {
        transitionBuildingStatus(b, b.outputBuffer ? 'output_full' : 'input_starved');
        continue;
      }

      const outStack = recipe.outputs[0];
      const outputBlocked =
        b.outputBuffer !== null &&
        (b.outputBuffer.item !== outStack.item || b.outputBuffer.count + outStack.count > 20);

      if (b.craftProgress <= 0) {
        if (!hasAllRecipeInputs(recipe, b.inputBuffer)) {
          transitionBuildingStatus(b, outputBlocked ? 'output_full' : 'input_starved');
          continue;
        }
        if (outputBlocked) {
          transitionBuildingStatus(b, 'output_full');
          continue;
        }
        for (let k = 0; k < recipe.inputs.length; k++) {
          const inp = recipe.inputs[k];
          b.inputBuffer[inp.item] = Math.max(0, (b.inputBuffer[inp.item] ?? 0) - inp.count);
          hooks?.onItemConsumed?.(world, inp.item, inp.count);
        }
        b.craftProgress = 0.0001;
      }

      const rate =
        (1 / recipe.duration) * b.clock * (1 + b.geoBonus) * craftMult * satisfaction;
      b.craftProgress += rate * DT;

      if (b.craftProgress >= 1.0) {
        if (!outputBlocked) {
          b.craftProgress = 0;
          if (b.outputBuffer && b.outputBuffer.item === outStack.item) {
            b.outputBuffer.count += outStack.count;
          } else {
            if (b.outputBuffer) releaseItemStack(b.outputBuffer);
            b.outputBuffer = acquireItemStack(outStack.item, outStack.count);
          }
          hooks?.onItemProduced?.(world, outStack.item, outStack.count);
          transitionBuildingStatus(b, 'working');
        } else {
          b.craftProgress = 1.0;
          transitionBuildingStatus(b, 'output_full');
        }
      } else {
        transitionBuildingStatus(b, 'working');
      }
      continue;
    }

    if (b.type === 'research_lab') {
      hooks?.onResearchLabStep?.(world, b, satisfaction, DT, events, config);
    }
  }
}

function collectPushProposals(world: WorldState, config: GameConfig): void {
  pushCount = 0;
  const entities = getWorldBuildingLists(world).all;

  for (let i = 0; i < entities.length; i++) {
    const b = entities[i];

    if (isBeltType(b.type) || b.type === 'merger') {
      if (b.slots.length > 0 && b.slots[0].progress >= 1.0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          recordPushProposal(b, tx, ty, oppositeDir(b.dir), b.slots[0].item, false, -1);
        }
      }
      continue;
    }

    if (b.type === 'splitter') {
      if (b.slots.length === 0 || b.slots[0].progress < 1.0) continue;
      const offsets = SPLITTER_OFFSETS_BY_DIR[b.dir];
      const item = b.slots[0].item;
      for (let k = 0; k < 3; k++) {
        const idx = (b.splitterIndex + k) % 3;
        const outDir = offsets[idx];
        const tx = b.x + DIR_DX[outDir];
        const ty = b.y + DIR_DY[outDir];
        const target = getBuildingAt(world, tx, ty);
        if (target && canTargetAccept(world, target, item, oppositeDir(outDir), false, config)) {
          recordPushProposal(b, tx, ty, oppositeDir(outDir), item, false, idx);
          break;
        }
      }
      continue;
    }

    if (b.type === 'tunnel') {
      if (b.tunnelMode === 'entrance' && b.pairedId && b.tunnelQueue.length > 0) {
        if (b.tunnelQueue[0].progress < 1.0) continue;
        const exit = world.buildings[b.pairedId];
        if (!exit) continue;
        const tx = exit.x + DIR_DX[exit.dir];
        const ty = exit.y + DIR_DY[exit.dir];
        if (inBounds(tx, ty)) {
          recordPushProposal(b, tx, ty, oppositeDir(exit.dir), b.tunnelQueue[0].item, false, -1);
        }
      }
      continue;
    }

    if (b.type === 'inserter') {
      if (b.inserterItem !== null && b.inserterProgress >= 1.0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          recordPushProposal(b, tx, ty, oppositeDir(b.dir), b.inserterItem, true, -1);
        }
      }
      continue;
    }

    if (b.type === 'miner_mk1' || b.type === 'miner_mk2' || isProcessorType(b.type)) {
      if (b.outputBuffer && b.outputBuffer.count > 0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          recordPushProposal(b, tx, ty, oppositeDir(b.dir), b.outputBuffer.item, false, -1);
        }
      }
    }
  }
}

function resolveAndCommitPushes(
  world: WorldState,
  config: GameConfig,
  events: SimulationAudioEvent[],
  hooks?: SimulationHooks
): void {
  dirtyPushCount = 0;

  for (let i = 0; i < pushCount; i++) {
    const p = pushPool[i];
    const target = getBuildingAt(world, p.targetX, p.targetY);
    if (!target) continue;
    if (!canTargetAccept(world, target, p.item, p.fromSide, p.viaInserter, config)) continue;

    p.target = target;
    const key = isHubTile(p.targetX, p.targetY)
      ? HUB_CANONICAL_TILE
      : tileIndex(p.targetX, p.targetY);

    pushNext[i] = -1;
    if (pushHead[key] === -1) {
      pushHead[key] = i;
      pushTail[key] = i;
      dirtyPushTargets[dirtyPushCount++] = key;
    } else {
      pushNext[pushTail[key]] = i;
      pushTail[key] = i;
    }
  }

  acceptedCount = 0;

  for (let d = 0; d < dirtyPushCount; d++) {
    const key = dirtyPushTargets[d];
    let curIdx = pushHead[key];
    if (curIdx === -1) continue;

    const first = pushPool[curIdx];
    const target = first.target;
    if (!target) continue;

    if (
      target.type === 'orbital_hub' ||
      target.type === 'storage' ||
      target.type === 'coal_generator' ||
      target.type === 'research_lab' ||
      isProcessorType(target.type)
    ) {
      while (curIdx !== -1) {
        const c = pushPool[curIdx];
        if (canTargetAccept(world, target, c.item, c.fromSide, c.viaInserter, config)) {
          acceptedIndices[acceptedCount++] = curIdx;
        }
        curIdx = pushNext[curIdx];
      }
      continue;
    }

    candPushScratch.length = 0;
    while (curIdx !== -1) {
      candPushScratch.push(pushPool[curIdx]);
      curIdx = pushNext[curIdx];
    }

    if (target.type === 'merger') {
      const sideOrder = MERGER_SIDE_ORDER_BY_DIR[target.dir];
      let chosenIdx = -1;
      for (let k = 0; k < 3; k++) {
        const idx = (target.mergerIndex + k) % 3;
        const side = sideOrder[idx];
        for (let m = 0; m < candPushScratch.length; m++) {
          if (candPushScratch[m].fromSide === side) {
            chosenIdx = m;
            target.mergerIndex = (idx + 1) % 3;
            break;
          }
        }
        if (chosenIdx !== -1) break;
      }
      if (chosenIdx === -1 && candPushScratch.length > 0) {
        chosenIdx = 0;
      }
      if (chosenIdx !== -1) {
        // Recover original pushPool index via sequential walk
        let walk = pushHead[key];
        for (let step = 0; step < chosenIdx && walk !== -1; step++) {
          walk = pushNext[walk];
        }
        if (walk !== -1) acceptedIndices[acceptedCount++] = walk;
      }
      continue;
    }

    // Belts, splitters, tunnel entrances accept at most 1 item/tick, deterministic by source.id order
    const pickPos = (world.tick + first.targetX * 31 + first.targetY) % candPushScratch.length;
    let walk = pushHead[key];
    for (let step = 0; step < pickPos && walk !== -1; step++) {
      walk = pushNext[walk];
    }
    if (walk !== -1) acceptedIndices[acceptedCount++] = walk;
  }

  // Clear touched bucket heads/tails in O(active targets)
  for (let d = 0; d < dirtyPushCount; d++) {
    const key = dirtyPushTargets[d];
    pushHead[key] = -1;
    pushTail[key] = -1;
  }

  // Atomic commit: detach from sources and insert into targets
  for (let a = 0; a < acceptedCount; a++) {
    const proposal = pushPool[acceptedIndices[a]];
    const target = proposal.target;
    if (!target) continue;
    const src = proposal.source;
    let detached = false;

    if (isBeltType(src.type) || src.type === 'merger') {
      if (src.slots.length > 0 && src.slots[0].progress >= 1.0) {
        shiftBeltSlot(src);
        detached = true;
      }
    } else if (src.type === 'splitter') {
      if (src.slots.length > 0 && src.slots[0].progress >= 1.0) {
        shiftBeltSlot(src);
        if (proposal.splitterIdx >= 0) {
          src.splitterIndex = (proposal.splitterIdx + 1) % 3;
        }
        detached = true;
      }
    } else if (src.type === 'tunnel') {
      if (src.tunnelQueue.length > 0 && src.tunnelQueue[0].progress >= 1.0) {
        shiftTunnelItem(src);
        detached = true;
      }
    } else if (src.type === 'inserter') {
      if (src.inserterItem !== null) {
        src.inserterItem = null;
        src.inserterPhase = 'to_source';
        src.inserterProgress = 1.0;
        detached = true;
      }
    } else if (src.type === 'miner_mk1' || src.type === 'miner_mk2' || isProcessorType(src.type)) {
      if (src.outputBuffer && src.outputBuffer.count > 0) {
        src.outputBuffer.count -= 1;
        if (src.outputBuffer.count <= 0) {
          releaseItemStack(src.outputBuffer);
          src.outputBuffer = null;
        }
        detached = true;
      }
    }

    if (detached) {
      insertIntoTarget(world, target, proposal.item, proposal.fromSide, events, config, hooks);
    }
  }
}

function resolveInserterPulls(world: WorldState, config: GameConfig): void {
  if (world.power.satisfaction <= 0.01) return;

  pullCount = 0;
  const inserters = getWorldBuildingLists(world).inserters;

  for (let i = 0; i < inserters.length; i++) {
    const b = inserters[i];
    if (b.inserterItem !== null || b.inserterPhase !== 'to_source' || b.inserterProgress > 0) {
      continue;
    }

    const sx = b.x - DIR_DX[b.dir];
    const sy = b.y - DIR_DY[b.dir];
    const tx = b.x + DIR_DX[b.dir];
    const ty = b.y + DIR_DY[b.dir];

    const source = getBuildingAt(world, sx, sy);
    const target = getBuildingAt(world, tx, ty);
    if (!source || !target) continue;

    const item = findPullableItemForTarget(world, source, target, oppositeDir(b.dir), config);
    if (!item) continue;

    recordPullProposal(b, source, item);
  }

  if (pullCount === 0) return;

  dirtyPullCount = 0;
  for (let i = 0; i < pullCount; i++) {
    const p = pullPool[i];
    const key = tileIndex(p.source.x, p.source.y);
    pullNext[i] = -1;
    if (pullHead[key] === -1) {
      pullHead[key] = i;
      pullTail[key] = i;
      dirtyPullSources[dirtyPullCount++] = key;
    } else {
      pullNext[pullTail[key]] = i;
      pullTail[key] = i;
    }
  }

  for (let d = 0; d < dirtyPullCount; d++) {
    const key = dirtyPullSources[d];
    candPullScratch.length = 0;
    let curIdx = pullHead[key];
    while (curIdx !== -1) {
      candPullScratch.push(pullPool[curIdx]);
      curIdx = pullNext[curIdx];
    }

    const pick =
      candPullScratch[
        (world.tick + candPullScratch[0].source.x * 17 + candPullScratch[0].source.y) %
          candPullScratch.length
      ];
    if (removeOneFromPullSource(pick.source, pick.item)) {
      pick.inserter.inserterItem = pick.item;
      pick.inserter.inserterPhase = 'to_target';
      pick.inserter.inserterProgress = 0;
      transitionBuildingStatus(pick.inserter, 'working');
    }

    pullHead[key] = -1;
    pullTail[key] = -1;
  }
}

/**
 * Advances one deterministic 20 Hz simulation tick across all entities and logistics phases.
 * Note: Returns a reusable per-tick event buffer; consume synchronously before the next tick.
 * @example const events = stepSimulation(world, DEFAULT_CONFIG, FULL_SIM_HOOKS);
 */
export function stepSimulation(
  world: WorldState,
  config: GameConfig = DEFAULT_CONFIG,
  hooks?: SimulationHooks
): SimulationAudioEvent[] {
  tickEvents.length = 0;

  world.tick += 1;
  const cycleSec = Math.max(10, config.day_cycle_seconds.value);
  world.dayTime = (world.dayTime + DT / cycleSec) % 1.0;
  if (world.rocketTimer > 0) {
    world.rocketTimer = Math.max(0, world.rocketTimer - DT);
  }

  hooks?.onPowerStep?.(world, config, DT);

  const overdriveMult = isFeatureUnlocked(world, 'orbital_overdrive') ? OVERDRIVE_SPEED_MULT : 1.0;

  // Phase 1: Advance internal belt slots, tunnel travel, inserter arms, miners & crafters
  advanceInternals(world, config, tickEvents, overdriveMult, hooks);

  // Phase 2A: Order-independent Push resolution
  collectPushProposals(world, config);
  resolveAndCommitPushes(world, config, tickEvents, hooks);

  // Phase 2B: Order-independent Inserter Pull resolution
  resolveInserterPulls(world, config);

  hooks?.onTickEnd?.(world);

  return tickEvents;
}
