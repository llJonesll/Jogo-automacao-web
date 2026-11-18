import { BUILDING_IDS, BUILDINGS, ITEM_IDS, ITEMS, rotateDirCW } from '../core/data';
import type { BuildingId, BuildingStatus, Direction, ItemId } from '../core/types';
import { getBundle, type Locale } from '../ui/i18n';

const itemIconCache = new Map<string, string>();
const buildingIconCache = new Map<string, string>();

export function statusColor(status: BuildingStatus, colorblind = false): string {
  switch (status) {
    case 'working':
      return colorblind ? '#38bdf8' : '#22c55e';
    case 'idle':
      return '#f59e0b';
    case 'no_power':
      return colorblind ? '#f43f5e' : '#ef4444';
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
  colorblind = false
): void {
  const def = ITEMS[item];
  if (!def) return;
  const r = size * 0.44;
  ctx.save();
  ctx.translate(cx, cy);

  switch (item) {
    case 'iron_ore':
    case 'copper_ore':
    case 'coal':
    case 'stone': {
      // Jagged faceted ore cluster
      ctx.fillStyle = def.color;
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
      // Octagonal iridescent silicon disc with grid traces
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
      // Riveted metal plate
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.accent;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.fillRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
      ctx.strokeRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
      ctx.fillStyle = def.accent;
      for (const sx of [-0.5, 0.5]) {
        for (const sy of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.arc(r * sx, r * sy, r * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
      // Green PCB with gold pin traces
      ctx.fillStyle = colorblind ? '#0284c7' : def.color;
      ctx.strokeStyle = def.accent;
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

export function drawBeltTile(
  ctx: CanvasRenderingContext2D,
  type: 'belt_mk1' | 'belt_mk2' | 'belt_mk3',
  dir: Direction,
  x: number,
  y: number,
  size: number,
  timeSec: number,
  colorblind = false
): void {
  const accent =
    type === 'belt_mk1'
      ? colorblind
        ? '#eab308'
        : '#f59e0b'
      : type === 'belt_mk2'
        ? colorblind
          ? '#f97316'
          : '#ef4444'
        : '#06b6d4';

  const speed = BUILDINGS[type].speed ?? 2;
  ctx.save();
  ctx.translate(x + size * 0.5, y + size * 0.5);
  ctx.rotate((dir * Math.PI) / 2);

  // Dark belt track bed
  const hw = size * 0.38;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-hw, -size * 0.5, hw * 2, size);

  // Side rails
  ctx.fillStyle = '#475569';
  ctx.fillRect(-hw, -size * 0.5, size * 0.08, size);
  ctx.fillRect(hw - size * 0.08, -size * 0.5, size * 0.08, size);

  // Scrolling directional chevrons pointing UP (dir=0 local coordinates)
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, size * 0.075);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.rect(-hw, -size * 0.5, hw * 2, size);
  ctx.clip();

  const phase = ((timeSec * speed * 0.7) % 1 + 1) % 1;
  const step = size * 0.48;
  for (let i = -1; i <= 2; i++) {
    const cy = size * 0.5 - (i + phase) * step;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.55, cy + size * 0.14);
    ctx.lineTo(0, cy - size * 0.08);
    ctx.lineTo(hw * 0.55, cy + size * 0.14);
    ctx.stroke();
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
  opts?: {
    active?: boolean;
    status?: BuildingStatus;
    energyRatio?: number;
    tunnelMode?: 'entrance' | 'exit';
    colorblind?: boolean;
    geoBonus?: number;
  }
): void {
  const active = opts?.active ?? true;
  const colorblind = opts?.colorblind ?? false;

  if (type === 'belt_mk1' || type === 'belt_mk2' || type === 'belt_mk3') {
    drawBeltTile(ctx, type, dir, x, y, size, timeSec, colorblind);
    return;
  }

  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  const pad = size * 0.08;
  const box = size - pad * 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Subtle 2.5D ground drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(-box * 0.5 + size * 0.05, -box * 0.5 + size * 0.07, box, box);

  // Draw orientation chassis helper
  const drawChassis = (baseColor: string, topColor: string, borderColor: string) => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(-box * 0.5, -box * 0.5, box, box);
    ctx.fillStyle = topColor;
    ctx.fillRect(-box * 0.44, -box * 0.44, box * 0.88, box * 0.78);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeRect(-box * 0.5, -box * 0.5, box, box);
  };

  // Directional output port arrow
  const drawPortArrow = (d: Direction, color = '#f59e0b') => {
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
  };

  switch (type) {
    case 'tunnel': {
      drawChassis('#1e293b', '#334155', '#64748b');
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
      drawChassis('#1e293b', '#334155', '#f59e0b');
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
      drawPortArrow(dir, '#fbbf24');
      drawPortArrow(rotateDirCW(dir, 1), '#fbbf24');
      drawPortArrow(rotateDirCW(dir, 3), '#fbbf24');
      break;
    }
    case 'merger': {
      drawChassis('#1e293b', '#334155', '#38bdf8');
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
      drawPortArrow(dir, '#38bdf8');
      break;
    }
    case 'inserter': {
      // Base pedestal + static arm preview (live animated arm drawn in renderer)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.stroke();
      drawPortArrow(dir, '#38bdf8');
      break;
    }
    case 'storage': {
      drawChassis('#292524', '#57534e', '#a8a29e');
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-box * 0.3, -box * 0.3, box * 0.6, box * 0.6);
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(-box * 0.3, -box * 0.3, box * 0.6, box * 0.6);
      break;
    }
    case 'miner_mk1':
    case 'miner_mk2': {
      const isMk2 = type === 'miner_mk2';
      drawChassis('#1e293b', isMk2 ? '#0c4a6e' : '#3f2e18', isMk2 ? '#38bdf8' : '#f59e0b');
      // Rotating drill rotor
      ctx.save();
      const spin = active ? timeSec * (isMk2 ? 7 : 4) : 0;
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
      drawPortArrow(dir, isMk2 ? '#38bdf8' : '#f59e0b');
      break;
    }
    case 'smelter': {
      drawChassis('#27272a', '#3f3f46', '#ea580c');
      const glow = active ? 0.65 + 0.35 * Math.sin(timeSec * 8) : 0.2;
      ctx.fillStyle = `rgba(249, 115, 22, ${glow})`;
      ctx.beginPath();
      ctx.arc(0, 0, box * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.stroke();
      drawPortArrow(dir, '#fb923c');
      break;
    }
    case 'constructor': {
      drawChassis('#1e293b', '#334155', '#eab308');
      const piston = active ? Math.sin(timeSec * 9) * box * 0.14 : 0;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-box * 0.28, -box * 0.14 + piston, box * 0.56, box * 0.14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-box * 0.28, box * 0.16, box * 0.56, box * 0.12);
      drawPortArrow(dir, '#facc15');
      break;
    }
    case 'foundry': {
      drawChassis('#1c1917', '#44403c', '#f97316');
      const pulse = active ? 0.7 + 0.3 * Math.sin(timeSec * 10) : 0.2;
      ctx.fillStyle = `rgba(251, 146, 60, ${pulse})`;
      ctx.fillRect(-box * 0.32, -box * 0.22, box * 0.64, box * 0.44);
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.strokeRect(-box * 0.32, -box * 0.22, box * 0.64, box * 0.44);
      drawPortArrow(dir, '#fb923c');
      break;
    }
    case 'assembler': {
      drawChassis('#0f172a', '#1e3a5f', '#38bdf8');
      const armA = active ? Math.sin(timeSec * 7) * 0.35 : 0;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(-box * 0.32, -box * 0.25);
      ctx.lineTo(armA * box * 0.2, 0);
      ctx.moveTo(box * 0.32, box * 0.25);
      ctx.lineTo(-armA * box * 0.2, 0);
      ctx.stroke();
      ctx.fillStyle = active ? '#22d3ee' : '#64748b';
      ctx.beginPath();
      ctx.arc(0, 0, box * 0.12, 0, Math.PI * 2);
      ctx.fill();
      drawPortArrow(dir, '#38bdf8');
      break;
    }
    case 'coal_generator': {
      drawChassis('#18181b', '#27272a', '#71717a');
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(-box * 0.16, -box * 0.1, box * 0.18, 0, Math.PI * 2);
      ctx.arc(box * 0.16, box * 0.1, box * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
        ctx.beginPath();
        ctx.arc(-box * 0.16, -box * 0.1, box * 0.08, 0, Math.PI * 2);
        ctx.arc(box * 0.16, box * 0.1, box * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'solar_panel': {
      drawChassis('#0f172a', '#1e40af', '#60a5fa');
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = Math.max(0.8, size * 0.03);
      for (const offset of [-0.18, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(box * offset, -box * 0.42);
        ctx.lineTo(box * offset, box * 0.42);
        ctx.moveTo(-box * 0.42, box * offset);
        ctx.lineTo(box * 0.42, box * offset);
        ctx.stroke();
      }
      break;
    }
    case 'accumulator': {
      drawChassis('#0f172a', '#1e293b', '#22d3ee');
      const ratio = Math.max(0, Math.min(1, opts?.energyRatio ?? 0.65));
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-box * 0.25, -box * 0.35, box * 0.5, box * 0.7);
      ctx.fillStyle = '#06b6d4';
      const fillH = box * 0.62 * ratio;
      ctx.fillRect(-box * 0.2, box * 0.31 - fillH, box * 0.4, fillH);
      break;
    }
    case 'geothermal_plant': {
      drawChassis('#292524', '#7c2d12', '#fb923c');
      ctx.save();
      ctx.rotate(active ? timeSec * 5 : 0);
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(box * 0.34, 0);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'research_lab': {
      drawChassis('#0f172a', '#1e1b4b', '#818cf8');
      ctx.fillStyle = active ? '#a5b4fc' : '#475569';
      ctx.beginPath();
      ctx.arc(0, 0, box * 0.28, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.save();
        ctx.rotate(timeSec * 3.5);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(1.2, size * 0.05);
        ctx.beginPath();
        ctx.ellipse(0, 0, box * 0.36, box * 0.14, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'orbital_hub': {
      // Preview silhouette for Hub (live 3x3 rendered separately at 3x scale)
      drawChassis('#0f172a', '#1e293b', '#f59e0b');
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, box * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(0, -box * 0.25);
      ctx.lineTo(box * 0.15, box * 0.2);
      ctx.lineTo(-box * 0.15, box * 0.2);
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

  // Crisp status LED indicator dot
  if (opts?.status && type !== 'orbital_hub') {
    ctx.fillStyle = statusColor(opts.status, colorblind);
    ctx.beginPath();
    ctx.arc(box * 0.34, -box * 0.34, Math.max(2, size * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function getItemIconDataUrl(item: ItemId, size = 32, colorblind = false): string {
  const key = `${item}_${size}_${colorblind ? 1 : 0}`;
  const cached = itemIconCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawItemIcon(ctx, item, size / 2, size / 2, size * 0.85, colorblind);
  }
  const url = canvas.toDataURL();
  itemIconCache.set(key, url);
  return url;
}

export function getBuildingIconDataUrl(
  type: BuildingId,
  size = 36,
  colorblind = false
): string {
  const key = `${type}_${size}_${colorblind ? 1 : 0}`;
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
      colorblind,
      energyRatio: 0.75,
    });
  }
  const url = canvas.toDataURL();
  buildingIconCache.set(key, url);
  return url;
}

/**
 * Renders the Game Studio `?scene=figures` catalog screen showing every item and
 * every building silhouette side-by-side with clear labels and zero emojis.
 */
export function renderFiguresGallery(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  locale: Locale,
  timeSec: number
): void {
  const t = getBundle(locale);
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('AETHERFORGE — Procedural Asset & Silhouette Catalog (Zero Emoji)', 28, 36);

  // Section 1: Items (19)
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`ITEMS (${ITEM_IDS.length})`, 28, 66);

  const cols = Math.max(4, Math.floor((width - 56) / 140));
  const cellW = 136;
  const cellH = 74;

  ITEM_IDS.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 28 + col * cellW;
    const y = 80 + row * cellH;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#1e293b';
    ctx.fillRect(x, y, cellW - 8, cellH - 8);
    ctx.strokeRect(x, y, cellW - 8, cellH - 8);
    drawItemIcon(ctx, item, x + 28, y + 32, 34);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(t.items[item].slice(0, 11), x + 50, y + 37);
  });

  const itemRows = Math.ceil(ITEM_IDS.length / cols);
  const bStartY = 100 + itemRows * cellH;

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`BUILDINGS (${BUILDING_IDS.length})`, 28, bStartY);

  BUILDING_IDS.forEach((bType, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 28 + col * cellW;
    const y = bStartY + 14 + row * cellH;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#1e293b';
    ctx.fillRect(x, y, cellW - 8, cellH - 8);
    ctx.strokeRect(x, y, cellW - 8, cellH - 8);
    drawBuildingGlyph(ctx, bType, 1, x + 8, y + 12, 42, timeSec, {
      active: true,
      status: 'working',
      energyRatio: 0.8,
    });
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(t.buildings[bType].name.slice(0, 11), x + 54, y + 38);
  });
}
