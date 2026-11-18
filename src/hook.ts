import type { WorldState } from './core/types';
import type { ColorblindMode, Locale, UiScale } from './ui/i18n';
import type { ModalId, ToolSelection } from './ui/hud';

export const MAX_HOOK_STEP_SECONDS = 3600;

export interface GameUiSnapshot {
  locale: Locale;
  uiScale: UiScale;
  colorblindMode: ColorblindMode;
  reducedMotion: boolean;
  activeModal: ModalId;
  selectedTool: ToolSelection;
  showAltMode: boolean;
  showPowerOverlay: boolean;
  rocketTimer: number;
  hoverTile: { x: number; y: number } | null;
}

export interface GameHook {
  scene: () => 'title' | 'play' | 'figures';
  state: () => {
    tick: number;
    dayTime: number;
    phase: number;
    orbitalLaunches: number;
    buildings: number;
    generatedMw: number;
    demandedMw: number;
    satisfaction: number;
    unlockedTechs: string[];
    stockpile: WorldState['stockpile'];
    victory: boolean;
  };
  ui?: () => GameUiSnapshot;
  press: (key: string) => void;
  hold: (key: string, seconds: number) => void;
  step: (seconds: number) => void;
}

export interface HookController {
  getScene: () => 'title' | 'play' | 'figures';
  getWorld: () => WorldState;
  getUi?: () => GameUiSnapshot;
  pressKey: (key: string) => void;
  holdKey: (key: string, seconds: number) => void;
  stepSim: (seconds: number) => void;
}

export function installGameHook(ctrl: HookController): void {
  if (typeof window === 'undefined') return;
  const hook: GameHook = {
    scene: () => ctrl.getScene(),
    state: () => {
      const w = ctrl.getWorld();
      return {
        tick: w.tick,
        dayTime: Number(w.dayTime.toFixed(3)),
        phase: w.phaseIndex + 1,
        orbitalLaunches: w.orbitalLaunches,
        buildings: Object.keys(w.buildings).length,
        generatedMw: Number(w.power.generatedMw.toFixed(2)),
        demandedMw: Number(w.power.demandedMw.toFixed(2)),
        satisfaction: Number(w.power.satisfaction.toFixed(3)),
        unlockedTechs: [...w.unlockedTechs],
        stockpile: { ...w.stockpile },
        victory: w.victoryAchieved,
      };
    },
    ...(ctrl.getUi ? { ui: () => ctrl.getUi!() } : {}),
    press: (key: string) => ctrl.pressKey(key),
    hold: (key: string, seconds: number) => {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return;
      ctrl.holdKey(key, Math.min(60, seconds));
    },
    step: (seconds: number) => {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return;
      ctrl.stepSim(Math.min(MAX_HOOK_STEP_SECONDS, seconds));
    },
  };

  (window as unknown as { game: GameHook }).game = hook;
}
