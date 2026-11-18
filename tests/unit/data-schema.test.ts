import { describe, expect, it } from 'vitest';
import rawConfig from '../../data/config.json';
import rawBuildings from '../../data/factory_buildings.json';
import rawItems from '../../data/factory_items.json';
import rawRecipes from '../../data/factory_recipes.json';
import rawTechs from '../../data/factory_techs.json';
import configSchema from '../../data/schemas/config.schema.json';
import buildingsSchema from '../../data/schemas/factory_buildings.schema.json';
import itemsSchema from '../../data/schemas/factory_items.schema.json';
import recipesSchema from '../../data/schemas/factory_recipes.schema.json';
import techsSchema from '../../data/schemas/factory_techs.schema.json';
import {
  BUILDING_IDS,
  BUILDING_STATUS_TRANSITIONS,
  BUILDINGS,
  DEFAULT_CONFIG,
  HUB_ORIGIN,
  HUB_SIZE,
  ITEM_IDS,
  ITEMS,
  ORBITAL_PHASES,
  RECIPES,
  RECIPES_BY_BUILDING,
  RECIPE_LIST,
  TECH_BY_ID,
  TECHS,
  createDefaultConfig,
  isProcessorType,
} from '../../src/core/data';
import type { BuildingStatus, ItemId } from '../../src/core/types';
import { createWorld, isHubTile, tileIndex } from '../../src/game/world';
import { getBundle } from '../../src/ui/i18n';

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;
const ALL_STATUSES: readonly BuildingStatus[] = [
  'working',
  'idle',
  'no_power',
  'input_starved',
  'output_full',
  'no_resource',
  'unpaired',
];
const ACTIVE_FEATURE_GATES = new Set(['overclock', 'quantum_recipes', 'orbital_overdrive']);

type JsonSchemaNode = {
  $ref?: string;
  $defs?: Record<string, JsonSchemaNode>;
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaNode>;
  patternProperties?: Record<string, JsonSchemaNode>;
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  minItems?: number;
  minProperties?: number;
  items?: JsonSchemaNode;
};

function resolveRef(root: JsonSchemaNode, ref: string): JsonSchemaNode {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix) || !root.$defs) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }
  const key = ref.slice(prefix.length);
  const target = root.$defs[key];
  if (!target) {
    throw new Error(`Missing schema $def: ${key}`);
  }
  return target;
}

function assertMatchesJsonSchema(
  value: unknown,
  node: JsonSchemaNode,
  root: JsonSchemaNode,
  path = '$'
): void {
  if (node.$ref) {
    assertMatchesJsonSchema(value, resolveRef(root, node.$ref), root, path);
    return;
  }

  if (node.enum) {
    expect(node.enum, `${path} enum`).toContain(value);
  }

  if (node.type === 'object') {
    expect(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} object`).toBe(
      true
    );
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (node.minProperties !== undefined) {
      expect(keys.length, `${path} minProperties`).toBeGreaterThanOrEqual(node.minProperties);
    }
    if (node.required) {
      for (const req of node.required) {
        expect(Object.prototype.hasOwnProperty.call(obj, req), `${path}.${req} required`).toBe(
          true
        );
      }
    }
    const patternEntries = node.patternProperties
      ? Object.entries(node.patternProperties).map(([pat, sub]) => [new RegExp(pat), sub] as const)
      : [];
    for (const k of keys) {
      const propSchema = node.properties?.[k];
      if (propSchema) {
        assertMatchesJsonSchema(obj[k], propSchema, root, `${path}.${k}`);
        continue;
      }
      let matchedPattern = false;
      for (const [re, sub] of patternEntries) {
        if (re.test(k)) {
          matchedPattern = true;
          assertMatchesJsonSchema(obj[k], sub, root, `${path}.${k}`);
        }
      }
      if (!matchedPattern && node.additionalProperties === false) {
        throw new Error(`Unexpected additional property ${path}.${k}`);
      }
    }
  } else if (node.type === 'array') {
    expect(Array.isArray(value), `${path} array`).toBe(true);
    const arr = value as unknown[];
    if (node.minItems !== undefined) {
      expect(arr.length, `${path} minItems`).toBeGreaterThanOrEqual(node.minItems);
    }
    if (node.items) {
      for (let i = 0; i < arr.length; i++) {
        assertMatchesJsonSchema(arr[i], node.items, root, `${path}[${i}]`);
      }
    }
  } else if (node.type === 'string') {
    expect(typeof value, `${path} string`).toBe('string');
    const str = value as string;
    if (node.minLength !== undefined) {
      expect(str.length, `${path} minLength`).toBeGreaterThanOrEqual(node.minLength);
    }
    if (node.pattern) {
      expect(str, `${path} pattern`).toMatch(new RegExp(node.pattern));
    }
  } else if (node.type === 'integer') {
    expect(typeof value === 'number' && Number.isInteger(value), `${path} integer`).toBe(true);
    const num = value as number;
    if (node.minimum !== undefined) expect(num, `${path} min`).toBeGreaterThanOrEqual(node.minimum);
    if (node.maximum !== undefined) expect(num, `${path} max`).toBeLessThanOrEqual(node.maximum);
  } else if (node.type === 'number') {
    expect(typeof value === 'number' && Number.isFinite(value), `${path} number`).toBe(true);
    const num = value as number;
    if (node.minimum !== undefined) expect(num, `${path} min`).toBeGreaterThanOrEqual(node.minimum);
    if (node.maximum !== undefined) expect(num, `${path} max`).toBeLessThanOrEqual(node.maximum);
    if (node.exclusiveMinimum !== undefined) {
      expect(num, `${path} exclusiveMin`).toBeGreaterThan(node.exclusiveMinimum);
    }
  } else if (node.type === 'boolean') {
    expect(typeof value, `${path} boolean`).toBe('boolean');
  }
}

describe('data schemas, zero-orphan invariants, tech DAG, i18n parity, and worldgen', () => {
  it('enforces snake_case keys and valid config knob bounds across all data/*.json', () => {
    for (const [k, knob] of Object.entries(rawConfig)) {
      expect(k).toMatch(SNAKE_CASE_RE);
      expect(typeof knob.value).toBe('number');
      expect(typeof knob.min).toBe('number');
      expect(typeof knob.max).toBe('number');
      expect(typeof knob.step).toBe('number');
      expect(knob.step).toBeGreaterThan(0);
      expect(knob.value).toBeGreaterThanOrEqual(knob.min);
      expect(knob.value).toBeLessThanOrEqual(knob.max);
      expect(typeof knob.description).toBe('string');
      expect(knob.description.length).toBeGreaterThan(5);
    }

    for (const [k, def] of Object.entries(rawItems)) {
      expect(k).toMatch(SNAKE_CASE_RE);
      expect(def.id).toBe(k);
    }
    for (const [k, def] of Object.entries(rawBuildings)) {
      expect(k).toMatch(SNAKE_CASE_RE);
      expect(def.id).toBe(k);
    }
    for (const [k, def] of Object.entries(rawRecipes)) {
      expect(k).toMatch(SNAKE_CASE_RE);
      expect(def.id).toBe(k);
    }
    for (const k of Object.keys(rawTechs)) {
      expect(k).toMatch(SNAKE_CASE_RE);
    }
    expect(rawTechs.schema_version).toBe(1);

    // DEFAULT_CONFIG is frozen and independent from createDefaultConfig()
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    const mutableCfg = createDefaultConfig();
    mutableCfg.free_build.value = 1;
    expect(DEFAULT_CONFIG.free_build.value).toBe(0);
  });

  it('guarantees zero orphaned items, recipes, buildings, or tech unlocks', () => {
    const producedItems = new Set<ItemId>();
    const consumedItems = new Set<ItemId>();

    // Raw ores come from world extraction
    for (const id of ITEM_IDS) {
      if (ITEMS[id].category === 'raw') producedItems.add(id);
      if (ITEMS[id].fuel_value > 0) consumedItems.add(id);
    }

    // Recipe integrity
    for (const recipe of RECIPE_LIST) {
      expect(BUILDINGS[recipe.building]).toBeDefined();
      expect(isProcessorType(recipe.building)).toBe(true);
      expect(recipe.duration).toBeGreaterThan(0);
      expect(RECIPES_BY_BUILDING[recipe.building]?.some((r) => r.id === recipe.id)).toBe(true);
      if (recipe.required_tech) {
        expect(TECH_BY_ID[recipe.required_tech]).toBeDefined();
      }
      for (const inp of recipe.inputs) {
        expect(ITEMS[inp.item]).toBeDefined();
        expect(inp.count).toBeGreaterThan(0);
        consumedItems.add(inp.item);
      }
      for (const out of recipe.outputs) {
        expect(ITEMS[out.item]).toBeDefined();
        expect(out.count).toBeGreaterThan(0);
        producedItems.add(out.item);
      }
    }

    // Building costs & unlocks
    const unlockedByTech = new Set<string>();
    for (const tech of TECHS) {
      for (const c of tech.cost) {
        expect(ITEMS[c.item]).toBeDefined();
        consumedItems.add(c.item);
      }
      for (const bId of tech.unlocks_buildings) {
        expect(BUILDINGS[bId]).toBeDefined();
        unlockedByTech.add(bId);
      }
    }
    for (const bId of BUILDING_IDS) {
      const def = BUILDINGS[bId];
      for (const c of def.cost) {
        expect(ITEMS[c.item]).toBeDefined();
        consumedItems.add(c.item);
      }
      if (def.tier > 0) {
        expect(unlockedByTech.has(bId)).toBe(true);
      }
    }
    for (const phase of ORBITAL_PHASES) {
      for (const req of phase.requirements) {
        expect(ITEMS[req.item]).toBeDefined();
        consumedItems.add(req.item);
      }
    }

    // Every item must have >= 1 production source and >= 1 sink
    for (const id of ITEM_IDS) {
      expect(producedItems.has(id)).toBe(true);
      expect(consumedItems.has(id)).toBe(true);
    }

    // Every unlocks_features token in factory_techs.json must map to an active enforced feature gate
    for (const tech of TECHS) {
      for (const feat of tech.unlocks_features) {
        expect(ACTIVE_FEATURE_GATES.has(feat)).toBe(true);
      }
    }
  });

  it('validates all data/*.json files against data/schemas/*.schema.json structural rules', () => {
    assertMatchesJsonSchema(rawConfig, configSchema as JsonSchemaNode, configSchema as JsonSchemaNode);
    assertMatchesJsonSchema(rawItems, itemsSchema as JsonSchemaNode, itemsSchema as JsonSchemaNode);
    assertMatchesJsonSchema(
      rawBuildings,
      buildingsSchema as JsonSchemaNode,
      buildingsSchema as JsonSchemaNode
    );
    assertMatchesJsonSchema(
      rawRecipes,
      recipesSchema as JsonSchemaNode,
      recipesSchema as JsonSchemaNode
    );
    assertMatchesJsonSchema(rawTechs, techsSchema as JsonSchemaNode, techsSchema as JsonSchemaNode);
  });

  it('verifies tech DAG acyclicity, monotonic Tier 2->3->6 cost curve, and status transition table', () => {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (id: string) => {
      expect(visiting.has(id)).toBe(false);
      if (visited.has(id)) return;
      visiting.add(id);
      const tech = TECH_BY_ID[id];
      expect(tech).toBeDefined();
      for (const pre of tech.prerequisites) {
        const preTech = TECH_BY_ID[pre];
        expect(preTech).toBeDefined();
        expect(preTech.tier).toBeLessThan(tech.tier);
        dfs(pre);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const tech of TECHS) dfs(tech.id);

    // Compute raw ore equivalent recursively per item to verify Tier 3 >= Tier 2
    const rawEquiv = (item: ItemId, depth = 0): number => {
      expect(depth).toBeLessThan(12);
      if (ITEMS[item].category === 'raw') return 1;
      const recipe = RECIPE_LIST.find((r) => r.outputs.some((o) => o.item === item))!;
      const outCount = recipe.outputs.find((o) => o.item === item)!.count;
      let sum = 0;
      for (const inp of recipe.inputs) {
        sum += rawEquiv(inp.item, depth + 1) * inp.count;
      }
      return sum / outCount;
    };
    const techOreCost = (id: string) =>
      TECH_BY_ID[id].cost.reduce((acc, s) => acc + rawEquiv(s.item) * s.count, 0);

    expect(techOreCost('tier_3_electronics')).toBeGreaterThanOrEqual(
      techOreCost('tier_2_metallurgy')
    );
    expect(techOreCost('tier_4_overclock')).toBeGreaterThanOrEqual(
      techOreCost('tier_3_electronics')
    );

    for (const st of ALL_STATUSES) {
      expect(BUILDING_STATUS_TRANSITIONS[st].length).toBeGreaterThan(0);
      expect(BUILDING_STATUS_TRANSITIONS[st]).toContain(st);
    }
  });

  it('maintains 100% i18n key and entry parity between PT-BR and EN across items, buildings, recipes, techs, phases, statuses, and tweaks', () => {
    const pt = getBundle('pt-BR');
    const en = getBundle('en');

    // Top-level bundle keys & nested key sets must match identically
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(pt.cb_modes).sort()).toEqual(Object.keys(en.cb_modes).sort());
    expect(Object.keys(pt.bp_starter_names).sort()).toEqual(
      Object.keys(en.bp_starter_names).sort()
    );
    expect(pt.help_lines.length).toBe(en.help_lines.length);
    expect(pt.help_lines.length).toBeGreaterThanOrEqual(8);

    // 19 items
    expect(ITEM_IDS.length).toBe(19);
    expect(Object.keys(pt.items).sort()).toEqual([...ITEM_IDS].sort());
    expect(Object.keys(en.items).sort()).toEqual([...ITEM_IDS].sort());
    for (const id of ITEM_IDS) {
      expect(pt.items[id].trim().length).toBeGreaterThan(0);
      expect(en.items[id].trim().length).toBeGreaterThan(0);
    }

    // 20 buildings (name + desc)
    expect(BUILDING_IDS.length).toBe(20);
    expect(Object.keys(pt.buildings).sort()).toEqual([...BUILDING_IDS].sort());
    expect(Object.keys(en.buildings).sort()).toEqual([...BUILDING_IDS].sort());
    for (const id of BUILDING_IDS) {
      expect(pt.buildings[id]?.name.trim().length).toBeGreaterThan(0);
      expect(en.buildings[id]?.name.trim().length).toBeGreaterThan(0);
      expect(pt.buildings[id]?.desc.trim().length).toBeGreaterThan(0);
      expect(en.buildings[id]?.desc.trim().length).toBeGreaterThan(0);
    }

    // 14 recipes
    const recipeKeys = Object.keys(RECIPES).sort();
    expect(recipeKeys.length).toBe(14);
    expect(Object.keys(pt.recipes).sort()).toEqual(recipeKeys);
    expect(Object.keys(en.recipes).sort()).toEqual(recipeKeys);
    for (const id of recipeKeys) {
      expect(pt.recipes[id].trim().length).toBeGreaterThan(0);
      expect(en.recipes[id].trim().length).toBeGreaterThan(0);
    }

    // 6 techs (name + desc)
    const techKeys = TECHS.map((t) => t.id).sort();
    expect(techKeys.length).toBe(6);
    expect(Object.keys(pt.techs).sort()).toEqual(techKeys);
    expect(Object.keys(en.techs).sort()).toEqual(techKeys);
    for (const id of techKeys) {
      expect(pt.techs[id]?.name.trim().length).toBeGreaterThan(0);
      expect(en.techs[id]?.name.trim().length).toBeGreaterThan(0);
      expect(pt.techs[id]?.desc.trim().length).toBeGreaterThan(0);
      expect(en.techs[id]?.desc.trim().length).toBeGreaterThan(0);
    }

    // 5 orbital phases
    const phaseKeys = ORBITAL_PHASES.map((p) => p.id).sort();
    expect(phaseKeys.length).toBe(5);
    expect(Object.keys(pt.phases).sort()).toEqual(phaseKeys);
    expect(Object.keys(en.phases).sort()).toEqual(phaseKeys);
    for (const id of phaseKeys) {
      expect(pt.phases[id].trim().length).toBeGreaterThan(0);
      expect(en.phases[id].trim().length).toBeGreaterThan(0);
    }

    // 7 building statuses
    const statusKeys = [...ALL_STATUSES].sort();
    expect(statusKeys.length).toBe(7);
    expect(Object.keys(pt.statuses).sort()).toEqual(statusKeys);
    expect(Object.keys(en.statuses).sort()).toEqual(statusKeys);
    for (const st of ALL_STATUSES) {
      expect(pt.statuses[st].trim().length).toBeGreaterThan(0);
      expect(en.statuses[st].trim().length).toBeGreaterThan(0);
    }

    // 7 config tweaks (labels + descs)
    const configKeys = Object.keys(rawConfig).sort();
    expect(configKeys.length).toBe(7);
    expect(Object.keys(pt.tweak_labels).sort()).toEqual(configKeys);
    expect(Object.keys(en.tweak_labels).sort()).toEqual(configKeys);
    expect(Object.keys(pt.tweak_descs).sort()).toEqual(configKeys);
    expect(Object.keys(en.tweak_descs).sort()).toEqual(configKeys);
    for (const k of configKeys) {
      expect(pt.tweak_labels[k].trim().length).toBeGreaterThan(0);
      expect(en.tweak_labels[k].trim().length).toBeGreaterThan(0);
      expect(pt.tweak_descs[k].trim().length).toBeGreaterThan(0);
      expect(en.tweak_descs[k].trim().length).toBeGreaterThan(0);
    }
  });

  it('generates deterministic terrain with clean 9x9 hub plaza, weighted iron_ore veins, and bootstrap-only stockpile', () => {
    const w1 = createWorld(42026);
    const w2 = createWorld(42026);
    expect(w1.resources).toEqual(w2.resources);

    // 3x3 Hub grid & clean 9x9 plaza
    for (let y = HUB_ORIGIN - 3; y <= HUB_ORIGIN + HUB_SIZE + 2; y++) {
      for (let x = HUB_ORIGIN - 3; x <= HUB_ORIGIN + HUB_SIZE + 2; x++) {
        expect(w1.resources[tileIndex(x, y)]).toBe('none');
        if (isHubTile(x, y)) {
          expect(w1.grid[tileIndex(x, y)]).toBe(1);
        }
      }
    }

    // Iron ore weighted highest (~40% of ore tiles), and geothermal vents preserved
    const counts: Record<string, number> = {};
    let totalOre = 0;
    for (const res of w1.resources) {
      if (res === 'none') continue;
      counts[res] = (counts[res] ?? 0) + 1;
      if (res !== 'geothermal_vent') totalOre += 1;
    }
    expect(counts.geothermal_vent).toBeGreaterThanOrEqual(4);
    expect((counts.iron_ore ?? 0) / totalOre).toBeGreaterThanOrEqual(0.28);
    expect(counts.iron_ore).toBeGreaterThan(counts.stone ?? 0);

    // Starter stockpile prevents skipping Tier 1 + Tier 2 or Tier 1 + Phase 1 at tick 0
    expect(w1.stockpile.iron_plate).toBe(60);
    expect(w1.stockpile.copper_wire).toBe(30);
    const t1Plate = TECH_BY_ID.tier_1_logistics.cost.find((c) => c.item === 'iron_plate')?.count ?? 0;
    const t2Plate = TECH_BY_ID.tier_2_metallurgy.cost.find((c) => c.item === 'iron_plate')?.count ?? 0;
    const p1Plate = ORBITAL_PHASES[0].requirements.find((c) => c.item === 'iron_plate')?.count ?? 0;
    expect(w1.stockpile.iron_plate!).toBeLessThan(t1Plate + t2Plate);
    expect(w1.stockpile.iron_plate!).toBeLessThan(t1Plate + p1Plate);
  });
});
