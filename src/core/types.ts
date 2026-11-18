export type Direction = 0 | 1 | 2 | 3; // 0: North, 1: East, 2: South, 3: West

export type ItemId =
  | 'iron_ore'
  | 'copper_ore'
  | 'coal'
  | 'stone'
  | 'quartz'
  | 'iron_ingot'
  | 'copper_ingot'
  | 'concrete'
  | 'glass_crystal'
  | 'steel_beam'
  | 'silicon_wafer'
  | 'iron_plate'
  | 'iron_gear'
  | 'copper_wire'
  | 'circuit'
  | 'rotor'
  | 'modular_frame'
  | 'processor'
  | 'quantum_core';

export type BuildingId =
  | 'belt_mk1'
  | 'belt_mk2'
  | 'belt_mk3'
  | 'tunnel'
  | 'splitter'
  | 'merger'
  | 'inserter'
  | 'storage'
  | 'miner_mk1'
  | 'miner_mk2'
  | 'smelter'
  | 'constructor'
  | 'foundry'
  | 'assembler'
  | 'coal_generator'
  | 'solar_panel'
  | 'accumulator'
  | 'geothermal_plant'
  | 'research_lab'
  | 'orbital_hub';

export type ResourceType =
  | 'none'
  | 'iron_ore'
  | 'copper_ore'
  | 'coal'
  | 'stone'
  | 'quartz'
  | 'geothermal_vent';

export type BuildingStatus =
  | 'working'
  | 'idle'
  | 'no_power'
  | 'input_starved'
  | 'output_full'
  | 'no_resource'
  | 'unpaired';

export interface ItemStack {
  item: ItemId;
  count: number;
}

export interface ItemDef {
  id: ItemId;
  category: 'raw' | 'refined' | 'manufactured';
  tier: number;
  color: string;
  accent: string;
  fuel_value: number;
}

export interface RecipeDef {
  id: string;
  building: 'smelter' | 'constructor' | 'foundry' | 'assembler';
  required_tech?: string;
  inputs: ItemStack[];
  outputs: ItemStack[];
  duration: number;
}

export interface BuildingDef {
  id: BuildingId;
  category: 'logistics' | 'extraction' | 'production' | 'power' | 'special';
  size: number;
  tier: number;
  speed?: number;
  max_span?: number;
  capacity?: number;
  power_mw: number;
  generates_mw: number;
  energy_capacity_mj?: number;
  charge_rate_mw?: number;
  fuel_burn_seconds?: number;
  requires_resource?: 'ore' | 'geothermal_vent';
  cost: ItemStack[];
}

export interface TechDef {
  id: string;
  tier: number;
  prerequisites: string[];
  cost: ItemStack[];
  unlocks_buildings: BuildingId[];
  unlocks_features: string[];
}

export interface OrbitalPhaseDef {
  phase: number;
  id: string;
  requirements: ItemStack[];
}

export interface ConfigKnob {
  value: number;
  min: number;
  max: number;
  step: number;
  description: string;
}

export type GameConfig = Record<
  | 'seed'
  | 'mining_speed_mult'
  | 'belt_speed_mult'
  | 'craft_speed_mult'
  | 'power_output_mult'
  | 'day_cycle_seconds'
  | 'free_build',
  ConfigKnob
>;

export interface BeltSlot {
  item: ItemId;
  progress: number;
  sourceDir?: Direction;
}

export interface TunnelItem {
  item: ItemId;
  progress: number;
}

export interface BuildingEntity {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  dir: Direction;
  slots: BeltSlot[];
  tunnelMode?: 'entrance' | 'exit';
  pairedId?: number;
  tunnelQueue: TunnelItem[];
  splitterIndex: number;
  mergerIndex: number;
  inserterItem: ItemId | null;
  inserterProgress: number;
  inserterPhase: 'to_source' | 'to_target';
  recipeId: string;
  lockedRecipeId: string | null;
  craftProgress: number;
  clock: number;
  inputBuffer: Partial<Record<ItemId, number>>;
  outputBuffer: ItemStack | null;
  inventory: Partial<Record<ItemId, number>>;
  energyMj: number;
  fuelTimer: number;
  status: BuildingStatus;
  activePowerMw: number;
  geoBonus: number;
}

export interface PowerStats {
  generatedMw: number;
  demandedMw: number;
  storedMj: number;
  capacityMj: number;
  netMw: number;
  satisfaction: number;
  solarFactor: number;
}

export interface TelemetryBucket {
  produced: Partial<Record<ItemId, number>>;
  consumed: Partial<Record<ItemId, number>>;
}

export interface TelemetryState {
  buckets: TelemetryBucket[];
  bucketIndex: number;
  bucketTick: number;
  totalsProduced: Partial<Record<ItemId, number>>;
  totalsConsumed: Partial<Record<ItemId, number>>;
}

export interface BlueprintEntry {
  dx: number;
  dy: number;
  type: BuildingId;
  dir: Direction;
  recipeId?: string;
  clock?: number;
}

export interface BlueprintData {
  name: string;
  width: number;
  height: number;
  entries: BlueprintEntry[];
}

export interface SimulationAudioEvent {
  kind: 'launch' | 'tech';
}

export interface WorldState {
  version: number;
  seed: number;
  size: number;
  tick: number;
  dayTime: number;
  nextEntityId: number;
  resources: ResourceType[];
  grid: number[]; // 0 = empty, >0 = BuildingEntity.id
  buildings: Record<number, BuildingEntity>;
  stockpile: Partial<Record<ItemId, number>>;
  unlockedTechs: string[];
  activeTechId: string | null;
  techProgress: Record<string, Partial<Record<ItemId, number>>>;
  phaseIndex: number;
  phaseDelivered: Partial<Record<ItemId, number>>;
  orbitalLaunches: number;
  victoryAchieved: boolean;
  victoryDismissed: boolean;
  power: PowerStats;
  telemetry: TelemetryState;
  manualMineCount: number;
  rocketTimer: number;
}
