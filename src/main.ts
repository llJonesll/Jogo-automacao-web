import {
  BUILDING_IDS,
  BUILDINGS,
  DT,
  HUB_ORIGIN,
  HUB_SIZE,
  ITEM_IDS,
  createDefaultConfig,
  isBeltType,
  rotateDirCW,
} from './core/data';
import type {
  BlueprintData,
  BuildingId,
  Direction,
  GameConfig,
  SimulationAudioEvent,
  WorldState,
} from './core/types';
import { type AudioBusId, SoundEngine } from './audio/synth';
import {
  createBlueprint,
  decodeBlueprint,
  encodeBlueprint,
  placeBlueprint,
  rotateBlueprint,
} from './game/blueprints';
import { createDemoWorld } from './game/demo';
import {
  canStartTech,
  loadPhaseFromStockpile,
  tickWorld,
  unlockTechFromStockpile,
} from './game/progression';
import { deserializeWorld, loadFromStorage, saveToStorage } from './game/save';
import {
  canPlaceBuilding,
  createWorld,
  getBuildingAt,
  inBounds,
  isBuildingUnlocked,
  mineTileManual,
  placeBuilding,
  removeBuilding,
  rotateBuilding,
  setMachineClock,
  setMachineRecipe,
} from './game/world';
import { installGameHook } from './hook';
import { GamepadController } from './input/gamepad';
import {
  BASE_TILE_PX,
  CameraState,
  FactoryRenderer,
  type RenderOptions,
} from './render/renderer';
import {
  type FiguresGalleryLabels,
  renderFiguresGallery,
} from './render/sprites';
import './style.css';
import {
  COLORBLIND_MODES,
  FactoryHud,
  HOTBAR_CATEGORIES,
  HotbarCategoryId,
  HudActions,
  HudViewState,
  ModalId,
  ToolSelection,
  UI_SCALES,
} from './ui/hud';
import { ColorblindMode, Locale, UiScale, getBundle } from './ui/i18n';

const UI_PREFS_KEY = 'aetherforge_ui_prefs_v1';

interface StoredUiPrefs {
  locale: Locale;
  uiScale: UiScale;
  colorblindMode: ColorblindMode;
  reducedMotion: boolean;
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function systemPrefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function parseLocaleParam(search: string): Locale | null {
  const raw = new URLSearchParams(search).get('lang');
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'pt' || lower === 'pt-br') return 'pt-BR';
  return null;
}

function loadInitialUiPrefs(): StoredUiPrefs {
  const defaults: StoredUiPrefs = {
    locale: 'pt-BR',
    uiScale: 1,
    colorblindMode: 'default',
    reducedMotion: systemPrefersReducedMotion(),
  };

  const storage = getSafeStorage();
  if (storage) {
    try {
      const raw = storage.getItem(UI_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (parsed.locale === 'pt-BR' || parsed.locale === 'en') {
            defaults.locale = parsed.locale;
          }
          if (typeof parsed.uiScale === 'number' && UI_SCALES.includes(parsed.uiScale as UiScale)) {
            defaults.uiScale = parsed.uiScale as UiScale;
          }
          if (
            typeof parsed.colorblindMode === 'string' &&
            COLORBLIND_MODES.includes(parsed.colorblindMode as ColorblindMode)
          ) {
            defaults.colorblindMode = parsed.colorblindMode as ColorblindMode;
          }
          if (typeof parsed.reducedMotion === 'boolean') {
            defaults.reducedMotion = parsed.reducedMotion;
          }
        }
      }
    } catch {
      // Ignore malformed stored preferences and keep defaults
    }
  }

  const urlLocale = parseLocaleParam(window.location.search);
  if (urlLocale) {
    defaults.locale = urlLocale;
  }
  return defaults;
}

function saveUiPrefs(view: HudViewState): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    const payload: StoredUiPrefs = {
      locale: view.locale,
      uiScale: view.uiScale,
      colorblindMode: view.colorblindMode,
      reducedMotion: view.reducedMotion,
    };
    storage.setItem(UI_PREFS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors for UI preferences
  }
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud-root') as HTMLElement;
const ctx = canvas.getContext('2d')!;

const isFiguresScene =
  new URLSearchParams(window.location.search).get('scene') === 'figures';

const initialPrefs = loadInitialUiPrefs();

let config: GameConfig = createDefaultConfig();
let world: WorldState = createWorld(config.seed.value);
const sound = new SoundEngine();
const renderer = new FactoryRenderer();

const cam: CameraState = {
  x: HUB_ORIGIN + HUB_SIZE * 0.5,
  y: HUB_ORIGIN + HUB_SIZE * 0.5,
  zoom: 1.0,
};

const view: HudViewState = {
  scene: 'title',
  locale: initialPrefs.locale,
  uiScale: initialPrefs.uiScale,
  colorblindMode: initialPrefs.colorblindMode,
  colorblind: initialPrefs.colorblindMode !== 'default',
  reducedMotion: initialPrefs.reducedMotion,
  muted: sound.isMuted(),
  audioMono: sound.isMono(),
  audioVolumes: sound.getVolumes(),
  simSpeed: 1,
  showAltMode: true,
  showPowerOverlay: false,
  selectedTool: 'cursor',
  activeCategory: 'all',
  selectedBuildingId: null,
  activeModal: 'none',
  savedBlueprints: [],
  lastBpCode: '',
};

let toolDir: Direction = 1;
let hoverTile: { x: number; y: number } | null = null;
let dragPath: Array<{ x: number; y: number; dir: Direction }> = [];
let activeBlueprint: BlueprintData | null = null;
let copyStart: { x: number; y: number } | null = null;
let mineBeam: { tx: number; ty: number; timer: number } | null = null;

let isLeftDown = false;
let isRightDown = false;
let isPanDown = false;
let panLast = { x: 0, y: 0 };
const keysHeld = new Set<string>();

let simAccumulator = 0;
let autosaveTimer = 0;
let lastHudRenderMs = 0;

let knownUnlockedTechs = new Set<string>(world.unlockedTechs);
let powerWarnActive = world.power.satisfaction < 0.99;
let lastPowerToastMs = 0;
let victoryNotified = world.victoryAchieved;
let cachedFiguresLocale: Locale | null = null;
let cachedFiguresReduced: boolean | null = null;
let cachedFiguresLabels: FiguresGalleryLabels | undefined;

const renderOpts: RenderOptions = {
  showAltMode: view.showAltMode,
  showPowerOverlay: view.showPowerOverlay,
  colorblind: view.colorblind,
  colorblindMode: view.colorblindMode === 'default' ? 'none' : view.colorblindMode,
  selectedTool: view.selectedTool,
  toolDir: 1,
  hoverTile: null,
  dragPath: [],
  activeBlueprint: null,
  copyStart: null,
  selectedBuildingId: null,
  mineBeam: null,
  simAlpha: 0,
  reducedMotion: view.reducedMotion,
  uiScale: view.uiScale,
};

let viewportW = window.innerWidth;
let viewportH = window.innerHeight;
let currentDpr = Math.max(1, window.devicePixelRatio || 1);

function getFiguresLabels(): FiguresGalleryLabels {
  if (
    cachedFiguresLabels &&
    cachedFiguresLocale === view.locale &&
    cachedFiguresReduced === view.reducedMotion
  ) {
    return cachedFiguresLabels;
  }
  const bundle = getBundle(view.locale);
  cachedFiguresLocale = view.locale;
  cachedFiguresReduced = view.reducedMotion;
  cachedFiguresLabels = {
    title: bundle.figures_title,
    itemsHeading: `${bundle.figures_items_heading} (${ITEM_IDS.length})`,
    buildingsHeading: `${bundle.figures_buildings_heading} (${BUILDING_IDS.length})`,
    items: bundle.items,
    buildings: bundle.buildings,
    reducedMotion: view.reducedMotion,
  };
  return cachedFiguresLabels;
}

function applyUiPreferencesToDom(): void {
  const root = document.documentElement;
  root.lang = view.locale;
  document.title = getBundle(view.locale).page_title;
  root.style.setProperty('--ui-scale', String(view.uiScale));
  root.dataset.themeCb = view.colorblindMode;
  root.dataset.reducedMotion = view.reducedMotion ? 'true' : 'false';
}

function syncWorldTracking(w: WorldState): void {
  knownUnlockedTechs = new Set(w.unlockedTechs);
  powerWarnActive = w.power.satisfaction < 0.99;
  lastPowerToastMs = 0;
  victoryNotified = w.victoryAchieved;
}

function resetCamera(): void {
  cam.x = HUB_ORIGIN + HUB_SIZE * 0.5;
  cam.y = HUB_ORIGIN + HUB_SIZE * 0.5;
  cam.zoom = 1.0;
}

function clearPointerAndDragState(): void {
  keysHeld.clear();
  isLeftDown = false;
  isRightDown = false;
  isPanDown = false;
  dragPath = [];
}

function clampTileCoord(v: number): number {
  return Math.max(0, Math.min(world.size - 1, v));
}

function ensureHoverTile(): { x: number; y: number } {
  if (!hoverTile || !inBounds(hoverTile.x, hoverTile.y)) {
    hoverTile = {
      x: clampTileCoord(Math.floor(cam.x)),
      y: clampTileCoord(Math.floor(cam.y)),
    };
  }
  return hoverTile;
}

function moveGridCursor(dx: number, dy: number): void {
  const cur = ensureHoverTile();
  hoverTile = {
    x: clampTileCoord(cur.x + dx),
    y: clampTileCoord(cur.y + dy),
  };

  const tilePx = BASE_TILE_PX * cam.zoom;
  const halfVisX = (viewportW / tilePx) * 0.42;
  const halfVisY = (viewportH / tilePx) * 0.42;
  const tx = hoverTile.x + 0.5;
  const ty = hoverTile.y + 0.5;
  if (tx < cam.x - halfVisX) cam.x = Math.max(0, tx + halfVisX * 0.6);
  else if (tx > cam.x + halfVisX) cam.x = Math.min(world.size, tx - halfVisX * 0.6);
  if (ty < cam.y - halfVisY) cam.y = Math.max(0, ty + halfVisY * 0.6);
  else if (ty > cam.y + halfVisY) cam.y = Math.min(world.size, ty - halfVisY * 0.6);
}

function renderHudNow(): void {
  hud.render(world, config, view);
}

function startNewFactory(): void {
  world = createWorld(config.seed.value);
  renderer.dispose();
  view.scene = 'play';
  view.selectedTool = 'cursor';
  view.selectedBuildingId = null;
  view.activeModal = 'none';
  hoverTile = null;
  copyStart = null;
  clearPointerAndDragState();
  resetCamera();
  syncWorldTracking(world);
  renderHudNow();
}

const hudActions: HudActions = {
  onStartNew: () => {
    sound.unlock();
    sound.emit('ui_tick');
    startNewFactory();
  },
  onContinueSave: () => {
    sound.unlock();
    const t = getBundle(view.locale);
    const loaded = loadFromStorage();
    if (loaded) {
      world = loaded;
      renderer.dispose();
      view.scene = 'play';
      view.selectedTool = 'cursor';
      view.selectedBuildingId = null;
      view.activeModal = 'none';
      hoverTile = null;
      clearPointerAndDragState();
      resetCamera();
      syncWorldTracking(world);
      sound.emit('ui_save');
      hud.showToast(t.msg_loaded);
    } else {
      sound.emit('ui_error');
      hud.showToast(t.msg_no_save_found, true);
    }
    renderHudNow();
  },
  onStartDemo: () => {
    sound.unlock();
    sound.emit('ui_tick');
    world = createDemoWorld(config);
    renderer.dispose();
    view.scene = 'play';
    view.selectedTool = 'cursor';
    view.selectedBuildingId = null;
    view.activeModal = 'none';
    hoverTile = null;
    clearPointerAndDragState();
    cam.x = HUB_ORIGIN + 1;
    cam.y = HUB_ORIGIN + 1;
    cam.zoom = 0.85;
    syncWorldTracking(world);
    renderHudNow();
  },
  onNewPlanetSeed: () => {
    sound.unlock();
    sound.emit('ui_tick');
    config.seed.value = ((config.seed.value + 7919) % 999999) + 1;
    startNewFactory();
  },
  onToggleLocale: () => {
    sound.unlock();
    sound.emit('ui_tick');
    view.locale = view.locale === 'pt-BR' ? 'en' : 'pt-BR';
    applyUiPreferencesToDom();
    saveUiPrefs(view);
    renderHudNow();
  },
  onSetTextScale: (scale: UiScale) => {
    sound.unlock();
    sound.emit('ui_tick');
    view.uiScale = scale;
    applyUiPreferencesToDom();
    saveUiPrefs(view);
    renderHudNow();
  },
  onSetColorblindMode: (mode: ColorblindMode) => {
    sound.unlock();
    sound.emit('ui_tick');
    view.colorblindMode = mode;
    view.colorblind = mode !== 'default';
    applyUiPreferencesToDom();
    saveUiPrefs(view);
    renderHudNow();
  },
  onToggleReducedMotion: () => {
    sound.unlock();
    sound.emit('ui_tick');
    view.reducedMotion = !view.reducedMotion;
    if (view.reducedMotion && world.rocketTimer > 0) {
      world.rocketTimer = 0;
    }
    applyUiPreferencesToDom();
    saveUiPrefs(view);
    renderHudNow();
  },
  onSelectTool: (tool: ToolSelection) => {
    sound.unlock();
    sound.emit('ui_tick');
    view.selectedTool = tool;
    if (tool !== 'cursor') view.selectedBuildingId = null;
    if (tool !== 'bp_copy') copyStart = null;
    renderHudNow();
  },
  onSelectCategory: (category: HotbarCategoryId) => {
    sound.unlock();
    sound.emit('ui_tick');
    view.activeCategory = category;
    renderHudNow();
  },
  onSetSimSpeed: (speed: number) => {
    sound.unlock();
    sound.emit(speed === 0 ? 'sim_pause' : 'ui_tick');
    view.simSpeed = speed;
    renderHudNow();
  },
  onToggleAltMode: () => {
    sound.unlock();
    sound.emit('alt_mode');
    view.showAltMode = !view.showAltMode;
    renderHudNow();
  },
  onTogglePowerOverlay: () => {
    sound.unlock();
    sound.emit('ui_tick');
    view.showPowerOverlay = !view.showPowerOverlay;
    renderHudNow();
  },
  onToggleMute: () => {
    sound.unlock();
    view.muted = sound.toggleMute();
    if (!view.muted) sound.emit('ui_tick');
    renderHudNow();
  },
  onSetAudioVolume: (bus: AudioBusId, value: number) => {
    sound.unlock();
    sound.setVolume(bus, value);
    view.audioVolumes = sound.getVolumes();
    renderHudNow();
  },
  onToggleAudioMono: () => {
    sound.unlock();
    sound.setMono(!sound.isMono());
    view.audioMono = sound.isMono();
    sound.emit('ui_tick');
    renderHudNow();
  },
  onOpenModal: (modal: ModalId) => {
    sound.unlock();
    const prevModal = view.activeModal;
    if (modal !== 'none' && modal !== prevModal) {
      sound.emit('ui_modal_open');
    } else if (modal === 'none' && prevModal !== 'none') {
      sound.emit('ui_modal_close');
    } else {
      sound.emit('ui_tick');
    }
    view.activeModal = modal;
    if (modal !== 'none') clearPointerAndDragState();
    renderHudNow();
  },
  onSaveLocal: () => {
    sound.unlock();
    const t = getBundle(view.locale);
    if (saveToStorage(world)) {
      sound.emit('ui_save');
      hud.showToast(t.msg_saved);
    } else {
      sound.emit('ui_error');
      hud.showToast(t.msg_save_storage_failed, true);
    }
  },
  onImportSaveText: (json: string) => {
    sound.unlock();
    const res = deserializeWorld(json);
    const t = getBundle(view.locale);
    if (!res.ok) {
      sound.emit('ui_error');
      hud.showToast(t.msg_save_invalid, true);
      return;
    }
    world = res.world;
    renderer.dispose();
    view.selectedBuildingId = null;
    view.activeModal = 'none';
    hoverTile = null;
    clearPointerAndDragState();
    resetCamera();
    syncWorldTracking(world);
    sound.emit('ui_save');
    hud.showToast(t.msg_loaded);
    renderHudNow();
  },
  onStampBlueprint: (bp: BlueprintData) => {
    sound.unlock();
    sound.emit('ui_tick');
    activeBlueprint = { ...bp, entries: bp.entries.map((e) => ({ ...e })) };
    view.selectedTool = 'bp_stamp';
    renderHudNow();
  },
  onCopyBlueprint: (bp: BlueprintData) => {
    sound.unlock();
    const code = encodeBlueprint(bp);
    view.lastBpCode = code;
    try {
      void navigator.clipboard?.writeText(code).catch(() => {});
    } catch {
      // Clipboard API may be unavailable in non-secure contexts
    }
    sound.emit('bp_copy');
    hud.showToast(getBundle(view.locale).msg_bp_copied);
    renderHudNow();
  },
  onImportBlueprint: (raw: string) => {
    sound.unlock();
    const t = getBundle(view.locale);
    const res = decodeBlueprint(raw);
    if (!res.ok) {
      sound.emit('ui_error');
      hud.showToast(t.msg_bp_invalid, true);
      return;
    }
    view.savedBlueprints.unshift(res.blueprint);
    view.lastBpCode = raw.trim();
    activeBlueprint = {
      ...res.blueprint,
      entries: res.blueprint.entries.map((e) => ({ ...e })),
    };
    view.selectedTool = 'bp_stamp';
    view.activeModal = 'none';
    sound.emit('ui_tick');
    hud.showToast(t.msg_bp_imported);
    renderHudNow();
  },
  onLoadPhaseStockpile: () => {
    sound.unlock();
    const t = getBundle(view.locale);
    const ev: SimulationAudioEvent[] = [];
    const count = loadPhaseFromStockpile(world, ev);
    if (count > 0) {
      if (ev.some((e) => e.kind === 'launch')) {
        handleAudioEvents(ev);
      } else {
        sound.emit('hub_load');
        hud.showToast(t.msg_phase_loaded);
      }
      renderHudNow();
    }
  },
  onSkipRocketAnimation: () => {
    if (world.rocketTimer <= 0) return;
    sound.unlock();
    sound.emit('ui_tick');
    world.rocketTimer = 0;
    hud.showToast(getBundle(view.locale).msg_launch_skipped);
    renderHudNow();
  },
  onSetMachineRecipe: (entityId: number, recipeId: string) => {
    sound.unlock();
    if (setMachineRecipe(world, entityId, recipeId, config)) {
      sound.emit('ui_tick');
    } else {
      sound.emit('ui_error');
      hud.showToast(getBundle(view.locale).msg_tech_locked, true);
    }
    renderHudNow();
  },
  onSetMachineClock: (entityId: number, clock: number) => {
    sound.unlock();
    if (setMachineClock(world, entityId, clock, config.free_build.value >= 1)) {
      sound.emit('ui_tick');
    } else {
      sound.emit('ui_error');
    }
    renderHudNow();
  },
  onRotateBuilding: (entityId: number) => {
    const b = world.buildings[entityId];
    if (!b) return;
    sound.unlock();
    if (rotateBuilding(world, b.x, b.y)) {
      sound.emit('build_rotate');
    }
    renderHudNow();
  },
  onRemoveBuilding: (entityId: number) => {
    const b = world.buildings[entityId];
    if (!b) return;
    sound.unlock();
    if (removeBuilding(world, b.x, b.y, true)) {
      sound.emit('build_remove');
      if (!view.reducedMotion) {
        renderer.spawnBurst(b.x + 0.5, b.y + 0.5, 'remove');
      }
      if (view.selectedBuildingId === entityId) {
        view.selectedBuildingId = null;
      }
      renderHudNow();
    }
  },
  onCloseInspector: () => {
    sound.unlock();
    sound.emit('ui_tick');
    view.selectedBuildingId = null;
    renderHudNow();
  },
  onSetActiveTech: (techId: string) => {
    if (!canStartTech(world, techId)) return;
    sound.unlock();
    sound.emit('ui_tick');
    world.activeTechId = techId;
    renderHudNow();
  },
  onUnlockTech: (techId: string) => {
    sound.unlock();
    const t = getBundle(view.locale);
    const ev: SimulationAudioEvent[] = [];
    if (unlockTechFromStockpile(world, techId, ev)) {
      handleAudioEvents(ev);
      renderHudNow();
    } else {
      sound.emit('ui_error');
      hud.showToast(t.msg_no_materials, true);
    }
  },
  onSetConfigKnob: (key: keyof GameConfig, value: number) => {
    const knob = config[key];
    if (!knob || typeof value !== 'number' || !Number.isFinite(value)) return;
    knob.value = Math.max(knob.min, Math.min(knob.max, value));
    renderHudNow();
  },
  onResetConfig: () => {
    sound.unlock();
    sound.emit('ui_tick');
    const defaults = createDefaultConfig();
    for (const key of Object.keys(defaults) as Array<keyof GameConfig>) {
      config[key].value = defaults[key].value;
    }
    renderHudNow();
  },
  onDismissVictory: () => {
    sound.unlock();
    sound.emit('ui_modal_close');
    world.victoryDismissed = true;
    view.activeModal = 'none';
    renderHudNow();
  },
  onPlayUiTick: () => {
    sound.unlock();
    sound.emit('ui_tick');
  },
  onPlayUiError: () => {
    sound.unlock();
    sound.emit('ui_error');
  },
  onPlaySaveSound: () => {
    sound.unlock();
    sound.emit('ui_save');
  },
};

applyUiPreferencesToDom();
const hud = new FactoryHud(hudRoot, hudActions);

const gamepad = new GamepadController(
  {
    onConnected: (id) => {
      const t = getBundle(view.locale);
      const shortName = id.length > 36 ? `${id.slice(0, 33)}...` : id;
      hud.showToast(`${t.msg_gamepad_connected}: ${shortName}`);
    },
    onDisconnected: (id) => {
      const t = getBundle(view.locale);
      const shortName = id.length > 36 ? `${id.slice(0, 33)}...` : id;
      hud.showToast(`${t.msg_gamepad_disconnected}: ${shortName}`, true);
    },
  },
  0.18
);

function handleAudioEvents(events: SimulationAudioEvent[]): void {
  const t = getBundle(view.locale);
  for (const ev of events) {
    if (ev.kind === 'launch') {
      sound.emit('rocket_launch');
      hud.showToast(t.msg_rocket_launch);
      if (view.reducedMotion) {
        world.rocketTimer = 0;
      }
      if (world.victoryAchieved) {
        if (!victoryNotified) {
          victoryNotified = true;
          sound.emit('victory_fanfare');
        }
        if (!world.victoryDismissed) {
          view.activeModal = 'victory';
        }
      }
    } else if (ev.kind === 'tech') {
      const newlyUnlocked = world.unlockedTechs.filter((id) => !knownUnlockedTechs.has(id));
      for (const id of newlyUnlocked) knownUnlockedTechs.add(id);
      sound.emit('tech_unlock');
      if (newlyUnlocked.length === 1 && t.techs[newlyUnlocked[0]]) {
        hud.showToast(`${t.msg_tech_unlocked}: ${t.techs[newlyUnlocked[0]].name}`);
      } else {
        hud.showToast(t.msg_tech_unlocked);
      }
    }
  }
}

function checkPowerSatisfactionNotification(): void {
  if (view.scene !== 'play') return;
  const t = getBundle(view.locale);
  const sat = world.power.satisfaction;
  if (sat < 0.99 && !powerWarnActive) {
    const now = performance.now();
    if (lastPowerToastMs === 0 || now - lastPowerToastMs >= 8000) {
      powerWarnActive = true;
      lastPowerToastMs = now;
      sound.emit('power_brownout');
      hud.showToast(t.msg_power_low, true);
    }
  } else if (sat >= 0.995 && powerWarnActive) {
    powerWarnActive = false;
    sound.emit('power_restored');
    hud.showToast(t.msg_power_restored);
  }
}

function advanceSimTicks(count: number): void {
  for (let i = 0; i < count; i++) {
    const events = tickWorld(world, config);
    if (events.length > 0) handleAudioEvents(events);
  }
  checkPowerSatisfactionNotification();
}

function showPlacementFailure(reason?: string): void {
  const t = getBundle(view.locale);
  sound.emit('ui_error');
  if (reason === 'no_materials') hud.showToast(t.msg_no_materials, true);
  else if (reason === 'locked') hud.showToast(t.msg_tech_locked, true);
  else if (reason === 'needs_ore') hud.showToast(t.msg_needs_ore, true);
  else if (reason === 'needs_vent') hud.showToast(t.msg_needs_vent, true);
}

function commitDragBelts(): void {
  if (dragPath.length === 0 || !isBeltType(view.selectedTool as BuildingId)) return;
  const tool = view.selectedTool as BuildingId;
  let placed = 0;
  let rotated = 0;
  for (const step of dragPath) {
    const existing = getBuildingAt(world, step.x, step.y);
    if (existing && isBeltType(existing.type)) {
      if (rotateBuilding(world, step.x, step.y, step.dir)) {
        rotated++;
      }
      continue;
    }
    const res = placeBuilding(world, tool, step.x, step.y, step.dir, config);
    if (res.ok) {
      placed++;
      if (!view.reducedMotion) {
        renderer.spawnBurst(step.x + 0.5, step.y + 0.5, 'build');
      }
    } else if (res.reason && res.reason !== 'occupied') {
      showPlacementFailure(res.reason);
      break;
    }
  }
  if (placed > 0) sound.emit('build_place');
  else if (rotated > 0) sound.emit('build_rotate');
  dragPath = [];
  renderHudNow();
}

function dismantleAt(tx: number, ty: number): boolean {
  if (!inBounds(tx, ty)) return false;
  const target = getBuildingAt(world, tx, ty);
  if (!removeBuilding(world, tx, ty, true)) return false;
  if (target && view.selectedBuildingId === target.id) {
    view.selectedBuildingId = null;
  }
  sound.emit('build_remove');
  if (!view.reducedMotion) {
    renderer.spawnBurst(tx + 0.5, ty + 0.5, 'remove');
  }
  renderHudNow();
  return true;
}

function handlePrimaryActionAt(tx: number, ty: number, discrete = false): void {
  if (!inBounds(tx, ty)) return;
  const t = getBundle(view.locale);

  if (view.selectedTool === 'bp_copy') {
    if (!copyStart) {
      copyStart = { x: tx, y: ty };
      sound.emit('ui_tick');
      return;
    }
    const bp = createBlueprint(
      world,
      copyStart.x,
      copyStart.y,
      tx,
      ty,
      `${t.bp_prefix}-${view.savedBlueprints.length + 1}`
    );
    copyStart = null;
    if (bp.entries.length > 0) {
      view.savedBlueprints.unshift(bp);
      view.lastBpCode = encodeBlueprint(bp);
      activeBlueprint = bp;
      view.selectedTool = 'bp_stamp';
      sound.emit('bp_copy');
      hud.showToast(t.msg_bp_copied);
    } else {
      sound.emit('ui_error');
      view.selectedTool = 'cursor';
    }
    renderHudNow();
    return;
  }

  if (view.selectedTool === 'bp_stamp' && activeBlueprint) {
    const res = placeBlueprint(world, activeBlueprint, tx, ty, config);
    if (res.placed > 0) {
      sound.emit('bp_stamp');
      if (!view.reducedMotion) {
        let bursts = 0;
        for (const e of activeBlueprint.entries) {
          if (bursts >= 12) break;
          const bx = tx + e.dx;
          const by = ty + e.dy;
          if (inBounds(bx, by) && getBuildingAt(world, bx, by)?.type === e.type) {
            renderer.spawnBurst(bx + 0.5, by + 0.5, 'build');
            bursts++;
          }
        }
      }
    } else {
      sound.emit('ui_error');
    }
    renderHudNow();
    return;
  }

  if (view.selectedTool === 'deconstruct') {
    dismantleAt(tx, ty);
    return;
  }

  if (view.selectedTool === 'mine') {
    const mined = mineTileManual(world, tx, ty);
    if (mined) {
      mineBeam = { tx, ty, timer: 0.25 };
      sound.emit('mine_hit');
      if (!view.reducedMotion) {
        renderer.spawnBurst(tx + 0.5, ty + 0.5, 'mine');
      }
      renderHudNow();
    }
    return;
  }

  if (view.selectedTool in BUILDINGS) {
    const bType = view.selectedTool as BuildingId;
    if (isBeltType(bType)) {
      if (discrete) {
        const existing = getBuildingAt(world, tx, ty);
        if (existing && isBeltType(existing.type)) {
          if (rotateBuilding(world, tx, ty, toolDir)) {
            sound.emit('build_rotate');
          }
          renderHudNow();
          return;
        }
        const check = canPlaceBuilding(world, bType, tx, ty, config);
        if (!check.ok) {
          if (check.reason !== 'occupied') showPlacementFailure(check.reason);
          return;
        }
        const res = placeBuilding(world, bType, tx, ty, toolDir, config);
        if (res.ok) {
          sound.emit('build_place');
          if (!view.reducedMotion) {
            renderer.spawnBurst(tx + 0.5, ty + 0.5, 'build');
          }
          renderHudNow();
        }
        return;
      }
      dragPath = [{ x: tx, y: ty, dir: toolDir }];
      return;
    }

    const check = canPlaceBuilding(world, bType, tx, ty, config);
    if (!check.ok) {
      if (check.reason !== 'occupied') showPlacementFailure(check.reason);
      return;
    }
    const res = placeBuilding(world, bType, tx, ty, toolDir, config);
    if (res.ok) {
      sound.emit('build_place');
      if (!view.reducedMotion) {
        renderer.spawnBurst(tx + 0.5, ty + 0.5, 'build');
      }
      renderHudNow();
    }
    return;
  }

  // Cursor mode: inspect building OR mine ore manually
  const b = getBuildingAt(world, tx, ty);
  if (b) {
    view.selectedBuildingId = b.id;
    sound.emit('ui_tick');
    renderHudNow();
  } else {
    view.selectedBuildingId = null;
    const mined = mineTileManual(world, tx, ty);
    if (mined) {
      mineBeam = { tx, ty, timer: 0.25 };
      sound.emit('mine_hit');
      if (!view.reducedMotion) {
        renderer.spawnBurst(tx + 0.5, ty + 0.5, 'mine');
      }
    }
    renderHudNow();
  }
}

function handleRotateAction(shiftKey: boolean): void {
  const steps = shiftKey ? 3 : 1;
  if (view.selectedTool === 'bp_stamp' && activeBlueprint) {
    activeBlueprint = rotateBlueprint(activeBlueprint, steps);
  } else if (view.selectedTool === 'cursor') {
    const hovered = hoverTile ? getBuildingAt(world, hoverTile.x, hoverTile.y) : null;
    const target =
      hovered ??
      (view.selectedBuildingId !== null ? world.buildings[view.selectedBuildingId] ?? null : null);
    if (target) {
      rotateBuilding(world, target.x, target.y);
    } else {
      toolDir = rotateDirCW(toolDir, steps);
    }
  } else {
    toolDir = rotateDirCW(toolDir, steps);
  }
  sound.emit('build_rotate');
  renderHudNow();
}

function handlePipetteAction(): void {
  if (!hoverTile) return;
  const b = getBuildingAt(world, hoverTile.x, hoverTile.y);
  if (b && b.type !== 'orbital_hub') {
    view.selectedTool = b.type;
    toolDir = b.dir;
    sound.emit('ui_tick');
    renderHudNow();
  }
}

function cycleHotbarCategory(delta: -1 | 1): void {
  const idx = HOTBAR_CATEGORIES.findIndex((c) => c.id === view.activeCategory);
  const nextIdx =
    (Math.max(0, idx) + delta + HOTBAR_CATEGORIES.length) % HOTBAR_CATEGORIES.length;
  hudActions.onSelectCategory(HOTBAR_CATEGORIES[nextIdx].id);
}

function cycleHotbarSlot(delta: -1 | 1): void {
  const list =
    HOTBAR_CATEGORIES.find((c) => c.id === view.activeCategory)?.items ??
    HOTBAR_CATEGORIES[0].items;
  const freeBuild = config.free_build.value >= 1;
  const unlocked = list.filter((id) => freeBuild || isBuildingUnlocked(world, id));
  if (unlocked.length === 0) return;
  const curIdx = unlocked.indexOf(view.selectedTool as BuildingId);
  const nextIdx =
    curIdx === -1
      ? delta > 0
        ? 0
        : unlocked.length - 1
      : (curIdx + delta + unlocked.length) % unlocked.length;
  hudActions.onSelectTool(unlocked[nextIdx]);
}

function handleKeyPress(key: string, shiftKey = false, ctrlKey = false): void {
  if (view.scene === 'title') {
    if (key === 'Enter') {
      sound.unlock();
      sound.emit('ui_tick');
      startNewFactory();
    }
    return;
  }

  const lower = key.toLowerCase();

  if (key === 'Escape') {
    if (view.activeModal !== 'none') {
      hudActions.onOpenModal('none');
    } else if (view.selectedTool !== 'cursor') {
      view.selectedTool = 'cursor';
      dragPath = [];
      copyStart = null;
      sound.emit('ui_tick');
      renderHudNow();
    } else if (view.selectedBuildingId !== null) {
      view.selectedBuildingId = null;
      sound.emit('ui_tick');
      renderHudNow();
    }
    return;
  }

  // Block background canvas hotkeys while a modal is open
  if (view.activeModal !== 'none') {
    if (lower === 't' && view.activeModal === 'tech') hudActions.onOpenModal('none');
    else if (lower === 'p' && view.activeModal === 'stats') hudActions.onOpenModal('none');
    else if (lower === 'b' && view.activeModal === 'blueprints') hudActions.onOpenModal('none');
    else if (lower === 'g' && view.activeModal === 'tweak') hudActions.onOpenModal('none');
    else if ((lower === 'h' || key === '?') && view.activeModal === 'help') {
      hudActions.onOpenModal('none');
    }
    return;
  }

  if (ctrlKey && lower === 'c') {
    view.selectedTool = 'bp_copy';
    copyStart = null;
    sound.emit('ui_tick');
    renderHudNow();
    return;
  }

  if (key === 'Alt') {
    hudActions.onToggleAltMode();
    return;
  }

  if (lower === 'v') {
    hudActions.onTogglePowerOverlay();
    return;
  }

  if (lower === 'r') {
    handleRotateAction(shiftKey);
    return;
  }

  if (lower === 'q') {
    handlePipetteAction();
    return;
  }

  if (key === 'Home') {
    resetCamera();
    hoverTile = { x: HUB_ORIGIN + 1, y: HUB_ORIGIN + 1 };
    sound.emit('ui_tick');
    return;
  }

  if (lower === 'i') {
    moveGridCursor(0, -1);
    return;
  }
  if (lower === 'k') {
    moveGridCursor(0, 1);
    return;
  }
  if (lower === 'j') {
    moveGridCursor(-1, 0);
    return;
  }
  if (lower === 'l') {
    moveGridCursor(1, 0);
    return;
  }

  if (key === 'Enter') {
    if (world.rocketTimer > 0) {
      hudActions.onSkipRocketAnimation();
      return;
    }
    const tile = ensureHoverTile();
    handlePrimaryActionAt(tile.x, tile.y, true);
    return;
  }

  if (key === 'Delete' || key === 'Backspace') {
    const tile = ensureHoverTile();
    dismantleAt(tile.x, tile.y);
    return;
  }

  if (key === '[') {
    cycleHotbarCategory(-1);
    return;
  }
  if (key === ']') {
    cycleHotbarCategory(1);
    return;
  }

  if (lower === 't') {
    hudActions.onOpenModal('tech');
    return;
  }
  if (lower === 'p') {
    hudActions.onOpenModal('stats');
    return;
  }
  if (lower === 'b') {
    hudActions.onOpenModal('blueprints');
    return;
  }
  if (lower === 'g') {
    hudActions.onOpenModal('tweak');
    return;
  }
  if (lower === 'h' || key === '?') {
    hudActions.onOpenModal('help');
    return;
  }
  if (lower === 'm') {
    hudActions.onToggleMute();
    return;
  }
  if (key === ' ') {
    if (world.rocketTimer > 0) {
      hudActions.onSkipRocketAnimation();
    } else {
      hudActions.onSetSimSpeed(view.simSpeed === 0 ? 1 : 0);
    }
    return;
  }

  // Hotbar keys 1..9, 0
  if (/^[0-9]$/.test(key)) {
    const slots = hud.getHotbarSlotButtons();
    const idx = key === '0' ? 9 : Number(key) - 1;
    const btn = slots[idx];
    if (btn) btn.click();
  }
}

function getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

// Mouse & Keyboard Bindings
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (view.scene !== 'play' || view.activeModal !== 'none') return;
  sound.unlock();

  const pos = getCanvasCoords(e.clientX, e.clientY);

  if (e.button === 1 || (e.button === 0 && keysHeld.has(' '))) {
    isPanDown = true;
    panLast = { x: e.clientX, y: e.clientY };
    return;
  }

  if (e.button === 0 && renderer.hitTestMinimap(pos.x, pos.y, cam)) {
    return;
  }

  const tile = renderer.screenToTile(pos.x, pos.y, viewportW, viewportH, cam);
  hoverTile = tile;

  if (e.button === 0) {
    isLeftDown = true;
    handlePrimaryActionAt(tile.x, tile.y, false);
  } else if (e.button === 2) {
    isRightDown = true;
    if (view.selectedTool !== 'cursor') {
      view.selectedTool = 'cursor';
      dragPath = [];
      copyStart = null;
      renderHudNow();
    } else {
      dismantleAt(tile.x, tile.y);
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (view.scene !== 'play' || view.activeModal !== 'none') return;
  if (isPanDown) {
    const tilePx = BASE_TILE_PX * cam.zoom;
    cam.x = Math.max(0, Math.min(world.size, cam.x - (e.clientX - panLast.x) / tilePx));
    cam.y = Math.max(0, Math.min(world.size, cam.y - (e.clientY - panLast.y) / tilePx));
    panLast = { x: e.clientX, y: e.clientY };
    return;
  }

  const pos = getCanvasCoords(e.clientX, e.clientY);
  const tile = renderer.screenToTile(pos.x, pos.y, viewportW, viewportH, cam);
  hoverTile = tile;

  if (isLeftDown && isBeltType(view.selectedTool as BuildingId) && inBounds(tile.x, tile.y)) {
    const last = dragPath[dragPath.length - 1];
    if (!last || last.x !== tile.x || last.y !== tile.y) {
      const cur = last ? { ...last } : { x: tile.x, y: tile.y, dir: toolDir };
      if (!last) dragPath.push(cur);
      while (cur.x !== tile.x || cur.y !== tile.y) {
        const dx = tile.x - cur.x;
        const dy = tile.y - cur.y;
        let nx = cur.x;
        let ny = cur.y;
        let stepDir: Direction = cur.dir;
        if (Math.abs(dx) >= Math.abs(dy)) {
          nx += Math.sign(dx);
          stepDir = dx > 0 ? 1 : 3;
        } else {
          ny += Math.sign(dy);
          stepDir = dy > 0 ? 2 : 0;
        }
        if (dragPath.length > 0) {
          dragPath[dragPath.length - 1].dir = stepDir;
        }
        toolDir = stepDir;
        dragPath.push({ x: nx, y: ny, dir: stepDir });
        sound.emit('belt_drag_step');
        cur.x = nx;
        cur.y = ny;
        cur.dir = stepDir;
      }
    }
  } else if (isRightDown && view.selectedTool === 'cursor' && inBounds(tile.x, tile.y)) {
    dismantleAt(tile.x, tile.y);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isLeftDown) {
    isLeftDown = false;
    commitDragBelts();
  }
  if (e.button === 2) isRightDown = false;
  if (e.button === 1 || e.button === 0) isPanDown = false;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (view.scene !== 'play' || view.activeModal !== 'none') return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    cam.zoom = Math.max(0.38, Math.min(2.2, cam.zoom * factor));
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  const targetEl = e.target as HTMLElement | null;
  const tag = targetEl?.tagName;
  const isTextOrFormInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    if (view.activeModal !== 'none') {
      e.preventDefault();
      hudActions.onOpenModal('none');
      return;
    }
    if (isTextOrFormInput && targetEl) {
      targetEl.blur();
      return;
    }
    handleKeyPress('Escape', e.shiftKey, e.ctrlKey);
    return;
  }

  if (e.key === 'Tab' && view.activeModal !== 'none') {
    if (hud.handleFocusTrapTab(e.shiftKey)) {
      e.preventDefault();
    }
    return;
  }

  if (isTextOrFormInput) return;

  if (view.scene === 'title' && hud.isTitleInteractiveTarget(targetEl)) {
    if (e.key === 'Enter' || e.key === ' ') return;
  }

  if (
    view.scene === 'play' &&
    view.activeModal === 'none' &&
    hud.isRootInteractiveTarget(targetEl) &&
    (e.key === 'Enter' || e.key === ' ')
  ) {
    return;
  }

  if (e.key === 'Alt') e.preventDefault();
  if (e.key === 'Backspace' || e.key === 'Home') e.preventDefault();

  if (view.activeModal === 'none') {
    keysHeld.add(e.key.toLowerCase());
  }

  handleKeyPress(e.key, e.shiftKey, e.ctrlKey);
});

window.addEventListener('keyup', (e) => {
  keysHeld.delete(e.key.toLowerCase());
});

window.addEventListener('blur', () => {
  keysHeld.clear();
  isLeftDown = false;
  isRightDown = false;
  isPanDown = false;
});

function resizeCanvas(): void {
  currentDpr = Math.max(1, window.devicePixelRatio || 1);
  viewportW = Math.max(1, window.innerWidth);
  viewportH = Math.max(1, window.innerHeight);
  canvas.width = Math.round(viewportW * currentDpr);
  canvas.height = Math.round(viewportH * currentDpr);
  canvas.style.width = `${viewportW}px`;
  canvas.style.height = `${viewportH}px`;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Install deterministic automation & test hook
installGameHook({
  getScene: () => (isFiguresScene ? 'figures' : view.scene),
  getWorld: () => world,
  getUi: () => ({
    locale: view.locale,
    uiScale: view.uiScale,
    colorblindMode: view.colorblindMode,
    reducedMotion: view.reducedMotion,
    activeModal: view.activeModal,
    selectedTool: view.selectedTool,
    showAltMode: view.showAltMode,
    showPowerOverlay: view.showPowerOverlay,
    rocketTimer: world.rocketTimer,
    hoverTile: hoverTile ? { ...hoverTile } : null,
  }),
  pressKey: (k) => handleKeyPress(k),
  holdKey: (k, sec) => {
    const key = k.toLowerCase();
    const stepDt = 1 / 60;
    const frames = Math.max(1, Math.round(sec * 60));
    for (let i = 0; i < frames; i++) {
      const panSpeed = (12 / cam.zoom) * stepDt;
      if (key === 'w' || key === 'arrowup') cam.y = Math.max(0, cam.y - panSpeed);
      if (key === 's' || key === 'arrowdown') cam.y = Math.min(world.size, cam.y + panSpeed);
      if (key === 'a' || key === 'arrowleft') cam.x = Math.max(0, cam.x - panSpeed);
      if (key === 'd' || key === 'arrowright') cam.x = Math.min(world.size, cam.x + panSpeed);
    }
  },
  stepSim: (sec) => {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return;
    const capped = Math.min(3600, sec);
    const ticks = Math.max(1, Math.round(capped / DT));
    advanceSimTicks(ticks);
    renderHudNow();
  },
});

if (!isFiguresScene) {
  renderHudNow();
} else {
  hudRoot.classList.add('hidden');
}

function handleGamepadFrame(realDt: number): void {
  const gp = gamepad.poll(realDt);
  if (!gp.connected) return;

  if (view.scene === 'title') {
    const navDelta = gp.navStepY !== 0 ? gp.navStepY : gp.navStepX;
    if (navDelta !== 0) {
      hud.moveContainerFocus('title', navDelta);
    }
    if (gp.pressed.a || gp.pressed.start) {
      sound.unlock();
      hud.activateFocusedOrDefault('title');
    }
    return;
  }

  if (view.activeModal !== 'none') {
    if (gp.navStepY !== 0) {
      hud.moveContainerFocus('modal', gp.navStepY);
    } else if (gp.navStepX !== 0) {
      if (!hud.adjustFocusedControl(gp.navStepX)) {
        hud.moveContainerFocus('modal', gp.navStepX);
      }
    }
    if (gp.pressed.a) {
      sound.unlock();
      hud.activateFocusedOrDefault('modal');
    }
    if (gp.pressed.b || gp.pressed.start) {
      hudActions.onOpenModal('none');
    }
    return;
  }

  const panSpeed = (13 / cam.zoom) * realDt;
  if (gp.panX !== 0) {
    cam.x = Math.max(0, Math.min(world.size, cam.x + gp.panX * panSpeed));
  }
  if (gp.panY !== 0) {
    cam.y = Math.max(0, Math.min(world.size, cam.y + gp.panY * panSpeed));
  }
  if (Math.abs(gp.zoomDelta) > 0.05) {
    cam.zoom = Math.max(0.38, Math.min(2.2, cam.zoom * (1 + gp.zoomDelta * realDt * 1.4)));
  }

  if (gp.cursorStepX !== 0 || gp.cursorStepY !== 0) {
    moveGridCursor(gp.cursorStepX, gp.cursorStepY);
  }

  if (gp.pressed.a) {
    sound.unlock();
    if (world.rocketTimer > 0) {
      hudActions.onSkipRocketAnimation();
    } else {
      const tile = ensureHoverTile();
      handlePrimaryActionAt(tile.x, tile.y, true);
    }
  }
  if (gp.pressed.b) {
    sound.unlock();
    if (view.selectedTool !== 'cursor') {
      hudActions.onSelectTool('cursor');
      dragPath = [];
      copyStart = null;
    } else if (hoverTile && getBuildingAt(world, hoverTile.x, hoverTile.y)) {
      dismantleAt(hoverTile.x, hoverTile.y);
    } else if (view.selectedBuildingId !== null) {
      hudActions.onCloseInspector();
    }
  }
  if (gp.pressed.x) {
    sound.unlock();
    handleRotateAction(false);
  }
  if (gp.pressed.y) {
    sound.unlock();
    handlePipetteAction();
  }
  if (gp.pressed.lb) {
    sound.unlock();
    cycleHotbarSlot(-1);
  }
  if (gp.pressed.rb) {
    sound.unlock();
    cycleHotbarSlot(1);
  }
  if (gp.pressed.select) {
    hudActions.onToggleAltMode();
  }
  if (gp.pressed.start) {
    hudActions.onOpenModal('help');
  }
}

let prevTimeMs = performance.now();
function frameLoop(nowMs: number): void {
  const realDt = Math.min(0.1, Math.max(0, (nowMs - prevTimeMs) / 1000));
  prevTimeMs = nowMs;

  const latestDpr = Math.max(1, window.devicePixelRatio || 1);
  if (latestDpr !== currentDpr) {
    resizeCanvas();
  }
  ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

  const renderTimeSec = view.reducedMotion ? 0.35 : nowMs / 1000;

  if (isFiguresScene) {
    sound.updateAmbient(0, 1, true);
    renderFiguresGallery(
      ctx,
      viewportW,
      viewportH,
      view.locale,
      renderTimeSec,
      getFiguresLabels()
    );
    requestAnimationFrame(frameLoop);
    return;
  }

  handleGamepadFrame(realDt);

  if (view.scene === 'play') {
    if (view.activeModal === 'none') {
      const panSpeed = (13 / cam.zoom) * realDt;
      if (keysHeld.has('w') || keysHeld.has('arrowup')) cam.y = Math.max(0, cam.y - panSpeed);
      if (keysHeld.has('s') || keysHeld.has('arrowdown')) cam.y = Math.min(world.size, cam.y + panSpeed);
      if (keysHeld.has('a') || keysHeld.has('arrowleft')) cam.x = Math.max(0, cam.x - panSpeed);
      if (keysHeld.has('d') || keysHeld.has('arrowright')) cam.x = Math.min(world.size, cam.x + panSpeed);
    }

    if (mineBeam && mineBeam.timer > 0) {
      mineBeam.timer = Math.max(0, mineBeam.timer - realDt);
    }

    if (view.simSpeed > 0) {
      simAccumulator += realDt * view.simSpeed;
      let steps = 0;
      while (simAccumulator >= DT && steps < 12) {
        advanceSimTicks(1);
        simAccumulator -= DT;
        steps++;
      }
      if (steps === 12) simAccumulator = 0;
    }

    autosaveTimer += realDt;
    if (autosaveTimer >= 30) {
      autosaveTimer = 0;
      saveToStorage(world);
    }

    if (nowMs - lastHudRenderMs > 250) {
      lastHudRenderMs = nowMs;
      renderHudNow();
    }
  }

  let activeMachines = 0;
  if (view.scene === 'play' && view.simSpeed > 0) {
    const buildings = world.buildings;
    for (const k in buildings) {
      if (buildings[k].status === 'working') activeMachines++;
    }
  }
  sound.updateAmbient(
    activeMachines,
    world.power.satisfaction,
    view.simSpeed === 0 || view.scene !== 'play'
  );

  renderOpts.showAltMode = view.showAltMode;
  renderOpts.showPowerOverlay = view.showPowerOverlay;
  renderOpts.colorblind = view.colorblind;
  renderOpts.colorblindMode =
    view.colorblindMode === 'default' ? 'none' : view.colorblindMode;
  renderOpts.selectedTool = view.selectedTool;
  renderOpts.toolDir = toolDir;
  renderOpts.hoverTile = hoverTile;
  renderOpts.dragPath = dragPath;
  renderOpts.activeBlueprint = activeBlueprint;
  renderOpts.copyStart = copyStart;
  renderOpts.selectedBuildingId = view.selectedBuildingId;
  renderOpts.mineBeam = mineBeam;
  renderOpts.simAlpha = view.simSpeed > 0 ? Math.min(1, simAccumulator / DT) : 0;
  renderOpts.reducedMotion = view.reducedMotion;
  renderOpts.uiScale = view.uiScale;

  renderer.render(ctx, viewportW, viewportH, world, cam, renderTimeSec, renderOpts);

  requestAnimationFrame(frameLoop);
}

requestAnimationFrame(frameLoop);
