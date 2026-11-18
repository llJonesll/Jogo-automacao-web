import { createDefaultConfig } from '../core/data';
import type { GameConfig, WorldState } from '../core/types';
import { tickWorld } from './progression';
import { createWorld, placeBuilding, tileIndex } from './world';

/**
 * Generates a live running showcase factory around the Orbital Hub
 * demonstrating miners, Mk.II belts, splitters, underground tunnels, inserters,
 * coal/solar/geothermal power, overclocked assemblers, and hub deliveries.
 */
export function createDemoWorld(config: GameConfig = createDefaultConfig()): WorldState {
  const demoConfig = createDefaultConfig();
  demoConfig.free_build.value = 1;
  demoConfig.seed.value = config.seed.value;

  const world = createWorld(config.seed.value);
  world.unlockedTechs = [
    'tier_1_logistics',
    'tier_2_metallurgy',
    'tier_3_electronics',
    'tier_4_overclock',
  ];
  world.activeTechId = 'tier_5_quantum';
  world.phaseIndex = 1;
  world.orbitalLaunches = 1;
  world.stockpile = {
    iron_plate: 320,
    copper_wire: 210,
    iron_gear: 140,
    concrete: 110,
    steel_beam: 85,
    glass_crystal: 45,
    circuit: 55,
    rotor: 35,
    coal: 60,
  };

  // Clear natural vents in the showcase inner plaza so corridors stay unobstructed
  for (let y = 21; y <= 40; y++) {
    for (let x = 20; x <= 43; x++) {
      if (world.resources[tileIndex(x, y)] === 'geothermal_vent') {
        world.resources[tileIndex(x, y)] = 'none';
      }
    }
  }

  // --- WEST IRON PLATES & GEARS + UNDERGROUND TUNNEL TO CIRCUIT ASSEMBLER ---
  world.resources[tileIndex(21, 30)] = 'iron_ore';
  world.resources[tileIndex(21, 32)] = 'iron_ore';

  placeBuilding(world, 'miner_mk2', 21, 30, 1, demoConfig, { clock: 1.5 });
  placeBuilding(world, 'smelter', 22, 30, 1, demoConfig, { recipeId: 'smelt_iron' });
  placeBuilding(world, 'constructor', 23, 30, 1, demoConfig, { recipeId: 'press_plate' });
  placeBuilding(world, 'belt_mk2', 24, 30, 1, demoConfig);
  placeBuilding(world, 'splitter', 25, 30, 1, demoConfig);
  for (let x = 26; x <= 29; x++) placeBuilding(world, 'belt_mk2', x, 30, 1, demoConfig);
  placeBuilding(world, 'belt_mk2', 30, 30, 2, demoConfig);
  placeBuilding(world, 'belt_mk2', 30, 31, 1, demoConfig);

  // Splitter branch south over the Gear line via Underground Tunnel
  placeBuilding(world, 'tunnel', 25, 31, 2, demoConfig);
  placeBuilding(world, 'tunnel', 25, 33, 2, demoConfig);
  for (let x = 25; x <= 28; x++) {
    if (x === 25) placeBuilding(world, 'belt_mk2', 25, 34, 1, demoConfig);
    else placeBuilding(world, 'belt_mk2', x, 34, 1, demoConfig);
  }

  // Gear line (21..30, y=32)
  placeBuilding(world, 'miner_mk1', 21, 32, 1, demoConfig);
  placeBuilding(world, 'smelter', 22, 32, 1, demoConfig, { recipeId: 'smelt_iron' });
  placeBuilding(world, 'constructor', 23, 32, 1, demoConfig, { recipeId: 'cut_gear' });
  for (let x = 24; x <= 30; x++) placeBuilding(world, 'belt_mk2', x, 32, 1, demoConfig);

  // --- SOUTH COPPER WIRE + GEOTHERMAL + CIRCUIT ASSEMBLER ---
  world.resources[tileIndex(35, 39)] = 'copper_ore';
  world.resources[tileIndex(33, 37)] = 'geothermal_vent';

  placeBuilding(world, 'geothermal_plant', 33, 37, 0, demoConfig);
  placeBuilding(world, 'miner_mk2', 35, 39, 0, demoConfig, { clock: 1.25 });
  placeBuilding(world, 'smelter', 35, 38, 0, demoConfig, { recipeId: 'smelt_copper' });
  placeBuilding(world, 'constructor', 35, 37, 0, demoConfig, { recipeId: 'draw_wire' });
  placeBuilding(world, 'belt_mk2', 35, 36, 0, demoConfig);
  placeBuilding(world, 'belt_mk2', 35, 35, 3, demoConfig);
  placeBuilding(world, 'tunnel', 34, 35, 3, demoConfig);
  placeBuilding(world, 'belt_mk1', 33, 35, 2, demoConfig); // crossed underneath by tunnel
  placeBuilding(world, 'tunnel', 32, 35, 3, demoConfig);
  placeBuilding(world, 'splitter', 31, 35, 0, demoConfig);
  placeBuilding(world, 'belt_mk2', 31, 34, 0, demoConfig);

  // Wire branch west into Circuit Assembler at (29, 34) facing North
  placeBuilding(world, 'belt_mk2', 30, 35, 3, demoConfig);
  placeBuilding(world, 'belt_mk2', 29, 35, 0, demoConfig);
  placeBuilding(world, 'assembler', 29, 34, 0, demoConfig, {
    recipeId: 'assemble_circuit',
    clock: 1.5,
  });
  placeBuilding(world, 'belt_mk2', 29, 33, 1, demoConfig);
  placeBuilding(world, 'belt_mk2', 30, 33, 1, demoConfig);

  // --- EAST COAL POWER + STEEL FOUNDRY ---
  world.resources[tileIndex(42, 29)] = 'coal';
  world.resources[tileIndex(41, 31)] = 'coal';
  world.resources[tileIndex(41, 32)] = 'iron_ore';

  placeBuilding(world, 'miner_mk1', 42, 29, 2, demoConfig);
  placeBuilding(world, 'belt_mk1', 42, 30, 2, demoConfig);
  placeBuilding(world, 'coal_generator', 42, 31, 0, demoConfig);

  placeBuilding(world, 'miner_mk1', 41, 31, 3, demoConfig);
  placeBuilding(world, 'belt_mk2', 40, 31, 3, demoConfig);
  placeBuilding(world, 'belt_mk2', 39, 31, 3, demoConfig);

  placeBuilding(world, 'miner_mk1', 41, 32, 3, demoConfig);
  placeBuilding(world, 'smelter', 40, 32, 3, demoConfig, { recipeId: 'smelt_iron' });
  placeBuilding(world, 'belt_mk2', 39, 32, 3, demoConfig);
  placeBuilding(world, 'belt_mk2', 38, 32, 0, demoConfig);
  placeBuilding(world, 'foundry', 38, 31, 3, demoConfig, {
    recipeId: 'forge_steel',
    clock: 1.5,
  });
  for (let x = 37; x >= 34; x--) {
    placeBuilding(world, 'belt_mk2', x, 31, 3, demoConfig);
  }

  // --- NORTH SOLAR ARRAY + STONE CONCRETE LINE WITH INSERTER ---
  for (const sx of [26, 27, 28, 29, 33, 34]) {
    placeBuilding(world, 'solar_panel', sx, 26, 0, demoConfig);
  }
  for (const ax of [28, 29, 33, 34]) {
    placeBuilding(world, 'accumulator', ax, 27, 0, demoConfig);
  }

  world.resources[tileIndex(31, 22)] = 'stone';
  placeBuilding(world, 'miner_mk1', 31, 22, 2, demoConfig);
  placeBuilding(world, 'smelter', 31, 23, 2, demoConfig, { recipeId: 'kiln_concrete' });
  placeBuilding(world, 'storage', 31, 24, 2, demoConfig);
  placeBuilding(world, 'inserter', 31, 25, 2, demoConfig);
  for (let y = 26; y <= 30; y++) {
    placeBuilding(world, 'belt_mk1', 31, y, 2, demoConfig);
  }

  // Pre-warm showcase for 240 ticks (12 seconds) so all lines flow visually
  for (let t = 0; t < 240; t++) {
    tickWorld(world, config);
  }

  return world;
}
