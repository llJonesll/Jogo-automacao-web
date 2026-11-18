/**
 * Power grid simulation: generation, overclock demand scaling, accumulator storage, and brownout satisfaction.
 * Game rules: `design/gdd/factory-systems.md`.
 * Architecture: `docs/architecture/architecture.md` (zero DOM dependencies).
 */
import {
  BUILDINGS,
  ITEMS,
  isProcessorType,
  transitionBuildingStatus,
} from '../core/data';
import type { BuildingEntity, GameConfig, ItemId, WorldState } from '../core/types';
import { getWorldBuildingLists } from './world';

export const SOLAR_DAY_FRACTION = 0.7;
export const IDLE_POWER_FRACTION = 0.05;
export const OVERCLOCK_EXPONENT = 1.6;
export const SOLAR_ACTIVE_THRESHOLD = 0.02;
const DEFAULT_ACC_CAPACITY_MJ = 180;
const DEFAULT_ACC_RATE_MW = 15;

/**
 * Computes normalized solar irradiance in `[0, 1]` for a given `dayTime` in `[0, 1)`.
 * @example computeSolarFactor(0.35) // ~1.0 (midday peak)
 */
export function computeSolarFactor(dayTime: number): number {
  if (dayTime < 0 || dayTime >= SOLAR_DAY_FRACTION) return 0;
  return Math.sin(Math.PI * (dayTime / SOLAR_DAY_FRACTION));
}

/**
 * Computes power draw in MW using non-linear `clock^1.6` scaling when active, or 5% idle standby.
 * @example computeOverclockPower(3, 2.0, true) // ~9.094 MW
 */
export function computeOverclockPower(baseMw: number, clock: number, isActive: boolean): number {
  if (baseMw <= 0) return 0;
  if (!isActive) return baseMw * IDLE_POWER_FRACTION;
  return baseMw * Math.pow(Math.max(0.5, clock), OVERCLOCK_EXPONENT);
}

function isAttemptingWork(b: BuildingEntity): boolean {
  if (b.type === 'miner_mk1' || b.type === 'miner_mk2') {
    return b.status !== 'no_resource' && b.status !== 'output_full';
  }
  if (isProcessorType(b.type)) {
    return b.craftProgress > 0 || b.status === 'working' || b.status === 'no_power';
  }
  if (b.type === 'inserter') {
    return b.inserterItem !== null || b.inserterProgress > 0 || b.status === 'working';
  }
  if (b.type === 'research_lab') {
    return b.status === 'working' || b.status === 'no_power';
  }
  return false;
}

function consumeGeneratorFuel(b: BuildingEntity, generatesMw: number, fallbackSec: number): number {
  for (const k in b.inputBuffer) {
    const item = k as ItemId;
    const count = b.inputBuffer[item] ?? 0;
    if (count < 1) continue;
    const def = ITEMS[item];
    if (!def || def.fuel_value <= 0) continue;
    b.inputBuffer[item] = count - 1;
    return generatesMw > 0 ? def.fuel_value / generatesMw : fallbackSec;
  }
  return 0;
}

/**
 * Evaluates grid supply, demand, accumulator charge/discharge, and updates `world.power` in place.
 */
export function stepPower(world: WorldState, config: GameConfig, dt: number): void {
  const powerMult = config.power_output_mult.value;
  const solarFactor = computeSolarFactor(world.dayTime);
  const lists = getWorldBuildingLists(world);
  const nodes = lists.powerNodes;
  const accumulators = lists.accumulators;

  let generatedMw = 0;
  let demandedMw = 0;
  let storedMj = 0;
  let capacityMj = 0;
  let maxRateMw = 0;

  for (let i = 0; i < nodes.length; i++) {
    const b = nodes[i];
    const def = BUILDINGS[b.type];
    if (!def) continue;

    if (b.type === 'orbital_hub') {
      const gen = def.generates_mw * powerMult;
      generatedMw += gen;
      b.activePowerMw = gen;
      transitionBuildingStatus(b, 'working');
      continue;
    }

    if (b.type === 'solar_panel') {
      const gen = def.generates_mw * solarFactor * powerMult;
      generatedMw += gen;
      b.activePowerMw = gen;
      transitionBuildingStatus(b, solarFactor > SOLAR_ACTIVE_THRESHOLD ? 'working' : 'idle');
      continue;
    }

    if (b.type === 'geothermal_plant') {
      const onVent = world.resources[b.y * world.size + b.x] === 'geothermal_vent';
      if (onVent) {
        const gen = def.generates_mw * powerMult;
        generatedMw += gen;
        b.activePowerMw = gen;
        transitionBuildingStatus(b, 'working');
      } else {
        b.activePowerMw = 0;
        transitionBuildingStatus(b, 'no_resource');
      }
      continue;
    }

    if (b.type === 'coal_generator') {
      if (b.fuelTimer > 0) {
        b.fuelTimer = Math.max(0, b.fuelTimer - dt);
        if (b.fuelTimer < 1e-6) b.fuelTimer = 0;
      }
      if (b.fuelTimer <= 0) {
        const burnSec = consumeGeneratorFuel(
          b,
          def.generates_mw,
          def.fuel_burn_seconds ?? 4.0
        );
        if (burnSec > 0) {
          b.fuelTimer += burnSec;
        }
      }
      if (b.fuelTimer > 0) {
        const gen = def.generates_mw * powerMult;
        generatedMw += gen;
        b.activePowerMw = gen;
        transitionBuildingStatus(b, 'working');
      } else {
        b.activePowerMw = 0;
        transitionBuildingStatus(b, 'input_starved');
      }
      continue;
    }

    if (b.type === 'accumulator') {
      const cap = def.energy_capacity_mj ?? DEFAULT_ACC_CAPACITY_MJ;
      const rate = def.charge_rate_mw ?? DEFAULT_ACC_RATE_MW;
      b.energyMj = Math.max(0, Math.min(cap, b.energyMj));
      storedMj += b.energyMj;
      capacityMj += cap;
      maxRateMw += rate;
      continue;
    }

    if (def.power_mw > 0) {
      const draw = computeOverclockPower(def.power_mw, b.clock, isAttemptingWork(b));
      demandedMw += draw;
      b.activePowerMw = draw;
    }
  }

  const netMw = generatedMw - demandedMw;
  let satisfaction = 1.0;

  if (netMw >= 0) {
    if (accumulators.length > 0 && storedMj < capacityMj && netMw > 0) {
      const chargeMw = Math.min(netMw, maxRateMw);
      const maxAddMj = chargeMw * dt;
      const roomTotal = capacityMj - storedMj;
      const actualAddMj = Math.min(maxAddMj, roomTotal);
      const accCap = BUILDINGS.accumulator.energy_capacity_mj ?? DEFAULT_ACC_CAPACITY_MJ;
      for (let i = 0; i < accumulators.length; i++) {
        const acc = accumulators[i];
        const share = roomTotal > 0 ? (accCap - acc.energyMj) / roomTotal : 0;
        acc.energyMj = Math.min(accCap, acc.energyMj + actualAddMj * share);
        transitionBuildingStatus(acc, actualAddMj > 0.0001 ? 'working' : 'idle');
      }
      storedMj += actualAddMj;
    } else {
      for (let i = 0; i < accumulators.length; i++) {
        transitionBuildingStatus(accumulators[i], 'idle');
      }
    }
    satisfaction = 1.0;
  } else {
    const deficitMw = -netMw;
    let dischargedMw = 0;
    if (accumulators.length > 0 && storedMj > 0) {
      const desiredMj = Math.min(deficitMw, maxRateMw) * dt;
      const actualDrainMj = Math.min(desiredMj, storedMj);
      const oldStored = storedMj;
      for (let i = 0; i < accumulators.length; i++) {
        const acc = accumulators[i];
        const share = oldStored > 0 ? acc.energyMj / oldStored : 0;
        acc.energyMj = Math.max(0, acc.energyMj - actualDrainMj * share);
        transitionBuildingStatus(acc, actualDrainMj > 0.0001 ? 'working' : 'idle');
      }
      storedMj -= actualDrainMj;
      dischargedMw = dt > 0 ? actualDrainMj / dt : 0;
    }
    satisfaction = demandedMw > 0 ? Math.min(1.0, (generatedMw + dischargedMw) / demandedMw) : 1.0;
  }

  const pwr = world.power;
  pwr.generatedMw = generatedMw;
  pwr.demandedMw = demandedMw;
  pwr.storedMj = storedMj;
  pwr.capacityMj = capacityMj;
  pwr.netMw = netMw;
  pwr.satisfaction = satisfaction;
  pwr.solarFactor = solarFactor;
}
