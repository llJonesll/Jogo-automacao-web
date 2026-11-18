/**
 * Tech research, orbital cargo phase progression, telemetry rolling windows, and full world tick driver.
 * Game rules: `design/gdd/factory-systems.md`.
 * Architecture: `docs/architecture/architecture.md` (zero DOM dependencies).
 */
import {
  BUILDINGS,
  DEFAULT_CONFIG,
  ORBITAL_PHASES,
  TECH_BY_ID,
  TECHS,
  TICK_HZ,
  transitionBuildingStatus,
} from '../core/data';
import type {
  BuildingEntity,
  GameConfig,
  ItemId,
  ItemStack,
  OrbitalPhaseDef,
  SimulationAudioEvent,
  TechDef,
  WorldState,
} from '../core/types';
import { stepPower } from './power';
import { type SimulationHooks, stepSimulation } from './simulation';
import { TELEMETRY_BUCKETS, consumeResources, hasResources } from './world';

export const ROCKET_TIMER_SEC = 4.5;
export const LAB_SCIENCE_MULT = 2;

export function recordItemProduced(world: WorldState, item: ItemId, count: number): void {
  const bucket = world.telemetry.buckets[world.telemetry.bucketIndex];
  bucket.produced[item] = (bucket.produced[item] ?? 0) + count;
  world.telemetry.totalsProduced[item] = (world.telemetry.totalsProduced[item] ?? 0) + count;
}

export function recordItemConsumed(world: WorldState, item: ItemId, count: number): void {
  const bucket = world.telemetry.buckets[world.telemetry.bucketIndex];
  bucket.consumed[item] = (bucket.consumed[item] ?? 0) + count;
  world.telemetry.totalsConsumed[item] = (world.telemetry.totalsConsumed[item] ?? 0) + count;
}

export function advanceTelemetryTick(world: WorldState): void {
  world.telemetry.bucketTick += 1;
  if (world.telemetry.bucketTick >= TICK_HZ) {
    world.telemetry.bucketTick = 0;
    world.telemetry.bucketIndex = (world.telemetry.bucketIndex + 1) % TELEMETRY_BUCKETS;
    const bucket = world.telemetry.buckets[world.telemetry.bucketIndex];
    for (const k in bucket.produced) {
      bucket.produced[k as ItemId] = 0;
    }
    for (const k in bucket.consumed) {
      bucket.consumed[k as ItemId] = 0;
    }
  }
}

export function getRollingRates(world: WorldState): {
  producedPerMin: Partial<Record<ItemId, number>>;
  consumedPerMin: Partial<Record<ItemId, number>>;
} {
  const producedPerMin: Partial<Record<ItemId, number>> = {};
  const consumedPerMin: Partial<Record<ItemId, number>> = {};
  const buckets = world.telemetry.buckets;

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    for (const k in bucket.produced) {
      const v = bucket.produced[k as ItemId];
      if (v) {
        const item = k as ItemId;
        producedPerMin[item] = (producedPerMin[item] ?? 0) + v;
      }
    }
    for (const k in bucket.consumed) {
      const v = bucket.consumed[k as ItemId];
      if (v) {
        const item = k as ItemId;
        consumedPerMin[item] = (consumedPerMin[item] ?? 0) + v;
      }
    }
  }

  return { producedPerMin, consumedPerMin };
}

export function getTechById(id: string | null): TechDef | null {
  if (!id) return null;
  return TECH_BY_ID[id] ?? null;
}

function arePrereqsUnlocked(world: WorldState, prereqs: readonly string[]): boolean {
  for (let i = 0; i < prereqs.length; i++) {
    if (!world.unlockedTechs.includes(prereqs[i])) return false;
  }
  return true;
}

export function canStartTech(world: WorldState, techId: string): boolean {
  const tech = getTechById(techId);
  if (!tech) return false;
  if (world.unlockedTechs.includes(techId)) return false;
  return arePrereqsUnlocked(world, tech.prerequisites);
}

function finalizeTechUnlock(
  world: WorldState,
  tech: TechDef,
  events: SimulationAudioEvent[]
): void {
  if (!world.unlockedTechs.includes(tech.id)) {
    world.unlockedTechs.push(tech.id);
  }
  events.push({ kind: 'tech' });
  let nextId: string | null = null;
  for (let i = 0; i < TECHS.length; i++) {
    const candidate = TECHS[i];
    if (
      !world.unlockedTechs.includes(candidate.id) &&
      arePrereqsUnlocked(world, candidate.prerequisites)
    ) {
      nextId = candidate.id;
      break;
    }
  }
  world.activeTechId = nextId;
}

export function unlockTechFromStockpile(
  world: WorldState,
  techId: string,
  events: SimulationAudioEvent[] = []
): boolean {
  if (!canStartTech(world, techId)) return false;
  const tech = getTechById(techId)!;
  const prog = world.techProgress[techId] ?? {};
  const remaining: ItemStack[] = [];
  for (let i = 0; i < tech.cost.length; i++) {
    const c = tech.cost[i];
    const missing = Math.max(0, c.count - (prog[c.item] ?? 0));
    if (missing > 0) remaining.push({ item: c.item, count: missing });
  }

  if (!hasResources(world, remaining)) return false;
  consumeResources(world, remaining);
  for (let i = 0; i < tech.cost.length; i++) {
    const req = tech.cost[i];
    prog[req.item] = req.count;
  }
  world.techProgress[techId] = prog;
  finalizeTechUnlock(world, tech, events);
  return true;
}

/**
 * Advances a Research Lab consuming needed active-tech items at 2x science efficiency.
 */
export function stepResearchLab(
  world: WorldState,
  lab: BuildingEntity,
  satisfaction: number,
  dt: number,
  events: SimulationAudioEvent[],
  config: GameConfig = DEFAULT_CONFIG
): void {
  const tech = getTechById(world.activeTechId);
  if (!tech || !canStartTech(world, tech.id)) {
    transitionBuildingStatus(lab, 'idle');
    return;
  }
  if (satisfaction <= 0.01) {
    transitionBuildingStatus(lab, 'no_power');
    return;
  }

  let prog = world.techProgress[tech.id];
  if (!prog) {
    prog = {};
    world.techProgress[tech.id] = prog;
  }

  let needed: ItemStack | null = null;
  for (let i = 0; i < tech.cost.length; i++) {
    const c = tech.cost[i];
    if ((prog[c.item] ?? 0) < c.count && (lab.inputBuffer[c.item] ?? 0) >= 1) {
      needed = c;
      break;
    }
  }

  if (!needed) {
    transitionBuildingStatus(lab, 'input_starved');
    return;
  }

  const labSpeed = BUILDINGS.research_lab.speed ?? 2.0;
  const rate =
    labSpeed * (1 + lab.geoBonus) * config.craft_speed_mult.value * lab.clock * satisfaction;
  lab.craftProgress += rate * dt;
  transitionBuildingStatus(lab, 'working');

  if (lab.craftProgress >= 1.0) {
    lab.craftProgress -= 1.0;
    lab.inputBuffer[needed.item] = Math.max(0, (lab.inputBuffer[needed.item] ?? 0) - 1);
    recordItemConsumed(world, needed.item, 1);

    // Research Labs grant 2x science efficiency per item
    prog[needed.item] = Math.min(needed.count, (prog[needed.item] ?? 0) + LAB_SCIENCE_MULT);

    let complete = true;
    for (let i = 0; i < tech.cost.length; i++) {
      const c = tech.cost[i];
      if ((prog[c.item] ?? 0) < c.count) {
        complete = false;
        break;
      }
    }
    if (complete) {
      finalizeTechUnlock(world, tech, events);
    }
  }
}

export function getActiveOrbitalPhase(world: WorldState): OrbitalPhaseDef | null {
  return ORBITAL_PHASES[world.phaseIndex] ?? null;
}

function checkPhaseCompletion(world: WorldState, events: SimulationAudioEvent[]): void {
  const phase = getActiveOrbitalPhase(world);
  if (!phase) return;
  for (let i = 0; i < phase.requirements.length; i++) {
    const req = phase.requirements[i];
    if ((world.phaseDelivered[req.item] ?? 0) < req.count) return;
  }

  world.orbitalLaunches += 1;
  world.rocketTimer = ROCKET_TIMER_SEC;
  world.phaseIndex += 1;
  world.phaseDelivered = {};
  events.push({ kind: 'launch' });

  if (world.phaseIndex >= ORBITAL_PHASES.length) {
    world.victoryAchieved = true;
  }
}

export function handleHubDelivery(
  world: WorldState,
  item: ItemId,
  events: SimulationAudioEvent[]
): void {
  const phase = getActiveOrbitalPhase(world);
  if (!phase) return;
  let req: ItemStack | null = null;
  for (let i = 0; i < phase.requirements.length; i++) {
    if (phase.requirements[i].item === item) {
      req = phase.requirements[i];
      break;
    }
  }
  if (!req) return;

  const delivered = world.phaseDelivered[item] ?? 0;
  if (delivered < req.count && (world.stockpile[item] ?? 0) >= 1) {
    world.stockpile[item] = (world.stockpile[item] ?? 0) - 1;
    world.phaseDelivered[item] = delivered + 1;
    checkPhaseCompletion(world, events);
  }
}

export function loadPhaseFromStockpile(
  world: WorldState,
  events: SimulationAudioEvent[] = []
): number {
  const phase = getActiveOrbitalPhase(world);
  if (!phase) return 0;

  let loaded = 0;
  for (let i = 0; i < phase.requirements.length; i++) {
    const req = phase.requirements[i];
    const cur = world.phaseDelivered[req.item] ?? 0;
    const missing = Math.max(0, req.count - cur);
    const avail = world.stockpile[req.item] ?? 0;
    const take = Math.min(missing, avail);
    if (take > 0) {
      world.stockpile[req.item] = avail - take;
      world.phaseDelivered[req.item] = cur + take;
      loaded += take;
    }
  }
  if (loaded > 0) {
    checkPhaseCompletion(world, events);
  }
  return loaded;
}

export const FULL_SIM_HOOKS: SimulationHooks = {
  onPowerStep: stepPower,
  onItemProduced: recordItemProduced,
  onItemConsumed: recordItemConsumed,
  onHubDelivered: handleHubDelivery,
  onResearchLabStep: stepResearchLab,
  onTickEnd: advanceTelemetryTick,
};

/**
 * Advances the complete simulation (power, logistics, extraction, crafting, labs, telemetry) by 1 tick.
 * @example const events = tickWorld(world, config);
 */
export function tickWorld(
  world: WorldState,
  config: GameConfig = DEFAULT_CONFIG
): SimulationAudioEvent[] {
  return stepSimulation(world, config, FULL_SIM_HOOKS);
}
