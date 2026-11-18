import { describe, expect, it } from 'vitest';
import rawConfig from '../../data/config.json';
import rawBuildings from '../../data/factory_buildings.json';
import rawItems from '../../data/factory_items.json';
import rawRecipes from '../../data/factory_recipes.json';
import rawTechs from '../../data/factory_techs.json';
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

    const allStatuses: BuildingStatus[] = [
      'working',
      'idle',
      'no_power',
      'input_starved',
      'output_full',
      'no_resource',
      'unpaired',
    ];
    for (const st of allStatuses) {
      expect(BUILDING_STATUS_TRANSITIONS[st].length).toBeGreaterThan(0);
      expect(BUILDING_STATUS_TRANSITIONS[st]).toContain(st);
    }
  });

  it('maintains 100% i18n parity between PT-BR and EN across items, buildings, recipes, techs, and phases', () => {
    const pt = getBundle('pt-BR');
    const en = getBundle('en');

    for (const id of ITEM_IDS) {
      expect(pt.items[id]).toBeTruthy();
      expect(en.items[id]).toBeTruthy();
    }
    for (const id of BUILDING_IDS) {
      expect(pt.buildings[id]?.name).toBeTruthy();
      expect(en.buildings[id]?.name).toBeTruthy();
    }
    for (const id of Object.keys(RECIPES)) {
      expect(pt.recipes[id]).toBeTruthy();
      expect(en.recipes[id]).toBeTruthy();
    }
    for (const tech of TECHS) {
      expect(pt.techs[tech.id]?.name).toBeTruthy();
      expect(en.techs[tech.id]?.name).toBeTruthy();
    }
    for (const phase of ORBITAL_PHASES) {
      expect(pt.phases[phase.id]).toBeTruthy();
      expect(en.phases[phase.id]).toBeTruthy();
    }
    for (const k of Object.keys(rawConfig)) {
      expect(pt.tweak_descs[k]).toBeTruthy();
      expect(en.tweak_descs[k]).toBeTruthy();
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
