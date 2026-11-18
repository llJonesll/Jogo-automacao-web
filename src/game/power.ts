import { BUILDINGS, isProcessorType } from '../core/data';
import type { BuildingEntity, GameConfig, WorldState } from '../core/types';

export function computeSolarFactor(dayTime: number): number {
  if (dayTime < 0 || dayTime >= 0.7) return 0;
  return Math.sin(Math.PI * (dayTime / 0.7));
}

export function computeOverclockPower(baseMw: number, clock: number, isActive: boolean): number {
  if (baseMw <= 0) return 0;
  if (!isActive) return baseMw * 0.05;
  return baseMw * Math.pow(Math.max(0.5, clock), 1.6);
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

export function stepPower(world: WorldState, config: GameConfig, dt: number): void {
  const powerMult = config.power_output_mult.value;
  const solarFactor = computeSolarFactor(world.dayTime);

  let generatedMw = 0;
  let demandedMw = 0;
  let storedMj = 0;
  let capacityMj = 0;
  let maxRateMw = 0;
  const accumulators: BuildingEntity[] = [];

  for (const b of Object.values(world.buildings)) {
    const def = BUILDINGS[b.type];
    if (!def) continue;

    if (b.type === 'orbital_hub') {
      const gen = def.generates_mw * powerMult;
      generatedMw += gen;
      b.activePowerMw = gen;
      b.status = 'working';
      continue;
    }

    if (b.type === 'solar_panel') {
      const gen = def.generates_mw * solarFactor * powerMult;
      generatedMw += gen;
      b.activePowerMw = gen;
      b.status = solarFactor > 0.02 ? 'working' : 'idle';
      continue;
    }

    if (b.type === 'geothermal_plant') {
      const onVent = world.resources[b.y * world.size + b.x] === 'geothermal_vent';
      if (onVent) {
        const gen = def.generates_mw * powerMult;
        generatedMw += gen;
        b.activePowerMw = gen;
        b.status = 'working';
      } else {
        b.activePowerMw = 0;
        b.status = 'no_resource';
      }
      continue;
    }

    if (b.type === 'coal_generator') {
      const burnSec = def.fuel_burn_seconds ?? 4.0;
      if (b.fuelTimer > 0) {
        b.fuelTimer = Math.max(0, b.fuelTimer - dt);
      }
      if (b.fuelTimer <= 0 && (b.inputBuffer.coal ?? 0) >= 1) {
        b.inputBuffer.coal = (b.inputBuffer.coal ?? 0) - 1;
        if (b.inputBuffer.coal <= 0) delete b.inputBuffer.coal;
        b.fuelTimer += burnSec;
      }
      if (b.fuelTimer > 0) {
        const gen = def.generates_mw * powerMult;
        generatedMw += gen;
        b.activePowerMw = gen;
        b.status = 'working';
      } else {
        b.activePowerMw = 0;
        b.status = 'input_starved';
      }
      continue;
    }

    if (b.type === 'accumulator') {
      const cap = def.energy_capacity_mj ?? 120;
      const rate = def.charge_rate_mw ?? 10;
      b.energyMj = Math.max(0, Math.min(cap, b.energyMj));
      storedMj += b.energyMj;
      capacityMj += cap;
      maxRateMw += rate;
      accumulators.push(b);
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
      for (const acc of accumulators) {
        const cap = BUILDINGS.accumulator.energy_capacity_mj ?? 120;
        const share = roomTotal > 0 ? (cap - acc.energyMj) / roomTotal : 0;
        acc.energyMj = Math.min(cap, acc.energyMj + actualAddMj * share);
        acc.status = actualAddMj > 0.0001 ? 'working' : 'idle';
      }
      storedMj += actualAddMj;
    } else {
      for (const acc of accumulators) acc.status = 'idle';
    }
    satisfaction = 1.0;
  } else {
    const deficitMw = -netMw;
    let dischargedMw = 0;
    if (accumulators.length > 0 && storedMj > 0) {
      const desiredMj = Math.min(deficitMw, maxRateMw) * dt;
      const actualDrainMj = Math.min(desiredMj, storedMj);
      const oldStored = storedMj;
      for (const acc of accumulators) {
        const share = oldStored > 0 ? acc.energyMj / oldStored : 0;
        acc.energyMj = Math.max(0, acc.energyMj - actualDrainMj * share);
        acc.status = actualDrainMj > 0.0001 ? 'working' : 'idle';
      }
      storedMj -= actualDrainMj;
      dischargedMw = dt > 0 ? actualDrainMj / dt : 0;
    }
    satisfaction = demandedMw > 0 ? Math.min(1.0, (generatedMw + dischargedMw) / demandedMw) : 1.0;
  }

  world.power = {
    generatedMw,
    demandedMw,
    storedMj,
    capacityMj,
    netMw,
    satisfaction,
    solarFactor,
  };
}
