import { ORBITAL_PHASES, TECHS, TICK_HZ, createDefaultConfig } from '../core/data';
import type {
  BuildingEntity,
  GameConfig,
  ItemId,
  OrbitalPhaseDef,
  SimulationAudioEvent,
  TechDef,
  WorldState,
} from '../core/types';
import { stepPower } from './power';
import { type SimulationHooks, stepSimulation } from './simulation';
import { TELEMETRY_BUCKETS, consumeResources, hasResources } from './world';

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
    world.telemetry.buckets[world.telemetry.bucketIndex] = {
      produced: {},
      consumed: {},
    };
  }
}

export function getRollingRates(world: WorldState): {
  producedPerMin: Partial<Record<ItemId, number>>;
  consumedPerMin: Partial<Record<ItemId, number>>;
} {
  const producedPerMin: Partial<Record<ItemId, number>> = {};
  const consumedPerMin: Partial<Record<ItemId, number>> = {};

  for (const bucket of world.telemetry.buckets) {
    for (const [k, v] of Object.entries(bucket.produced)) {
      if (v) {
        const item = k as ItemId;
        producedPerMin[item] = (producedPerMin[item] ?? 0) + v;
      }
    }
    for (const [k, v] of Object.entries(bucket.consumed)) {
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
  return TECHS.find((t) => t.id === id) ?? null;
}

export function canStartTech(world: WorldState, techId: string): boolean {
  const tech = getTechById(techId);
  if (!tech) return false;
  if (world.unlockedTechs.includes(techId)) return false;
  return tech.prerequisites.every((pre) => world.unlockedTechs.includes(pre));
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
  const next = TECHS.find(
    (t) =>
      !world.unlockedTechs.includes(t.id) &&
      t.prerequisites.every((p) => world.unlockedTechs.includes(p))
  );
  world.activeTechId = next ? next.id : null;
}

export function unlockTechFromStockpile(
  world: WorldState,
  techId: string,
  events: SimulationAudioEvent[] = []
): boolean {
  if (!canStartTech(world, techId)) return false;
  const tech = getTechById(techId)!;
  const prog = world.techProgress[techId] ?? {};
  const remaining = tech.cost
    .map((c) => ({
      item: c.item,
      count: Math.max(0, c.count - (prog[c.item] ?? 0)),
    }))
    .filter((c) => c.count > 0);

  if (!hasResources(world, remaining)) return false;
  consumeResources(world, remaining);
  for (const req of tech.cost) {
    prog[req.item] = req.count;
  }
  world.techProgress[techId] = prog;
  finalizeTechUnlock(world, tech, events);
  return true;
}

export function stepResearchLab(
  world: WorldState,
  lab: BuildingEntity,
  satisfaction: number,
  dt: number,
  events: SimulationAudioEvent[]
): void {
  const tech = getTechById(world.activeTechId);
  if (!tech || !canStartTech(world, tech.id)) {
    lab.status = 'idle';
    return;
  }
  if (satisfaction <= 0.01) {
    lab.status = 'no_power';
    return;
  }

  const prog = (world.techProgress[tech.id] ??= {});
  const needed = tech.cost.find(
    (c) => (prog[c.item] ?? 0) < c.count && (lab.inputBuffer[c.item] ?? 0) >= 1
  );

  if (!needed) {
    lab.status = 'input_starved';
    return;
  }

  lab.craftProgress += 2.0 * lab.clock * satisfaction * dt;
  lab.status = 'working';

  if (lab.craftProgress >= 1.0) {
    lab.craftProgress -= 1.0;
    lab.inputBuffer[needed.item] = (lab.inputBuffer[needed.item] ?? 0) - 1;
    if (lab.inputBuffer[needed.item] === 0) delete lab.inputBuffer[needed.item];
    recordItemConsumed(world, needed.item, 1);

    // Research Labs grant 2x science efficiency per item
    prog[needed.item] = Math.min(needed.count, (prog[needed.item] ?? 0) + 2);

    const complete = tech.cost.every((c) => (prog[c.item] ?? 0) >= c.count);
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
  const done = phase.requirements.every(
    (req) => (world.phaseDelivered[req.item] ?? 0) >= req.count
  );
  if (!done) return;

  world.orbitalLaunches += 1;
  world.rocketTimer = 4.5;
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
  const req = phase.requirements.find((r) => r.item === item);
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
  for (const req of phase.requirements) {
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

export function tickWorld(
  world: WorldState,
  config: GameConfig = createDefaultConfig()
): SimulationAudioEvent[] {
  return stepSimulation(world, config, FULL_SIM_HOOKS);
}
