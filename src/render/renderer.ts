import {
  BUILDINGS,
  DIR_DX,
  DIR_DY,
  DT,
  HUB_ORIGIN,
  HUB_SIZE,
  ITEMS,
  RECIPES,
  WORLD_SIZE,
  isBeltType,
  isProcessorType,
  oppositeDir,
} from '../core/data';
import type {
  BlueprintData,
  BuildingEntity,
  BuildingId,
  Direction,
  ItemId,
  ResourceType,
  WorldState,
} from '../core/types';
import { getBuildingAt, inBounds, isHubTile, tileIndex } from '../game/world';
import {
  PARTICLE_COLOR_INDEX,
  type ParticleBurstKind,
  ParticlePool,
} from './particles';
import {
  type BuildingGlyphOptions,
  type ColorblindMode,
  drawBuildingGlyph,
  drawItemFromAtlas,
  drawItemIcon,
  statusColor,
} from './sprites';

export const BASE_TILE_PX = 48;

export type { ColorblindMode } from './sprites';
export type { ParticleBurstKind } from './particles';

export interface CameraState {
  x: number; // world center in tile coordinates
  y: number;
  zoom: number;
}

export interface RenderOptions {
  showAltMode: boolean;
  showPowerOverlay?: boolean;
  colorblind: boolean;
  selectedTool: BuildingId | 'cursor' | 'mine' | 'deconstruct' | 'bp_copy' | 'bp_stamp';
  toolDir: Direction;
  hoverTile: { x: number; y: number } | null;
  dragPath: Array<{ x: number; y: number; dir: Direction }>;
  activeBlueprint: BlueprintData | null;
  copyStart: { x: number; y: number } | null;
  selectedBuildingId: number | null;
  mineBeam: { tx: number; ty: number; timer: number } | null;
  simAlpha?: number;
  reducedMotion?: boolean;
  colorblindMode?: ColorblindMode;
  uiScale?: number;
}

interface OreColors {
  base: string;
  fleck: string;
  rgb: readonly [number, number, number];
}

const ORE_PALETTE: Record<Exclude<ResourceType, 'none'>, OreColors> = {
  iron_ore: { base: '#273a4f', fleck: '#7ea8d6', rgb: [126, 168, 214] },
  copper_ore: { base: '#4a2617', fleck: '#eb7d44', rgb: [235, 125, 68] },
  coal: { base: '#14171c', fleck: '#4b5563', rgb: [75, 85, 99] },
  stone: { base: '#373a40', fleck: '#9ca3af', rgb: [156, 163, 175] },
  quartz: { base: '#3b1e54', fleck: '#d8b4fe', rgb: [216, 180, 254] },
  geothermal_vent: { base: '#451208', fleck: '#fb923c', rgb: [251, 146, 60] },
};

const ORE_PALETTE_CB: Record<Exclude<ResourceType, 'none'>, OreColors> = {
  iron_ore: { base: '#1e3a5f', fleck: '#60a5fa', rgb: [96, 165, 250] },
  copper_ore: { base: '#572808', fleck: '#fb923c', rgb: [251, 146, 60] },
  coal: { base: '#14171c', fleck: '#64748b', rgb: [100, 116, 139] },
  stone: { base: '#373a40', fleck: '#cbd5e1', rgb: [203, 213, 225] },
  quartz: { base: '#4c1d95', fleck: '#f0abfc', rgb: [240, 171, 252] },
  geothermal_vent: { base: '#500724', fleck: '#fb7185', rgb: [251, 113, 133] },
};

const TUNNEL_DASH: number[] = [5, 4];
const POWER_DASH: number[] = [4, 4];
const GLOW_TEX_SIZE = 128;

// Pre-cached clock percentage strings & font strings (zero per-frame string churn)
const CLOCK_LABELS = new Map<number, string>();
for (let pct = 50; pct <= 250; pct += 5) {
  CLOCK_LABELS.set(pct, `${pct}%`);
}
const FONT_CACHE = new Map<number, string>();
const POWER_TEXT_CACHE = new Map<number, string>();

function getClockLabel(clock: number): string {
  const pct = Math.round(clock * 100);
  let label = CLOCK_LABELS.get(pct);
  if (!label) {
    label = `${pct}%`;
    CLOCK_LABELS.set(pct, label);
  }
  return label;
}

function getMonoFont(px: number): string {
  let font = FONT_CACHE.get(px);
  if (!font) {
    font = `bold ${px}px monospace`;
    FONT_CACHE.set(px, font);
  }
  return font;
}

function getPowerLabel(mw: number, isGen: boolean): string {
  const tenths = Math.round(mw * 10);
  const key = isGen ? tenths + 100000 : tenths;
  let label = POWER_TEXT_CACHE.get(key);
  if (!label) {
    label = `${isGen ? '+' : ''}${(tenths / 10).toFixed(1)}MW`;
    POWER_TEXT_CACHE.set(key, label);
  }
  return label;
}

function effectiveCbMode(opts: RenderOptions): ColorblindMode {
  if (opts.colorblindMode && opts.colorblindMode !== 'none') return opts.colorblindMode;
  return opts.colorblind ? 'deuteranopia' : 'none';
}

function oreParticleColorIdx(res: ResourceType): number {
  switch (res) {
    case 'iron_ore':
      return PARTICLE_COLOR_INDEX.iron_ore;
    case 'copper_ore':
      return PARTICLE_COLOR_INDEX.copper_ore;
    case 'coal':
      return PARTICLE_COLOR_INDEX.coal;
    case 'stone':
      return PARTICLE_COLOR_INDEX.stone;
    case 'quartz':
      return PARTICLE_COLOR_INDEX.quartz;
    default:
      return PARTICLE_COLOR_INDEX.amber;
  }
}

function drawOreDepositShapes(
  ctx: CanvasRenderingContext2D,
  res: Exclude<ResourceType, 'none'>,
  px: number,
  py: number,
  tilePx: number,
  pal: OreColors,
  x: number,
  y: number
): void {
  ctx.fillStyle = pal.base;
  ctx.fillRect(px + 1, py + 1, tilePx - 2, tilePx - 2);

  if (res === 'geothermal_vent') {
    // Static dark basalt crater; pulsing glow ring is rendered per frame
    const cx = px + tilePx * 0.5;
    const cy = py + tilePx * 0.5;
    ctx.fillStyle = '#1c0a04';
    ctx.beginPath();
    ctx.arc(cx, cy, tilePx * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = Math.max(1, tilePx * 0.05);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = pal.fleck;
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  for (let k = 0; k < 4; k++) {
    const ox = ((h >> (k * 4)) & 7) / 10 + 0.15;
    const oy = ((h >> (k * 4 + 2)) & 7) / 10 + 0.15;
    const cx = px + ox * tilePx * 0.75 + tilePx * 0.07;
    const cy = py + oy * tilePx * 0.75 + tilePx * 0.07;
    const s = tilePx * 0.14;

    if (res === 'iron_ore') {
      // Angular diamond shards
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.65);
      ctx.lineTo(cx + s * 0.65, cy);
      ctx.lineTo(cx, cy + s * 0.65);
      ctx.lineTo(cx - s * 0.65, cy);
      ctx.closePath();
      ctx.fill();
    } else if (res === 'copper_ore') {
      // Faceted triangular nuggets
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.65);
      ctx.lineTo(cx + s * 0.65, cy + s * 0.55);
      ctx.lineTo(cx - s * 0.65, cy + s * 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (res === 'coal') {
      // Rounded anthracite lumps
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (res === 'quartz') {
      // Elongated crystal prism needles
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy - s * 0.8);
      ctx.lineTo(cx + s * 0.35, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.35, cy + s * 0.8);
      ctx.lineTo(cx - s * 0.35, cy + s * 0.45);
      ctx.closePath();
      ctx.fill();
    } else {
      // Stratified stone slabs
      ctx.fillRect(cx - s * 0.65, cy - s * 0.38, s * 1.3, s * 0.76);
    }
  }
}

function isFeederFromSide(
  world: WorldState,
  b: BuildingEntity,
  sideDir: Direction
): boolean {
  const nx = b.x + DIR_DX[sideDir];
  const ny = b.y + DIR_DY[sideDir];
  if (!inBounds(nx, ny)) return false;
  const nb = getBuildingAt(world, nx, ny);
  if (!nb) return false;
  if (nb.type === 'splitter') return true;
  const targetDir = oppositeDir(sideDir);
  if (nb.dir !== targetDir) return false;
  return (
    isBeltType(nb.type) ||
    nb.type === 'merger' ||
    (nb.type === 'tunnel' && nb.tunnelMode === 'exit') ||
    nb.type === 'miner_mk1' ||
    nb.type === 'miner_mk2' ||
    isProcessorType(nb.type)
  );
}

function detectBeltEntryDir(world: WorldState, b: BuildingEntity): Direction | undefined {
  const backDir = oppositeDir(b.dir);
  if (isFeederFromSide(world, b, backDir)) return undefined;
  const leftDir = ((b.dir + 3) & 3) as Direction;
  const rightDir = ((b.dir + 1) & 3) as Direction;
  const fromLeft = isFeederFromSide(world, b, leftDir);
  const fromRight = isFeederFromSide(world, b, rightDir);
  if (fromLeft && !fromRight) return leftDir;
  if (fromRight && !fromLeft) return rightDir;
  return undefined;
}

// Reusable scratch buffers to eliminate hot-loop heap allocations
const scratchPos = { x: 0, y: 0 };
const reusableGlyphOpts: BuildingGlyphOptions = {
  active: false,
  status: 'idle',
  energyRatio: 0,
  tunnelMode: undefined,
  colorblind: 'none',
  geoBonus: 0,
  entryDir: undefined,
  reducedMotion: false,
};

export class FactoryRenderer {
  private minimapBounds = { x: 0, y: 0, w: 144, h: 144 };
  public readonly particles = new ParticlePool();

  // Cached offscreen terrain canvas (rebuilt only when world.seed / cbMode / size changes)
  private terrainCanvas: HTMLCanvasElement | null = null;
  private cachedTerrainSeed = Number.NaN;
  private cachedTerrainSize = -1;
  private cachedTerrainCb: ColorblindMode = 'none';
  private cachedVentTiles: number[] = [];

  // Cached 64x64 offscreen minimap canvas + pixel buffer
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private minimapImgData: ImageData | null = null;
  private lastMinimapSeed = Number.NaN;
  private lastMinimapCb: ColorblindMode = 'none';
  private lastMinimapBuildingCount = -1;
  private lastMinimapTimeSec = -999;

  // Pre-baked radial glow sprites (cyan, orange, indigo)
  private glowCyan: HTMLCanvasElement | null = null;
  private glowOrange: HTMLCanvasElement | null = null;
  private glowIndigo: HTMLCanvasElement | null = null;

  // Timing & emission state
  private lastRenderTimeSec = -1;
  private prevRocketTimer = 0;
  private fxRngState = 0x9e3779b9;

  public dispose(): void {
    this.terrainCanvas = null;
    this.cachedTerrainSeed = Number.NaN;
    this.cachedVentTiles.length = 0;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.minimapImgData = null;
    this.lastMinimapSeed = Number.NaN;
    this.glowCyan = null;
    this.glowOrange = null;
    this.glowIndigo = null;
    this.particles.clear();
  }

  public spawnBurst(worldX: number, worldY: number, kind: ParticleBurstKind): void {
    this.particles.spawnBurst(worldX, worldY, kind);
  }

  private nextFxRand(): number {
    this.fxRngState = (Math.imul(this.fxRngState, 1664525) + 1013904223) >>> 0;
    return this.fxRngState / 4294967296;
  }

  public screenToTile(
    sx: number,
    sy: number,
    viewW: number,
    viewH: number,
    cam: CameraState
  ): { x: number; y: number } {
    const tilePx = BASE_TILE_PX * cam.zoom;
    const wx = (sx - viewW * 0.5) / tilePx + cam.x;
    const wy = (sy - viewH * 0.5) / tilePx + cam.y;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  public hitTestMinimap(sx: number, sy: number, cam: CameraState): boolean {
    const m = this.minimapBounds;
    if (sx < m.x || sx > m.x + m.w || sy < m.y || sy > m.y + m.h) return false;
    cam.x = ((sx - m.x) / m.w) * WORLD_SIZE;
    cam.y = ((sy - m.y) / m.h) * WORLD_SIZE;
    return true;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    world: WorldState,
    cam: CameraState,
    timeSec: number,
    opts: RenderOptions
  ): void {
    const dt =
      this.lastRenderTimeSec < 0
        ? 0
        : Math.max(0, Math.min(0.05, timeSec - this.lastRenderTimeSec));
    this.lastRenderTimeSec = timeSec;

    const cbMode = effectiveCbMode(opts);
    const reducedMotion = Boolean(opts.reducedMotion);
    const simAlpha = reducedMotion ? 0 : Math.max(0, Math.min(1, opts.simAlpha ?? 0));

    this.particles.update(dt, reducedMotion);

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, viewW, viewH);

    const tilePx = BASE_TILE_PX * cam.zoom;
    const offsetX = viewW * 0.5 - cam.x * tilePx;
    const offsetY = viewH * 0.5 - cam.y * tilePx;

    const minX = Math.max(0, Math.floor(-offsetX / tilePx) - 1);
    const maxX = Math.min(world.size - 1, Math.ceil((viewW - offsetX) / tilePx) + 1);
    const minY = Math.max(0, Math.floor(-offsetY / tilePx) - 1);
    const maxY = Math.min(world.size - 1, Math.ceil((viewH - offsetY) / tilePx) + 1);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 1. Planet basalt terrain & resource veins (offscreen cached + animated vents)
    this.drawTerrain(ctx, world, minX, maxX, minY, maxY, tilePx, timeSec, dt, cbMode, reducedMotion);

    // 2. Buildings (excluding items riding on belts)
    this.drawBuildings(ctx, world, minX, maxX, minY, maxY, tilePx, timeSec, dt, opts, cbMode, reducedMotion);

    // 3. Orbital Hub (3x3 centerpiece + Rocket launch VFX)
    this.drawOrbitalHub(ctx, world, tilePx, timeSec, dt, reducedMotion);

    // 4. Belt items & 2-segment articulated Inserter arms
    this.drawItemsAndInserterArms(
      ctx,
      world,
      minX,
      maxX,
      minY,
      maxY,
      tilePx,
      cbMode,
      simAlpha
    );

    // 5. Alt-Mode & Tunnel Link Overlays
    if (opts.showAltMode) {
      this.drawAltModeOverlays(ctx, world, minX, maxX, minY, maxY, tilePx, cbMode);
    }

    // 6. Power Grid Overlay (when toggled via showPowerOverlay)
    if (opts.showPowerOverlay) {
      this.drawPowerOverlay(ctx, world, minX, maxX, minY, maxY, tilePx, cbMode);
    }

    // 7. Night lighting tint & pre-baked additive industrial glow
    this.drawDayNightGlow(ctx, world, minX, maxX, minY, maxY, tilePx, cbMode);

    // 8. Interactive Ghosts, Drag Belts, Blueprint Stamp, Selection & Mining Laser
    this.drawInteractionOverlays(ctx, world, tilePx, timeSec, dt, opts, cbMode, reducedMotion);

    // 9. Pooled zero-GC 2.5D Particle VFX
    this.particles.render(ctx, minX, maxX, minY, maxY, tilePx, reducedMotion);

    ctx.restore();

    // 10. Interactive Minimap (screen space, offscreen cached)
    this.drawMinimap(ctx, viewW, viewH, world, cam, timeSec, cbMode, opts.uiScale ?? 1);
  }

  private ensureTerrainCache(world: WorldState, cbMode: ColorblindMode): boolean {
    if (typeof document === 'undefined') return false;
    if (
      this.terrainCanvas &&
      this.cachedTerrainSeed === world.seed &&
      this.cachedTerrainSize === world.size &&
      this.cachedTerrainCb === cbMode
    ) {
      return true;
    }

    // shortcut: terrain offscreen cache assumes WORLD_SIZE = 64 (3072x3072); switch to chunked 512px tile cache if world exceeds 64x64
    const sizePx = world.size * BASE_TILE_PX;
    if (!this.terrainCanvas || this.terrainCanvas.width !== sizePx) {
      this.terrainCanvas = document.createElement('canvas');
      this.terrainCanvas.width = sizePx;
      this.terrainCanvas.height = sizePx;
    }

    const tctx = this.terrainCanvas.getContext('2d');
    if (!tctx) return false;

    const palette = cbMode !== 'none' ? ORE_PALETTE_CB : ORE_PALETTE;
    this.cachedVentTiles.length = 0;

    tctx.fillStyle = '#0f1623';
    tctx.fillRect(0, 0, sizePx, sizePx);

    for (let y = 0; y < world.size; y++) {
      for (let x = 0; x < world.size; x++) {
        const px = x * BASE_TILE_PX;
        const py = y * BASE_TILE_PX;
        if ((x + y) % 2 === 0) {
          tctx.fillStyle = 'rgba(255,255,255,0.015)';
          tctx.fillRect(px, py, BASE_TILE_PX, BASE_TILE_PX);
        }
        const idx = y * world.size + x;
        const res = world.resources[idx];
        if (res === 'none') continue;
        if (res === 'geothermal_vent') {
          this.cachedVentTiles.push(idx);
        }
        drawOreDepositShapes(tctx, res, px, py, BASE_TILE_PX, palette[res], x, y);
      }
    }

    this.cachedTerrainSeed = world.seed;
    this.cachedTerrainSize = world.size;
    this.cachedTerrainCb = cbMode;
    return true;
  }

  private drawTerrain(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    timeSec: number,
    dt: number,
    cbMode: ColorblindMode,
    reducedMotion: boolean
  ): void {
    const palette = cbMode !== 'none' ? ORE_PALETTE_CB : ORE_PALETTE;
    const hasCached = this.ensureTerrainCache(world, cbMode);

    if (hasCached && this.terrainCanvas) {
      const sx = minX * BASE_TILE_PX;
      const sy = minY * BASE_TILE_PX;
      const sw = (maxX - minX + 1) * BASE_TILE_PX;
      const sh = (maxY - minY + 1) * BASE_TILE_PX;
      if (sw > 0 && sh > 0) {
        ctx.drawImage(
          this.terrainCanvas,
          sx,
          sy,
          sw,
          sh,
          minX * tilePx,
          minY * tilePx,
          (maxX - minX + 1) * tilePx,
          (maxY - minY + 1) * tilePx
        );
      }

      // Animate only geothermal vents inside viewport
      const prevAlpha = ctx.globalAlpha;
      const ventCol = cbMode !== 'none' ? '#fb7185' : '#fb923c';
      for (let i = 0; i < this.cachedVentTiles.length; i++) {
        const idx = this.cachedVentTiles[i];
        const x = idx % world.size;
        const y = (idx / world.size) | 0;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        const px = x * tilePx;
        const py = y * tilePx;
        const pulse = reducedMotion ? 0.65 : 0.55 + 0.45 * Math.sin(timeSec * 4 + x + y);
        ctx.globalAlpha = 0.35 + pulse * 0.45;
        ctx.fillStyle = ventCol;
        ctx.beginPath();
        ctx.arc(px + tilePx * 0.5, py + tilePx * 0.5, tilePx * 0.32, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = prevAlpha;
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = Math.max(1, tilePx * 0.04);
        ctx.beginPath();
        ctx.arc(
          px + tilePx * 0.5,
          py + tilePx * 0.5,
          tilePx * (0.18 + 0.1 * pulse),
          0,
          Math.PI * 2
        );
        ctx.stroke();

        if (!reducedMotion && dt > 0 && this.nextFxRand() < dt * 1.1) {
          this.particles.spawnBurst(x + 0.5, y + 0.5, 'steam');
        }
      }
      ctx.globalAlpha = prevAlpha;
    } else {
      // Headless / fallback direct terrain rendering
      ctx.fillStyle = '#0f1623';
      ctx.fillRect(
        minX * tilePx,
        minY * tilePx,
        (maxX - minX + 1) * tilePx,
        (maxY - minY + 1) * tilePx
      );
      const prevAlpha = ctx.globalAlpha;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x * tilePx;
          const py = y * tilePx;
          if ((x + y) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.015)';
            ctx.fillRect(px, py, tilePx, tilePx);
          }
          const res = world.resources[tileIndex(x, y)];
          if (res === 'none') continue;
          drawOreDepositShapes(ctx, res, px, py, tilePx, palette[res], x, y);
          if (res === 'geothermal_vent') {
            const pulse = reducedMotion ? 0.65 : 0.55 + 0.45 * Math.sin(timeSec * 4 + x + y);
            ctx.globalAlpha = 0.35 + pulse * 0.45;
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.arc(px + tilePx * 0.5, py + tilePx * 0.5, tilePx * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = prevAlpha;
          }
        }
      }
      ctx.globalAlpha = prevAlpha;
    }

    // Subtle tile grid lines
    if (tilePx >= 18) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = minX; x <= maxX + 1; x++) {
        ctx.moveTo(x * tilePx, minY * tilePx);
        ctx.lineTo(x * tilePx, (maxY + 1) * tilePx);
      }
      for (let y = minY; y <= maxY + 1; y++) {
        ctx.moveTo(minX * tilePx, y * tilePx);
        ctx.lineTo((maxX + 1) * tilePx, y * tilePx);
      }
      ctx.stroke();
    }
  }

  private drawBuildings(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    timeSec: number,
    dt: number,
    opts: RenderOptions,
    cbMode: ColorblindMode,
    reducedMotion: boolean
  ): void {
    const cap = BUILDINGS.accumulator.energy_capacity_mj ?? 120;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isHubTile(x, y)) continue;
        const b = getBuildingAt(world, x, y);
        if (!b) continue;

        const px = x * tilePx;
        const py = y * tilePx;
        const isWorking = b.status === 'working';

        reusableGlyphOpts.active = isWorking;
        reusableGlyphOpts.status = b.status;
        reusableGlyphOpts.energyRatio = b.energyMj / cap;
        reusableGlyphOpts.tunnelMode = b.tunnelMode;
        reusableGlyphOpts.colorblind = cbMode;
        reusableGlyphOpts.geoBonus = b.geoBonus;
        reusableGlyphOpts.entryDir = isBeltType(b.type) ? detectBeltEntryDir(world, b) : undefined;
        reusableGlyphOpts.reducedMotion = reducedMotion;

        drawBuildingGlyph(ctx, b.type, b.dir, px, py, tilePx, timeSec, reusableGlyphOpts);

        // Emit subtle contextual industrial particles on working machines
        if (!reducedMotion && dt > 0 && isWorking) {
          if (b.type === 'smelter' || b.type === 'foundry' || b.type === 'coal_generator') {
            if (this.nextFxRand() < dt * 1.4) {
              this.particles.spawnBurst(x + 0.5, y + 0.45, 'ember');
            }
            if (this.nextFxRand() < dt * 0.9) {
              this.particles.spawnBurst(x + 0.5, y + 0.35, 'wisp');
            }
          } else if (b.type === 'miner_mk1' || b.type === 'miner_mk2') {
            if (this.nextFxRand() < dt * 1.8) {
              const res = world.resources[tileIndex(x, y)];
              this.particles.spawnBurst(x + 0.5, y + 0.5, 'ore_chip', oreParticleColorIdx(res));
            }
          } else if (b.type === 'assembler' || b.type === 'constructor') {
            if (this.nextFxRand() < dt * 1.3) {
              this.particles.spawnBurst(x + 0.5, y + 0.5, 'spark', PARTICLE_COLOR_INDEX.cyan);
            }
          } else if (b.type === 'research_lab') {
            if (this.nextFxRand() < dt * 1.5) {
              this.particles.spawnBurst(
                x + 0.5,
                y + 0.45,
                'spark',
                this.nextFxRand() > 0.5 ? PARTICLE_COLOR_INDEX.cyan : PARTICLE_COLOR_INDEX.indigo
              );
            }
          } else if (b.type === 'geothermal_plant') {
            if (this.nextFxRand() < dt * 1.6) {
              this.particles.spawnBurst(x + 0.5, y + 0.35, 'steam');
            }
          }
        }

        // Progress bar on active processors/miners
        if (
          tilePx >= 26 &&
          (isProcessorType(b.type) || b.type === 'miner_mk1' || b.type === 'miner_mk2') &&
          b.craftProgress > 0
        ) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(px + tilePx * 0.14, py + tilePx * 0.84, tilePx * 0.72, tilePx * 0.08);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(
            px + tilePx * 0.14,
            py + tilePx * 0.84,
            tilePx * 0.72 * Math.min(1, b.craftProgress),
            tilePx * 0.08
          );
        }

        // Highlight selected building
        if (opts.selectedBuildingId === b.id) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = Math.max(2, tilePx * 0.06);
          ctx.strokeRect(px + 1, py + 1, tilePx - 2, tilePx - 2);
        }
      }
    }
  }

  private drawOrbitalHub(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    tilePx: number,
    timeSec: number,
    dt: number,
    reducedMotion: boolean
  ): void {
    const hx = HUB_ORIGIN * tilePx;
    const hy = HUB_ORIGIN * tilePx;
    const size = HUB_SIZE * tilePx;
    const cx = hx + size * 0.5;
    const cy = hy + size * 0.5;

    ctx.save();
    // Base pad with 2.5D south rim & perimeter intake ports
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(2, tilePx * 0.08);
    ctx.fillRect(hx + 2, hy + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.fillRect(hx + 2, hy + size - tilePx * 0.18, size - 4, tilePx * 0.16);
    ctx.strokeRect(hx + 2, hy + 2, size - 4, size - 4);

    // 12 intake bay chevrons around perimeter
    ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < 3; i++) {
      const off = (i + 0.5) * tilePx;
      ctx.fillRect(hx + off - tilePx * 0.12, hy + 3, tilePx * 0.24, tilePx * 0.09);
      ctx.fillRect(hx + off - tilePx * 0.12, hy + size - tilePx * 0.12, tilePx * 0.24, tilePx * 0.09);
      ctx.fillRect(hx + 3, hy + off - tilePx * 0.12, tilePx * 0.09, tilePx * 0.24);
      ctx.fillRect(hx + size - tilePx * 0.12, hy + off - tilePx * 0.12, tilePx * 0.09, tilePx * 0.24);
    }

    // Center Orbital Elevator ring
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(4, tilePx * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    // Telemetry scanner sweep (paused cleanly when reducedMotion is active)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reducedMotion ? 0.35 : timeSec * 0.9);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2, tilePx * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 0.55);
    ctx.stroke();
    ctx.restore();

    // Central Rocket Pod (launches skyward during world.rocketTimer > 0)
    const launchProgress = world.rocketTimer > 0 ? Math.max(0, Math.min(1, 1 - world.rocketTimer / 4.5)) : 0;
    const liftTiles = launchProgress > 0 ? -Math.pow(launchProgress, 2) * HUB_SIZE * 8 : 0;
    const liftY = liftTiles * tilePx;
    const rocketScale = 1 + launchProgress * 0.65;

    if (!reducedMotion && world.rocketTimer > 0) {
      const hubTileCenter = HUB_ORIGIN + HUB_SIZE * 0.5;
      if (this.prevRocketTimer <= 0) {
        this.particles.spawnBurst(hubTileCenter, hubTileCenter, 'shockwave');
      }
      if (dt > 0) {
        this.particles.spawnBurst(
          hubTileCenter,
          hubTileCenter + liftTiles + 0.45 * rocketScale,
          'rocket_exhaust'
        );
      }
    }
    this.prevRocketTimer = world.rocketTimer;

    ctx.save();
    ctx.translate(cx, cy + liftY);
    ctx.scale(rocketScale, rocketScale);

    if (launchProgress > 0) {
      // Thruster plasma flame (steady fade on reducedMotion, zero linear-gradient alloc)
      const prevAlpha = ctx.globalAlpha;
      const flameH = reducedMotion
        ? size * 0.48
        : size * (0.45 + 0.18 * Math.sin(timeSec * 45));
      const flameAlpha = reducedMotion ? Math.max(0.2, 0.85 * (1 - launchProgress * 0.6)) : 0.9;

      ctx.globalAlpha = prevAlpha * flameAlpha * 0.55;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(-size * 0.13, size * 0.14);
      ctx.lineTo(0, size * 0.14 + flameH);
      ctx.lineTo(size * 0.13, size * 0.14);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = prevAlpha * flameAlpha * 0.85;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-size * 0.08, size * 0.14);
      ctx.lineTo(0, size * 0.14 + flameH * 0.72);
      ctx.lineTo(size * 0.08, size * 0.14);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = prevAlpha * flameAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.04, size * 0.14);
      ctx.lineTo(0, size * 0.14 + flameH * 0.38);
      ctx.lineTo(size * 0.04, size * 0.14);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = prevAlpha;
    }

    // Rocket fuselage
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.5, tilePx * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.24);
    ctx.lineTo(size * 0.11, -size * 0.04);
    ctx.lineTo(size * 0.11, size * 0.15);
    ctx.lineTo(-size * 0.11, size * 0.15);
    ctx.lineTo(-size * 0.11, -size * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-size * 0.045, -size * 0.06, size * 0.09, size * 0.14);
    ctx.restore();

    ctx.restore();
  }

  private drawItemsAndInserterArms(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    cbMode: ColorblindMode,
    simAlpha: number
  ): void {
    const itemSize = Math.max(10, tilePx * 0.44);
    const insBaseSpeed = (BUILDINGS.inserter.speed ?? 1.5) * world.power.satisfaction;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const b = getBuildingAt(world, x, y);
        if (!b) continue;

        if (isBeltType(b.type) || b.type === 'splitter' || b.type === 'merger') {
          const slots = b.slots;
          if (slots.length === 0) continue;
          const speed = BUILDINGS[b.type].speed ?? 2;
          const step = speed * DT * simAlpha;
          let leadVisualP = 1.0;

          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            let p = slot.progress;
            if (simAlpha > 0) {
              if (i === 0) {
                p = Math.min(1.0, p + step);
              } else {
                p = Math.min(Math.max(p, leadVisualP - 0.5), p + step);
              }
            }
            leadVisualP = p;
            this.writeBeltItemPos(b, p, slot.sourceDir, tilePx);
            drawItemFromAtlas(ctx, slot.item, scratchPos.x, scratchPos.y, itemSize, cbMode);
          }
          continue;
        }

        if (b.type === 'inserter') {
          const cx = (b.x + 0.5) * tilePx;
          const cy = (b.y + 0.5) * tilePx;

          let p = b.inserterProgress;
          if (simAlpha > 0 && b.status === 'working') {
            if (b.inserterItem !== null) {
              p = Math.min(1.0, p + insBaseSpeed * 2 * DT * simAlpha);
            } else if (b.inserterPhase === 'to_source' && p > 0) {
              p = Math.max(0, p - insBaseSpeed * 2 * DT * simAlpha);
            }
          }

          const dx = DIR_DX[b.dir];
          const dy = DIR_DY[b.dir];
          const perpX = -dy;
          const perpY = dx;
          const reach = (p - 0.5) * 1.45 * tilePx;
          const tipX = cx + dx * reach;
          const tipY = cy + dy * reach;

          // 2-segment articulated elbow geometry
          const dNorm = reach / tilePx;
          const bend = Math.sqrt(Math.max(0.06, 0.62 - dNorm * dNorm)) * tilePx * 0.38;
          const elbowX = (cx + tipX) * 0.5 + perpX * bend;
          const elbowY = (cy + tipY) * 0.5 + perpY * bend;

          // Arm drop shadow
          const shX = tilePx * 0.04;
          const shY = tilePx * 0.06;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = Math.max(2.5, tilePx * 0.09);
          ctx.beginPath();
          ctx.moveTo(cx + shX, cy + shY);
          ctx.lineTo(elbowX + shX, elbowY + shY);
          ctx.lineTo(tipX + shX, tipY + shY);
          ctx.stroke();

          // Segment 1 (shoulder -> elbow)
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = Math.max(2.5, tilePx * 0.095);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(elbowX, elbowY);
          ctx.stroke();

          // Segment 2 (elbow -> claw)
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = Math.max(2, tilePx * 0.07);
          ctx.beginPath();
          ctx.moveTo(elbowX, elbowY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Elbow pivot pin
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(elbowX, elbowY, Math.max(2, tilePx * 0.055), 0, Math.PI * 2);
          ctx.fill();

          // Articulated gripper claw
          const clawSpan = b.inserterItem ? tilePx * 0.1 : tilePx * 0.14;
          const clawLen = tilePx * 0.1;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(1.5, tilePx * 0.05);
          ctx.beginPath();
          ctx.moveTo(tipX + perpX * clawSpan, tipY + perpY * clawSpan);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(tipX - perpX * clawSpan, tipY - perpY * clawSpan);
          ctx.moveTo(tipX + perpX * clawSpan, tipY + perpY * clawSpan);
          ctx.lineTo(tipX + perpX * clawSpan + dx * clawLen, tipY + perpY * clawSpan + dy * clawLen);
          ctx.moveTo(tipX - perpX * clawSpan, tipY - perpY * clawSpan);
          ctx.lineTo(tipX - perpX * clawSpan + dx * clawLen, tipY - perpY * clawSpan + dy * clawLen);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(tipX, tipY, Math.max(2.2, tilePx * 0.065), 0, Math.PI * 2);
          ctx.fill();

          if (b.inserterItem) {
            drawItemFromAtlas(ctx, b.inserterItem, tipX, tipY, itemSize * 0.9, cbMode);
          }
        }
      }
    }
  }

  private writeBeltItemPos(
    b: BuildingEntity,
    progress: number,
    sourceDir: Direction | undefined,
    tilePx: number
  ): void {
    const cx = (b.x + 0.5) * tilePx;
    const cy = (b.y + 0.5) * tilePx;

    if (sourceDir !== undefined && sourceDir !== ((b.dir + 2) & 3)) {
      const outX = DIR_DX[b.dir] * 0.5 * tilePx;
      const outY = DIR_DY[b.dir] * 0.5 * tilePx;
      const inX = DIR_DX[sourceDir] * 0.5 * tilePx;
      const inY = DIR_DY[sourceDir] * 0.5 * tilePx;
      const mt = 1 - progress;
      scratchPos.x = cx + mt * mt * inX + progress * progress * outX;
      scratchPos.y = cy + mt * mt * inY + progress * progress * outY;
      return;
    }

    const offset = (progress - 0.5) * tilePx;
    scratchPos.x = cx + DIR_DX[b.dir] * offset;
    scratchPos.y = cy + DIR_DY[b.dir] * offset;
  }

  private drawAltModeOverlays(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    cbMode: ColorblindMode
  ): void {
    const fontPx = Math.max(10, Math.round(tilePx * 0.22));
    ctx.font = getMonoFont(fontPx);
    ctx.textAlign = 'center';

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const b = getBuildingAt(world, x, y);
        if (!b || b.type === 'orbital_hub') continue;

        const cx = (x + 0.5) * tilePx;
        const cy = (y + 0.5) * tilePx;

        // Tunnel link dashed lines
        if (b.type === 'tunnel' && b.tunnelMode === 'entrance' && b.pairedId) {
          const exit = world.buildings[b.pairedId];
          if (exit) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
            ctx.lineWidth = Math.max(1.5, tilePx * 0.06);
            ctx.setLineDash(TUNNEL_DASH);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo((exit.x + 0.5) * tilePx, (exit.y + 0.5) * tilePx);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Show crafted output icon on machines & resource icon on miners
        let iconItem: ItemId | null = null;
        if (isProcessorType(b.type)) {
          const rId = b.recipeId !== 'auto' ? b.recipeId : b.lockedRecipeId;
          if (rId && RECIPES[rId]) iconItem = RECIPES[rId].outputs[0].item;
        } else if (b.type === 'miner_mk1' || b.type === 'miner_mk2') {
          const res = world.resources[tileIndex(x, y)];
          if (res in ITEMS) iconItem = res as ItemId;
        }

        if (iconItem) {
          ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
          ctx.beginPath();
          ctx.arc(cx, cy, tilePx * 0.28, 0, Math.PI * 2);
          ctx.fill();
          drawItemFromAtlas(ctx, iconItem, cx, cy, tilePx * 0.44, cbMode);
        }

        // Clock % badge when overclocked/underclocked
        if (b.clock !== 1.0 && tilePx >= 28) {
          ctx.fillStyle = b.clock > 1 ? '#f59e0b' : '#38bdf8';
          ctx.fillText(getClockLabel(b.clock), cx, (y + 0.24) * tilePx);
        }

        // Status ring on malfunctioning buildings
        if (b.status === 'no_power' || b.status === 'output_full' || b.status === 'unpaired') {
          ctx.strokeStyle = statusColor(b.status, cbMode);
          ctx.lineWidth = 2;
          ctx.strokeRect(x * tilePx + 2, y * tilePx + 2, tilePx - 4, tilePx - 4);
        }
      }
    }
  }

  private drawPowerOverlay(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    cbMode: ColorblindMode
  ): void {
    const sat = world.power.satisfaction;
    const prevAlpha = ctx.globalAlpha;
    const accCap = BUILDINGS.accumulator.energy_capacity_mj ?? 120;
    const showText = tilePx >= 28;
    if (showText) {
      ctx.font = getMonoFont(Math.max(10, Math.round(tilePx * 0.2)));
      ctx.textAlign = 'center';
    }

    // Highlight Hub power radius / generation
    const hubX = HUB_ORIGIN * tilePx;
    const hubY = HUB_ORIGIN * tilePx;
    const hubSize = HUB_SIZE * tilePx;
    ctx.globalAlpha = prevAlpha * 0.16;
    ctx.fillStyle = cbMode === 'none' ? '#22c55e' : '#38bdf8';
    ctx.fillRect(hubX, hubY, hubSize, hubSize);
    ctx.globalAlpha = prevAlpha;
    ctx.strokeStyle = cbMode === 'none' ? '#22c55e' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(hubX + 1, hubY + 1, hubSize - 2, hubSize - 2);

    const okColor = cbMode === 'none' ? '#22c55e' : '#38bdf8';
    const warnColor = cbMode === 'tritanopia' ? '#f472b6' : '#f59e0b';
    const failColor = cbMode === 'none' ? '#ef4444' : '#fb7185';

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x * tilePx;
        const py = y * tilePx;
        const res = world.resources[tileIndex(x, y)];
        const b = isHubTile(x, y) ? null : getBuildingAt(world, x, y);

        if (!b) {
          if (res === 'geothermal_vent') {
            ctx.save();
            ctx.strokeStyle = '#fb923c';
            ctx.lineWidth = 2;
            ctx.setLineDash(POWER_DASH);
            ctx.strokeRect(px + 2, py + 2, tilePx - 4, tilePx - 4);
            ctx.restore();
          }
          continue;
        }

        const def = BUILDINGS[b.type];
        if (def.generates_mw > 0) {
          ctx.globalAlpha = prevAlpha * 0.22;
          ctx.fillStyle = okColor;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.globalAlpha = prevAlpha;
          ctx.strokeStyle = okColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, tilePx - 2, tilePx - 2);
          if (showText) {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(getPowerLabel(b.activePowerMw, true), px + tilePx * 0.5, py + tilePx * 0.24);
          }
        } else if (b.type === 'accumulator') {
          const ratio = Math.max(0, Math.min(1, b.energyMj / accCap));
          ctx.globalAlpha = prevAlpha * 0.22;
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(px, py + tilePx * (1 - ratio), tilePx, tilePx * ratio);
          ctx.globalAlpha = prevAlpha;
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, tilePx - 2, tilePx - 2);
        } else if (def.power_mw > 0) {
          const col =
            b.status === 'no_power' || sat < 0.5
              ? failColor
              : sat < 0.99
                ? warnColor
                : '#38bdf8';
          ctx.globalAlpha = prevAlpha * (b.status === 'no_power' ? 0.3 : 0.14);
          ctx.fillStyle = col;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.globalAlpha = prevAlpha;
          ctx.strokeStyle = col;
          ctx.lineWidth = b.status === 'no_power' ? 2.5 : 1.5;
          ctx.strokeRect(px + 1, py + 1, tilePx - 2, tilePx - 2);
          if (b.status === 'no_power') {
            ctx.beginPath();
            ctx.moveTo(px + 3, py + 3);
            ctx.lineTo(px + tilePx - 3, py + tilePx - 3);
            ctx.moveTo(px + tilePx - 3, py + 3);
            ctx.lineTo(px + 3, py + tilePx - 3);
            ctx.stroke();
          }
          if (showText) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(getPowerLabel(b.activePowerMw, false), px + tilePx * 0.5, py + tilePx * 0.24);
          }
        }
      }
    }

    ctx.globalAlpha = prevAlpha;
  }

  private ensureGlowSprites(): void {
    if (typeof document === 'undefined') return;
    if (!this.glowCyan) this.glowCyan = this.bakeGlowCanvas('rgba(56, 189, 248, 1)', 'rgba(56, 189, 248, 0)');
    if (!this.glowOrange) this.glowOrange = this.bakeGlowCanvas('rgba(251, 146, 60, 1)', 'rgba(251, 146, 60, 0)');
    if (!this.glowIndigo) this.glowIndigo = this.bakeGlowCanvas('rgba(129, 140, 248, 1)', 'rgba(129, 140, 248, 0)');
  }

  private bakeGlowCanvas(innerColor: string, outerColor: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = GLOW_TEX_SIZE;
    c.height = GLOW_TEX_SIZE;
    const gctx = c.getContext('2d');
    if (gctx) {
      const half = GLOW_TEX_SIZE * 0.5;
      const grad = gctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, innerColor);
      grad.addColorStop(0.45, innerColor);
      grad.addColorStop(1, outerColor);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, GLOW_TEX_SIZE, GLOW_TEX_SIZE);
    }
    return c;
  }

  private stampGlow(
    ctx: CanvasRenderingContext2D,
    sprite: HTMLCanvasElement | null,
    gx: number,
    gy: number,
    rad: number,
    alpha: number,
    fallbackHex: string
  ): void {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (sprite) {
      ctx.drawImage(sprite, gx - rad, gy - rad, rad * 2, rad * 2);
    } else {
      ctx.fillStyle = fallbackHex;
      ctx.beginPath();
      ctx.arc(gx, gy, rad * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDayNightGlow(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    cbMode: ColorblindMode
  ): void {
    const nightAlpha = Math.max(0, 1 - world.power.solarFactor) * 0.42;
    const dt = world.dayTime;
    const dawn = Math.max(0, 1 - Math.abs(dt - 0.03) / 0.09);
    const dusk = Math.max(0, 1 - Math.abs(dt - 0.67) / 0.09);
    const twilightAlpha = Math.max(dawn, dusk) * 0.13;

    if (nightAlpha <= 0.04 && twilightAlpha <= 0.01) return;

    const rx = minX * tilePx;
    const ry = minY * tilePx;
    const rw = (maxX - minX + 1) * tilePx;
    const rh = (maxY - minY + 1) * tilePx;
    const prevAlpha = ctx.globalAlpha;

    if (nightAlpha > 0.04) {
      ctx.globalAlpha = nightAlpha;
      ctx.fillStyle = '#040918';
      ctx.fillRect(rx, ry, rw, rh);
    }

    if (twilightAlpha > 0.01) {
      ctx.globalAlpha = twilightAlpha;
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(rx, ry, rw, rh);
    }

    if (nightAlpha <= 0.04) {
      ctx.globalAlpha = prevAlpha;
      return;
    }

    // Pre-baked additive radial light blooms
    this.ensureGlowSprites();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    this.stampGlow(
      ctx,
      this.glowCyan,
      (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx,
      (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx,
      tilePx * 3.8,
      nightAlpha * 0.7,
      '#38bdf8'
    );

    const ventSprite = cbMode !== 'none' ? this.glowIndigo : this.glowOrange;
    if (this.cachedVentTiles.length > 0) {
      for (let i = 0; i < this.cachedVentTiles.length; i++) {
        const idx = this.cachedVentTiles[i];
        const vx = idx % world.size;
        const vy = (idx / world.size) | 0;
        if (vx < minX || vx > maxX || vy < minY || vy > maxY) continue;
        this.stampGlow(
          ctx,
          ventSprite,
          (vx + 0.5) * tilePx,
          (vy + 0.5) * tilePx,
          tilePx * 1.4,
          nightAlpha * 0.8,
          '#fb923c'
        );
      }
    }

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.cachedVentTiles.length === 0 && world.resources[tileIndex(x, y)] === 'geothermal_vent') {
          this.stampGlow(
            ctx,
            ventSprite,
            (x + 0.5) * tilePx,
            (y + 0.5) * tilePx,
            tilePx * 1.4,
            nightAlpha * 0.8,
            '#fb923c'
          );
        }
        const b = getBuildingAt(world, x, y);
        if (
          b &&
          b.status === 'working' &&
          (b.type === 'smelter' ||
            b.type === 'foundry' ||
            b.type === 'coal_generator' ||
            b.type === 'research_lab')
        ) {
          this.stampGlow(
            ctx,
            b.type === 'research_lab' ? this.glowIndigo : this.glowOrange,
            (x + 0.5) * tilePx,
            (y + 0.5) * tilePx,
            tilePx * 1.1,
            nightAlpha * (b.type === 'research_lab' ? 0.8 : 0.7),
            b.type === 'research_lab' ? '#818cf8' : '#fb923c'
          );
        }
      }
    }

    ctx.restore();
    ctx.globalAlpha = prevAlpha;
  }

  private drawBlockedCrossHatch(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tilePx: number,
    cbMode: ColorblindMode
  ): void {
    const prevAlpha = ctx.globalAlpha;
    const strokeCol = cbMode === 'none' ? '#ef4444' : '#fb7185';
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = strokeCol;
    ctx.fillRect(px, py, tilePx, tilePx);

    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = Math.max(2, tilePx * 0.06);
    ctx.strokeRect(px + 1, py + 1, tilePx - 2, tilePx - 2);

    // Diagonal X cross-hatch non-color blocked cue
    const pad = Math.max(3, tilePx * 0.14);
    ctx.beginPath();
    ctx.moveTo(px + pad, py + pad);
    ctx.lineTo(px + tilePx - pad, py + tilePx - pad);
    ctx.moveTo(px + tilePx - pad, py + pad);
    ctx.lineTo(px + pad, py + tilePx - pad);
    ctx.stroke();

    ctx.globalAlpha = prevAlpha;
  }

  private drawInteractionOverlays(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    tilePx: number,
    timeSec: number,
    dt: number,
    opts: RenderOptions,
    cbMode: ColorblindMode,
    reducedMotion: boolean
  ): void {
    // Manual mining beam VFX
    if (opts.mineBeam && opts.mineBeam.timer > 0) {
      const sx = (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx;
      const sy = (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx;
      const ex = (opts.mineBeam.tx + 0.5) * tilePx;
      const ey = (opts.mineBeam.ty + 0.5) * tilePx;
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, tilePx * 0.1 * opts.mineBeam.timer * 3);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(ex, ey, tilePx * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!reducedMotion && dt > 0 && this.nextFxRand() < dt * 24) {
        const res = inBounds(opts.mineBeam.tx, opts.mineBeam.ty)
          ? world.resources[tileIndex(opts.mineBeam.tx, opts.mineBeam.ty)]
          : 'none';
        this.particles.spawnBurst(
          opts.mineBeam.tx + 0.5,
          opts.mineBeam.ty + 0.5,
          'mine',
          res !== 'none' ? oreParticleColorIdx(res) : PARTICLE_COLOR_INDEX.yellow
        );
      }
    }

    // Drag belt path preview
    if (opts.dragPath.length > 0 && isBeltType(opts.selectedTool as BuildingId)) {
      const tool = opts.selectedTool as BuildingId;
      for (let i = 0; i < opts.dragPath.length; i++) {
        const step = opts.dragPath[i];
        const prevStep = i > 0 ? opts.dragPath[i - 1] : null;
        let entryDir: Direction | undefined;
        if (prevStep && prevStep.dir !== step.dir) {
          entryDir = oppositeDir(prevStep.dir);
        }
        ctx.save();
        ctx.globalAlpha = 0.65;
        reusableGlyphOpts.active = true;
        reusableGlyphOpts.status = undefined;
        reusableGlyphOpts.colorblind = cbMode;
        reusableGlyphOpts.entryDir = entryDir;
        reusableGlyphOpts.reducedMotion = reducedMotion;
        drawBuildingGlyph(ctx, tool, step.dir, step.x * tilePx, step.y * tilePx, tilePx, timeSec, reusableGlyphOpts);
        ctx.restore();
      }
      return;
    }

    if (!opts.hoverTile || !inBounds(opts.hoverTile.x, opts.hoverTile.y)) return;
    const hx = opts.hoverTile.x;
    const hy = opts.hoverTile.y;

    // Blueprint Copy Box
    if (opts.selectedTool === 'bp_copy' && opts.copyStart) {
      const minX = Math.min(opts.copyStart.x, hx);
      const maxX = Math.max(opts.copyStart.x, hx);
      const minY = Math.min(opts.copyStart.y, hy);
      const maxY = Math.max(opts.copyStart.y, hy);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillRect(
        minX * tilePx,
        minY * tilePx,
        (maxX - minX + 1) * tilePx,
        (maxY - minY + 1) * tilePx
      );
      ctx.strokeRect(
        minX * tilePx,
        minY * tilePx,
        (maxX - minX + 1) * tilePx,
        (maxY - minY + 1) * tilePx
      );
      return;
    }

    const validColor = cbMode === 'none' ? '#22c55e' : '#38bdf8';
    const validFill = cbMode === 'none' ? 'rgba(34, 197, 94, 0.22)' : 'rgba(56, 189, 248, 0.22)';

    // Blueprint Stamp Ghost
    if (opts.selectedTool === 'bp_stamp' && opts.activeBlueprint) {
      const entries = opts.activeBlueprint.entries;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const tx = hx + e.dx;
        const ty = hy + e.dy;
        if (!inBounds(tx, ty)) continue;
        const def = BUILDINGS[e.type];
        const res = world.resources[tileIndex(tx, ty)];
        const missingRes =
          def &&
          ((def.requires_resource === 'ore' && (res === 'none' || res === 'geothermal_vent')) ||
            (def.requires_resource === 'geothermal_vent' && res !== 'geothermal_vent'));
        const blocked = world.grid[tileIndex(tx, ty)] !== 0 || Boolean(missingRes);

        ctx.save();
        ctx.globalAlpha = 0.6;
        reusableGlyphOpts.active = false;
        reusableGlyphOpts.status = undefined;
        reusableGlyphOpts.colorblind = cbMode;
        reusableGlyphOpts.entryDir = undefined;
        reusableGlyphOpts.reducedMotion = reducedMotion;
        drawBuildingGlyph(ctx, e.type, e.dir, tx * tilePx, ty * tilePx, tilePx, timeSec, reusableGlyphOpts);
        if (blocked) {
          this.drawBlockedCrossHatch(ctx, tx * tilePx, ty * tilePx, tilePx, cbMode);
        } else {
          ctx.fillStyle = validFill;
          ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
        }
        ctx.restore();
      }
      return;
    }

    // Single tile cursor / building ghost
    if (opts.selectedTool in BUILDINGS) {
      const bType = opts.selectedTool as BuildingId;
      const def = BUILDINGS[bType];
      const res = world.resources[tileIndex(hx, hy)];
      const missingRes =
        (def.requires_resource === 'ore' && (res === 'none' || res === 'geothermal_vent')) ||
        (def.requires_resource === 'geothermal_vent' && res !== 'geothermal_vent');
      const blocked = world.grid[tileIndex(hx, hy)] !== 0 || missingRes;

      ctx.save();
      ctx.globalAlpha = 0.65;
      reusableGlyphOpts.active = true;
      reusableGlyphOpts.status = undefined;
      reusableGlyphOpts.colorblind = cbMode;
      reusableGlyphOpts.entryDir = undefined;
      reusableGlyphOpts.reducedMotion = reducedMotion;
      drawBuildingGlyph(ctx, bType, opts.toolDir, hx * tilePx, hy * tilePx, tilePx, timeSec, reusableGlyphOpts);
      if (blocked) {
        this.drawBlockedCrossHatch(ctx, hx * tilePx, hy * tilePx, tilePx, cbMode);
      } else {
        ctx.strokeStyle = validColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(hx * tilePx, hy * tilePx, tilePx, tilePx);
      }
      ctx.restore();
    } else {
      ctx.strokeStyle =
        opts.selectedTool === 'deconstruct'
          ? cbMode === 'none'
            ? '#ef4444'
            : '#fb7185'
          : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * tilePx + 1, hy * tilePx + 1, tilePx - 2, tilePx - 2);
      if (opts.selectedTool === 'deconstruct') {
        const px = hx * tilePx;
        const py = hy * tilePx;
        const pad = Math.max(4, tilePx * 0.2);
        ctx.beginPath();
        ctx.moveTo(px + pad, py + pad);
        ctx.lineTo(px + tilePx - pad, py + tilePx - pad);
        ctx.moveTo(px + tilePx - pad, py + pad);
        ctx.lineTo(px + pad, py + tilePx - pad);
        ctx.stroke();
      }
    }
  }

  private ensureMinimapCache(
    world: WorldState,
    timeSec: number,
    cbMode: ColorblindMode
  ): boolean {
    if (typeof document === 'undefined') return false;

    let bCount = 0;
    for (const _k in world.buildings) bCount++;

    if (!this.minimapCanvas || this.minimapCanvas.width !== world.size) {
      this.minimapCanvas = document.createElement('canvas');
      this.minimapCanvas.width = world.size;
      this.minimapCanvas.height = world.size;
      this.minimapCtx = this.minimapCanvas.getContext('2d');
      this.minimapImgData = this.minimapCtx
        ? this.minimapCtx.createImageData(world.size, world.size)
        : null;
      this.lastMinimapSeed = Number.NaN;
    }

    if (!this.minimapCtx || !this.minimapImgData) return false;

    const dirty =
      world.seed !== this.lastMinimapSeed ||
      cbMode !== this.lastMinimapCb ||
      bCount !== this.lastMinimapBuildingCount ||
      Math.abs(timeSec - this.lastMinimapTimeSec) >= 0.4;

    if (!dirty) return true;

    const palette = cbMode !== 'none' ? ORE_PALETTE_CB : ORE_PALETTE;
    const data = this.minimapImgData.data;
    const size = world.size;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const off = idx * 4;
        const gid = world.grid[idx];
        if (gid > 0) {
          if (isHubTile(x, y)) {
            data[off] = 56;
            data[off + 1] = 189;
            data[off + 2] = 248;
            data[off + 3] = 255;
          } else {
            data[off] = 245;
            data[off + 1] = 158;
            data[off + 2] = 11;
            data[off + 3] = 255;
          }
        } else {
          const res = world.resources[idx];
          if (res !== 'none') {
            const rgb = palette[res].rgb;
            data[off] = rgb[0];
            data[off + 1] = rgb[1];
            data[off + 2] = rgb[2];
            data[off + 3] = 255;
          } else {
            data[off] = 9;
            data[off + 1] = 13;
            data[off + 2] = 22;
            data[off + 3] = 224;
          }
        }
      }
    }

    this.minimapCtx.putImageData(this.minimapImgData, 0, 0);
    this.lastMinimapSeed = world.seed;
    this.lastMinimapCb = cbMode;
    this.lastMinimapBuildingCount = bCount;
    this.lastMinimapTimeSec = timeSec;
    return true;
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    world: WorldState,
    cam: CameraState,
    timeSec: number,
    cbMode: ColorblindMode,
    uiScale: number
  ): void {
    const size = 140;
    const bottomOffset = Math.round(86 * Math.max(1, Math.min(1.6, uiScale)));
    const mx = viewW - size - 14;
    const my = Math.max(14, viewH - size - bottomOffset);
    this.minimapBounds = { x: mx, y: my, w: size, h: size };

    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.fillRect(mx, my, size, size);

    if (this.ensureMinimapCache(world, timeSec, cbMode) && this.minimapCanvas) {
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.minimapCanvas, mx, my, size, size);
      ctx.imageSmoothingEnabled = prevSmooth;
    } else {
      const palette = cbMode !== 'none' ? ORE_PALETTE_CB : ORE_PALETTE;
      const cell = size / WORLD_SIZE;
      const cellCeil = Math.ceil(cell);
      for (let y = 0; y < WORLD_SIZE; y++) {
        for (let x = 0; x < WORLD_SIZE; x++) {
          const idx = tileIndex(x, y);
          const res = world.resources[idx];
          if (res !== 'none') {
            ctx.fillStyle = palette[res].fleck;
            ctx.fillRect(mx + x * cell, my + y * cell, cellCeil, cellCeil);
          }
          if (world.grid[idx] > 0) {
            ctx.fillStyle = isHubTile(x, y) ? '#38bdf8' : '#f59e0b';
            ctx.fillRect(mx + x * cell, my + y * cell, cellCeil, cellCeil);
          }
        }
      }
    }

    ctx.strokeRect(mx, my, size, size);

    // Viewport rectangle
    const cell = size / WORLD_SIZE;
    const tilePx = BASE_TILE_PX * cam.zoom;
    const spanX = (viewW / tilePx) * cell;
    const spanY = (viewH / tilePx) * cell;
    const vx = mx + cam.x * cell - spanX * 0.5;
    const vy = my + cam.y * cell - spanY * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, spanX, spanY);
    ctx.restore();
  }
}

// Re-export drawItemIcon cleanly in case external callers import it via renderer
export { drawItemIcon };
