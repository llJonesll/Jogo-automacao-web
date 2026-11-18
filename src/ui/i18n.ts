import type { BuildingId, BuildingStatus, ItemId } from '../core/types';

export type Locale = 'pt-BR' | 'en';

export interface LocalizationBundle {
  title_sub: string;
  btn_new_factory: string;
  btn_continue: string;
  btn_demo: string;
  btn_colorblind: string;
  btn_lang: string;
  phase_label: string;
  phase_complete: string;
  load_stockpile: string;
  tech_label: string;
  no_active_tech: string;
  power_gen: string;
  power_use: string;
  power_stored: string;
  daytime: string;
  nighttime: string;
  btn_tech: string;
  btn_stats: string;
  btn_blueprints: string;
  btn_tweak: string;
  btn_alt: string;
  btn_save: string;
  btn_mute: string;
  btn_help: string;
  cat_all: string;
  cat_logistics: string;
  cat_extraction: string;
  cat_production: string;
  cat_power: string;
  tool_cursor: string;
  tool_mine: string;
  tool_deconstruct: string;
  tool_blueprint_copy: string;
  inspector_title: string;
  inspector_recipe: string;
  inspector_recipe_auto: string;
  inspector_overclock: string;
  inspector_overclock_locked: string;
  inspector_geo_bonus: string;
  inspector_buffers: string;
  inspector_rotate: string;
  inspector_dismantle: string;
  btn_unlock_stockpile: string;
  unlocked: string;
  locked_prereq: string;
  stats_stockpile: string;
  stats_rates: string;
  stats_diagnostics: string;
  stats_produced: string;
  stats_consumed: string;
  bp_capture: string;
  bp_starters: string;
  bp_saved: string;
  bp_import_export: string;
  bp_import_btn: string;
  bp_copy_btn: string;
  bp_stamp_btn: string;
  tweak_title: string;
  tweak_reset: string;
  save_title: string;
  save_local: string;
  save_export: string;
  save_import: string;
  save_new_seed: string;
  victory_title: string;
  victory_desc: string;
  victory_continue: string;
  help_title: string;
  msg_saved: string;
  msg_loaded: string;
  msg_bp_copied: string;
  msg_bp_imported: string;
  msg_bp_invalid: string;
  msg_save_invalid: string;
  msg_no_materials: string;
  msg_tech_locked: string;
  msg_needs_ore: string;
  msg_needs_vent: string;
  msg_phase_loaded: string;
  msg_rocket_launch: string;
  title_hint: string;
  statuses: Record<BuildingStatus, string>;
  items: Record<ItemId, string>;
  buildings: Record<BuildingId, { name: string; desc: string }>;
  recipes: Record<string, string>;
  techs: Record<string, { name: string; desc: string }>;
  phases: Record<string, string>;
}

const PT_BR: LocalizationBundle = {
  title_sub: 'Fundição Orbital & Logística Industrial',
  btn_new_factory: 'Nova Fábrica',
  btn_continue: 'Continuar Save',
  btn_demo: 'Fábrica de Demonstração (Showcase)',
  btn_colorblind: 'Alto Contraste',
  btn_lang: 'PT-BR',
  phase_label: 'Elevador Orbital',
  phase_complete: 'Todas as Fases Concluídas!',
  load_stockpile: 'Carregar Foguete',
  tech_label: 'Pesquisa',
  no_active_tech: 'Pesquisas Concluídas',
  power_gen: 'Geração',
  power_use: 'Demanda',
  power_stored: 'Bateria',
  daytime: 'Dia',
  nighttime: 'Noite',
  btn_tech: 'Tech [T]',
  btn_stats: 'Produção [P]',
  btn_blueprints: 'Blueprints [B]',
  btn_tweak: 'Config [G]',
  btn_alt: 'Alt-Mode',
  btn_save: 'Salvar',
  btn_mute: 'Som [M]',
  btn_help: 'Ajuda [H]',
  cat_all: 'Tudo',
  cat_logistics: 'Logística',
  cat_extraction: 'Mineração',
  cat_production: 'Indústria',
  cat_power: 'Energia',
  tool_cursor: 'Inspecionar / Minerar [Esc]',
  tool_mine: 'Laser de Mineração',
  tool_deconstruct: 'Desmontar [Botão Dir.]',
  tool_blueprint_copy: 'Copiar Blueprint [Ctrl+C]',
  inspector_title: 'Inspetor de Máquina',
  inspector_recipe: 'Receita',
  inspector_recipe_auto: 'Auto (Detectar por Insumo)',
  inspector_overclock: 'Overclock',
  inspector_overclock_locked: 'Requer Tier 4: Controle de Overclock',
  inspector_geo_bonus: 'Ressonância Geotérmica: +35% Velocidade Grátis',
  inspector_buffers: 'Buffers & Estoque',
  inspector_rotate: 'Girar [R]',
  inspector_dismantle: 'Desmontar (100% Reembolso)',
  btn_unlock_stockpile: 'Desbloquear com Estoque',
  unlocked: 'Desbloqueado',
  locked_prereq: 'Requer Tier anterior',
  stats_stockpile: 'Estoque Global do Hub Orbital',
  stats_rates: 'Fluxo Industrial (Últimos 60s / min)',
  stats_diagnostics: 'Diagnóstico de Gargalos',
  stats_produced: 'Produzido/min',
  stats_consumed: 'Consumido/min',
  bp_capture: 'Capturar Área do Mapa [Ctrl+C]',
  bp_starters: 'Blueprints Iniciais do Estúdio',
  bp_saved: 'Seus Blueprints Capturados',
  bp_import_export: 'Compartilhar String Base64 (AFBP1:)',
  bp_import_btn: 'Importar Blueprint',
  bp_copy_btn: 'Copiar Texto',
  bp_stamp_btn: 'Carimbar',
  tweak_title: 'Painel de Calibração (data/config.json)',
  tweak_reset: 'Restaurar Padrões',
  save_title: 'Gerenciador de Save & Mundo',
  save_local: 'Salvar no Navegador',
  save_export: 'Baixar Save (.json)',
  save_import: 'Importar Save (.json)',
  save_new_seed: 'Gerar Novo Planeta',
  victory_title: 'Ascensão Orbital Concluída!',
  victory_desc:
    'Todas as 5 Fases do Elevador Orbital foram lançadas com sucesso. Sua linha de produção automatizada domina o planeta.',
  victory_continue: 'Continuar Megafábrica (Sandbox)',
  help_title: 'Guia de Controle & Cadeias Produtivas',
  msg_saved: 'Progresso salvo no navegador.',
  msg_loaded: 'Save carregado com sucesso.',
  msg_bp_copied: 'Blueprint copiado! Clique no mapa para carimbar (R gira).',
  msg_bp_imported: 'Blueprint validado e carregado para carimbo.',
  msg_bp_invalid: 'Blueprint inválido ou corrompido.',
  msg_save_invalid: 'Arquivo de save inválido ou corrompido.',
  msg_no_materials: 'Recursos insuficientes no estoque do Hub.',
  msg_tech_locked: 'Desbloqueie a tecnologia correspondente primeiro.',
  msg_needs_ore: 'Extratores precisam ser posicionados sobre uma jazida mineral.',
  msg_needs_vent: 'Usina Geotérmica exige uma fissura de magma.',
  msg_phase_loaded: 'Carga transferida para o módulo orbital.',
  msg_rocket_launch: 'LANÇAMENTO ORBITAL CONFIRMADO! Próxima fase desbloqueada.',
  title_hint: 'Arraste esteiras com o mouse | R gira | Q pipeta | Alt exibe receitas',
  statuses: {
    working: 'Operando',
    idle: 'Em Espera',
    no_power: 'Sem Energia',
    input_starved: 'Falta Insumo',
    output_full: 'Saída Cheia',
    no_resource: 'Sem Jazida',
    unpaired: 'Sem Par',
  },
  items: {
    iron_ore: 'Minério de Ferro',
    copper_ore: 'Minério de Cobre',
    coal: 'Carvão Mineral',
    stone: 'Rocha Bruta',
    quartz: 'Cristal de Quartzo',
    iron_ingot: 'Lingote de Ferro',
    copper_ingot: 'Lingote de Cobre',
    concrete: 'Concreto Industrial',
    glass_crystal: 'Vidro de Quartzo',
    steel_beam: 'Viga de Aço',
    silicon_wafer: 'Wafer de Silício',
    iron_plate: 'Chapa de Ferro',
    iron_gear: 'Engrenagem de Ferro',
    copper_wire: 'Fio de Cobre',
    circuit: 'Circuito Lógico',
    rotor: 'Rotor Eletromagnético',
    modular_frame: 'Estrutura Modular',
    processor: 'Processador Quântico',
    quantum_core: 'Núcleo Quântico',
  },
  buildings: {
    belt_mk1: { name: 'Esteira Mk.I', desc: 'Transporta 2.0 itens/s. Arraste para fazer curvas.' },
    belt_mk2: { name: 'Esteira Mk.II', desc: 'Alta vazão: 4.0 itens/s.' },
    belt_mk3: { name: 'Esteira Mk.III', desc: 'Transporte hiper-rápido: 8.0 itens/s.' },
    tunnel: { name: 'Túnel Subterrâneo', desc: 'Cruza até 5 blocos sob obstáculos (entrada -> saída).' },
    splitter: { name: 'Divisor 1->3', desc: 'Balanceia 1 entrada igualmente entre até 3 saídas.' },
    merger: { name: 'Junção 3->1', desc: 'Combina até 3 esteiras em 1 saída sem travamentos.' },
    inserter: { name: 'Braço Inserter', desc: 'Move itens entre baús, esteiras e máquinas (1.5/s).' },
    storage: { name: 'Baú Logístico', desc: 'Armazena até 200 itens com buffer direto.' },
    miner_mk1: { name: 'Extrator Mk.I', desc: 'Minera 0.75/s sobre jazidas. Consome 2 MW.' },
    miner_mk2: { name: 'Extrator Mk.II', desc: 'Mineração pesada de 1.8/s. Consome 5 MW.' },
    smelter: { name: 'Fornalha', desc: 'Funde minérios em lingotes, vidro e concreto (3 MW).' },
    constructor: { name: 'Prensa / Construtor', desc: 'Fabrica chapas, engrenagens e fios (4 MW).' },
    foundry: { name: 'Alto-Forno', desc: 'Ligas avançadas de 2 insumos: Aço e Silício (8 MW).' },
    assembler: { name: 'Montadora', desc: 'Monta Circuitos, Rotores, Processadores e Núcleos (12 MW).' },
    coal_generator: { name: 'Termelétrica', desc: 'Gera +25 MW queimando 1 Carvão a cada 4s.' },
    solar_panel: { name: 'Painel Solar', desc: 'Gera até +8 MW durante o ciclo diurno.' },
    accumulator: { name: 'Acumulador', desc: 'Armazena 120 MJ para suprir picos e a noite (10 MW).' },
    geothermal_plant: { name: 'Usina Geotérmica', desc: 'Gera +60 MW contínuos sobre fissuras vulcânicas.' },
    research_lab: { name: 'Lab. de Pesquisa', desc: 'Dobra a eficiência (2x) de itens enviados à pesquisa.' },
    orbital_hub: { name: 'Hub Orbital (3x3)', desc: 'Núcleo central indestrutível (+15 MW RTG) e elevador de carga.' },
  },
  recipes: {
    smelt_iron: 'Lingote de Ferro (1 Minério)',
    smelt_copper: 'Lingote de Cobre (1 Minério)',
    kiln_concrete: 'Concreto (2 Rochas)',
    smelt_glass: 'Vidro de Quartzo (1 Quartzo)',
    press_plate: 'Chapa de Ferro (1 Lingote)',
    cut_gear: 'Engrenagem (2 Lingotes)',
    draw_wire: '2x Fio de Cobre (1 Lingote)',
    forge_steel: 'Viga de Aço (2 Ferro + 1 Carvão)',
    dope_silicon: 'Wafer Silício (1 Vidro + 1 Carvão)',
    assemble_circuit: 'Circuito (1 Chapa + 2 Fios)',
    assemble_rotor: 'Rotor (2 Chapas + 2 Engren.)',
    assemble_frame: 'Estrutura Mod. (2 Aço + 1 Rotor)',
    assemble_processor: 'Processador (2 Circ. + 1 Wafer)',
    assemble_quantum: 'Núcleo Quântico (1 Est. + 2 Proc.)',
  },
  techs: {
    tier_1_logistics: { name: 'Tier 1: Logística Avançada', desc: 'Esteira Mk.II, Túnel, Divisor, Junção e Inserter.' },
    tier_2_metallurgy: { name: 'Tier 2: Metalurgia & Energia', desc: 'Alto-Forno, Termelétrica a Carvão e Lab. de Pesquisa.' },
    tier_3_electronics: { name: 'Tier 3: Eletrônica & Solar', desc: 'Montadora, Painel Solar, Acumulador e Blueprints.' },
    tier_4_overclock: { name: 'Tier 4: Overclock & Geotermia', desc: 'Overclock (50%-250%), Esteira Mk.III, Extrator Mk.II e Geotérmica.' },
    tier_5_quantum: { name: 'Tier 5: Computação Quântica', desc: 'Desbloqueia Processadores e Núcleos Quânticos de ponta.' },
    orbital_ascension: { name: 'Tier 6: Ascensão Orbital', desc: 'Protocolo final de engenharia orbital.' },
  },
  phases: {
    phase_1: 'Fase 1: Estrutura do Elevador',
    phase_2: 'Fase 2: Cabos & Eletromagnetismo',
    phase_3: 'Fase 3: Matriz Estrutural',
    phase_4: 'Fase 4: Telemetria de Silício',
    phase_5: 'Fase 5: Núcleo de Propulsão Quântica',
  },
};

const EN: LocalizationBundle = {
  title_sub: 'Orbital Foundry & Industrial Logistics',
  btn_new_factory: 'New Factory',
  btn_continue: 'Continue Save',
  btn_demo: 'Demo Factory (Showcase)',
  btn_colorblind: 'High Contrast',
  btn_lang: 'EN',
  phase_label: 'Orbital Elevator',
  phase_complete: 'All Orbital Phases Launched!',
  load_stockpile: 'Load Rocket',
  tech_label: 'Research',
  no_active_tech: 'All Techs Researched',
  power_gen: 'Output',
  power_use: 'Demand',
  power_stored: 'Battery',
  daytime: 'Day',
  nighttime: 'Night',
  btn_tech: 'Tech [T]',
  btn_stats: 'Stats [P]',
  btn_blueprints: 'Blueprints [B]',
  btn_tweak: 'Tweak [G]',
  btn_alt: 'Alt-Mode',
  btn_save: 'Save',
  btn_mute: 'Audio [M]',
  btn_help: 'Help [H]',
  cat_all: 'All',
  cat_logistics: 'Logistics',
  cat_extraction: 'Mining',
  cat_production: 'Production',
  cat_power: 'Power',
  tool_cursor: 'Inspect / Mine [Esc]',
  tool_mine: 'Mining Laser',
  tool_deconstruct: 'Dismantle [Right Click]',
  tool_blueprint_copy: 'Copy Blueprint [Ctrl+C]',
  inspector_title: 'Machine Inspector',
  inspector_recipe: 'Recipe',
  inspector_recipe_auto: 'Auto (Match Input)',
  inspector_overclock: 'Overclock',
  inspector_overclock_locked: 'Requires Tier 4: Overclock Control',
  inspector_geo_bonus: 'Geothermal Resonance: +35% Free Speed',
  inspector_buffers: 'Buffers & Inventory',
  inspector_rotate: 'Rotate [R]',
  inspector_dismantle: 'Dismantle (100% Refund)',
  btn_unlock_stockpile: 'Unlock from Stockpile',
  unlocked: 'Unlocked',
  locked_prereq: 'Requires previous Tier',
  stats_stockpile: 'Global Orbital Hub Stockpile',
  stats_rates: 'Industrial Throughput (Rolling 60s / min)',
  stats_diagnostics: 'Bottleneck Diagnostics',
  stats_produced: 'Produced/min',
  stats_consumed: 'Consumed/min',
  bp_capture: 'Capture Map Region [Ctrl+C]',
  bp_starters: 'Studio Starter Blueprints',
  bp_saved: 'Your Captured Blueprints',
  bp_import_export: 'Share Base64 String (AFBP1:)',
  bp_import_btn: 'Import Blueprint',
  bp_copy_btn: 'Copy String',
  bp_stamp_btn: 'Stamp',
  tweak_title: 'Studio Tuning Panel (data/config.json)',
  tweak_reset: 'Reset Defaults',
  save_title: 'Save & World Manager',
  save_local: 'Save to Browser',
  save_export: 'Download Save (.json)',
  save_import: 'Import Save (.json)',
  save_new_seed: 'New Planet Seed',
  victory_title: 'Orbital Ascension Complete!',
  victory_desc:
    'All 5 Orbital Cargo Phases have launched successfully. Your automated foundry spans the exoplanet.',
  victory_continue: 'Continue Megafactory (Sandbox)',
  help_title: 'Controls & Production Chain Guide',
  msg_saved: 'Factory saved to browser storage.',
  msg_loaded: 'Save loaded successfully.',
  msg_bp_copied: 'Blueprint ready! Click map to stamp (R rotates).',
  msg_bp_imported: 'Blueprint validated and ready to stamp.',
  msg_bp_invalid: 'Invalid or corrupted blueprint string.',
  msg_save_invalid: 'Invalid or corrupted save file.',
  msg_no_materials: 'Insufficient materials in Hub stockpile.',
  msg_tech_locked: 'Research the required technology tier first.',
  msg_needs_ore: 'Miners must be placed on an ore deposit.',
  msg_needs_vent: 'Geothermal Plant requires a magma vent tile.',
  msg_phase_loaded: 'Cargo loaded into orbital rocket pod.',
  msg_rocket_launch: 'ORBITAL LAUNCH CONFIRMED! Next cargo phase unlocked.',
  title_hint: 'Drag belts with mouse | R rotate | Q pipette | Alt info overlay',
  statuses: {
    working: 'Working',
    idle: 'Idle',
    no_power: 'No Power',
    input_starved: 'Input Starved',
    output_full: 'Output Full',
    no_resource: 'No Deposit',
    unpaired: 'Unpaired',
  },
  items: {
    iron_ore: 'Iron Ore',
    copper_ore: 'Copper Ore',
    coal: 'Coal',
    stone: 'Raw Stone',
    quartz: 'Quartz Crystal',
    iron_ingot: 'Iron Ingot',
    copper_ingot: 'Copper Ingot',
    concrete: 'Concrete',
    glass_crystal: 'Quartz Glass',
    steel_beam: 'Steel Beam',
    silicon_wafer: 'Silicon Wafer',
    iron_plate: 'Iron Plate',
    iron_gear: 'Iron Gear',
    copper_wire: 'Copper Wire',
    circuit: 'Logic Circuit',
    rotor: 'Rotor',
    modular_frame: 'Modular Frame',
    processor: 'Quantum Processor',
    quantum_core: 'Quantum Core',
  },
  buildings: {
    belt_mk1: { name: 'Belt Mk.I', desc: 'Moves 2.0 items/s. Drag to curve.' },
    belt_mk2: { name: 'Belt Mk.II', desc: 'Fast belt: 4.0 items/s.' },
    belt_mk3: { name: 'Belt Mk.III', desc: 'Hyper belt: 8.0 items/s.' },
    tunnel: { name: 'Underground Tunnel', desc: 'Crosses up to 5 tiles under obstacles.' },
    splitter: { name: 'Splitter 1->3', desc: 'Splits 1 input evenly across up to 3 exits.' },
    merger: { name: 'Merger 3->1', desc: 'Merges up to 3 belts cleanly into 1 exit.' },
    inserter: { name: 'Inserter Arm', desc: 'Transfers items between chests, belts & machines (1.5/s).' },
    storage: { name: 'Storage Chest', desc: 'Stores up to 200 items with direct belt buffer.' },
    miner_mk1: { name: 'Miner Mk.I', desc: 'Extracts 0.75/s on ore deposits (2 MW).' },
    miner_mk2: { name: 'Miner Mk.II', desc: 'Heavy mining at 1.8/s (5 MW).' },
    smelter: { name: 'Smelter', desc: 'Smelts ores into ingots, glass, and concrete (3 MW).' },
    constructor: { name: 'Constructor', desc: 'Presses plates, cuts gears, and draws wire (4 MW).' },
    foundry: { name: 'Foundry', desc: 'Dual-input alloys: Steel Beams & Silicon (8 MW).' },
    assembler: { name: 'Assembler', desc: 'Builds Circuits, Rotors, Frames, Processors & Cores (12 MW).' },
    coal_generator: { name: 'Coal Generator', desc: 'Generates +25 MW burning 1 Coal every 4s.' },
    solar_panel: { name: 'Solar Panel', desc: 'Generates up to +8 MW during daylight.' },
    accumulator: { name: 'Accumulator', desc: 'Stores 120 MJ for night & peak demand (10 MW).' },
    geothermal_plant: { name: 'Geothermal Plant', desc: 'Generates +60 MW continuously on magma vents.' },
    research_lab: { name: 'Research Lab', desc: 'Doubles (2x) science value of delivered items.' },
    orbital_hub: { name: 'Orbital Hub (3x3)', desc: 'Indestructible core (+15 MW RTG) & cargo elevator.' },
  },
  recipes: {
    smelt_iron: 'Iron Ingot (1 Ore)',
    smelt_copper: 'Copper Ingot (1 Ore)',
    kiln_concrete: 'Concrete (2 Stone)',
    smelt_glass: 'Quartz Glass (1 Quartz)',
    press_plate: 'Iron Plate (1 Ingot)',
    cut_gear: 'Iron Gear (2 Ingots)',
    draw_wire: '2x Copper Wire (1 Ingot)',
    forge_steel: 'Steel Beam (2 Iron + 1 Coal)',
    dope_silicon: 'Silicon Wafer (1 Glass + 1 Coal)',
    assemble_circuit: 'Circuit (1 Plate + 2 Wire)',
    assemble_rotor: 'Rotor (2 Plates + 2 Gears)',
    assemble_frame: 'Modular Frame (2 Steel + 1 Rotor)',
    assemble_processor: 'Processor (2 Circ. + 1 Wafer)',
    assemble_quantum: 'Quantum Core (1 Frame + 2 Proc.)',
  },
  techs: {
    tier_1_logistics: { name: 'Tier 1: Advanced Logistics', desc: 'Unlocks Belt Mk.II, Tunnel, Splitter, Merger & Inserter.' },
    tier_2_metallurgy: { name: 'Tier 2: Metallurgy & Coal', desc: 'Unlocks Foundry, Coal Generator & Research Lab.' },
    tier_3_electronics: { name: 'Tier 3: Electronics & Solar', desc: 'Unlocks Assembler, Solar Panel, Accumulator & Blueprints.' },
    tier_4_overclock: { name: 'Tier 4: Overclock & Geothermal', desc: 'Unlocks Overclock (50%-250%), Belt Mk.III, Miner Mk.II & Geothermal.' },
    tier_5_quantum: { name: 'Tier 5: Quantum Computing', desc: 'Unlocks end-game Processors and Quantum Cores.' },
    orbital_ascension: { name: 'Tier 6: Orbital Ascension', desc: 'Final orbital engineering protocol.' },
  },
  phases: {
    phase_1: 'Phase 1: Elevator Anchor',
    phase_2: 'Phase 2: Electromagnetics',
    phase_3: 'Phase 3: Structural Matrix',
    phase_4: 'Phase 4: Silicon Telemetry',
    phase_5: 'Phase 5: Quantum Propulsion Core',
  },
};

export function getBundle(locale: Locale): LocalizationBundle {
  return locale === 'en' ? EN : PT_BR;
}
