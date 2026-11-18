import { BUILDING_IDS, BUILDINGS, ITEM_IDS, ITEMS, rotateDirCW } from '../core/data';
import type { BuildingId, BuildingStatus, Direction, ItemId } from '../core/types';

export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface BeltDrawOptions {
  colorblind?: boolean | ColorblindMode;
  entryDir?: Direction;
  reducedMotion?: boolean;
}

export interface BuildingGlyphOptions {
  active?: boolean;
  status?: BuildingStatus;
  energyRatio?: number;
  tunnelMode?: 'entrance' | 'exit';
  colorblind?: boolean | ColorblindMode;
  geoBonus?: number;
  entryDir?: Direction;
  reducedMotion?: boolean;
}

export interface FiguresGalleryLabels {
  title?: string;
  itemsHeading?: string;
  buildingsHeading?: string;
  items?: Partial<Record<ItemId, string>>;
  buildings?: Partial<Record<BuildingId, string | { name: string }>>;
  reducedMotion?: boolean;
}

const MAX_ICON_CACHE = 256;
const itemIconCache = new Map<string, string>();
const buildingIconCache = new Map<string, string>();

const ATLAS_CELL_PX = 64;
const ITEM_INDEX_MAP: Record<ItemId, number> = Object.create(null);
for (let i = 0; i < ITEM_IDS.length; i++) {
  ITEM_INDEX_MAP[ITEM_IDS[i]] = i;
}
const itemAtlasCache: Partial<Record<ColorblindMode, HTMLCanvasElement>> = {};

export function resolveColorblindMode(cb?: boolean | ColorblindMode): ColorblindMode {
  if (!cb || cb === 'none') return 'none';
  if (cb === true) return 'deuteranopia';
  return cb;
}

export function clearIconCaches(): void {
  itemIconCache.clear();
  buildingIconCache.clear();
  itemAtlasCache.none = undefined;
  itemAtlasCache.protanopia = undefined;
  itemAtlasCache.deuteranopia = undefined;
  itemAtlasCache.tritanopia = undefined;
}

function cacheSet(cache: Map<string, string>, key: string, val: string): void {
  // shortcut: 256-entry FIFO dataURL cache cap; switch to LRU if dynamic skinning is added
  if (cache.size >= MAX_ICON_CACHE) {
    const first = cache.keys().next();
    if (!first.done) cache.delete(first.value);
  }
  cache.set(key, val);
}

export function statusColor(
  status: BuildingStatus,
  colorblind: boolean | ColorblindMode = false
): string {
  const mode = resolveColorblindMode(colorblind);
  if (mode === 'tritanopia') {
    switch (status) {
      case 'working':
        return '#10b981';
      case 'idle':
        return '#f472b6';
      case 'no_power':
        return '#ef4444';
      case 'input_starved':
        return '#fb7185';
      case 'output_full':
        return '#f8fafc';
      case 'no_resource':
        return '#dc2626';
      case 'unpaired':
        return '#e879f9';
    }
  }
  if (mode === 'protanopia' || mode === 'deuteranopia') {
    switch (status) {
      case 'working':
        return '#38bdf8';
      case 'idle':
        return '#facc15';
      case 'no_power':
        return '#fb7185';
      case 'input_starved':
        return '#fb923c';
      case 'output_full':
        return '#fde047';
      case 'no_resource':
        return '#f472b6';
      case 'unpaired':
        return '#c084fc';
    }
  }
  switch (status) {
    case 'working':
      return '#22c55e';
    case 'idle':
      return '#f59e0b';
    case 'no_power':
      return '#ef4444';
    case 'input_starved':
      return '#fb923c';
    case 'output_full':
      return '#eab308';
    case 'no_resource':
      return '#ef4444';
    case 'unpaired':
      return '#a855f7';
  }
}

export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  item: ItemId,
  cx: number,
  cy: number,
  size: number,
  colorblind: boolean | ColorblindMode = false
): void {
  const def = ITEMS[item];
  if (!def) return;
  const mode = resolveColorblindMode(colorblind);
  const cbActive = mode !== 'none';
  const r = size * 0.44;
  ctx.save();
  ctx.translate(cx, cy);

  switch (item) {
    case 'iron_ore':
    case 'copper_ore':
    case 'coal':
    case 'stone': {
      // Jagged faceted ore cluster
      const fill =
        cbActive && item === 'copper_ore'
          ? mode === 'tritanopia'
            ? '#f97316'
            : '#ea580c'
          : def.color;
      ctx.fillStyle = fill;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, r * 0.25);
      ctx.lineTo(-r * 0.55, -r * 0.75);
      ctx.lineTo(r * 0.2, -r * 0.85);
      ctx.lineTo(r * 0.9, -r * 0.1);
      ctx.lineTo(r * 0.55, r * 0.8);
      ctx.lineTo(-r * 0.35, r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.45);
      ctx.lineTo(r * 0.4, -r * 0.15);
      ctx.lineTo(0, r * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'quartz':
    case 'glass_crystal': {
      // Hexagonal translucent prism crystal
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.65, -r * 0.3);
      ctx.lineTo(r * 0.45, r * 0.85);
      ctx.lineTo(-r * 0.45, r * 0.85);
      ctx.lineTo(-r * 0.65, -r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffffaa';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(0, r * 0.75);
      ctx.stroke();
      break;
    }
    case 'iron_ingot':
    case 'copper_ingot': {
      // Trapezoidal beveled bar
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.45);
      ctx.lineTo(-r * 0.55, -r * 0.5);
      ctx.lineTo(r * 0.75, -r * 0.5);
      ctx.lineTo(r * 0.95, r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = def.accent;
      ctx.fillRect(-r * 0.35, -r * 0.25, r * 0.85, r * 0.22);
      break;
    }
    case 'concrete': {
      // Stacked concrete slab block
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.fillRect(-r * 0.85, -r * 0.65, r * 1.7, r * 1.3);
      ctx.strokeRect(-r * 0.85, -r * 0.65, r * 1.7, r * 1.3);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-r * 0.55, -r * 0.25, r * 1.1, r * 0.2);
      ctx.fillRect(-r * 0.55, r * 0.15, r * 1.1, r * 0.2);
      break;
    }
    case 'steel_beam': {
      // I-Beam profile
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 0.35);
      ctx.fillRect(-r * 0.25, -r * 0.45, r * 0.5, r * 0.9);
      ctx.fillRect(-r * 0.8, r * 0.45, r * 1.6, r * 0.35);
      ctx.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 0.35);
      ctx.strokeRect(-r * 0.8, r * 0.45, r * 1.6, r * 0.35);
      break;
    }
    case 'silicon_wafer': {
      // Iridescent silicon disc with grid traces
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(0.8, size * 0.04);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.lineTo(r * 0.6, 0);
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6);
      ctx.stroke();
      break;
    }
    case 'iron_plate': {
      // Riveted metal plate (scalar corners, zero array allocation)
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.fillRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
      ctx.strokeRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
      ctx.fillStyle = def.accent;
      const rivOff = r * 0.5;
      const rivR = r * 0.12;
      ctx.beginPath();
      ctx.arc(-rivOff, -rivOff, rivR, 0, Math.PI * 2);
      ctx.arc(rivOff, -rivOff, rivR, 0, Math.PI * 2);
      ctx.arc(-rivOff, rivOff, rivR, 0, Math.PI * 2);
      ctx.arc(rivOff, rivOff, rivR, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'iron_gear': {
      // 8-tooth precision cog
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.06);
      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i * Math.PI) / teeth;
        const rad = i % 2 === 0 ? r * 0.95 : r * 0.66;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'copper_wire': {
      // Wound copper spool coil
      ctx.strokeStyle = def.color;
      ctx.lineWidth = Math.max(1.5, size * 0.14);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'circuit': {
      // PCB with gold pin traces
      ctx.fillStyle = cbActive ? (mode === 'tritanopia' ? '#0891b2' : '#0284c7') : def.color;
      ctx.strokeStyle = cbActive ? '#bae6fd' : def.accent;
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.fillRect(-r * 0.85, -r * 0.72, r * 1.7, r * 1.44);
      ctx.strokeRect(-r * 0.85, -r * 0.72, r * 1.7, r * 1.44);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-r * 0.68, -r * 0.45, r * 0.22, r * 0.18);
      ctx.fillRect(r * 0.46, r * 0.25, r * 0.22, r * 0.18);
      break;
    }
    case 'rotor': {
      // Turbine coil rotor
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = Math.max(1.2, size * 0.11);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
      ctx.fillStyle = def.accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'modular_frame': {
      // Structural braced cube frame
      ctx.strokeStyle = def.accent;
      ctx.fillStyle = def.color;
      ctx.lineWidth = Math.max(1.2, size * 0.09);
      ctx.fillRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
      ctx.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
      ctx.beginPath();
      ctx.moveTo(-r * 0.78, -r * 0.78);
      ctx.lineTo(r * 0.78, r * 0.78);
      ctx.moveTo(r * 0.78, -r * 0.78);
      ctx.lineTo(-r * 0.78, r * 0.78);
      ctx.stroke();
      break;
    }
    case 'processor': {
      // High-density microchip with gold pins
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84);
      ctx.fillStyle = '#facc15';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * r * 0.36 - r * 0.08, -r * 0.92, r * 0.16, r * 0.22);
        ctx.fillRect(i * r * 0.36 - r * 0.08, r * 0.7, r * 0.16, r * 0.22);
      }
      break;
    }
    case 'quantum_core': {
      // Glowing orbital diamond core
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1.2, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.95, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

function getOrBuildItemAtlas(mode: ColorblindMode): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cached = itemAtlasCache[mode];
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = ITEM_IDS.length * ATLAS_CELL_PX;
  canvas.height = ATLAS_CELL_PX;
  const actx = canvas.getContext('2d');
  if (actx) {
    const half = ATLAS_CELL_PX * 0.5;
    for (let i = 0; i < ITEM_IDS.length; i++) {
      drawItemIcon(actx, ITEM_IDS[i], i * ATLAS_CELL_PX + half, half, ATLAS_CELL_PX * 0.86, mode);
    }
  }
  itemAtlasCache[mode] = canvas;
  return canvas;
}

export function drawItemFromAtlas(
  ctx: CanvasRenderingContext2D,
  item: ItemId,
  cx: number,
  cy: number,
  size: number,
  colorblind: boolean | ColorblindMode = false
): void {
  const mode = resolveColorblindMode(colorblind);
  const atlas = getOrBuildItemAtlas(mode);
  const idx = ITEM_INDEX_MAP[item];
  if (!atlas || idx === undefined) {
    drawItemIcon(ctx, item, cx, cy, size, mode);
    return;
  }
  const half = size * 0.5;
  ctx.drawImage(
    atlas,
    idx * ATLAS_CELL_PX,
    0,
    ATLAS_CELL_PX,
    ATLAS_CELL_PX,
    cx - half,
    cy - half,
    size,
    size
  );
}

function getBeltAccent(
  type: 'belt_mk1' | 'belt_mk2' | 'belt_mk3',
  mode: ColorblindMode
): string {
  if (mode === 'tritanopia') {
    if (type === 'belt_mk1') return '#fb923c';
    if (type === 'belt_mk2') return '#e11d48';
    return '#2dd4bf';
  }
  if (mode === 'protanopia' || mode === 'deuteranopia') {
    if (type === 'belt_mk1') return '#eab308';
    if (type === 'belt_mk2') return '#f43f5e';
    return '#38bdf8';
  }
  if (type === 'belt_mk1') return '#f59e0b';
  if (type === 'belt_mk2') return '#ef4444';
  return '#06b6d4';
}

function drawChevronGroup(
  ctx: CanvasRenderingContext2D,
  tierPips: number,
  cx: number,
  cy: number,
  hw: number,
  size: number
): void {
  const w = hw * 0.52;
  const h = size * 0.11;
  const gap = size * 0.08;
  const baseOffset = ((tierPips - 1) * gap) * 0.5;
  for (let p = 0; p < tierPips; p++) {
    const oy = cy - baseOffset + p * gap;
    ctx.beginPath();
    ctx.moveTo(cx - w, oy + h);
    ctx.lineTo(cx, oy - h * 0.65);
    ctx.lineTo(cx + w, oy + h);
    ctx.stroke();
  }
}

export function drawBeltTile(
  ctx: CanvasRenderingContext2D,
  type: 'belt_mk1' | 'belt_mk2' | 'belt_mk3',
  dir: Direction,
  x: number,
  y: number,
  size: number,
  timeSec: number,
  colorblindOrOpts: boolean | ColorblindMode | BeltDrawOptions = false
): void {
  let mode: ColorblindMode = 'none';
  let entryDir: Direction | undefined;
  let reducedMotion = false;

  if (typeof colorblindOrOpts === 'object' && colorblindOrOpts !== null) {
    mode = resolveColorblindMode(colorblindOrOpts.colorblind);
    entryDir = colorblindOrOpts.entryDir;
    reducedMotion = Boolean(colorblindOrOpts.reducedMotion);
  } else {
    mode = resolveColorblindMode(colorblindOrOpts);
  }

  const accent = getBeltAccent(type, mode);
  const tierPips = type === 'belt_mk1' ? 1 : type === 'belt_mk2' ? 2 : 3;
  const speed = BUILDINGS[type].speed ?? 2;
  const phase = reducedMotion ? 0.25 : ((timeSec * speed * 0.7) % 1 + 1) % 1;
  const hw = size * 0.38;
  const railW = Math.max(1.5, size * 0.08);
  const backDir = ((dir + 2) & 3) as Direction;
  const isCornerLeft = entryDir === ((dir + 3) & 3);
  const isCornerRight = entryDir === ((dir + 1) & 3);
  const isCurve = entryDir !== undefined && entryDir !== backDir && (isCornerLeft || isCornerRight);

  ctx.save();
  ctx.translate(x + size * 0.5, y + size * 0.5);
  ctx.rotate((dir * Math.PI) / 2);

  if (isCurve) {
    const px = isCornerLeft ? -size * 0.5 : size * 0.5;
    const py = -size * 0.5;
    const rMid = size * 0.5;
    const rOut = rMid + hw;
    const rIn = rMid - hw;
    const startA = isCornerLeft ? 0 : Math.PI * 0.5;
    const endA = isCornerLeft ? Math.PI * 0.5 : Math.PI;

    // Curved track bed
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(px, py, rOut, startA, endA, false);
    ctx.arc(px, py, rIn, endA, startA, true);
    ctx.closePath();
    ctx.fill();

    // Curved side rails
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = railW;
    ctx.beginPath();
    ctx.arc(px, py, rOut - railW * 0.5, startA, endA, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, rIn + railW * 0.5, startA, endA, false);
    ctx.stroke();

    // Clip to curved belt bed and draw scrolling 1/2/3 tier chevrons along quarter-arc
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, rOut - railW * 0.6, startA, endA, false);
    ctx.arc(px, py, rIn + railW * 0.6, endA, startA, true);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.3, size * 0.068);
    ctx.lineCap = 'round';
    const arcSteps = 2;
    for (let i = -1; i <= arcSteps; i++) {
      const frac = (i + phase) / arcSteps;
      const theta = isCornerLeft
        ? Math.PI * 0.5 * (1 - frac)
        : Math.PI * 0.5 * (1 + frac);
      const rot = isCornerLeft ? theta : theta - Math.PI;
      const cx = px + Math.cos(theta) * rMid;
      const cy = py + Math.sin(theta) * rMid;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      drawChevronGroup(ctx, tierPips, 0, 0, hw * 0.9, size * 0.92);
      ctx.restore();
    }
    ctx.restore();
  } else {
    // Straight belt track bed
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-hw, -size * 0.5, hw * 2, size);

    // Side rails
    ctx.fillStyle = '#475569';
    ctx.fillRect(-hw, -size * 0.5, railW, size);
    ctx.fillRect(hw - railW, -size * 0.5, railW, size);

    // Non-color tier pips on left rail (1/2/3 notches)
    if (size >= 18) {
      ctx.fillStyle = accent;
      const pipR = Math.max(1, size * 0.032);
      for (let p = 0; p < tierPips; p++) {
        ctx.fillRect(-hw + railW * 0.2, -size * 0.25 + p * size * 0.22, railW * 0.6, pipR * 2);
      }
    }

    // Scrolling directional chevrons (1/2/3 stacked per belt tier)
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.3, size * 0.068);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.rect(-hw + railW * 0.5, -size * 0.5, hw * 2 - railW, size);
    ctx.clip();

    const step = size * 0.56;
    for (let i = -1; i <= 2; i++) {
      const cy = size * 0.5 - (i + phase) * step;
      drawChevronGroup(ctx, tierPips, 0, cy, hw, size);
    }
  }

  ctx.restore();
}

// Module-scoped 2.5D chassis helper (zero per-frame closure allocation)
function drawChassis(
  ctx: CanvasRenderingContext2D,
  box: number,
  size: number,
  baseColor: string,
  topColor: string,
  borderColor: string
): void {
  const half = box * 0.5;
  const skirtH = box * 0.16;

  // Base shell
  ctx.fillStyle = baseColor;
  ctx.fillRect(-half, -half, box, box);

  // Top deck shifted slightly north for 2.5D south extrusion
  ctx.fillStyle = topColor;
  ctx.fillRect(-box * 0.44, -box * 0.44, box * 0.88, box * 0.72);

  // 2.5D south chassis extruded bevel face
  ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
  ctx.fillRect(-half, half - skirtH, box, skirtH);

  // Top north specular rim highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(-box * 0.44, -box * 0.44, box * 0.88, Math.max(1, size * 0.04));

  // Crisp outer perimeter frame
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.strokeRect(-half, -half, box, box);
}

// Module-scoped output port arrow helper
function drawPortArrow(
  ctx: CanvasRenderingContext2D,
  d: Direction,
  size: number,
  color = '#f59e0b'
): void {
  ctx.save();
  ctx.rotate((d * Math.PI) / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.48);
  ctx.lineTo(size * 0.13, -size * 0.3);
  ctx.lineTo(-size * 0.13, -size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Non-color status LED with shape cue + internal glyph
function drawStatusLed(
  ctx: CanvasRenderingContext2D,
  status: BuildingStatus,
  box: number,
  size: number,
  mode: ColorblindMode
): void {
  const sx = box * 0.33;
  const sy = -box * 0.33;
  const rad = Math.max(2.4, size * 0.085);
  const col = statusColor(status, mode);

  ctx.save();
  ctx.translate(sx, sy);

  // Dark contrast halo
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.arc(0, 0, rad * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = col;
  if (status === 'working') {
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
  } else if (status === 'idle' || status === 'output_full') {
    ctx.fillRect(-rad * 0.9, -rad * 0.9, rad * 1.8, rad * 1.8);
  } else if (status === 'no_power' || status === 'unpaired') {
    ctx.beginPath();
    ctx.moveTo(0, -rad * 1.1);
    ctx.lineTo(rad * 1.1, 0);
    ctx.lineTo(0, rad * 1.1);
    ctx.lineTo(-rad * 1.1, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    // Warning triangle for input_starved / no_resource
    ctx.beginPath();
    ctx.moveTo(0, -rad * 1.05);
    ctx.lineTo(rad * 1.05, rad * 0.9);
    ctx.lineTo(-rad * 1.05, rad * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  // Internal symbol glyph when tile size permits
  if (size >= 24) {
    ctx.strokeStyle = '#090d16';
    ctx.fillStyle = '#090d16';
    ctx.lineWidth = Math.max(1, rad * 0.32);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (status === 'working') {
      // Checkmark
      ctx.moveTo(-rad * 0.45, 0);
      ctx.lineTo(-rad * 0.1, rad * 0.35);
      ctx.lineTo(rad * 0.5, -rad * 0.35);
      ctx.stroke();
    } else if (status === 'idle') {
      // Pause bars
      ctx.moveTo(-rad * 0.3, -rad * 0.4);
      ctx.lineTo(-rad * 0.3, rad * 0.4);
      ctx.moveTo(rad * 0.3, -rad * 0.4);
      ctx.lineTo(rad * 0.3, rad * 0.4);
      ctx.stroke();
    } else if (status === 'no_power') {
      // Lightning zig-zag
      ctx.moveTo(rad * 0.2, -rad * 0.55);
      ctx.lineTo(-rad * 0.25, 0);
      ctx.lineTo(rad * 0.15, 0);
      ctx.lineTo(-rad * 0.2, rad * 0.55);
      ctx.stroke();
    } else if (status === 'output_full') {
      // Up arrow / bar
      ctx.moveTo(-rad * 0.45, -rad * 0.4);
      ctx.lineTo(rad * 0.45, -rad * 0.4);
      ctx.moveTo(0, rad * 0.45);
      ctx.lineTo(0, -rad * 0.1);
      ctx.stroke();
    } else if (status === 'no_resource') {
      // Cross X
      ctx.moveTo(-rad * 0.4, -rad * 0.25);
      ctx.lineTo(rad * 0.4, rad * 0.55);
      ctx.moveTo(rad * 0.4, -rad * 0.25);
      ctx.lineTo(-rad * 0.4, rad * 0.55);
      ctx.stroke();
    } else if (status === 'input_starved') {
      // Vertical exclamation mark
      ctx.moveTo(0, -rad * 0.45);
      ctx.lineTo(0, rad * 0.2);
      ctx.stroke();
      ctx.fillRect(-rad * 0.16, rad * 0.38, rad * 0.32, rad * 0.24);
    } else {
      // Unpaired split dot
      ctx.moveTo(-rad * 0.45, 0);
      ctx.lineTo(-rad * 0.15, 0);
      ctx.moveTo(rad * 0.15, 0);
      ctx.lineTo(rad * 0.45, 0);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawBuildingGlyph(
  ctx: CanvasRenderingContext2D,
  type: BuildingId,
  dir: Direction,
  x: number,
  y: number,
  size: number,
  timeSec: number,
  opts?: BuildingGlyphOptions
): void {
  const active = opts?.active ?? true;
  const reducedMotion = Boolean(opts?.reducedMotion);
  const mode = resolveColorblindMode(opts?.colorblind);

  if (type === 'belt_mk1' || type === 'belt_mk2' || type === 'belt_mk3') {
    drawBeltTile(ctx, type, dir, x, y, size, timeSec, {
      colorblind: mode,
      entryDir: opts?.entryDir,
      reducedMotion,
    });
    return;
  }

  const animTime = reducedMotion ? 0 : timeSec;
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  const pad = size * 0.08;
  const box = size - pad * 2;
  const prevAlpha = ctx.globalAlpha;

  ctx.save();
  ctx.translate(cx, cy);

  // Subtle 2.5D ground drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(-box * 0.5 + size * 0.05, -box * 0.5 + size * 0.07, box, box);

  switch (type) {
    case 'tunnel': {
      drawChassis(ctx, box, size, '#1e293b', '#334155', '#64748b');
      ctx.save();
      ctx.rotate((dir * Math.PI) / 2);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-box * 0.34, -box * 0.32, box * 0.68, box * 0.64);
      ctx.fillStyle = opts?.tunnelMode === 'exit' ? '#38bdf8' : '#f59e0b';
      const arrowY = opts?.tunnelMode === 'exit' ? -box * 0.25 : box * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, arrowY - box * 0.18);
      ctx.lineTo(box * 0.22, arrowY + box * 0.1);
      ctx.lineTo(-box * 0.22, arrowY + box * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'splitter': {
      drawChassis(ctx, box, size, '#1e293b', '#334155', '#f59e0b');
      ctx.save();
      ctx.rotate((dir * Math.PI) / 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(1.5, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, box * 0.35);
      ctx.lineTo(0, -box * 0.35);
      ctx.moveTo(-box * 0.35, 0);
      ctx.lineTo(box * 0.35, 0);
      ctx.stroke();
      ctx.restore();
      drawPortArrow(ctx, dir, size, '#fbbf24');
      drawPortArrow(ctx, rotateDirCW(dir, 1), size, '#fbbf24');
      drawPortArrow(ctx, rotateDirCW(dir, 3), size, '#fbbf24');
      break;
    }
    case 'merger': {
      drawChassis(ctx, box, size, '#1e293b', '#334155', '#38bdf8');
      ctx.save();
      ctx.rotate((dir * Math.PI) / 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(-box * 0.28, box * 0.2);
      ctx.lineTo(0, -box * 0.1);
      ctx.lineTo(box * 0.28, box * 0.2);
      ctx.moveTo(0, -box * 0.35);
      ctx.lineTo(0, box * 0.35);
      ctx.stroke();
      ctx.restore();
      drawPortArrow(ctx, dir, size, '#38bdf8');
      break;
    }
    case 'inserter': {
      // Base pedestal + static arm preview (live articulated arm drawn in renderer)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.stroke();
      drawPortArrow(ctx, dir, size, '#38bdf8');
      break;
    }
    case 'storage': {
      drawChassis(ctx, box, size, '#292524', '#57534e', '#a8a29e');
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-box * 0.3, -box * 0.3, box * 0.6, box * 0.56);
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(-box * 0.3, -box * 0.3, box * 0.6, box * 0.56);
      break;
    }
    case 'miner_mk1':
    case 'miner_mk2': {
      const isMk2 = type === 'miner_mk2';
      drawChassis(ctx, box, size, '#1e293b', isMk2 ? '#0c4a6e' : '#3f2e18', isMk2 ? '#38bdf8' : '#f59e0b');
      // Rotating drill rotor
      ctx.save();
      const spin = active && !reducedMotion ? animTime * (isMk2 ? 7 : 4) : 0;
      ctx.rotate(spin);
      ctx.fillStyle = isMk2 ? '#7dd3fc' : '#fbbf24';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size * 0.26, -size * 0.07);
        ctx.lineTo(size * 0.22, size * 0.09);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      drawPortArrow(ctx, dir, size, isMk2 ? '#38bdf8' : '#f59e0b');
      break;
    }
    case 'smelter': {
      drawChassis(ctx, box, size, '#27272a', '#3f3f46', '#ea580c');
      const glow = active ? (reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(animTime * 8)) : 0.2;
      ctx.globalAlpha = prevAlpha * glow;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(0, -box * 0.04, box * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = prevAlpha;
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.beginPath();
      ctx.arc(0, -box * 0.04, box * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      drawPortArrow(ctx, dir, size, '#fb923c');
      break;
    }
    case 'constructor': {
      drawChassis(ctx, box, size, '#1e293b', '#334155', '#eab308');
      const piston = active && !reducedMotion ? Math.sin(animTime * 9) * box * 0.14 : 0;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-box * 0.28, -box * 0.16 + piston, box * 0.56, box * 0.14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-box * 0.28, box * 0.12, box * 0.56, box * 0.12);
      drawPortArrow(ctx, dir, size, '#facc15');
      break;
    }
    case 'foundry': {
      drawChassis(ctx, box, size, '#1c1917', '#44403c', '#f97316');
      const pulse = active ? (reducedMotion ? 0.82 : 0.7 + 0.3 * Math.sin(animTime * 10)) : 0.2;
      ctx.globalAlpha = prevAlpha * pulse;
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(-box * 0.32, -box * 0.24, box * 0.64, box * 0.42);
      ctx.globalAlpha = prevAlpha;
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.strokeRect(-box * 0.32, -box * 0.24, box * 0.64, box * 0.42);
      drawPortArrow(ctx, dir, size, '#fb923c');
      break;
    }
    case 'assembler': {
      drawChassis(ctx, box, size, '#0f172a', '#1e3a5f', '#38bdf8');
      const armA = active && !reducedMotion ? Math.sin(animTime * 7) * 0.35 : 0;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(-box * 0.32, -box * 0.25);
      ctx.lineTo(armA * box * 0.2, 0);
      ctx.moveTo(box * 0.32, box * 0.2);
      ctx.lineTo(-armA * box * 0.2, 0);
      ctx.stroke();
      ctx.fillStyle = active ? '#22d3ee' : '#64748b';
      ctx.beginPath();
      ctx.arc(0, 0, box * 0.12, 0, Math.PI * 2);
      ctx.fill();
      drawPortArrow(ctx, dir, size, '#38bdf8');
      break;
    }
    case 'coal_generator': {
      drawChassis(ctx, box, size, '#18181b', '#27272a', '#71717a');
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(-box * 0.16, -box * 0.12, box * 0.17, 0, Math.PI * 2);
      ctx.arc(box * 0.16, box * 0.06, box * 0.17, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(-box * 0.16, -box * 0.12, box * 0.08, 0, Math.PI * 2);
        ctx.arc(box * 0.16, box * 0.06, box * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'solar_panel': {
      drawChassis(ctx, box, size, '#0f172a', '#1e40af', '#60a5fa');
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = Math.max(0.8, size * 0.03);
      const off = 0.18;
      ctx.beginPath();
      ctx.moveTo(-box * off, -box * 0.4);
      ctx.lineTo(-box * off, box * 0.26);
      ctx.moveTo(box * off, -box * 0.4);
      ctx.lineTo(box * off, box * 0.26);
      ctx.moveTo(-box * 0.4, -box * off);
      ctx.lineTo(box * 0.4, -box * off);
      ctx.moveTo(-box * 0.4, box * 0.1);
      ctx.lineTo(box * 0.4, box * 0.1);
      ctx.stroke();
      break;
    }
    case 'accumulator': {
      drawChassis(ctx, box, size, '#0f172a', '#1e293b', '#22d3ee');
      const ratio = Math.max(0, Math.min(1, opts?.energyRatio ?? 0.65));
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-box * 0.25, -box * 0.36, box * 0.5, box * 0.64);
      ctx.fillStyle = '#06b6d4';
      const fillH = box * 0.56 * ratio;
      ctx.fillRect(-box * 0.2, box * 0.24 - fillH, box * 0.4, fillH);
      break;
    }
    case 'geothermal_plant': {
      drawChassis(ctx, box, size, '#292524', '#7c2d12', '#fb923c');
      ctx.save();
      ctx.rotate(active && !reducedMotion ? animTime * 5 : 0);
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(box * 0.32, 0);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'research_lab': {
      drawChassis(ctx, box, size, '#0f172a', '#1e1b4b', '#818cf8');
      ctx.fillStyle = active ? '#a5b4fc' : '#475569';
      ctx.beginPath();
      ctx.arc(0, -box * 0.04, box * 0.26, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.save();
        ctx.translate(0, -box * 0.04);
        ctx.rotate(reducedMotion ? 0.5 : animTime * 3.5);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(1.2, size * 0.05);
        ctx.beginPath();
        ctx.ellipse(0, 0, box * 0.34, box * 0.13, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'orbital_hub': {
      drawChassis(ctx, box, size, '#0f172a', '#1e293b', '#f59e0b');
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.arc(0, -box * 0.04, box * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(0, -box * 0.26);
      ctx.lineTo(box * 0.15, box * 0.16);
      ctx.lineTo(-box * 0.15, box * 0.16);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  // Geothermal Resonance thermal badge on adjacent machines
  if ((opts?.geoBonus ?? 0) > 0) {
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(-box * 0.34, -box * 0.34, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp status LED with non-color shape & icon symbol
  if (opts?.status && type !== 'orbital_hub') {
    drawStatusLed(ctx, opts.status, box, size, mode);
  }

  ctx.restore();
}

export function getItemIconDataUrl(
  item: ItemId,
  size = 32,
  colorblind: boolean | ColorblindMode = false
): string {
  const mode = resolveColorblindMode(colorblind);
  const key = `${item}_${size}_${mode}`;
  const cached = itemIconCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawItemIcon(ctx, item, size / 2, size / 2, size * 0.85, mode);
  }
  const url = canvas.toDataURL();
  cacheSet(itemIconCache, key, url);
  return url;
}

export function getBuildingIconDataUrl(
  type: BuildingId,
  size = 36,
  colorblind: boolean | ColorblindMode = false
): string {
  const mode = resolveColorblindMode(colorblind);
  const key = `${type}_${size}_${mode}`;
  const cached = buildingIconCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawBuildingGlyph(ctx, type, 1, 2, 2, size - 4, 0.35, {
      active: true,
      colorblind: mode,
      energyRatio: 0.75,
    });
  }
  const url = canvas.toDataURL();
  cacheSet(buildingIconCache, key, url);
  return url;
}

function formatIdLabel(id: string): string {
  const parts = id.split('_');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === 'mk1') parts[i] = 'Mk.I';
    else if (p === 'mk2') parts[i] = 'Mk.II';
    else if (p === 'mk3') parts[i] = 'Mk.III';
    else if (p.length > 0) parts[i] = p[0].toUpperCase() + p.slice(1);
  }
  return parts.join(' ');
}

function drawWrappedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);

  const lineH = 16;
  const startY = lines.length > 1 ? y - 6 : y;
  for (let i = 0; i < Math.min(2, lines.length); i++) {
    ctx.fillText(lines[i], x, startY + i * lineH);
  }
}

/**
 * Renders the Game Studio `?scene=figures` catalog screen showing every item and
 * every building silhouette side-by-side with clear labels and zero emojis.
 * Accepts optional localized label maps so render stays independent of UI modules.
 */
export function renderFiguresGallery(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  locale: string = 'en',
  timeSec = 0,
  labels?: FiguresGalleryLabels
): void {
  const isPt = locale === 'pt-BR';
  const titleText =
    labels?.title ??
    (isPt
      ? 'AETHERFORGE — Catalogo Procedural de Itens e Estruturas'
      : 'AETHERFORGE — Procedural Asset & Silhouette Catalog (Zero Emoji)');
  const itemsHeading =
    labels?.itemsHeading ?? `${isPt ? 'ITENS' : 'ITEMS'} (${ITEM_IDS.length})`;
  const buildingsHeading =
    labels?.buildingsHeading ?? `${isPt ? 'ESTRUTURAS' : 'BUILDINGS'} (${BUILDING_IDS.length})`;
  const reducedMotion = Boolean(labels?.reducedMotion);

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(titleText, 24, 34);

  const cols = Math.max(3, Math.floor((width - 48) / 210));
  const cellW = Math.floor((width - 48) / cols);
  const cellH = 66;

  // Section 1: Items (19)
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(itemsHeading, 24, 62);

  for (let i = 0; i < ITEM_IDS.length; i++) {
    const item = ITEM_IDS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 24 + col * cellW;
    const y = 74 + row * cellH;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#1e293b';
    ctx.fillRect(x, y, cellW - 8, cellH - 8);
    ctx.strokeRect(x, y, cellW - 8, cellH - 8);
    drawItemIcon(ctx, item, x + 26, y + 29, 32);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    const label = labels?.items?.[item] ?? formatIdLabel(item);
    drawWrappedLabel(ctx, label, x + 50, y + 33, cellW - 64);
  }

  const itemRows = Math.ceil(ITEM_IDS.length / cols);
  const bStartY = 94 + itemRows * cellH;

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(buildingsHeading, 24, bStartY);

  for (let i = 0; i < BUILDING_IDS.length; i++) {
    const bType = BUILDING_IDS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 24 + col * cellW;
    const y = bStartY + 12 + row * cellH;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#1e293b';
    ctx.fillRect(x, y, cellW - 8, cellH - 8);
    ctx.strokeRect(x, y, cellW - 8, cellH - 8);
    drawBuildingGlyph(ctx, bType, 1, x + 8, y + 9, 40, timeSec, {
      active: true,
      status: 'working',
      energyRatio: 0.8,
      reducedMotion,
    });
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    const rawLabel = labels?.buildings?.[bType];
    const bLabel =
      typeof rawLabel === 'string'
        ? rawLabel
        : rawLabel?.name ?? formatIdLabel(bType);
    drawWrappedLabel(ctx, bLabel, x + 54, y + 33, cellW - 68);
  }
}
