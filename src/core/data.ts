import rawConfig from '../../data/config.json';
import rawItems from '../../data/factory_items.json';
import rawRecipes from '../../data/factory_recipes.json';
import rawBuildings from '../../data/factory_buildings.json';
import rawTechs from '../../data/factory_techs.json';
import type {
  BuildingDef,
  BuildingId,
  Direction,
  GameConfig,
  ItemDef,
  ItemId,
  OrbitalPhaseDef,
  RecipeDef,
  TechDef,
} from './types';

export const WORLD_SIZE = 64;
export const HUB_ORIGIN = 31;
export const HUB_SIZE = 3;
export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;

export const DIR_DX: readonly number[] = [0, 1, 0, -1];
export const DIR_DY: readonly number[] = [-1, 0, 1, 0];

export function oppositeDir(dir: Direction): Direction {
  return ((dir + 2) & 3) as Direction;
}

export function rotateDirCW(dir: Direction, steps = 1): Direction {
  return (((dir + steps) % 4 + 4) % 4) as Direction;
}

export const ITEMS: Record<ItemId, ItemDef> = rawItems as Record<ItemId, ItemDef>;
export const ITEM_IDS: ItemId[] = Object.keys(ITEMS) as ItemId[];

export const RECIPES: Record<string, RecipeDef> = rawRecipes as Record<string, RecipeDef>;
export const RECIPE_LIST: RecipeDef[] = Object.values(RECIPES);

export const BUILDINGS: Record<BuildingId, BuildingDef> = rawBuildings as Record<
  BuildingId,
  BuildingDef
>;
export const BUILDING_IDS: BuildingId[] = Object.keys(BUILDINGS) as BuildingId[];

export const TECHS: TechDef[] = rawTechs.techs as TechDef[];
export const ORBITAL_PHASES: OrbitalPhaseDef[] = rawTechs.orbital_phases as OrbitalPhaseDef[];

export function createDefaultConfig(): GameConfig {
  return JSON.parse(JSON.stringify(rawConfig)) as GameConfig;
}

export function getRecipesForBuilding(building: BuildingId): RecipeDef[] {
  return RECIPE_LIST.filter((r) => r.building === building);
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
