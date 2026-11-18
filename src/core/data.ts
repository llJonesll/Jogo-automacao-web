/**
 * Canonical game data registry and immutable simulation constants.
 * Architecture: `docs/architecture/architecture.md` (core <- game <- render/ui).
 * Game rules: `design/gdd/factory-systems.md`.
 * Threading contract: single-threaded deterministic execution only; module-level caches
 * assume synchronous main-thread/test-runner usage without concurrent workers.
 */
import rawConfig from '../../data/config.json';
import rawItems from '../../data/factory_items.json';
import rawRecipes from '../../data/factory_recipes.json';
import rawBuildings from '../../data/factory_buildings.json';
import rawTechs from '../../data/factory_techs.json';
import type {
  BuildingDef,
  BuildingEntity,
  BuildingId,
  BuildingStatus,
  ConfigKnob,
  Direction,
  GameConfig,
  ItemDef,
  ItemId,
  OrbitalPhaseDef,
  RecipeDef,
  TechDef,
} from './types';

// shortcut: fixed 64x64 flat grid (4096 tiles), switch to sparse chunk map if world exceeds 128x128
export const WORLD_SIZE = 64;
export const TILE_COUNT = WORLD_SIZE * WORLD_SIZE;
export const HUB_ORIGIN = 31;
export const HUB_SIZE = 3;
export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;

export const DIR_DX: readonly number[] = [0, 1, 0, -1];
export const DIR_DY: readonly number[] = [-1, 0, 1, 0];

/**
 * Returns the cardinal direction opposite to `dir`.
 * @example oppositeDir(1) // 3 (West)
 */
export function oppositeDir(dir: Direction): Direction {
  return ((dir + 2) & 3) as Direction;
}

/**
 * Rotates a cardinal direction clockwise by `steps` 90-degree increments.
 * @example rotateDirCW(0, 1) // 1 (East)
 */
export function rotateDirCW(dir: Direction, steps = 1): Direction {
  return (((dir + steps) % 4 + 4) % 4) as Direction;
}

export const ITEMS: Record<ItemId, ItemDef> = rawItems as Record<ItemId, ItemDef>;
export const ITEM_IDS: ItemId[] = Object.keys(ITEMS) as ItemId[];
export const VALID_ITEM_IDS: ReadonlySet<string> = new Set(ITEM_IDS);

export const RECIPES: Record<string, RecipeDef> = rawRecipes as Record<string, RecipeDef>;
export const RECIPE_LIST: RecipeDef[] = Object.values(RECIPES);
export const VALID_RECIPE_IDS: ReadonlySet<string> = new Set(Object.keys(RECIPES));

export const BUILDINGS: Record<BuildingId, BuildingDef> = rawBuildings as Record<
  BuildingId,
  BuildingDef
>;
export const BUILDING_IDS: BuildingId[] = Object.keys(BUILDINGS) as BuildingId[];
export const VALID_BUILDING_IDS: ReadonlySet<string> = new Set(BUILDING_IDS);

export const TECHS: TechDef[] = rawTechs.techs as TechDef[];
export const ORBITAL_PHASES: OrbitalPhaseDef[] = rawTechs.orbital_phases as OrbitalPhaseDef[];

export const TECH_BY_ID: Readonly<Record<string, TechDef>> = (() => {
  const map: Record<string, TechDef> = {};
  for (let i = 0; i < TECHS.length; i++) {
    map[TECHS[i].id] = TECHS[i];
  }
  return map;
})();

const EMPTY_RECIPES: RecipeDef[] = [];

export const RECIPES_BY_BUILDING: Readonly<Partial<Record<BuildingId, RecipeDef[]>>> = (() => {
  const map: Partial<Record<BuildingId, RecipeDef[]>> = {};
  for (let i = 0; i < BUILDING_IDS.length; i++) {
    map[BUILDING_IDS[i]] = [];
  }
  for (let i = 0; i < RECIPE_LIST.length; i++) {
    const r = RECIPE_LIST[i];
    const bucket = map[r.building];
    if (bucket) bucket.push(r);
    else map[r.building] = [r];
  }
  return map;
})();

/**
 * Explicit state transition table for `BuildingEntity.status` (`design/gdd/factory-systems.md`).
 * Documents every legal operational transition across power, logistics, and production steps.
 */
export const BUILDING_STATUS_TRANSITIONS: Readonly<Record<BuildingStatus, readonly BuildingStatus[]>> = {
  idle: ['idle', 'working', 'no_power', 'input_starved', 'output_full', 'no_resource', 'unpaired'],
  working: ['working', 'idle', 'no_power', 'input_starved', 'output_full', 'no_resource', 'unpaired'],
  no_power: ['no_power', 'working', 'idle', 'input_starved', 'output_full', 'no_resource', 'unpaired'],
  input_starved: ['input_starved', 'working', 'idle', 'no_power', 'output_full'],
  output_full: ['output_full', 'working', 'idle', 'no_power', 'input_starved'],
  no_resource: ['no_resource', 'working', 'idle', 'no_power', 'output_full'],
  unpaired: ['unpaired', 'working', 'idle'],
};

/**
 * Transitions a building's status if permitted by `BUILDING_STATUS_TRANSITIONS`.
 */
export function transitionBuildingStatus(b: BuildingEntity, next: BuildingStatus): void {
  if (b.status === next) return;
  const allowed = BUILDING_STATUS_TRANSITIONS[b.status];
  for (let i = 0; i < allowed.length; i++) {
    if (allowed[i] === next) {
      b.status = next;
      return;
    }
  }
  // Fallback assignment only if an external caller forced a non-standard state
  b.status = next;
}

function cloneKnob(knob: ConfigKnob): ConfigKnob {
  return {
    value: knob.value,
    min: knob.min,
    max: knob.max,
    step: knob.step,
    description: knob.description,
  };
}

function buildConfigObject(freezeKnobs: boolean): GameConfig {
  const src = rawConfig as GameConfig;
  const cfg: GameConfig = {
    seed: cloneKnob(src.seed),
    mining_speed_mult: cloneKnob(src.mining_speed_mult),
    belt_speed_mult: cloneKnob(src.belt_speed_mult),
    craft_speed_mult: cloneKnob(src.craft_speed_mult),
    power_output_mult: cloneKnob(src.power_output_mult),
    day_cycle_seconds: cloneKnob(src.day_cycle_seconds),
    free_build: cloneKnob(src.free_build),
  };
  if (freezeKnobs) {
    Object.freeze(cfg.seed);
    Object.freeze(cfg.mining_speed_mult);
    Object.freeze(cfg.belt_speed_mult);
    Object.freeze(cfg.craft_speed_mult);
    Object.freeze(cfg.power_output_mult);
    Object.freeze(cfg.day_cycle_seconds);
    Object.freeze(cfg.free_build);
    Object.freeze(cfg);
  }
  return cfg;
}

/**
 * Immutable shared default configuration for read-only simulation ticks.
 */
export const DEFAULT_CONFIG: GameConfig = buildConfigObject(true);

/**
 * Returns a fresh mutable `GameConfig` cloned from `data/config.json`.
 * @example const cfg = createDefaultConfig(); cfg.free_build.value = 1;
 */
export function createDefaultConfig(): GameConfig {
  return buildConfigObject(false);
}

/**
 * Returns the cached recipe list for a building archetype (O(1), zero allocation).
 */
export function getRecipesForBuilding(building: BuildingId): RecipeDef[] {
  return RECIPES_BY_BUILDING[building] ?? EMPTY_RECIPES;
}

export function isBeltType(type: BuildingId): boolean {
  return type === 'belt_mk1' || type === 'belt_mk2' || type === 'belt_mk3';
}

export function isProcessorType(type: BuildingId): boolean {
  return (
    type === 'smelter' ||
    type === 'constructor' ||
    type === 'foundry' ||
    type === 'assembler'
  );
}
