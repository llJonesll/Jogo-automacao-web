import type { WorldState } from './core/types';

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
  press: (key: string) => void;
  hold: (key: string, seconds: number) => void;
  step: (seconds: number) => void;
}

export interface HookController {
  getScene: () => 'title' | 'play' | 'figures';
  getWorld: () => WorldState;
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
    press: (key: string) => ctrl.pressKey(key),
    hold: (key: string, seconds: number) => ctrl.holdKey(key, seconds),
    step: (seconds: number) => ctrl.stepSim(seconds),
  };

  (window as unknown as { game: GameHook }).game = hook;
}
