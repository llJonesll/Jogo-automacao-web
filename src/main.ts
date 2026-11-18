import {
  BUILDINGS,
  DT,
  HUB_ORIGIN,
  HUB_SIZE,
  createDefaultConfig,
  isBeltType,
  rotateDirCW,
} from './core/data';
import type { BlueprintData, BuildingId, Direction, GameConfig, WorldState } from './core/types';
import { SoundEngine } from './audio/synth';
import {
  createBlueprint,
  encodeBlueprint,
  placeBlueprint,
  rotateBlueprint,
} from './game/blueprints';
import { createDemoWorld } from './game/demo';
import { tickWorld } from './game/progression';
import { deserializeWorld, loadFromStorage, saveToStorage } from './game/save';
import {
  canPlaceBuilding,
  createWorld,
  getBuildingAt,
  inBounds,
  mineTileManual,
  placeBuilding,
  removeBuilding,
  rotateBuilding,
} from './game/world';
import { installGameHook } from './hook';
import { CameraState, FactoryRenderer } from './render/renderer';
import { renderFiguresGallery } from './render/sprites';
import './style.css';
import { FactoryHud, HudViewState, ModalId, ToolSelection } from './ui/hud';
import { getBundle } from './ui/i18n';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud-root') as HTMLElement;
const ctx = canvas.getContext('2d')!;

const isFiguresScene =
  new URLSearchParams(window.location.search).get('scene') === 'figures';

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
  locale: 'pt-BR',
  colorblind: false,
  muted: false,
  simSpeed: 1,
  showAltMode: true,
  selectedTool: 'cursor',
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

function resetCamera(): void {
  cam.x = HUB_ORIGIN + HUB_SIZE * 0.5;
  cam.y = HUB_ORIGIN + HUB_SIZE * 0.5;
  cam.zoom = 1.0;
}

const hud = new FactoryHud(hudRoot, {
  onStartNew: () => {
    sound.unlock();
    sound.playUiTick();
    world = createWorld(config.seed.value);
    view.scene = 'play';
    view.selectedTool = 'cursor';
    view.selectedBuildingId = null;
    view.activeModal = 'none';
    resetCamera();
    hud.render(world, config, view);
  },
  onContinueSave: () => {
    sound.unlock();
    sound.playUiTick();
    const loaded = loadFromStorage();
    if (loaded) {
      world = loaded;
      view.scene = 'play';
      view.activeModal = 'none';
      resetCamera();
      hud.showToast(getBundle(view.locale).msg_loaded);
    }
    hud.render(world, config, view);
  },
  onStartDemo: () => {
    sound.unlock();
    sound.playUiTick();
    world = createDemoWorld(config);
    view.scene = 'play';
    view.selectedTool = 'cursor';
    view.selectedBuildingId = null;
    view.activeModal = 'none';
    cam.x = HUB_ORIGIN + 1;
    cam.y = HUB_ORIGIN + 1;
    cam.zoom = 0.85;
    hud.render(world, config, view);
  },
  onToggleLocale: () => {
    sound.unlock();
    sound.playUiTick();
    view.locale = view.locale === 'pt-BR' ? 'en' : 'pt-BR';
    hud.render(world, config, view);
  },
  onToggleColorblind: () => {
    sound.unlock();
    sound.playUiTick();
    view.colorblind = !view.colorblind;
    hud.render(world, config, view);
  },
  onSelectTool: (tool: ToolSelection) => {
    sound.unlock();
    sound.playUiTick();
    view.selectedTool = tool;
    if (tool !== 'cursor') view.selectedBuildingId = null;
    if (tool !== 'bp_copy') copyStart = null;
    hud.render(world, config, view);
  },
  onSetSimSpeed: (speed: number) => {
    sound.unlock();
    sound.playUiTick();
    view.simSpeed = speed;
    hud.render(world, config, view);
  },
  onToggleAltMode: () => {
    sound.unlock();
    sound.playUiTick();
    view.showAltMode = !view.showAltMode;
    hud.render(world, config, view);
  },
  onToggleMute: () => {
    sound.unlock();
    view.muted = sound.toggleMute();
    hud.render(world, config, view);
  },
  onOpenModal: (modal: ModalId) => {
    sound.unlock();
    sound.playUiTick();
    view.activeModal = modal;
    hud.render(world, config, view);
  },
  onSaveLocal: () => {
    saveToStorage(world);
  },
  onImportSaveText: (json: string) => {
    const res = deserializeWorld(json);
    const t = getBundle(view.locale);
    if (!res.ok) {
      hud.showToast(t.msg_save_invalid, true);
      return;
    }
    world = res.world;
    view.activeModal = 'none';
    resetCamera();
    hud.showToast(t.msg_loaded);
    hud.render(world, config, view);
  },
  onStampBlueprint: (bp: BlueprintData) => {
    activeBlueprint = { ...bp, entries: bp.entries.map((e) => ({ ...e })) };
    view.selectedTool = 'bp_stamp';
    hud.render(world, config, view);
  },
  onMutateWorld: () => {
    hud.render(world, config, view);
  },
  onPlayTechSound: () => sound.playTechUnlock(),
  onPlayLaunchSound: () => sound.playRocketLaunch(),
  onPlayUiTick: () => sound.playUiTick(),
});

function handleAudioEvents(events: Array<{ kind: 'launch' | 'tech' }>): void {
  const t = getBundle(view.locale);
  for (const ev of events) {
    if (ev.kind === 'launch') {
      sound.playRocketLaunch();
      hud.showToast(t.msg_rocket_launch);
      if (world.victoryAchieved && !world.victoryDismissed) {
        view.activeModal = 'victory';
      }
    } else if (ev.kind === 'tech') {
      sound.playTechUnlock();
    }
  }
}

function advanceSimTicks(count: number): void {
  for (let i = 0; i < count; i++) {
    const events = tickWorld(world, config);
    if (events.length > 0) handleAudioEvents(events);
  }
}

function showPlacementFailure(reason?: string): void {
  const t = getBundle(view.locale);
  if (reason === 'no_materials') hud.showToast(t.msg_no_materials, true);
  else if (reason === 'locked') hud.showToast(t.msg_tech_locked, true);
  else if (reason === 'needs_ore') hud.showToast(t.msg_needs_ore, true);
  else if (reason === 'needs_vent') hud.showToast(t.msg_needs_vent, true);
}

function commitDragBelts(): void {
  if (dragPath.length === 0 || !isBeltType(view.selectedTool as BuildingId)) return;
  const tool = view.selectedTool as BuildingId;
  let placed = 0;
  for (const step of dragPath) {
    const existing = getBuildingAt(world, step.x, step.y);
    if (existing && isBeltType(existing.type)) {
      rotateBuilding(world, step.x, step.y, step.dir);
      continue;
    }
    const res = placeBuilding(world, tool, step.x, step.y, step.dir, config);
    if (res.ok) placed++;
    else if (res.reason && res.reason !== 'occupied') {
      showPlacementFailure(res.reason);
      break;
    }
  }
  if (placed > 0) sound.playPlace();
  dragPath = [];
  hud.render(world, config, view);
}

function handlePrimaryClickAt(tx: number, ty: number): void {
  if (!inBounds(tx, ty)) return;

  if (view.selectedTool === 'bp_copy') {
    if (!copyStart) {
      copyStart = { x: tx, y: ty };
      return;
    }
    const bp = createBlueprint(
      world,
      copyStart.x,
      copyStart.y,
      tx,
      ty,
      `BP-${view.savedBlueprints.length + 1}`
    );
    copyStart = null;
    if (bp.entries.length > 0) {
      view.savedBlueprints.unshift(bp);
      view.lastBpCode = encodeBlueprint(bp);
      activeBlueprint = bp;
      view.selectedTool = 'bp_stamp';
      hud.showToast(getBundle(view.locale).msg_bp_copied);
    } else {
      view.selectedTool = 'cursor';
    }
    hud.render(world, config, view);
    return;
  }

  if (view.selectedTool === 'bp_stamp' && activeBlueprint) {
    const res = placeBlueprint(world, activeBlueprint, tx, ty, config);
    if (res.placed > 0) sound.playPlace();
    hud.render(world, config, view);
    return;
  }

  if (view.selectedTool === 'deconstruct') {
    if (removeBuilding(world, tx, ty, true)) {
      sound.playRemove();
      hud.render(world, config, view);
    }
    return;
  }

  if (view.selectedTool in BUILDINGS) {
    const bType = view.selectedTool as BuildingId;
    if (isBeltType(bType)) {
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
      sound.playPlace();
      hud.render(world, config, view);
    }
    return;
  }

  // Cursor mode: inspect building OR mine ore manually
  const b = getBuildingAt(world, tx, ty);
  if (b) {
    view.selectedBuildingId = b.id;
    sound.playUiTick();
    hud.render(world, config, view);
  } else {
    view.selectedBuildingId = null;
    const mined = mineTileManual(world, tx, ty);
    if (mined) {
      mineBeam = { tx, ty, timer: 0.25 };
      sound.playMine();
    }
    hud.render(world, config, view);
  }
}

function handleKeyPress(key: string, shiftKey = false, ctrlKey = false): void {
  if (view.scene === 'title') {
    if (key === 'Enter') {
      view.scene = 'play';
      hud.render(world, config, view);
    }
    return;
  }

  const lower = key.toLowerCase();
  if (ctrlKey && lower === 'c') {
    view.selectedTool = 'bp_copy';
    copyStart = null;
    hud.render(world, config, view);
    return;
  }

  if (key === 'Escape') {
    if (view.activeModal !== 'none') view.activeModal = 'none';
    else if (view.selectedTool !== 'cursor') {
      view.selectedTool = 'cursor';
      dragPath = [];
      copyStart = null;
    } else {
      view.selectedBuildingId = null;
    }
    hud.render(world, config, view);
    return;
  }

  if (key === 'Alt') {
    view.showAltMode = !view.showAltMode;
    hud.render(world, config, view);
    return;
  }

  if (lower === 'r') {
    const steps = shiftKey ? 3 : 1;
    if (view.selectedTool === 'bp_stamp' && activeBlueprint) {
      activeBlueprint = rotateBlueprint(activeBlueprint, steps);
    } else if (view.selectedTool === 'cursor' && hoverTile) {
      const hovered = getBuildingAt(world, hoverTile.x, hoverTile.y);
      if (hovered) rotateBuilding(world, hoverTile.x, hoverTile.y);
    } else {
      toolDir = rotateDirCW(toolDir, steps);
    }
    sound.playUiTick();
    hud.render(world, config, view);
    return;
  }

  if (lower === 'q' && hoverTile) {
    const b = getBuildingAt(world, hoverTile.x, hoverTile.y);
    if (b && b.type !== 'orbital_hub') {
      view.selectedTool = b.type;
      toolDir = b.dir;
      sound.playUiTick();
      hud.render(world, config, view);
    }
    return;
  }

  if (lower === 't') {
    view.activeModal = view.activeModal === 'tech' ? 'none' : 'tech';
    hud.render(world, config, view);
    return;
  }
  if (lower === 'p') {
    view.activeModal = view.activeModal === 'stats' ? 'none' : 'stats';
    hud.render(world, config, view);
    return;
  }
  if (lower === 'b') {
    view.activeModal = view.activeModal === 'blueprints' ? 'none' : 'blueprints';
    hud.render(world, config, view);
    return;
  }
  if (lower === 'g') {
    view.activeModal = view.activeModal === 'tweak' ? 'none' : 'tweak';
    hud.render(world, config, view);
    return;
  }
  if (lower === 'h' || key === '?') {
    view.activeModal = view.activeModal === 'help' ? 'none' : 'help';
    hud.render(world, config, view);
    return;
  }
  if (lower === 'm') {
    view.muted = sound.toggleMute();
    hud.render(world, config, view);
    return;
  }
  if (key === ' ') {
    view.simSpeed = view.simSpeed === 0 ? 1 : 0;
    hud.render(world, config, view);
    return;
  }

  // Hotbar keys 1..9, 0
  if (/^[0-9]$/.test(key)) {
    const slots = hudRoot.querySelectorAll<HTMLButtonElement>('.hotbar-slot');
    const idx = key === '0' ? 9 : Number(key) - 1;
    const btn = slots[idx];
    if (btn) btn.click();
  }
}

// Mouse & Keyboard Bindings
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (view.scene !== 'play') return;
  sound.unlock();

  if (e.button === 1 || (e.button === 0 && keysHeld.has(' '))) {
    isPanDown = true;
    panLast = { x: e.clientX, y: e.clientY };
    return;
  }

  if (e.button === 0 && renderer.hitTestMinimap(e.clientX, e.clientY, cam)) {
    return;
  }

  const tile = renderer.screenToTile(e.clientX, e.clientY, canvas.width, canvas.height, cam);
  hoverTile = tile;

  if (e.button === 0) {
    isLeftDown = true;
    handlePrimaryClickAt(tile.x, tile.y);
  } else if (e.button === 2) {
    isRightDown = true;
    if (view.selectedTool !== 'cursor') {
      view.selectedTool = 'cursor';
      dragPath = [];
      copyStart = null;
      hud.render(world, config, view);
    } else if (removeBuilding(world, tile.x, tile.y, true)) {
      sound.playRemove();
      hud.render(world, config, view);
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (view.scene !== 'play') return;
  if (isPanDown) {
    const tilePx = 48 * cam.zoom;
    cam.x = Math.max(0, Math.min(world.size, cam.x - (e.clientX - panLast.x) / tilePx));
    cam.y = Math.max(0, Math.min(world.size, cam.y - (e.clientY - panLast.y) / tilePx));
    panLast = { x: e.clientX, y: e.clientY };
    return;
  }

  const tile = renderer.screenToTile(e.clientX, e.clientY, canvas.width, canvas.height, cam);
  hoverTile = tile;

  if (isLeftDown && isBeltType(view.selectedTool as BuildingId) && inBounds(tile.x, tile.y)) {
    const last = dragPath[dragPath.length - 1];
    if (!last || last.x !== tile.x || last.y !== tile.y) {
      // Fill orthogonal Manhattan steps so fast mouse drags never skip belt tiles
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
        // Orient previous dragged belt toward this turn!
        if (dragPath.length > 0) {
          dragPath[dragPath.length - 1].dir = stepDir;
        }
        toolDir = stepDir;
        const nextNode = { x: nx, y: ny, dir: stepDir };
        dragPath.push(nextNode);
        cur.x = nx;
        cur.y = ny;
        cur.dir = stepDir;
      }
    }
  } else if (isRightDown && view.selectedTool === 'cursor' && inBounds(tile.x, tile.y)) {
    if (removeBuilding(world, tile.x, tile.y, true)) {
      sound.playRemove();
      hud.render(world, config, view);
    }
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
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    cam.zoom = Math.max(0.38, Math.min(2.2, cam.zoom * factor));
  },
  { passive: false }
);

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  keysHeld.add(e.key.toLowerCase());
  if (e.key === 'Alt') e.preventDefault();
  handleKeyPress(e.key, e.shiftKey, e.ctrlKey);
});

window.addEventListener('keyup', (e) => {
  keysHeld.delete(e.key.toLowerCase());
});

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Install deterministic automation & test hook
installGameHook({
  getScene: () => (isFiguresScene ? 'figures' : view.scene),
  getWorld: () => world,
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
    const ticks = Math.max(1, Math.round(sec / DT));
    advanceSimTicks(ticks);
    hud.render(world, config, view);
  },
});

if (!isFiguresScene) {
  hud.render(world, config, view);
} else {
  hudRoot.classList.add('hidden');
}

let prevTimeMs = performance.now();
function frameLoop(nowMs: number): void {
  const realDt = Math.min(0.1, Math.max(0, (nowMs - prevTimeMs) / 1000));
  prevTimeMs = nowMs;
  const timeSec = nowMs / 1000;

  if (isFiguresScene) {
    renderFiguresGallery(ctx, canvas.width, canvas.height, view.locale, timeSec);
    requestAnimationFrame(frameLoop);
    return;
  }

  if (view.scene === 'play') {
    const panSpeed = (13 / cam.zoom) * realDt;
    if (keysHeld.has('w') || keysHeld.has('arrowup')) cam.y = Math.max(0, cam.y - panSpeed);
    if (keysHeld.has('s') || keysHeld.has('arrowdown')) cam.y = Math.min(world.size, cam.y + panSpeed);
    if (keysHeld.has('a') || keysHeld.has('arrowleft')) cam.x = Math.max(0, cam.x - panSpeed);
    if (keysHeld.has('d') || keysHeld.has('arrowright')) cam.x = Math.min(world.size, cam.x + panSpeed);

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
      hud.render(world, config, view);
    }
  }

  renderer.render(ctx, canvas.width, canvas.height, world, cam, timeSec, {
    showAltMode: view.showAltMode,
    showPowerOverlay: false,
    colorblind: view.colorblind,
    selectedTool: view.selectedTool,
    toolDir,
    hoverTile,
    dragPath,
    activeBlueprint,
    copyStart,
    selectedBuildingId: view.selectedBuildingId,
    mineBeam,
  });

  requestAnimationFrame(frameLoop);
}

requestAnimationFrame(frameLoop);
