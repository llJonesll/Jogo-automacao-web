/**
 * Zero-dependency Web Gamepad API controller for AETHERFORGE.
 * Polls standard-mapped controllers (`navigator.getGamepads()`) with configurable
 * deadzone, edge-triggered face/shoulder buttons, analog triggers, and repeat-paced
 * tile cursor / modal navigation steps.
 */

export interface GamepadEventCallbacks {
  onConnected?: (id: string, index: number) => void;
  onDisconnected?: (id: string, index: number) => void;
}

export interface GamepadInputFrame {
  connected: boolean;
  panX: number;
  panY: number;
  zoomDelta: number;
  cursorStepX: -1 | 0 | 1;
  cursorStepY: -1 | 0 | 1;
  navStepX: -1 | 0 | 1;
  navStepY: -1 | 0 | 1;
  pressed: {
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    lb: boolean;
    rb: boolean;
    select: boolean;
    start: boolean;
  };
}

interface AxisRepeatState {
  dir: -1 | 0 | 1;
  timer: number;
  firedInitial: boolean;
}

const INITIAL_REPEAT_DELAY = 0.28;
const REPEAT_INTERVAL = 0.13;
const STICK_STEP_THRESHOLD = 0.48;

function applyDeadzone(raw: number, deadzone: number): number {
  const abs = Math.abs(raw);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / (1 - deadzone);
  return Math.sign(raw) * Math.min(1, scaled);
}

function stepRepeat(
  state: AxisRepeatState,
  desiredDir: -1 | 0 | 1,
  dt: number
): -1 | 0 | 1 {
  if (desiredDir === 0) {
    state.dir = 0;
    state.timer = 0;
    state.firedInitial = false;
    return 0;
  }
  if (desiredDir !== state.dir) {
    state.dir = desiredDir;
    state.timer = INITIAL_REPEAT_DELAY;
    state.firedInitial = true;
    return desiredDir;
  }
  state.timer -= dt;
  if (state.timer <= 0) {
    state.timer = REPEAT_INTERVAL;
    return desiredDir;
  }
  return 0;
}

function emptyFrame(): GamepadInputFrame {
  return {
    connected: false,
    panX: 0,
    panY: 0,
    zoomDelta: 0,
    cursorStepX: 0,
    cursorStepY: 0,
    navStepX: 0,
    navStepY: 0,
    pressed: {
      a: false,
      b: false,
      x: false,
      y: false,
      lb: false,
      rb: false,
      select: false,
      start: false,
    },
  };
}

export class GamepadController {
  public readonly deadzone: number;
  private prevButtons = new Map<number, boolean[]>();
  private seenPads = new Map<number, string>();
  private cursorRepeatX: AxisRepeatState = { dir: 0, timer: 0, firedInitial: false };
  private cursorRepeatY: AxisRepeatState = { dir: 0, timer: 0, firedInitial: false };
  private navRepeatX: AxisRepeatState = { dir: 0, timer: 0, firedInitial: false };
  private navRepeatY: AxisRepeatState = { dir: 0, timer: 0, firedInitial: false };

  private readonly onPadConnected = (e: GamepadEvent): void => {
    this.notifyConnected(e.gamepad);
  };

  private readonly onPadDisconnected = (e: GamepadEvent): void => {
    this.notifyDisconnected(e.gamepad.index, e.gamepad.id);
  };

  constructor(
    private callbacks: GamepadEventCallbacks = {},
    deadzone = 0.18
  ) {
    this.deadzone = deadzone;
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.onPadConnected);
      window.addEventListener('gamepaddisconnected', this.onPadDisconnected);
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.onPadConnected);
      window.removeEventListener('gamepaddisconnected', this.onPadDisconnected);
    }
  }

  private notifyConnected(pad: Gamepad): void {
    if (!this.seenPads.has(pad.index)) {
      this.seenPads.set(pad.index, pad.id || `Gamepad ${pad.index + 1}`);
      this.callbacks.onConnected?.(pad.id || `Gamepad ${pad.index + 1}`, pad.index);
    }
  }

  private notifyDisconnected(index: number, id?: string): void {
    if (this.seenPads.has(index)) {
      const label = id || this.seenPads.get(index) || `Gamepad ${index + 1}`;
      this.seenPads.delete(index);
      this.prevButtons.delete(index);
      this.callbacks.onDisconnected?.(label, index);
    }
  }

  public poll(dt: number): GamepadInputFrame {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return emptyFrame();
    }

    const pads = navigator.getGamepads();
    const activeIndices = new Set<number>();
    let primary: Gamepad | null = null;

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      activeIndices.add(pad.index);
      this.notifyConnected(pad);
      if (!primary) primary = pad;
    }

    for (const idx of [...this.seenPads.keys()]) {
      if (!activeIndices.has(idx)) {
        this.notifyDisconnected(idx);
      }
    }

    if (!primary) {
      this.cursorRepeatX.dir = 0;
      this.cursorRepeatY.dir = 0;
      this.navRepeatX.dir = 0;
      this.navRepeatY.dir = 0;
      return emptyFrame();
    }

    const prev = this.prevButtons.get(primary.index) ?? [];
    const btns = primary.buttons;
    const isDown = (idx: number): boolean => Boolean(btns[idx]?.pressed);
    const justPressed = (idx: number): boolean => isDown(idx) && !prev[idx];

    const frame: GamepadInputFrame = {
      connected: true,
      panX: applyDeadzone(primary.axes[0] ?? 0, this.deadzone),
      panY: applyDeadzone(primary.axes[1] ?? 0, this.deadzone),
      zoomDelta: (btns[7]?.value ?? (isDown(7) ? 1 : 0)) - (btns[6]?.value ?? (isDown(6) ? 1 : 0)),
      cursorStepX: 0,
      cursorStepY: 0,
      navStepX: 0,
      navStepY: 0,
      pressed: {
        a: justPressed(0),
        b: justPressed(1),
        x: justPressed(2),
        y: justPressed(3),
        lb: justPressed(4),
        rb: justPressed(5),
        select: justPressed(8),
        start: justPressed(9),
      },
    };

    const rsX = applyDeadzone(primary.axes[2] ?? 0, this.deadzone);
    const rsY = applyDeadzone(primary.axes[3] ?? 0, this.deadzone);
    const dpadX: -1 | 0 | 1 = isDown(15) ? 1 : isDown(14) ? -1 : 0;
    const dpadY: -1 | 0 | 1 = isDown(13) ? 1 : isDown(12) ? -1 : 0;

    const rawCursorX: -1 | 0 | 1 =
      dpadX !== 0 ? dpadX : Math.abs(rsX) >= STICK_STEP_THRESHOLD ? (rsX > 0 ? 1 : -1) : 0;
    const rawCursorY: -1 | 0 | 1 =
      dpadY !== 0 ? dpadY : Math.abs(rsY) >= STICK_STEP_THRESHOLD ? (rsY > 0 ? 1 : -1) : 0;

    frame.cursorStepX = stepRepeat(this.cursorRepeatX, rawCursorX, dt);
    frame.cursorStepY = stepRepeat(this.cursorRepeatY, rawCursorY, dt);

    const rawNavX: -1 | 0 | 1 =
      dpadX !== 0
        ? dpadX
        : Math.abs(frame.panX) >= STICK_STEP_THRESHOLD
          ? frame.panX > 0
            ? 1
            : -1
          : rawCursorX;
    const rawNavY: -1 | 0 | 1 =
      dpadY !== 0
        ? dpadY
        : Math.abs(frame.panY) >= STICK_STEP_THRESHOLD
          ? frame.panY > 0
            ? 1
            : -1
          : rawCursorY;

    frame.navStepX = stepRepeat(this.navRepeatX, rawNavX, dt);
    frame.navStepY = stepRepeat(this.navRepeatY, rawNavY, dt);

    const nextPrev: boolean[] = new Array(btns.length);
    for (let i = 0; i < btns.length; i++) {
      nextPrev[i] = Boolean(btns[i]?.pressed);
    }
    this.prevButtons.set(primary.index, nextPrev);

    return frame;
  }
}
