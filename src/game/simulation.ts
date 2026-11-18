import {
  BUILDINGS,
  DIR_DX,
  DIR_DY,
  DT,
  RECIPES,
  createDefaultConfig,
  getRecipesForBuilding,
  isBeltType,
  isProcessorType,
  oppositeDir,
} from '../core/data';
import type {
  BuildingEntity,
  Direction,
  GameConfig,
  ItemId,
  RecipeDef,
  SimulationAudioEvent,
  WorldState,
} from '../core/types';
import { getBuildingAt, inBounds, isHubTile, tileIndex } from './world';

interface PushProposal {
  source: BuildingEntity;
  targetX: number;
  targetY: number;
  fromSide: Direction;
  item: ItemId;
  viaInserter: boolean;
  splitterIdx?: number;
  acceptOverride?: boolean;
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
    events: SimulationAudioEvent[]
  ) => void;
  onTickEnd?: (world: WorldState) => void;
}

function resolveAutoRecipe(b: BuildingEntity): RecipeDef | null {
  if (b.recipeId !== 'auto') {
    return RECIPES[b.recipeId] ?? null;
  }
  if (b.lockedRecipeId) {
    return RECIPES[b.lockedRecipeId] ?? null;
  }
  const candidates = getRecipesForBuilding(b.type);
  const bufferedItems = Object.entries(b.inputBuffer)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([item]) => item as ItemId);

  if (bufferedItems.length === 0) return null;

  // Prefer recipes matching ALL currently buffered items
  const fullMatches = candidates.filter((r) =>
    bufferedItems.every((item) => r.inputs.some((inp) => inp.item === item))
  );
  if (fullMatches.length === 1) {
    b.lockedRecipeId = fullMatches[0].id;
    return fullMatches[0];
  }

  // If multiple recipes match (e.g. Constructor iron_ingot -> plate vs gear), pick ready craft
  const readyMatch = fullMatches.find((r) =>
    r.inputs.every((inp) => (b.inputBuffer[inp.item] ?? 0) >= inp.count)
  );
  if (readyMatch) {
    b.lockedRecipeId = readyMatch.id;
    return readyMatch;
  }

  return null;
}

function canAcceptInputItem(b: BuildingEntity, item: ItemId): boolean {
  if (b.recipeId !== 'auto') {
    const recipe = RECIPES[b.recipeId];
    if (!recipe) return false;
    const req = recipe.inputs.find((inp) => inp.item === item);
    if (!req) return false;
    return (b.inputBuffer[item] ?? 0) < Math.max(8, req.count * 4);
  }

  if (b.lockedRecipeId) {
    const recipe = RECIPES[b.lockedRecipeId];
    if (!recipe) return false;
    const req = recipe.inputs.find((inp) => inp.item === item);
    if (!req) return false;
    return (b.inputBuffer[item] ?? 0) < Math.max(8, req.count * 4);
  }

  const bufferedItems = Object.entries(b.inputBuffer)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([id]) => id as ItemId);
  const desiredSet = new Set<ItemId>([...bufferedItems, item]);

  const valid = getRecipesForBuilding(b.type).some((r) =>
    Array.from(desiredSet).every((reqItem) => r.inputs.some((inp) => inp.item === reqItem))
  );
  if (!valid) return false;
  return (b.inputBuffer[item] ?? 0) < 8;
}

function totalInventoryCount(inv: Partial<Record<ItemId, number>>): number {
  let sum = 0;
  for (const val of Object.values(inv)) {
    sum += val ?? 0;
  }
  return sum;
}

function canTargetAccept(
  world: WorldState,
  target: BuildingEntity,
  item: ItemId,
  fromSide: Direction,
  viaInserter: boolean
): boolean {
  if (target.type === 'orbital_hub') return true;

  if (isBeltType(target.type)) {
    if (!viaInserter && fromSide === target.dir) return false;
    if (target.slots.length === 0) return true;
    return target.slots.length === 1 && target.slots[0].progress >= 0.5;
  }

  if (target.type === 'splitter') {
    return fromSide === oppositeDir(target.dir) && target.slots.length === 0;
  }

  if (target.type === 'merger') {
    return fromSide !== target.dir && target.slots.length === 0;
  }

  if (target.type === 'tunnel') {
    return (
      target.tunnelMode === 'entrance' &&
      target.pairedId !== undefined &&
      fromSide === oppositeDir(target.dir) &&
      target.tunnelQueue.length < 10
    );
  }

  if (target.type === 'storage') {
    const cap = BUILDINGS.storage.capacity ?? 200;
    return totalInventoryCount(target.inventory) < cap;
  }

  if (target.type === 'coal_generator') {
    return item === 'coal' && (target.inputBuffer.coal ?? 0) < 10;
  }

  if (target.type === 'research_lab') {
    if (!world.activeTechId) return false;
    return (target.inputBuffer[item] ?? 0) < 20;
  }

  if (isProcessorType(target.type)) {
    if (!viaInserter && fromSide === target.dir) return false;
    return canAcceptInputItem(target, item);
  }

  return false;
}

function insertIntoTarget(
  world: WorldState,
  target: BuildingEntity,
  item: ItemId,
  fromSide: Direction,
  events: SimulationAudioEvent[],
  hooks?: SimulationHooks
): void {
  if (target.type === 'orbital_hub') {
    world.stockpile[item] = (world.stockpile[item] ?? 0) + 1;
    hooks?.onHubDelivered?.(world, item, events);
    return;
  }

  if (isBeltType(target.type) || target.type === 'splitter' || target.type === 'merger') {
    target.slots.push({ item, progress: 0, sourceDir: fromSide });
    return;
  }

  if (target.type === 'tunnel') {
    target.tunnelQueue.push({ item, progress: 0 });
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
      resolveAutoRecipe(target);
    }
  }
}

function findPullableItemForTarget(
  world: WorldState,
  source: BuildingEntity,
  target: BuildingEntity,
  fromSide: Direction
): ItemId | null {
  if (source.type === 'storage') {
    for (const [k, count] of Object.entries(source.inventory)) {
      if (!count || count <= 0) continue;
      const item = k as ItemId;
      if (canTargetAccept(world, target, item, fromSide, true)) {
        return item;
      }
    }
    return null;
  }

  if (source.type === 'miner_mk1' || source.type === 'miner_mk2' || isProcessorType(source.type)) {
    if (source.outputBuffer && source.outputBuffer.count > 0) {
      if (canTargetAccept(world, target, source.outputBuffer.item, fromSide, true)) {
        return source.outputBuffer.item;
      }
    }
    return null;
  }

  if (isBeltType(source.type) || source.type === 'splitter' || source.type === 'merger') {
    if (source.slots.length > 0 && source.slots[0].progress >= 0.45) {
      const item = source.slots[0].item;
      if (canTargetAccept(world, target, item, fromSide, true)) {
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
    if (source.outputBuffer.count <= 0) source.outputBuffer = null;
    return true;
  }

  if (isBeltType(source.type) || source.type === 'splitter' || source.type === 'merger') {
    if (source.slots.length === 0 || source.slots[0].item !== item) return false;
    source.slots.shift();
    return true;
  }

  if (source.type === 'storage') {
    const cur = source.inventory[item] ?? 0;
    if (cur <= 0) return false;
    source.inventory[item] = cur - 1;
    if (source.inventory[item] === 0) delete source.inventory[item];
    return true;
  }

  return false;
}

function advanceInternals(
  world: WorldState,
  config: GameConfig,
  events: SimulationAudioEvent[],
  hooks?: SimulationHooks
): void {
  const satisfaction = world.power.satisfaction;
  const beltMult = config.belt_speed_mult.value;
  const mineMult = config.mining_speed_mult.value;
  const craftMult = config.craft_speed_mult.value;

  const entities = Object.values(world.buildings);

  for (const b of entities) {
    if (isBeltType(b.type)) {
      const speed = (BUILDINGS[b.type].speed ?? 2) * beltMult;
      const step = speed * DT;
      if (b.slots.length >= 1) {
        b.slots[0].progress = Math.min(1.0, b.slots[0].progress + step);
      }
      if (b.slots.length >= 2) {
        b.slots[1].progress = Math.min(b.slots[0].progress - 0.5, b.slots[1].progress + step);
      }
      b.status = b.slots.length > 0 ? 'working' : 'idle';
      continue;
    }

    if (b.type === 'splitter' || b.type === 'merger') {
      const speed = (BUILDINGS[b.type].speed ?? 4) * beltMult;
      if (b.slots.length > 0) {
        b.slots[0].progress = Math.min(1.0, b.slots[0].progress + speed * DT);
      }
      b.status = b.slots.length > 0 ? 'working' : 'idle';
      continue;
    }

    if (b.type === 'tunnel') {
      if (b.tunnelMode === 'entrance' && b.pairedId) {
        const exit = world.buildings[b.pairedId];
        if (exit) {
          const dist = Math.max(1, Math.abs(exit.x - b.x) + Math.abs(exit.y - b.y));
          const speed = (BUILDINGS.tunnel.speed ?? 4) * beltMult;
          const step = (speed / (dist + 1)) * DT;
          for (let i = 0; i < b.tunnelQueue.length; i++) {
            const cap = i === 0 ? 1.0 : Math.max(0, b.tunnelQueue[i - 1].progress - 0.25);
            b.tunnelQueue[i].progress = Math.min(cap, b.tunnelQueue[i].progress + step);
          }
          b.status = b.tunnelQueue.length > 0 ? 'working' : 'idle';
        } else {
          b.status = 'unpaired';
        }
      } else {
        b.status = b.pairedId ? 'working' : 'unpaired';
      }
      continue;
    }

    if (b.type === 'inserter') {
      const speed = (BUILDINGS.inserter.speed ?? 1.5) * satisfaction;
      if (satisfaction <= 0.01) {
        b.status = 'no_power';
        continue;
      }
      if (b.inserterItem !== null) {
        b.inserterProgress = Math.min(1.0, b.inserterProgress + speed * 2 * DT);
        b.status = 'working';
      } else if (b.inserterPhase === 'to_source' && b.inserterProgress > 0) {
        b.inserterProgress = Math.max(0, b.inserterProgress - speed * 2 * DT);
        b.status = 'working';
      } else {
        b.status = 'idle';
      }
      continue;
    }

    if (b.type === 'miner_mk1' || b.type === 'miner_mk2') {
      const res = world.resources[tileIndex(b.x, b.y)];
      if (res === 'none' || res === 'geothermal_vent') {
        b.status = 'no_resource';
        continue;
      }
      if (satisfaction <= 0.01) {
        b.status = 'no_power';
        continue;
      }
      if (b.outputBuffer && b.outputBuffer.count >= 10) {
        b.status = 'output_full';
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
          b.outputBuffer = { item: ore, count: 1 };
        }
        hooks?.onItemProduced?.(world, ore, 1);
      }
      b.status = 'working';
      continue;
    }

    if (isProcessorType(b.type)) {
      if (satisfaction <= 0.01) {
        b.status = 'no_power';
        continue;
      }
      const recipe = resolveAutoRecipe(b);
      if (!recipe) {
        b.status = b.outputBuffer ? 'output_full' : 'input_starved';
        continue;
      }

      const outStack = recipe.outputs[0];
      const outputBlocked =
        b.outputBuffer !== null &&
        (b.outputBuffer.item !== outStack.item || b.outputBuffer.count + outStack.count > 20);

      if (b.craftProgress <= 0) {
        const hasInputs = recipe.inputs.every(
          (inp) => (b.inputBuffer[inp.item] ?? 0) >= inp.count
        );
        if (!hasInputs) {
          b.status = outputBlocked ? 'output_full' : 'input_starved';
          continue;
        }
        if (outputBlocked) {
          b.status = 'output_full';
          continue;
        }
        for (const inp of recipe.inputs) {
          b.inputBuffer[inp.item] = (b.inputBuffer[inp.item] ?? 0) - inp.count;
          if (b.inputBuffer[inp.item] === 0) delete b.inputBuffer[inp.item];
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
            b.outputBuffer = { item: outStack.item, count: outStack.count };
          }
          hooks?.onItemProduced?.(world, outStack.item, outStack.count);
          b.status = 'working';
        } else {
          b.craftProgress = 1.0;
          b.status = 'output_full';
        }
      } else {
        b.status = 'working';
      }
      continue;
    }

    if (b.type === 'research_lab') {
      hooks?.onResearchLabStep?.(world, b, satisfaction, DT, events);
    }
  }
}

function collectPushProposals(world: WorldState): PushProposal[] {
  const proposals: PushProposal[] = [];
  const entities = Object.values(world.buildings);

  for (const b of entities) {
    if (isBeltType(b.type) || b.type === 'merger') {
      if (b.slots.length > 0 && b.slots[0].progress >= 1.0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          proposals.push({
            source: b,
            targetX: tx,
            targetY: ty,
            fromSide: oppositeDir(b.dir),
            item: b.slots[0].item,
            viaInserter: false,
          });
        }
      }
      continue;
    }

    if (b.type === 'splitter') {
      if (b.slots.length === 0 || b.slots[0].progress < 1.0) continue;
      const offsets: Direction[] = [
        ((b.dir + 3) & 3) as Direction,
        b.dir,
        ((b.dir + 1) & 3) as Direction,
      ];
      const item = b.slots[0].item;
      for (let i = 0; i < 3; i++) {
        const idx = (b.splitterIndex + i) % 3;
        const outDir = offsets[idx];
        const tx = b.x + DIR_DX[outDir];
        const ty = b.y + DIR_DY[outDir];
        const target = getBuildingAt(world, tx, ty);
        if (target && canTargetAccept(world, target, item, oppositeDir(outDir), false)) {
          proposals.push({
            source: b,
            targetX: tx,
            targetY: ty,
            fromSide: oppositeDir(outDir),
            item,
            viaInserter: false,
            splitterIdx: idx,
          });
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
          proposals.push({
            source: b,
            targetX: tx,
            targetY: ty,
            fromSide: oppositeDir(exit.dir),
            item: b.tunnelQueue[0].item,
            viaInserter: false,
          });
        }
      }
      continue;
    }

    if (b.type === 'inserter') {
      if (b.inserterItem !== null && b.inserterProgress >= 1.0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          proposals.push({
            source: b,
            targetX: tx,
            targetY: ty,
            fromSide: oppositeDir(b.dir),
            item: b.inserterItem,
            viaInserter: true,
          });
        }
      }
      continue;
    }

    if (b.type === 'miner_mk1' || b.type === 'miner_mk2' || isProcessorType(b.type)) {
      if (b.outputBuffer && b.outputBuffer.count > 0) {
        const tx = b.x + DIR_DX[b.dir];
        const ty = b.y + DIR_DY[b.dir];
        if (inBounds(tx, ty)) {
          proposals.push({
            source: b,
            targetX: tx,
            targetY: ty,
            fromSide: oppositeDir(b.dir),
            item: b.outputBuffer.item,
            viaInserter: false,
          });
        }
      }
    }
  }

  return proposals;
}

function resolveAndCommitPushes(
  world: WorldState,
  proposals: PushProposal[],
  events: SimulationAudioEvent[],
  hooks?: SimulationHooks
): void {
  const byTarget = new Map<number, PushProposal[]>();

  for (const p of proposals) {
    const target = getBuildingAt(world, p.targetX, p.targetY);
    if (!target) continue;
    if (!canTargetAccept(world, target, p.item, p.fromSide, p.viaInserter)) continue;

    // Group hub deliveries under Hub entity ID (1) so all hub tiles accept infinitely
    const key = isHubTile(p.targetX, p.targetY)
      ? 1
      : tileIndex(p.targetX, p.targetY) + 100;
    const list = byTarget.get(key);
    if (list) list.push(p);
    else byTarget.set(key, [p]);
  }

  const accepted: Array<{ proposal: PushProposal; target: BuildingEntity }> = [];

  for (const [, candidates] of byTarget) {
    const first = candidates[0];
    const target = getBuildingAt(world, first.targetX, first.targetY);
    if (!target) continue;

    // Hub, Storage, Machines, Research Labs can absorb all simultaneous valid inputs on a tick
    if (
      target.type === 'orbital_hub' ||
      target.type === 'storage' ||
      target.type === 'coal_generator' ||
      target.type === 'research_lab' ||
      isProcessorType(target.type)
    ) {
      for (const c of candidates) {
        if (canTargetAccept(world, target, c.item, c.fromSide, c.viaInserter)) {
          accepted.push({ proposal: c, target });
        }
      }
      continue;
    }

    if (target.type === 'merger') {
      // Deterministic round-robin across [left, back, right]
      const sideOrder: Direction[] = [
        ((target.dir + 3) & 3) as Direction,
        ((target.dir + 2) & 3) as Direction,
        ((target.dir + 1) & 3) as Direction,
      ];
      let chosen: PushProposal | undefined;
      for (let i = 0; i < 3; i++) {
        const idx = (target.mergerIndex + i) % 3;
        const side = sideOrder[idx];
        const match = candidates.find((c) => c.fromSide === side);
        if (match) {
          chosen = match;
          target.mergerIndex = (idx + 1) % 3;
          break;
        }
      }
      if (!chosen && candidates.length > 0) {
        chosen = candidates[0];
      }
      if (chosen) accepted.push({ proposal: chosen, target });
      continue;
    }

    // Belts, splitters, tunnel entrances accept at most 1 item per tick, chosen deterministically
    candidates.sort((a, b) => a.source.id - b.source.id);
    const pickIdx = (world.tick + first.targetX * 31 + first.targetY) % candidates.length;
    accepted.push({ proposal: candidates[pickIdx], target });
  }

  // Atomic commit: detach from sources and insert into targets
  for (const { proposal, target } of accepted) {
    const src = proposal.source;
    let detached = false;

    if (isBeltType(src.type) || src.type === 'merger') {
      if (src.slots.length > 0 && src.slots[0].progress >= 1.0) {
        src.slots.shift();
        detached = true;
      }
    } else if (src.type === 'splitter') {
      if (src.slots.length > 0 && src.slots[0].progress >= 1.0) {
        src.slots.shift();
        if (proposal.splitterIdx !== undefined) {
          src.splitterIndex = (proposal.splitterIdx + 1) % 3;
        }
        detached = true;
      }
    } else if (src.type === 'tunnel') {
      if (src.tunnelQueue.length > 0 && src.tunnelQueue[0].progress >= 1.0) {
        src.tunnelQueue.shift();
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
        if (src.outputBuffer.count <= 0) src.outputBuffer = null;
        detached = true;
      }
    }

    if (detached) {
      insertIntoTarget(world, target, proposal.item, proposal.fromSide, events, hooks);
    }
  }
}

function resolveInserterPulls(world: WorldState): void {
  if (world.power.satisfaction <= 0.01) return;

  const pullProposals: PullProposal[] = [];

  for (const b of Object.values(world.buildings)) {
    if (b.type !== 'inserter') continue;
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

    // Avoid pulling an item unless target can take it (prevents inserter deadlocks!)
    const item = findPullableItemForTarget(world, source, target, oppositeDir(b.dir));
    if (!item) continue;

    pullProposals.push({ inserter: b, source, item });
  }

  const bySource = new Map<number, PullProposal[]>();
  for (const p of pullProposals) {
    const list = bySource.get(p.source.id);
    if (list) list.push(p);
    else bySource.set(p.source.id, [p]);
  }

  for (const [, candidates] of bySource) {
    candidates.sort((a, b) => a.inserter.id - b.inserter.id);
    const pick =
      candidates[(world.tick + candidates[0].source.x * 17 + candidates[0].source.y) % candidates.length];
    if (removeOneFromPullSource(pick.source, pick.item)) {
      pick.inserter.inserterItem = pick.item;
      pick.inserter.inserterPhase = 'to_target';
      pick.inserter.inserterProgress = 0;
      pick.inserter.status = 'working';
    }
  }
}

export function stepSimulation(
  world: WorldState,
  config: GameConfig = createDefaultConfig(),
  hooks?: SimulationHooks
): SimulationAudioEvent[] {
  const events: SimulationAudioEvent[] = [];

  world.tick += 1;
  const cycleSec = Math.max(10, config.day_cycle_seconds.value);
  world.dayTime = (world.dayTime + DT / cycleSec) % 1.0;
  if (world.rocketTimer > 0) {
    world.rocketTimer = Math.max(0, world.rocketTimer - DT);
  }

  hooks?.onPowerStep?.(world, config, DT);

  // Phase 1: Advance internal belt slots, tunnel travel, inserter arms, miners & crafters
  advanceInternals(world, config, events, hooks);

  // Phase 2A: Order-independent Push resolution
  const pushes = collectPushProposals(world);
  resolveAndCommitPushes(world, pushes, events, hooks);

  // Phase 2B: Order-independent Inserter Pull resolution
  resolveInserterPulls(world);

  hooks?.onTickEnd?.(world);

  return events;
}
