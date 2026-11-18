import {
  BUILDINGS,
  DIR_DX,
  DIR_DY,
  HUB_ORIGIN,
  HUB_SIZE,
  ITEMS,
  RECIPES,
  WORLD_SIZE,
  isBeltType,
  isProcessorType,
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
import { drawBuildingGlyph, drawItemIcon, statusColor } from './sprites';

export const BASE_TILE_PX = 48;

export interface CameraState {
  x: number; // world center in tile coordinates
  y: number;
  zoom: number;
}

export interface RenderOptions {
  showAltMode: boolean;
  showPowerOverlay: boolean;
  colorblind: boolean;
  selectedTool: BuildingId | 'cursor' | 'mine' | 'deconstruct' | 'bp_copy' | 'bp_stamp';
  toolDir: Direction;
  hoverTile: { x: number; y: number } | null;
  dragPath: Array<{ x: number; y: number; dir: Direction }>;
  activeBlueprint: BlueprintData | null;
  copyStart: { x: number; y: number } | null;
  selectedBuildingId: number | null;
  mineBeam: { tx: number; ty: number; timer: number } | null;
}

const ORE_PALETTE: Record<Exclude<ResourceType, 'none'>, { base: string; fleck: string }> = {
  iron_ore: { base: '#273a4f', fleck: '#7ea8d6' },
  copper_ore: { base: '#4a2617', fleck: '#eb7d44' },
  coal: { base: '#14171c', fleck: '#4b5563' },
  stone: { base: '#373a40', fleck: '#9ca3af' },
  quartz: { base: '#3b1e54', fleck: '#d8b4fe' },
  geothermal_vent: { base: '#451208', fleck: '#fb923c' },
};

export class FactoryRenderer {
  private minimapBounds = { x: 0, y: 0, w: 144, h: 144 };

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
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, viewW, viewH);

    const tilePx = BASE_TILE_PX * cam.zoom;
    const offsetX = viewW * 0.5 - cam.x * tilePx;
    const offsetY = viewH * 0.5 - cam.y * tilePx;

    const minX = Math.max(0, Math.floor(-offsetX / tilePx) - 1);
    const maxX = Math.min(WORLD_SIZE - 1, Math.ceil((viewW - offsetX) / tilePx) + 1);
    const minY = Math.max(0, Math.floor(-offsetY / tilePx) - 1);
    const maxY = Math.min(WORLD_SIZE - 1, Math.ceil((viewH - offsetY) / tilePx) + 1);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 1. Planet basalt terrain & resource veins
    this.drawTerrain(ctx, world, minX, maxX, minY, maxY, tilePx, timeSec);

    // 2. Buildings (excluding items riding on belts)
    this.drawBuildings(ctx, world, minX, maxX, minY, maxY, tilePx, timeSec, opts);

    // 3. Orbital Hub (3x3 centerpiece + Rocket launch VFX)
    this.drawOrbitalHub(ctx, world, tilePx, timeSec);

    // 4. Belt items & Inserter carried items (drawn on top of tracks)
    this.drawItemsAndInserterArms(ctx, world, minX, maxX, minY, maxY, tilePx, opts);

    // 5. Alt-Mode & Tunnel Link Overlays
    if (opts.showAltMode) {
      this.drawAltModeOverlays(ctx, world, minX, maxX, minY, maxY, tilePx, opts.colorblind);
    }

    // 6. Night lighting tint & additive industrial glow
    this.drawDayNightGlow(ctx, world, minX, maxX, minY, maxY, tilePx);

    // 7. Interactive Ghosts, Drag Belts, Blueprint Stamp, Selection & Mining Laser
    this.drawInteractionOverlays(ctx, world, tilePx, timeSec, opts);

    ctx.restore();

    // 8. Interactive Minimap (screen space)
    this.drawMinimap(ctx, viewW, viewH, world, cam);
  }

  private drawTerrain(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    timeSec: number
  ): void {
    // Ground base slab
    ctx.fillStyle = '#0f1623';
    ctx.fillRect(minX * tilePx, minY * tilePx, (maxX - minX + 1) * tilePx, (maxY - minY + 1) * tilePx);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x * tilePx;
        const py = y * tilePx;

        // Subtle checkerboard basalt variation
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.015)';
          ctx.fillRect(px, py, tilePx, tilePx);
        }

        const res = world.resources[tileIndex(x, y)];
        if (res === 'none') continue;

        const pal = ORE_PALETTE[res];
        ctx.fillStyle = pal.base;
        ctx.fillRect(px + 1, py + 1, tilePx - 2, tilePx - 2);

        if (res === 'geothermal_vent') {
          const pulse = 0.55 + 0.45 * Math.sin(timeSec * 4 + x + y);
          ctx.fillStyle = `rgba(251, 146, 60, ${0.35 + pulse * 0.45})`;
          ctx.beginPath();
          ctx.arc(px + tilePx * 0.5, py + tilePx * 0.5, tilePx * 0.34, 0, Math.PI * 2);
          ctx.fill();
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
        } else {
          // Deterministic mineral crystal shards on tile
          ctx.fillStyle = pal.fleck;
          const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          for (let k = 0; k < 4; k++) {
            const ox = ((h >> (k * 4)) & 7) / 10 + 0.15;
            const oy = ((h >> (k * 4 + 2)) & 7) / 10 + 0.15;
            const s = tilePx * 0.14;
            ctx.fillRect(px + ox * tilePx * 0.75, py + oy * tilePx * 0.75, s, s);
          }
        }
      }
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
    opts: RenderOptions
  ): void {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isHubTile(x, y)) continue;
        const b = getBuildingAt(world, x, y);
        if (!b) continue;

        const px = x * tilePx;
        const py = y * tilePx;
        const cap = BUILDINGS.accumulator.energy_capacity_mj ?? 120;

        drawBuildingGlyph(ctx, b.type, b.dir, px, py, tilePx, timeSec, {
          active: b.status === 'working',
          status: b.status,
          energyRatio: b.energyMj / cap,
          tunnelMode: b.tunnelMode,
          colorblind: opts.colorblind,
          geoBonus: b.geoBonus,
        });

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
    timeSec: number
  ): void {
    const hx = HUB_ORIGIN * tilePx;
    const hy = HUB_ORIGIN * tilePx;
    const size = HUB_SIZE * tilePx;
    const cx = hx + size * 0.5;
    const cy = hy + size * 0.5;

    ctx.save();
    // Base pad & perimeter intake ports
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(2, tilePx * 0.08);
    ctx.fillRect(hx + 2, hy + 2, size - 4, size - 4);
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

    // Animated telemetry scanner sweep
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(timeSec * 0.9);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2, tilePx * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 0.55);
    ctx.stroke();
    ctx.restore();

    // Central Rocket Pod (launches skyward during world.rocketTimer > 0!)
    const launchProgress = world.rocketTimer > 0 ? 1 - world.rocketTimer / 4.5 : 0;
    const liftY = launchProgress > 0 ? -Math.pow(launchProgress, 2) * size * 8 : 0;
    const rocketScale = 1 + launchProgress * 0.65;

    ctx.save();
    ctx.translate(cx, cy + liftY);
    ctx.scale(rocketScale, rocketScale);

    if (launchProgress > 0) {
      // Thruster plasma flame & smoke ring
      const flameH = size * (0.45 + 0.18 * Math.sin(timeSec * 45));
      const grad = ctx.createLinearGradient(0, size * 0.1, 0, size * 0.1 + flameH);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#fbbf24');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, size * 0.14);
      ctx.lineTo(0, size * 0.14 + flameH);
      ctx.lineTo(size * 0.12, size * 0.14);
      ctx.closePath();
      ctx.fill();
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
    opts: RenderOptions
  ): void {
    const itemSize = Math.max(10, tilePx * 0.44);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const b = getBuildingAt(world, x, y);
        if (!b) continue;

        if (isBeltType(b.type) || b.type === 'splitter' || b.type === 'merger') {
          for (const slot of b.slots) {
            const pos = this.beltItemPos(b, slot.progress, slot.sourceDir, tilePx);
            drawItemIcon(ctx, slot.item, pos.x, pos.y, itemSize, opts.colorblind);
          }
          continue;
        }

        if (b.type === 'inserter') {
          const cx = (b.x + 0.5) * tilePx;
          const cy = (b.y + 0.5) * tilePx;
          // Interpolate arm tip from source tile (-dir) to target tile (+dir)
          const p = b.inserterProgress; // 0 = at source, 1 = at target
          const reach = (p - 0.5) * 1.45 * tilePx;
          const tipX = cx + DIR_DX[b.dir] * reach;
          const tipY = cy + DIR_DY[b.dir] * reach;

          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = Math.max(2, tilePx * 0.08);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(tipX, tipY, Math.max(2.5, tilePx * 0.08), 0, Math.PI * 2);
          ctx.fill();

          if (b.inserterItem) {
            drawItemIcon(ctx, b.inserterItem, tipX, tipY, itemSize * 0.9, opts.colorblind);
          }
        }
      }
    }
  }

  private beltItemPos(
    b: BuildingEntity,
    progress: number,
    sourceDir: Direction | undefined,
    tilePx: number
  ): { x: number; y: number } {
    const cx = (b.x + 0.5) * tilePx;
    const cy = (b.y + 0.5) * tilePx;
    const outX = DIR_DX[b.dir] * 0.5 * tilePx;
    const outY = DIR_DY[b.dir] * 0.5 * tilePx;

    if (sourceDir !== undefined && sourceDir !== ((b.dir + 2) & 3)) {
      // Quadratic curve from perpendicular entry edge through center to exit edge
      const inX = DIR_DX[sourceDir] * 0.5 * tilePx;
      const inY = DIR_DY[sourceDir] * 0.5 * tilePx;
      const t = progress;
      const mt = 1 - t;
      return {
        x: cx + mt * mt * inX + t * t * outX,
        y: cy + mt * mt * inY + t * t * outY,
      };
    }

    const offset = (progress - 0.5) * tilePx;
    return {
      x: cx + DIR_DX[b.dir] * offset,
      y: cy + DIR_DY[b.dir] * offset,
    };
  }

  private drawAltModeOverlays(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    colorblind: boolean
  ): void {
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
            ctx.setLineDash([5, 4]);
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
          drawItemIcon(ctx, iconItem, cx, cy, tilePx * 0.44, colorblind);
        }

        // Clock % badge when overclocked/underclocked
        if (b.clock !== 1.0 && tilePx >= 28) {
          ctx.fillStyle = b.clock > 1 ? '#f59e0b' : '#38bdf8';
          ctx.font = `bold ${Math.max(10, Math.round(tilePx * 0.22))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(`${Math.round(b.clock * 100)}%`, cx, (y + 0.24) * tilePx);
        }

        // Status ring on malfunctioning buildings
        if (b.status === 'no_power' || b.status === 'output_full' || b.status === 'unpaired') {
          ctx.strokeStyle = statusColor(b.status, colorblind);
          ctx.lineWidth = 2;
          ctx.strokeRect(x * tilePx + 2, y * tilePx + 2, tilePx - 4, tilePx - 4);
        }
      }
    }
  }

  private drawDayNightGlow(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number
  ): void {
    const nightAlpha = Math.max(0, 1 - world.power.solarFactor) * 0.42;
    if (nightAlpha <= 0.04) return;

    ctx.fillStyle = `rgba(4, 9, 24, ${nightAlpha.toFixed(3)})`;
    ctx.fillRect(
      minX * tilePx,
      minY * tilePx,
      (maxX - minX + 1) * tilePx,
      (maxY - minY + 1) * tilePx
    );

    // Additive radial light blooms around active machines, vents & Hub
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const drawGlow = (gx: number, gy: number, rad: number, color: string) => {
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(gx, gy, rad, 0, Math.PI * 2);
      ctx.fill();
    };

    drawGlow(
      (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx,
      (HUB_ORIGIN + HUB_SIZE * 0.5) * tilePx,
      tilePx * 3.8,
      `rgba(56, 189, 248, ${nightAlpha * 0.7})`
    );

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = (x + 0.5) * tilePx;
        const py = (y + 0.5) * tilePx;
        if (world.resources[tileIndex(x, y)] === 'geothermal_vent') {
          drawGlow(px, py, tilePx * 1.4, `rgba(249, 115, 22, ${nightAlpha * 0.8})`);
        }
        const b = getBuildingAt(world, x, y);
        if (b && b.status === 'working' && (b.type === 'smelter' || b.type === 'foundry' || b.type === 'research_lab')) {
          drawGlow(
            px,
            py,
            tilePx * 1.1,
            b.type === 'research_lab'
              ? `rgba(129, 140, 248, ${nightAlpha * 0.8})`
              : `rgba(251, 146, 60, ${nightAlpha * 0.7})`
          );
        }
      }
    }
    ctx.restore();
  }

  private drawInteractionOverlays(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    tilePx: number,
    timeSec: number,
    opts: RenderOptions
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
    }

    // Drag belt path preview
    if (opts.dragPath.length > 0 && isBeltType(opts.selectedTool as BuildingId)) {
      const tool = opts.selectedTool as BuildingId;
      for (const step of opts.dragPath) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        drawBuildingGlyph(ctx, tool, step.dir, step.x * tilePx, step.y * tilePx, tilePx, timeSec);
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

    // Blueprint Stamp Ghost
    if (opts.selectedTool === 'bp_stamp' && opts.activeBlueprint) {
      for (const e of opts.activeBlueprint.entries) {
        const tx = hx + e.dx;
        const ty = hy + e.dy;
        if (!inBounds(tx, ty)) continue;
        const blocked = world.grid[tileIndex(tx, ty)] !== 0;
        ctx.save();
        ctx.globalAlpha = 0.6;
        drawBuildingGlyph(ctx, e.type, e.dir, tx * tilePx, ty * tilePx, tilePx, timeSec);
        ctx.fillStyle = blocked ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.25)';
        ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
        ctx.restore();
      }
      return;
    }

    // Single tile cursor / building ghost
    if (opts.selectedTool in BUILDINGS) {
      const bType = opts.selectedTool as BuildingId;
      ctx.save();
      ctx.globalAlpha = 0.65;
      drawBuildingGlyph(ctx, bType, opts.toolDir, hx * tilePx, hy * tilePx, tilePx, timeSec);
      const occupied = world.grid[tileIndex(hx, hy)] !== 0;
      ctx.strokeStyle = occupied ? '#ef4444' : '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * tilePx, hy * tilePx, tilePx, tilePx);
      ctx.restore();
    } else {
      ctx.strokeStyle = opts.selectedTool === 'deconstruct' ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx * tilePx + 1, hy * tilePx + 1, tilePx - 2, tilePx - 2);
    }
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    world: WorldState,
    cam: CameraState
  ): void {
    const size = 140;
    const mx = viewW - size - 14;
    const my = viewH - size - 86;
    this.minimapBounds = { x: mx, y: my, w: size, h: size };

    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.fillRect(mx, my, size, size);
    ctx.strokeRect(mx, my, size, size);

    const cell = size / WORLD_SIZE;
    for (let y = 0; y < WORLD_SIZE; y++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const res = world.resources[tileIndex(x, y)];
        if (res !== 'none') {
          ctx.fillStyle = ORE_PALETTE[res].fleck;
          ctx.fillRect(mx + x * cell, my + y * cell, Math.ceil(cell), Math.ceil(cell));
        }
        const gid = world.grid[tileIndex(x, y)];
        if (gid > 0) {
          ctx.fillStyle = isHubTile(x, y) ? '#38bdf8' : '#f59e0b';
          ctx.fillRect(mx + x * cell, my + y * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }

    // Viewport rectangle
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
