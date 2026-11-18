/**
 * Zero-GC TypedArray Struct-of-Arrays particle pool for industrial VFX.
 * Coordinates are stored in world tile space so camera pan/zoom stays locked.
 */

export const MAX_PARTICLES = 512;

export type ParticleBurstKind =
  | 'build'
  | 'remove'
  | 'mine'
  | 'ember'
  | 'wisp'
  | 'ore_chip'
  | 'spark'
  | 'steam'
  | 'rocket_exhaust'
  | 'shockwave'
  | 'hub_pulse';

// Numeric particle style tags stored inside Uint8Array
const STYLE_SQUARE = 0;
const STYLE_CIRCLE = 1;
const STYLE_RING = 2;

// Static palette table so render() allocates zero rgba()/hex strings per frame.
const PARTICLE_COLORS: readonly string[] = [
  '#f59e0b', // 0: amber
  '#fb923c', // 1: orange ember
  '#fde047', // 2: yellow spark
  '#38bdf8', // 3: plasma cyan
  '#818cf8', // 4: lab indigo
  '#cbd5e1', // 5: steam / smoke light
  '#64748b', // 6: smoke dark
  '#ef4444', // 7: dismantle / exhaust red
  '#ffffff', // 8: white hot core
  '#7ea8d6', // 9: iron ore chip
  '#eb7d44', // 10: copper ore chip
  '#4b5563', // 11: coal chip
  '#9ca3af', // 12: stone chip
  '#d8b4fe', // 13: quartz chip
];

export const PARTICLE_COLOR_INDEX = {
  amber: 0,
  orange: 1,
  yellow: 2,
  cyan: 3,
  indigo: 4,
  steam: 5,
  smoke: 6,
  red: 7,
  white: 8,
  iron_ore: 9,
  copper_ore: 10,
  coal: 11,
  stone: 12,
  quartz: 13,
} as const;

export class ParticlePool {
  public readonly capacity: number;
  private readonly active: Uint8Array;
  private readonly style: Uint8Array;
  private readonly colorIdx: Uint8Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private cursor = 0;
  private activeCount = 0;
  private rngState = 0x6d2b79f5;

  // shortcut: fixed 512-slot SoA ring buffer overwrites oldest slot if saturated; raise capacity or split layers if megafactory VFX exceeds 512 concurrent particles
  public constructor(capacity = MAX_PARTICLES) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.style = new Uint8Array(capacity);
    this.colorIdx = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
  }

  public get count(): number {
    return this.activeCount;
  }

  public clear(): void {
    this.active.fill(0);
    this.activeCount = 0;
    this.cursor = 0;
  }

  private nextRand(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(this.rngState ^ (this.rngState >>> 15), 1 | this.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private allocSlot(): number {
    const cap = this.capacity;
    for (let i = 0; i < cap; i++) {
      const idx = (this.cursor + i) % cap;
      if (this.active[idx] === 0) {
        this.cursor = (idx + 1) % cap;
        this.activeCount++;
        return idx;
      }
    }
    // Ring overwrite when full
    const idx = this.cursor;
    this.cursor = (idx + 1) % cap;
    return idx;
  }

  public spawn(
    px: number,
    py: number,
    vx: number,
    vy: number,
    lifeSec: number,
    sizeTiles: number,
    colorIndex: number,
    particleStyle = STYLE_SQUARE
  ): void {
    const idx = this.allocSlot();
    this.active[idx] = 1;
    this.style[idx] = particleStyle;
    this.colorIdx[idx] = colorIndex;
    this.x[idx] = px;
    this.y[idx] = py;
    this.vx[idx] = vx;
    this.vy[idx] = vy;
    this.age[idx] = 0;
    this.life[idx] = Math.max(0.05, lifeSec);
    this.size[idx] = sizeTiles;
  }

  public spawnBurst(
    worldX: number,
    worldY: number,
    kind: ParticleBurstKind,
    colorOverrideIdx?: number
  ): void {
    switch (kind) {
      case 'build': {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + this.nextRand() * 0.4;
          const spd = 0.7 + this.nextRand() * 1.1;
          this.spawn(
            worldX,
            worldY,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            0.28 + this.nextRand() * 0.16,
            0.09,
            i % 2 === 0 ? PARTICLE_COLOR_INDEX.cyan : PARTICLE_COLOR_INDEX.amber,
            STYLE_SQUARE
          );
        }
        break;
      }
      case 'remove': {
        for (let i = 0; i < 8; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = 0.6 + this.nextRand() * 1.2;
          this.spawn(
            worldX,
            worldY,
            Math.cos(a) * spd,
            Math.sin(a) * spd - 0.3,
            0.3 + this.nextRand() * 0.18,
            0.1,
            i % 2 === 0 ? PARTICLE_COLOR_INDEX.orange : PARTICLE_COLOR_INDEX.smoke,
            STYLE_SQUARE
          );
        }
        break;
      }
      case 'mine': {
        for (let i = 0; i < 5; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = 0.8 + this.nextRand() * 1.4;
          this.spawn(
            worldX,
            worldY,
            Math.cos(a) * spd,
            Math.sin(a) * spd - 0.35,
            0.24 + this.nextRand() * 0.14,
            0.08,
            colorOverrideIdx ?? (i === 0 ? PARTICLE_COLOR_INDEX.yellow : PARTICLE_COLOR_INDEX.cyan),
            STYLE_SQUARE
          );
        }
        break;
      }
      case 'ember': {
        this.spawn(
          worldX + (this.nextRand() - 0.5) * 0.32,
          worldY + (this.nextRand() - 0.5) * 0.18,
          (this.nextRand() - 0.5) * 0.25,
          -0.45 - this.nextRand() * 0.55,
          0.45 + this.nextRand() * 0.35,
          0.07 + this.nextRand() * 0.04,
          this.nextRand() > 0.35 ? PARTICLE_COLOR_INDEX.orange : PARTICLE_COLOR_INDEX.yellow,
          STYLE_SQUARE
        );
        break;
      }
      case 'wisp': {
        this.spawn(
          worldX + (this.nextRand() - 0.5) * 0.28,
          worldY - 0.1,
          (this.nextRand() - 0.5) * 0.18,
          -0.35 - this.nextRand() * 0.3,
          0.65 + this.nextRand() * 0.4,
          0.16 + this.nextRand() * 0.08,
          PARTICLE_COLOR_INDEX.smoke,
          STYLE_CIRCLE
        );
        break;
      }
      case 'ore_chip': {
        const a = this.nextRand() * Math.PI * 2;
        const spd = 0.45 + this.nextRand() * 0.65;
        this.spawn(
          worldX + (this.nextRand() - 0.5) * 0.24,
          worldY + (this.nextRand() - 0.5) * 0.24,
          Math.cos(a) * spd,
          Math.sin(a) * spd - 0.25,
          0.28 + this.nextRand() * 0.2,
          0.08,
          colorOverrideIdx ?? PARTICLE_COLOR_INDEX.iron_ore,
          STYLE_SQUARE
        );
        break;
      }
      case 'spark': {
        const a = this.nextRand() * Math.PI * 2;
        const spd = 0.5 + this.nextRand() * 0.85;
        this.spawn(
          worldX + (this.nextRand() - 0.5) * 0.3,
          worldY + (this.nextRand() - 0.5) * 0.3,
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          0.25 + this.nextRand() * 0.2,
          0.07,
          colorOverrideIdx ?? PARTICLE_COLOR_INDEX.cyan,
          STYLE_SQUARE
        );
        break;
      }
      case 'steam': {
        this.spawn(
          worldX + (this.nextRand() - 0.5) * 0.3,
          worldY - 0.05,
          (this.nextRand() - 0.5) * 0.22,
          -0.55 - this.nextRand() * 0.4,
          0.7 + this.nextRand() * 0.45,
          0.18 + this.nextRand() * 0.1,
          PARTICLE_COLOR_INDEX.steam,
          STYLE_CIRCLE
        );
        break;
      }
      case 'rocket_exhaust': {
        for (let i = 0; i < 3; i++) {
          const isCore = i === 0;
          this.spawn(
            worldX + (this.nextRand() - 0.5) * 0.42,
            worldY + this.nextRand() * 0.25,
            (this.nextRand() - 0.5) * 1.4,
            1.6 + this.nextRand() * 1.8,
            isCore ? 0.26 + this.nextRand() * 0.14 : 0.6 + this.nextRand() * 0.35,
            isCore ? 0.16 : 0.28 + this.nextRand() * 0.14,
            isCore
              ? this.nextRand() > 0.4
                ? PARTICLE_COLOR_INDEX.yellow
                : PARTICLE_COLOR_INDEX.white
              : this.nextRand() > 0.5
                ? PARTICLE_COLOR_INDEX.orange
                : PARTICLE_COLOR_INDEX.steam,
            isCore ? STYLE_SQUARE : STYLE_CIRCLE
          );
        }
        break;
      }
      case 'shockwave': {
        this.spawn(worldX, worldY, 0, 0, 0.95, 0.45, PARTICLE_COLOR_INDEX.amber, STYLE_RING);
        this.spawn(worldX, worldY, 0, 0, 0.65, 0.3, PARTICLE_COLOR_INDEX.cyan, STYLE_RING);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const spd = 1.8 + this.nextRand() * 1.4;
          this.spawn(
            worldX,
            worldY,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            0.55 + this.nextRand() * 0.25,
            0.22,
            i % 2 === 0 ? PARTICLE_COLOR_INDEX.steam : PARTICLE_COLOR_INDEX.orange,
            STYLE_CIRCLE
          );
        }
        break;
      }
      case 'hub_pulse': {
        this.spawn(worldX, worldY, 0, 0, 0.45, 0.3, PARTICLE_COLOR_INDEX.cyan, STYLE_RING);
        break;
      }
    }
  }

  public update(dt: number, reducedMotion = false): void {
    if (reducedMotion) {
      if (this.activeCount > 0) this.clear();
      return;
    }
    if (!(dt > 0) || this.activeCount === 0) return;

    const cap = this.capacity;
    for (let i = 0; i < cap; i++) {
      if (this.active[i] === 0) continue;
      const nextAge = this.age[i] + dt;
      if (nextAge >= this.life[i]) {
        this.active[i] = 0;
        this.activeCount--;
        continue;
      }
      this.age[i] = nextAge;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      // Gentle aerodynamic drag
      const drag = Math.max(0, 1 - dt * 1.6);
      this.vx[i] *= drag;
      this.vy[i] *= drag;
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tilePx: number,
    reducedMotion = false
  ): void {
    if (reducedMotion || this.activeCount === 0) return;

    const prevAlpha = ctx.globalAlpha;
    const cullMinX = minX - 2;
    const cullMaxX = maxX + 3;
    const cullMinY = minY - 2;
    const cullMaxY = maxY + 3;
    const cap = this.capacity;

    for (let i = 0; i < cap; i++) {
      if (this.active[i] === 0) continue;
      const px = this.x[i];
      const py = this.y[i];
      if (px < cullMinX || px > cullMaxX || py < cullMinY || py > cullMaxY) continue;

      const t = this.age[i] / this.life[i];
      const fade = 1 - t;
      const sx = px * tilePx;
      const sy = py * tilePx;
      const st = this.style[i];
      const col = PARTICLE_COLORS[this.colorIdx[i]];

      if (st === STYLE_RING) {
        const rad = (this.size[i] + t * 3.4) * tilePx;
        ctx.globalAlpha = fade * 0.78;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, tilePx * (0.09 * fade));
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (st === STYLE_CIRCLE) {
        const rad = this.size[i] * (0.75 + t * 0.85) * tilePx;
        ctx.globalAlpha = fade * 0.42;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const sz = this.size[i] * (1 - t * 0.35) * tilePx;
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = col;
        ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
      }
    }

    ctx.globalAlpha = prevAlpha;
  }
}
