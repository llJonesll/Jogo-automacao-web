import {
  BUILDINGS,
  ITEM_IDS,
  ORBITAL_PHASES,
  TECHS,
  getRecipesForBuilding,
  isProcessorType,
} from '../core/data';
import type {
  BlueprintData,
  BuildingEntity,
  BuildingId,
  GameConfig,
  ItemId,
  WorldState,
} from '../core/types';
import { STARTER_BLUEPRINTS } from '../game/blueprints';
import { computeOverclockPower } from '../game/power';
import {
  canStartTech,
  getActiveOrbitalPhase,
  getRollingRates,
  getTechById,
} from '../game/progression';
import { hasSavedGame, serializeWorld } from '../game/save';
import { isBuildingUnlocked, isFeatureUnlocked } from '../game/world';
import {
  getBuildingIconDataUrl,
  getItemIconDataUrl,
  statusColor,
} from '../render/sprites';
import {
  getBundle,
  type ColorblindMode,
  type Locale,
  type UiScale,
} from './i18n';

export type ToolSelection =
  | BuildingId
  | 'cursor'
  | 'mine'
  | 'deconstruct'
  | 'bp_copy'
  | 'bp_stamp';

export type ModalId =
  | 'none'
  | 'tech'
  | 'stats'
  | 'blueprints'
  | 'tweak'
  | 'save'
  | 'help'
  | 'victory';

export type HotbarCategoryId =
  | 'all'
  | 'logistics'
  | 'extraction'
  | 'production'
  | 'power';

export const MAX_SAVE_FILE_BYTES = 4_000_000;
export const UI_SCALES: readonly UiScale[] = [1, 1.15, 1.3, 1.5];
export const COLORBLIND_MODES: readonly ColorblindMode[] = [
  'default',
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

export interface HudActions {
  onStartNew: () => void;
  onContinueSave: () => void;
  onStartDemo: () => void;
  onNewPlanetSeed: () => void;
  onToggleLocale: () => void;
  onSetTextScale: (scale: UiScale) => void;
  onSetColorblindMode: (mode: ColorblindMode) => void;
  onToggleReducedMotion: () => void;
  onSelectTool: (tool: ToolSelection) => void;
  onSelectCategory: (category: HotbarCategoryId) => void;
  onSetSimSpeed: (speed: number) => void;
  onToggleAltMode: () => void;
  onTogglePowerOverlay: () => void;
  onToggleMute: () => void;
  onOpenModal: (modal: ModalId) => void;
  onSaveLocal: () => void;
  onImportSaveText: (json: string) => void;
  onStampBlueprint: (bp: BlueprintData) => void;
  onCopyBlueprint: (bp: BlueprintData) => void;
  onImportBlueprint: (raw: string) => void;
  onLoadPhaseStockpile: () => void;
  onSkipRocketAnimation: () => void;
  onSetMachineRecipe: (entityId: number, recipeId: string) => void;
  onSetMachineClock: (entityId: number, clock: number) => void;
  onRotateBuilding: (entityId: number) => void;
  onRemoveBuilding: (entityId: number) => void;
  onCloseInspector: () => void;
  onSetActiveTech: (techId: string) => void;
  onUnlockTech: (techId: string) => void;
  onSetConfigKnob: (key: keyof GameConfig, value: number) => void;
  onResetConfig: () => void;
  onDismissVictory: () => void;
  onPlayUiTick: () => void;
}

export interface HudViewState {
  scene: 'title' | 'play';
  locale: Locale;
  uiScale: UiScale;
  colorblindMode: ColorblindMode;
  colorblind: boolean;
  reducedMotion: boolean;
  muted: boolean;
  simSpeed: number;
  showAltMode: boolean;
  showPowerOverlay: boolean;
  selectedTool: ToolSelection;
  activeCategory: HotbarCategoryId;
  selectedBuildingId: number | null;
  activeModal: ModalId;
  savedBlueprints: BlueprintData[];
  lastBpCode: string;
}

export const HOTBAR_CATEGORIES: Array<{
  id: HotbarCategoryId;
  items: BuildingId[];
}> = [
  {
    id: 'all',
    items: [
      'belt_mk1',
      'belt_mk2',
      'belt_mk3',
      'tunnel',
      'splitter',
      'merger',
      'inserter',
      'storage',
      'miner_mk1',
      'miner_mk2',
      'smelter',
      'constructor',
      'foundry',
      'assembler',
      'coal_generator',
      'solar_panel',
      'accumulator',
      'geothermal_plant',
      'research_lab',
    ],
  },
  {
    id: 'logistics',
    items: [
      'belt_mk1',
      'belt_mk2',
      'belt_mk3',
      'tunnel',
      'splitter',
      'merger',
      'inserter',
      'storage',
    ],
  },
  {
    id: 'extraction',
    items: ['miner_mk1', 'miner_mk2'],
  },
  {
    id: 'production',
    items: ['smelter', 'constructor', 'foundry', 'assembler', 'research_lab'],
  },
  {
    id: 'power',
    items: ['coal_generator', 'solar_panel', 'accumulator', 'geothermal_plant'],
  },
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v);
  }
  return node;
}

function createEmblemSvg(): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 64 64',
    class: 'title-emblem',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('polygon', {
      points: '32,4 58,18 58,46 32,60 6,46 6,18',
      fill: '#0f172a',
      stroke: '#f59e0b',
      'stroke-width': '3',
    }),
    svgEl('circle', {
      cx: '32',
      cy: '32',
      r: '14',
      fill: 'none',
      stroke: '#38bdf8',
      'stroke-width': '3',
    }),
    svgEl('polygon', {
      points: '32,14 38,34 26,34',
      fill: '#f59e0b',
    }),
    svgEl('rect', {
      x: '27',
      y: '36',
      width: '10',
      height: '8',
      fill: '#e2e8f0',
    })
  );
  return svg;
}

function createCloseSvg(): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    class: 'icon-svg-sm',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('line', {
      x1: '3',
      y1: '3',
      x2: '13',
      y2: '13',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    }),
    svgEl('line', {
      x1: '13',
      y1: '3',
      x2: '3',
      y2: '13',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    })
  );
  return svg;
}

function createLockSvg(): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    class: 'icon-svg-xs',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('path', {
      d: 'M5 7V5a3 3 0 0 1 6 0v2',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
    }),
    svgEl('rect', {
      x: '3',
      y: '7',
      width: '10',
      height: '7',
      rx: '1.5',
      fill: 'currentColor',
    })
  );
  return svg;
}

function createAlertSvg(): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    class: 'icon-svg-xs',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('polygon', {
      points: '8,1.5 14.5,13.5 1.5,13.5',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.6',
      'stroke-linejoin': 'round',
    }),
    svgEl('line', {
      x1: '8',
      y1: '5.5',
      x2: '8',
      y2: '9.5',
      stroke: 'currentColor',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
    }),
    svgEl('circle', {
      cx: '8',
      cy: '11.6',
      r: '0.9',
      fill: 'currentColor',
    })
  );
  return svg;
}

function setTextIfChanged(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setClassIfChanged(node: HTMLElement, cls: string): void {
  if (node.className !== cls) node.className = cls;
}

function setPressed(btn: HTMLButtonElement, pressed: boolean): void {
  const val = pressed ? 'true' : 'false';
  if (btn.getAttribute('aria-pressed') !== val) {
    btn.setAttribute('aria-pressed', val);
  }
}

function makeItemChip(
  item: ItemId,
  labelText: string,
  colorblind: boolean,
  titleText?: string
): { chip: HTMLSpanElement; img: HTMLImageElement; txt: HTMLSpanElement } {
  const chip = el('span', 'item-chip');
  if (titleText) chip.title = titleText;
  const img = el('img', 'icon-sm');
  img.src = getItemIconDataUrl(item, 24, colorblind);
  img.alt = titleText ?? item;
  const txt = el('span', undefined, labelText);
  chip.append(img, txt);
  return { chip, img, txt };
}

function nextCycleValue<T>(list: readonly T[], current: T): T {
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}

function queryFocusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  );
  const out: HTMLElement[] = [];
  nodes.forEach((n) => {
    if (!n.classList.contains('hidden') && !n.closest('.hidden') && n.offsetParent !== null) {
      out.push(n);
    }
  });
  return out;
}

interface ToastEntry {
  message: string;
  isError: boolean;
}

interface ActiveToast {
  message: string;
  node: HTMLDivElement;
  timerId: number;
  createdAtMs: number;
}

interface PhaseChipRef {
  item: ItemId;
  chip: HTMLSpanElement;
  img: HTMLImageElement;
  txt: HTMLSpanElement;
}

interface HotbarSlotRef {
  btn: HTMLButtonElement;
  img: HTMLImageElement;
  label: HTMLSpanElement;
  keyBadge: HTMLSpanElement;
  lockBadge: HTMLSpanElement;
  deficitBadge: HTMLSpanElement;
  lastCb: boolean | null;
}

interface TechCardRef {
  techId: string;
  card: HTMLDivElement;
  titleEl: HTMLHeadingElement;
  descEl: HTMLParagraphElement;
  chips: Array<{ item: ItemId; count: number; img: HTMLImageElement; txt: HTMLSpanElement; lastCb: boolean }>;
  doneBadge: HTMLSpanElement;
  btnRow: HTMLDivElement;
  focusBtn: HTMLButtonElement;
  unlockBtn: HTMLButtonElement;
  lockedNote: HTMLSpanElement;
}

interface PhaseRowRef {
  phaseId: string;
  row: HTMLDivElement;
  titleEl: HTMLElement;
  chips: Array<{ item: ItemId; count: number; img: HTMLImageElement; txt: HTMLSpanElement; lastCb: boolean }>;
}

interface StatsRefs {
  stockChips: Map<ItemId, { img: HTMLImageElement; txt: HTMLSpanElement }>;
  rateRows: Map<ItemId, { row: HTMLDivElement; img: HTMLImageElement; chipTxt: HTMLSpanElement; pos: HTMLSpanElement; neg: HTMLSpanElement }>;
  emptyRatesNote: HTMLParagraphElement;
  diagChips: {
    no_power: HTMLSpanElement;
    input_starved: HTMLSpanElement;
    output_full: HTMLSpanElement;
    unpaired: HTMLSpanElement;
  };
}

export class FactoryHud {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private middleEl: HTMLElement;
  private topBarEl: HTMLElement;
  private hotbarEl: HTMLElement;
  private inspectorEl: HTMLElement;
  private modalEl: HTMLElement;
  private modalBoxEl: HTMLDivElement;
  private modalTitleEl: HTMLHeadingElement;
  private modalCloseBtn: HTMLButtonElement;
  private modalBodyEl: HTMLDivElement;
  private toastStackEl: HTMLDivElement;

  private activeToasts: ActiveToast[] = [];
  private pendingToasts: ToastEntry[] = [];
  private readonly maxVisibleToasts = 3;

  private previouslyFocusedEl: HTMLElement | null = null;
  private renderedModalId: ModalId = 'none';
  private renderedModalLocale: Locale | null = null;
  private renderedModalCb: boolean | null = null;
  private renderedSavedBpSig = '';

  // Persistent Title refs
  private titleBuilt = false;
  private titleRefs: {
    sub: HTMLParagraphElement;
    btnNew: HTMLButtonElement;
    btnDemo: HTMLButtonElement;
    btnCont: HTMLButtonElement;
    btnLang: HTMLButtonElement;
    btnCb: HTMLButtonElement;
    btnScale: HTMLButtonElement;
    btnMotion: HTMLButtonElement;
    hint: HTMLParagraphElement;
  } | null = null;

  // Persistent TopBar refs
  private topBarBuilt = false;
  private topRefs: {
    phaseTitle: HTMLSpanElement;
    phaseReqs: HTMLDivElement;
    phaseChips: PhaseChipRef[];
    renderedPhaseId: string | null;
    renderedPhaseCb: boolean | null;
    phaseDoneText: HTMLSpanElement;
    loadBtn: HTMLButtonElement;
    skipLaunchBtn: HTMLButtonElement;
    techPill: HTMLButtonElement;
    powerPill: HTMLDivElement;
    speedBtns: Map<number, HTMLButtonElement>;
    buttons: Record<
      | 'tech'
      | 'stats'
      | 'blueprints'
      | 'tweak'
      | 'alt'
      | 'power'
      | 'save'
      | 'mute'
      | 'help'
      | 'scale'
      | 'cb'
      | 'motion'
      | 'lang',
      HTMLButtonElement
    >;
  } | null = null;

  // Persistent Hotbar refs
  private hotbarBuilt = false;
  private renderedHotbarCat: HotbarCategoryId | null = null;
  private catBtns = new Map<HotbarCategoryId, HTMLButtonElement>();
  private utilBtns = new Map<ToolSelection, HTMLButtonElement>();
  private slotsRowEl: HTMLDivElement | null = null;
  private slotPool = new Map<BuildingId, HotbarSlotRef>();

  // Persistent Inspector refs
  private renderedInspId: number | null = null;
  private renderedInspLocale: Locale | null = null;
  private renderedInspCb: boolean | null = null;
  private lastInspBufferDigest = '';
  private inspRefs: {
    statusDot: HTMLSpanElement;
    statusText: HTMLSpanElement;
    geoBadge: HTMLDivElement;
    recipeSelect: HTMLSelectElement | null;
    ocLabel: HTMLLabelElement | null;
    ocSlider: HTMLInputElement | null;
    ocLockedNote: HTMLDivElement | null;
    buffersWrap: HTMLDivElement;
    buffersGrid: HTMLDivElement;
    rotBtn: HTMLButtonElement | null;
    delBtn: HTMLButtonElement | null;
    closeBtn: HTMLButtonElement;
  } | null = null;

  // Dynamic modal refs for in-place patching without wiping scroll or focus
  private techRefs: { cards: TechCardRef[]; phases: PhaseRowRef[] } | null = null;
  private statsRefs: StatsRefs | null = null;
  private victoryRefs: {
    ticks: HTMLSpanElement;
    launches: HTMLSpanElement;
    power: HTMLSpanElement;
    buildings: HTMLSpanElement;
  } | null = null;
  private tweakRefs: {
    sliders: Map<keyof GameConfig, { input: HTMLInputElement; valSpan: HTMLSpanElement }>;
    scaleBtns: Map<UiScale, HTMLButtonElement>;
    cbBtns: Map<ColorblindMode, HTMLButtonElement>;
    motionBtn: HTMLButtonElement | null;
  } | null = null;
  private bpSavedContainer: HTMLDivElement | null = null;
  private bpTextarea: HTMLTextAreaElement | null = null;

  private lastView: HudViewState | null = null;

  constructor(
    container: HTMLElement,
    private actions: HudActions
  ) {
    this.root = container;
    this.root.textContent = '';

    this.titleEl = el('div', 'title-overlay');
    this.topBarEl = el('header', 'hud-topbar');
    this.middleEl = el('div', 'hud-middle');
    this.inspectorEl = el('aside', 'hud-inspector hidden');
    this.inspectorEl.setAttribute('aria-label', 'Inspector');
    this.hotbarEl = el('footer', 'hud-hotbar');

    this.toastStackEl = el('div', 'hud-toast-stack');
    this.toastStackEl.setAttribute('aria-live', 'polite');
    this.toastStackEl.setAttribute('aria-atomic', 'false');

    this.modalEl = el('div', 'hud-modal-backdrop hidden');
    this.modalBoxEl = el('div', 'hud-modal');
    this.modalBoxEl.setAttribute('role', 'dialog');
    this.modalBoxEl.setAttribute('aria-modal', 'true');
    this.modalBoxEl.setAttribute('aria-labelledby', 'hud-modal-title');
    this.modalBoxEl.tabIndex = -1;

    const modalHead = el('div', 'modal-head');
    this.modalTitleEl = el('h2');
    this.modalTitleEl.id = 'hud-modal-title';
    this.modalCloseBtn = el('button', 'btn btn-xs btn-ghost modal-close-btn');
    this.modalCloseBtn.type = 'button';
    this.modalCloseBtn.append(createCloseSvg());
    this.modalCloseBtn.onclick = () => this.actions.onOpenModal('none');
    modalHead.append(this.modalTitleEl, this.modalCloseBtn);

    this.modalBodyEl = el('div', 'modal-body');
    this.modalBoxEl.append(modalHead, this.modalBodyEl);
    this.modalEl.append(this.modalBoxEl);

    this.middleEl.append(this.toastStackEl, this.inspectorEl);

    this.root.append(
      this.topBarEl,
      this.middleEl,
      this.hotbarEl,
      this.modalEl,
      this.titleEl
    );

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.actions.onOpenModal('none');
      }
    });
  }

  public showToast(message: string, isError = false): void {
    const now = Date.now();
    const recentDup = this.activeToasts.some(
      (t) => t.message === message && now - t.createdAtMs < 1200
    );
    if (recentDup) return;

    if (this.activeToasts.length >= this.maxVisibleToasts) {
      const queuedDup = this.pendingToasts.some((p) => p.message === message);
      if (!queuedDup && this.pendingToasts.length < 12) {
        this.pendingToasts.push({ message, isError });
      }
      return;
    }

    this.mountToast({ message, isError });
  }

  private mountToast(entry: ToastEntry): void {
    const node = el('div', `hud-toast ${entry.isError ? 'toast-error' : ''}`, entry.message);
    node.setAttribute('role', entry.isError ? 'alert' : 'status');
    this.toastStackEl.append(node);

    const durationMs = entry.isError ? 4200 : 3200;
    const active: ActiveToast = {
      message: entry.message,
      node,
      createdAtMs: Date.now(),
      timerId: window.setTimeout(() => {
        this.removeToast(active);
      }, durationMs),
    };
    this.activeToasts.push(active);
  }

  private removeToast(active: ActiveToast): void {
    window.clearTimeout(active.timerId);
    const idx = this.activeToasts.indexOf(active);
    if (idx !== -1) this.activeToasts.splice(idx, 1);
    if (active.node.parentElement === this.toastStackEl) {
      this.toastStackEl.removeChild(active.node);
    }
    const next = this.pendingToasts.shift();
    if (next && this.activeToasts.length < this.maxVisibleToasts) {
      this.mountToast(next);
    }
  }

  public handleFocusTrapTab(shiftKey: boolean): boolean {
    if (this.renderedModalId === 'none') return false;
    const focusables = queryFocusables(this.modalBoxEl);
    if (focusables.length === 0) {
      this.modalBoxEl.focus();
      return true;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (!active || !this.modalBoxEl.contains(active)) {
      (shiftKey ? last : first).focus();
      return true;
    }
    if (shiftKey && (active === first || active === this.modalBoxEl)) {
      last.focus();
      return true;
    }
    if (!shiftKey && active === last) {
      first.focus();
      return true;
    }
    return false;
  }

  public moveContainerFocus(container: 'title' | 'modal', delta: -1 | 1): void {
    const host = container === 'title' ? this.titleEl : this.modalBoxEl;
    const focusables = queryFocusables(host);
    if (focusables.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? focusables.indexOf(active) : -1;
    const nextIdx =
      idx === -1
        ? delta > 0
          ? 0
          : focusables.length - 1
        : (idx + delta + focusables.length) % focusables.length;
    focusables[nextIdx].focus();
  }

  public adjustFocusedControl(delta: -1 | 1): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    if (active instanceof HTMLInputElement && active.type === 'range') {
      const step = Number(active.step) || 1;
      const min = Number(active.min);
      const max = Number(active.max);
      const cur = Number(active.value);
      const next = Math.max(min, Math.min(max, cur + delta * step));
      if (next !== cur) {
        active.value = String(next);
        active.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }
    if (active instanceof HTMLSelectElement && active.options.length > 0) {
      const nextIdx =
        (active.selectedIndex + delta + active.options.length) % active.options.length;
      active.selectedIndex = nextIdx;
      active.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  public activateFocusedOrDefault(container: 'title' | 'modal'): boolean {
    const host = container === 'title' ? this.titleEl : this.modalBoxEl;
    const active = document.activeElement as HTMLElement | null;
    if (active && host.contains(active) && !(active instanceof HTMLInputElement && active.type === 'range')) {
      active.click();
      return true;
    }
    const focusables = queryFocusables(host);
    if (focusables.length > 0) {
      focusables[0].click();
      return true;
    }
    return false;
  }

  public getHotbarSlotButtons(): HTMLButtonElement[] {
    if (!this.slotsRowEl) return [];
    return Array.from(this.slotsRowEl.querySelectorAll<HTMLButtonElement>('.hotbar-slot'));
  }

  public isRootInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (!this.root.contains(target)) return false;
    const tag = target.tagName;
    return tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A';
  }

  public isTitleInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return this.titleEl.contains(target) && this.isRootInteractiveTarget(target);
  }

  public render(world: WorldState, config: GameConfig, view: HudViewState): void {
    this.lastView = view;

    if (view.scene === 'title') {
      this.titleEl.classList.remove('hidden');
      this.topBarEl.classList.add('hidden');
      this.middleEl.classList.add('hidden');
      this.hotbarEl.classList.add('hidden');
      this.inspectorEl.classList.add('hidden');
      this.modalEl.classList.add('hidden');
      this.renderTitle(view);
      return;
    }

    this.titleEl.classList.add('hidden');
    this.topBarEl.classList.remove('hidden');
    this.middleEl.classList.remove('hidden');
    this.hotbarEl.classList.remove('hidden');

    this.renderTopBar(world, view);
    this.renderHotbar(world, config, view);
    this.renderInspector(world, config, view);
    this.renderModal(world, config, view);
  }

  private renderTitle(view: HudViewState): void {
    const t = getBundle(view.locale);
    if (!this.titleBuilt) {
      this.titleBuilt = true;
      this.titleEl.textContent = '';

      const card = el('div', 'title-card');
      const emblem = createEmblemSvg();
      const h1 = el('h1', 'title-logo', 'AETHERFORGE');
      const sub = el('p', 'title-sub');

      const actions = el('div', 'title-actions');
      const btnNew = el('button', 'btn btn-primary');
      btnNew.type = 'button';
      btnNew.id = 'btn-new-factory';
      btnNew.onclick = () => this.actions.onStartNew();

      const btnDemo = el('button', 'btn btn-accent');
      btnDemo.type = 'button';
      btnDemo.id = 'btn-demo-factory';
      btnDemo.onclick = () => this.actions.onStartDemo();

      const btnCont = el('button', 'btn btn-secondary');
      btnCont.type = 'button';
      btnCont.id = 'btn-continue-save';
      btnCont.onclick = () => this.actions.onContinueSave();

      actions.append(btnNew, btnDemo, btnCont);

      const toggles = el('div', 'title-toggles');
      const btnLang = el('button', 'btn btn-ghost');
      btnLang.type = 'button';
      btnLang.id = 'btn-title-lang';
      btnLang.onclick = () => this.actions.onToggleLocale();

      const btnCb = el('button', 'btn btn-ghost');
      btnCb.type = 'button';
      btnCb.id = 'btn-title-colorblind';
      btnCb.onclick = () => {
        const cur = this.lastView?.colorblindMode ?? 'default';
        this.actions.onSetColorblindMode(nextCycleValue(COLORBLIND_MODES, cur));
      };

      const btnScale = el('button', 'btn btn-ghost');
      btnScale.type = 'button';
      btnScale.id = 'btn-title-scale';
      btnScale.onclick = () => {
        const cur = this.lastView?.uiScale ?? 1;
        this.actions.onSetTextScale(nextCycleValue(UI_SCALES, cur));
      };

      const btnMotion = el('button', 'btn btn-ghost');
      btnMotion.type = 'button';
      btnMotion.id = 'btn-title-motion';
      btnMotion.onclick = () => this.actions.onToggleReducedMotion();

      toggles.append(btnLang, btnCb, btnScale, btnMotion);

      const hint = el('p', 'title-hint');
      card.append(emblem, h1, sub, actions, toggles, hint);
      this.titleEl.append(card);

      this.titleRefs = {
        sub,
        btnNew,
        btnDemo,
        btnCont,
        btnLang,
        btnCb,
        btnScale,
        btnMotion,
        hint,
      };
    }

    const r = this.titleRefs!;
    setTextIfChanged(r.sub, t.title_sub);
    setTextIfChanged(r.btnNew, t.btn_new_factory);
    setTextIfChanged(r.btnDemo, t.btn_demo);
    setTextIfChanged(r.btnCont, t.btn_continue);
    r.btnCont.disabled = !hasSavedGame();

    setTextIfChanged(r.btnLang, t.btn_lang);
    setTextIfChanged(r.btnCb, `${t.btn_color_mode}: ${t.cb_modes[view.colorblindMode]}`);
    setClassIfChanged(
      r.btnCb,
      `btn btn-ghost ${view.colorblindMode !== 'default' ? 'active' : ''}`
    );
    setPressed(r.btnCb, view.colorblindMode !== 'default');

    const pct = Math.round(view.uiScale * 100);
    setTextIfChanged(r.btnScale, `${t.btn_scale}: ${pct}%`);
    setClassIfChanged(r.btnScale, `btn btn-ghost ${view.uiScale !== 1 ? 'active' : ''}`);
    setPressed(r.btnScale, view.uiScale !== 1);

    setTextIfChanged(
      r.btnMotion,
      `${t.btn_reduced_motion}: ${view.reducedMotion ? t.state_on : t.state_off}`
    );
    setClassIfChanged(r.btnMotion, `btn btn-ghost ${view.reducedMotion ? 'active' : ''}`);
    setPressed(r.btnMotion, view.reducedMotion);

    setTextIfChanged(r.hint, t.title_hint);
  }

  private renderTopBar(world: WorldState, view: HudViewState): void {
    const t = getBundle(view.locale);

    if (!this.topBarBuilt) {
      this.topBarBuilt = true;
      this.topBarEl.textContent = '';

      const left = el('div', 'topbar-group');
      const phaseCard = el('div', 'hud-pill phase-pill');
      const phaseTitle = el('span', 'pill-label');
      const phaseReqs = el('div', 'phase-reqs');
      const phaseDoneText = el('span', 'pill-label done-text hidden');

      const loadBtn = el('button', 'btn btn-xs btn-accent hidden');
      loadBtn.type = 'button';
      loadBtn.id = 'btn-load-phase';
      loadBtn.onclick = () => this.actions.onLoadPhaseStockpile();

      const skipLaunchBtn = el('button', 'btn btn-xs btn-primary hidden');
      skipLaunchBtn.type = 'button';
      skipLaunchBtn.id = 'btn-skip-launch';
      skipLaunchBtn.onclick = () => this.actions.onSkipRocketAnimation();

      phaseCard.append(phaseTitle, phaseReqs, phaseDoneText, loadBtn, skipLaunchBtn);

      const techPill = el('button', 'hud-pill tech-pill');
      techPill.type = 'button';
      techPill.id = 'btn-tech-pill';
      techPill.onclick = () => this.actions.onOpenModal('tech');

      left.append(phaseCard, techPill);

      const center = el('div', 'topbar-group');
      const powerPill = el('div', 'hud-pill power-pill');
      const speedWrap = el('div', 'speed-group');
      const speedBtns = new Map<number, HTMLButtonElement>();
      for (const [val, lbl] of [
        [0, '||'],
        [1, '1x'],
        [2, '2x'],
        [4, '4x'],
      ] as const) {
        const btn = el('button', 'btn btn-xs btn-ghost', lbl);
        btn.type = 'button';
        btn.onclick = () => this.actions.onSetSimSpeed(val);
        speedWrap.append(btn);
        speedBtns.set(val, btn);
      }
      center.append(powerPill, speedWrap);

      const right = el('div', 'topbar-group');
      const makeTopBtn = (id: string, onClick: () => void): HTMLButtonElement => {
        const b = el('button', 'btn btn-xs btn-secondary');
        b.type = 'button';
        b.id = id;
        b.onclick = onClick;
        return b;
      };

      const buttons = {
        tech: makeTopBtn('btn-open-tech', () =>
          this.actions.onOpenModal(this.lastView?.activeModal === 'tech' ? 'none' : 'tech')
        ),
        stats: makeTopBtn('btn-open-stats', () =>
          this.actions.onOpenModal(this.lastView?.activeModal === 'stats' ? 'none' : 'stats')
        ),
        blueprints: makeTopBtn('btn-open-bp', () =>
          this.actions.onOpenModal(
            this.lastView?.activeModal === 'blueprints' ? 'none' : 'blueprints'
          )
        ),
        tweak: makeTopBtn('btn-open-tweak', () =>
          this.actions.onOpenModal(this.lastView?.activeModal === 'tweak' ? 'none' : 'tweak')
        ),
        alt: makeTopBtn('btn-toggle-alt', () => this.actions.onToggleAltMode()),
        power: makeTopBtn('btn-toggle-power', () => this.actions.onTogglePowerOverlay()),
        save: makeTopBtn('btn-open-save', () =>
          this.actions.onOpenModal(this.lastView?.activeModal === 'save' ? 'none' : 'save')
        ),
        mute: makeTopBtn('btn-toggle-mute', () => this.actions.onToggleMute()),
        help: makeTopBtn('btn-open-help', () =>
          this.actions.onOpenModal(this.lastView?.activeModal === 'help' ? 'none' : 'help')
        ),
        scale: makeTopBtn('btn-toggle-scale', () => {
          const cur = this.lastView?.uiScale ?? 1;
          this.actions.onSetTextScale(nextCycleValue(UI_SCALES, cur));
        }),
        cb: makeTopBtn('btn-toggle-cb', () => {
          const cur = this.lastView?.colorblindMode ?? 'default';
          this.actions.onSetColorblindMode(nextCycleValue(COLORBLIND_MODES, cur));
        }),
        motion: makeTopBtn('btn-toggle-motion', () => this.actions.onToggleReducedMotion()),
        lang: makeTopBtn('btn-toggle-lang', () => this.actions.onToggleLocale()),
      };

      right.append(
        buttons.tech,
        buttons.stats,
        buttons.blueprints,
        buttons.tweak,
        buttons.alt,
        buttons.power,
        buttons.save,
        buttons.mute,
        buttons.help,
        buttons.scale,
        buttons.cb,
        buttons.motion,
        buttons.lang
      );

      this.topBarEl.append(left, center, right);

      this.topRefs = {
        phaseTitle,
        phaseReqs,
        phaseChips: [],
        renderedPhaseId: null,
        renderedPhaseCb: null,
        phaseDoneText,
        loadBtn,
        skipLaunchBtn,
        techPill,
        powerPill,
        speedBtns,
        buttons,
      };
    }

    const r = this.topRefs!;
    const phase = getActiveOrbitalPhase(world);
    if (phase) {
      r.phaseTitle.classList.remove('hidden');
      r.phaseReqs.classList.remove('hidden');
      r.phaseDoneText.classList.add('hidden');
      setTextIfChanged(r.phaseTitle, t.phases[phase.id]);

      if (r.renderedPhaseId !== phase.id || r.renderedPhaseCb !== view.colorblind) {
        r.renderedPhaseId = phase.id;
        r.renderedPhaseCb = view.colorblind;
        r.phaseReqs.textContent = '';
        r.phaseChips = [];
        for (const req of phase.requirements) {
          const { chip, img, txt } = makeItemChip(
            req.item,
            `0/${req.count}`,
            view.colorblind,
            t.items[req.item]
          );
          r.phaseReqs.append(chip);
          r.phaseChips.push({ item: req.item, chip, img, txt });
        }
      }

      let canLoadAny = false;
      phase.requirements.forEach((req, i) => {
        const cur = world.phaseDelivered[req.item] ?? 0;
        if (cur < req.count && (world.stockpile[req.item] ?? 0) > 0) canLoadAny = true;
        const ref = r.phaseChips[i];
        if (ref) {
          setTextIfChanged(ref.txt, `${cur}/${req.count}`);
          ref.chip.classList.toggle('done', cur >= req.count);
          ref.chip.title = t.items[req.item];
          ref.img.alt = t.items[req.item];
        }
      });

      setTextIfChanged(r.loadBtn, t.load_stockpile);
      r.loadBtn.classList.toggle('hidden', !canLoadAny);
    } else {
      r.phaseTitle.classList.add('hidden');
      r.phaseReqs.classList.add('hidden');
      r.loadBtn.classList.add('hidden');
      r.phaseDoneText.classList.remove('hidden');
      setTextIfChanged(r.phaseDoneText, t.phase_complete);
    }

    setTextIfChanged(r.skipLaunchBtn, t.skip_launch);
    r.skipLaunchBtn.classList.toggle('hidden', world.rocketTimer <= 0);

    const activeTech = getTechById(world.activeTechId);
    setTextIfChanged(
      r.techPill,
      activeTech ? `${t.tech_label}: ${t.techs[activeTech.id].name}` : t.no_active_tech
    );

    const p = world.power;
    const satPct = Math.round(p.satisfaction * 100);
    setClassIfChanged(r.powerPill, `hud-pill power-pill ${p.satisfaction < 0.99 ? 'warn' : ''}`);
    const isDay = world.dayTime < 0.7;
    const pText = `${p.generatedMw.toFixed(0)}/${p.demandedMw.toFixed(0)} MW (${satPct}%)`;
    const accText =
      p.capacityMj > 0
        ? ` | ${t.power_stored}: ${p.storedMj.toFixed(0)}/${p.capacityMj.toFixed(0)} MJ`
        : '';
    const timeText = ` | ${isDay ? t.daytime : t.nighttime}`;
    setTextIfChanged(r.powerPill, pText + accText + timeText);

    for (const [val, btn] of r.speedBtns) {
      const active = view.simSpeed === val;
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-accent' : 'btn-ghost'}`);
      setPressed(btn, active);
    }

    const patchBtn = (
      btn: HTMLButtonElement,
      label: string,
      active: boolean,
      isToggle = true
    ) => {
      setTextIfChanged(btn, label);
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-accent' : 'btn-secondary'}`);
      if (isToggle) setPressed(btn, active);
    };

    patchBtn(r.buttons.tech, t.btn_tech, view.activeModal === 'tech');
    patchBtn(r.buttons.stats, t.btn_stats, view.activeModal === 'stats');
    patchBtn(r.buttons.blueprints, t.btn_blueprints, view.activeModal === 'blueprints');
    patchBtn(r.buttons.tweak, t.btn_tweak, view.activeModal === 'tweak');
    patchBtn(r.buttons.alt, t.btn_alt, view.showAltMode);
    patchBtn(r.buttons.power, t.btn_power_overlay, view.showPowerOverlay);
    patchBtn(r.buttons.save, t.btn_save, view.activeModal === 'save');
    patchBtn(
      r.buttons.mute,
      view.muted ? `${t.btn_mute}${t.audio_off_suffix}` : t.btn_mute,
      !view.muted
    );
    patchBtn(r.buttons.help, t.btn_help, view.activeModal === 'help');

    const scalePct = Math.round(view.uiScale * 100);
    patchBtn(r.buttons.scale, `${t.btn_scale}: ${scalePct}%`, view.uiScale !== 1);
    patchBtn(
      r.buttons.cb,
      `${t.btn_color_mode}: ${t.cb_modes[view.colorblindMode]}`,
      view.colorblindMode !== 'default'
    );
    patchBtn(
      r.buttons.motion,
      `${t.btn_reduced_motion}: ${view.reducedMotion ? t.state_on : t.state_off}`,
      view.reducedMotion
    );
    patchBtn(r.buttons.lang, t.btn_lang, false, false);
  }

  private renderHotbar(world: WorldState, config: GameConfig, view: HudViewState): void {
    const t = getBundle(view.locale);

    if (!this.hotbarBuilt) {
      this.hotbarBuilt = true;
      this.hotbarEl.textContent = '';

      const catBar = el('div', 'hotbar-cats');
      for (const c of HOTBAR_CATEGORIES) {
        const btn = el('button', 'btn btn-xs btn-ghost');
        btn.type = 'button';
        btn.onclick = () => this.actions.onSelectCategory(c.id);
        this.catBtns.set(c.id, btn);
        catBar.append(btn);
      }

      const utilTools: ToolSelection[] = ['cursor', 'mine', 'deconstruct', 'bp_copy'];
      for (const ut of utilTools) {
        const btn = el('button', 'btn btn-xs btn-secondary');
        btn.type = 'button';
        btn.dataset.tool = ut;
        btn.onclick = () => this.actions.onSelectTool(ut);
        this.utilBtns.set(ut, btn);
        catBar.append(btn);
      }

      this.slotsRowEl = el('div', 'hotbar-slots');
      this.hotbarEl.append(catBar, this.slotsRowEl);
    }

    const catLabels: Record<HotbarCategoryId, string> = {
      all: t.cat_all,
      logistics: t.cat_logistics,
      extraction: t.cat_extraction,
      production: t.cat_production,
      power: t.cat_power,
    };
    for (const [id, btn] of this.catBtns) {
      const active = view.activeCategory === id;
      setTextIfChanged(btn, catLabels[id]);
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-accent' : 'btn-ghost'}`);
      setPressed(btn, active);
    }

    const utilLabels: Record<'cursor' | 'mine' | 'deconstruct' | 'bp_copy', string> = {
      cursor: t.tool_cursor,
      mine: t.tool_mine,
      deconstruct: t.tool_deconstruct,
      bp_copy: t.tool_blueprint_copy,
    };
    for (const [id, btn] of this.utilBtns) {
      const active = view.selectedTool === id;
      setTextIfChanged(btn, utilLabels[id as keyof typeof utilLabels]);
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-primary' : 'btn-secondary'}`);
      setPressed(btn, active);
    }

    const row = this.slotsRowEl!;
    const list =
      HOTBAR_CATEGORIES.find((c) => c.id === view.activeCategory)?.items ??
      HOTBAR_CATEGORIES[0].items;

    if (this.renderedHotbarCat !== view.activeCategory) {
      this.renderedHotbarCat = view.activeCategory;
      row.textContent = '';
      for (const bType of list) {
        let slotRef = this.slotPool.get(bType);
        if (!slotRef) {
          const btn = el('button', 'hotbar-slot');
          btn.type = 'button';
          btn.dataset.building = bType;

          const img = el('img', 'slot-icon');
          img.alt = bType;
          const label = el('span', 'slot-name');
          const keyBadge = el('span', 'slot-key');
          const lockBadge = el('span', 'slot-badge slot-lock-badge hidden');
          lockBadge.append(createLockSvg());
          const deficitBadge = el('span', 'slot-badge slot-deficit-badge hidden');
          deficitBadge.append(createAlertSvg());

          btn.append(img, label, keyBadge, lockBadge, deficitBadge);
          btn.onclick = () => {
            const curView = this.lastView;
            const curBundle = getBundle(curView?.locale ?? 'pt-BR');
            if (btn.dataset.locked === 'true') {
              this.showToast(curBundle.msg_tech_locked, true);
              return;
            }
            this.actions.onSelectTool(bType);
          };
          slotRef = { btn, img, label, keyBadge, lockBadge, deficitBadge, lastCb: null };
          this.slotPool.set(bType, slotRef);
        }
        row.append(slotRef.btn);
      }
    }

    const freeBuild = config.free_build.value >= 1;
    list.forEach((bType, idx) => {
      const slotRef = this.slotPool.get(bType)!;
      const def = BUILDINGS[bType];
      const unlocked = freeBuild || isBuildingUnlocked(world, bType);
      const affordable =
        freeBuild || def.cost.every((c) => (world.stockpile[c.item] ?? 0) >= c.count);
      const selected = view.selectedTool === bType;

      const cls = `hotbar-slot ${selected ? 'selected' : ''} ${
        !unlocked ? 'locked' : !affordable ? 'unaffordable' : ''
      }`;
      setClassIfChanged(slotRef.btn, cls);
      setPressed(slotRef.btn, selected);
      slotRef.btn.dataset.locked = unlocked ? 'false' : 'true';
      slotRef.btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');

      const costStr = def.cost.map((c) => `${c.count} ${t.items[c.item]}`).join(', ');
      const statusHint = !unlocked
        ? ` [${t.status_locked_short}]`
        : !affordable
          ? ` [${t.status_unaffordable_short}]`
          : '';
      const fullTitle = `${t.buildings[bType].name}${statusHint} — ${t.buildings[bType].desc}\n${costStr}`;
      if (slotRef.btn.title !== fullTitle) {
        slotRef.btn.title = fullTitle;
        slotRef.btn.setAttribute('aria-label', `${t.buildings[bType].name}${statusHint}`);
      }

      if (slotRef.lastCb !== view.colorblind) {
        slotRef.lastCb = view.colorblind;
        slotRef.img.src = getBuildingIconDataUrl(bType, 36, view.colorblind);
      }
      slotRef.img.alt = t.buildings[bType].name;
      setTextIfChanged(slotRef.label, t.buildings[bType].name);

      if (idx < 10) {
        slotRef.keyBadge.classList.remove('hidden');
        setTextIfChanged(slotRef.keyBadge, String((idx + 1) % 10));
      } else {
        slotRef.keyBadge.classList.add('hidden');
      }

      slotRef.lockBadge.classList.toggle('hidden', unlocked);
      slotRef.deficitBadge.classList.toggle('hidden', !unlocked || affordable);
    });
  }

  private renderInspector(world: WorldState, config: GameConfig, view: HudViewState): void {
    const b: BuildingEntity | null =
      view.selectedBuildingId !== null ? world.buildings[view.selectedBuildingId] ?? null : null;

    if (!b) {
      this.inspectorEl.classList.add('hidden');
      this.renderedInspId = null;
      this.lastInspBufferDigest = '';
      return;
    }

    this.inspectorEl.classList.remove('hidden');
    const t = getBundle(view.locale);
    const def = BUILDINGS[b.type];
    const rebuildNeeded =
      this.renderedInspId !== b.id ||
      this.renderedInspLocale !== view.locale ||
      this.renderedInspCb !== view.colorblind;

    if (rebuildNeeded) {
      this.renderedInspId = b.id;
      this.renderedInspLocale = view.locale;
      this.renderedInspCb = view.colorblind;
      this.lastInspBufferDigest = '';
      this.inspectorEl.textContent = '';

      const header = el('div', 'inspector-head');
      const titleWrap = el('div', 'inspector-title-wrap');
      const icon = el('img', 'icon-md');
      icon.src = getBuildingIconDataUrl(b.type, 40, view.colorblind);
      icon.alt = t.buildings[b.type].name;
      const title = el('strong', undefined, t.buildings[b.type].name);
      titleWrap.append(icon, title);

      const closeBtn = el('button', 'btn btn-xs btn-ghost');
      closeBtn.type = 'button';
      closeBtn.id = 'btn-close-inspector';
      closeBtn.setAttribute('aria-label', t.btn_close);
      closeBtn.append(createCloseSvg());
      closeBtn.onclick = () => this.actions.onCloseInspector();
      header.append(titleWrap, closeBtn);

      const statusBadge = el('div', 'status-row');
      const statusDot = el('span', 'status-dot');
      const statusText = el('span');
      statusBadge.append(statusDot, statusText);
      this.inspectorEl.append(header, statusBadge);

      const geoBadge = el('div', 'geo-badge hidden', t.inspector_geo_bonus);
      this.inspectorEl.append(geoBadge);

      let recipeSelect: HTMLSelectElement | null = null;
      if (isProcessorType(b.type)) {
        const recLabel = el('label', 'field-label', t.inspector_recipe);
        const selId = `inspector-recipe-${b.id}`;
        recLabel.htmlFor = selId;
        recipeSelect = el('select', 'field-select');
        recipeSelect.id = selId;
        const optAuto = el('option', undefined, t.inspector_recipe_auto);
        optAuto.value = 'auto';
        recipeSelect.append(optAuto);

        for (const r of getRecipesForBuilding(b.type)) {
          const opt = el('option', undefined, t.recipes[r.id] ?? r.id);
          opt.value = r.id;
          recipeSelect.append(opt);
        }
        recipeSelect.value = b.recipeId;
        recipeSelect.onchange = () => {
          this.actions.onSetMachineRecipe(b.id, recipeSelect!.value);
        };
        this.inspectorEl.append(recLabel, recipeSelect);
      }

      let ocLabel: HTMLLabelElement | null = null;
      let ocSlider: HTMLInputElement | null = null;
      let ocLockedNote: HTMLDivElement | null = null;
      if (def.power_mw > 0 && b.type !== 'inserter') {
        ocLabel = el('label', 'field-label');
        const ocId = `inspector-oc-${b.id}`;
        ocLabel.htmlFor = ocId;
        ocSlider = el('input', 'field-range');
        ocSlider.id = ocId;
        ocSlider.type = 'range';
        ocSlider.min = '50';
        ocSlider.max = '250';
        ocSlider.step = '25';
        ocSlider.oninput = () => {
          this.actions.onSetMachineClock(b.id, Number(ocSlider!.value) / 100);
        };
        ocLockedNote = el('div', 'muted-note hidden', t.inspector_overclock_locked);
        this.inspectorEl.append(ocLabel, ocSlider, ocLockedNote);
      }

      const buffersWrap = el('div', 'inspector-buffers hidden');
      buffersWrap.append(el('div', 'field-label', t.inspector_buffers));
      const buffersGrid = el('div', 'chip-grid');
      buffersWrap.append(buffersGrid);
      this.inspectorEl.append(buffersWrap);

      let rotBtn: HTMLButtonElement | null = null;
      let delBtn: HTMLButtonElement | null = null;
      if (b.type !== 'orbital_hub') {
        const btnRow = el('div', 'inspector-actions');
        rotBtn = el('button', 'btn btn-xs btn-secondary', t.inspector_rotate);
        rotBtn.type = 'button';
        rotBtn.onclick = () => this.actions.onRotateBuilding(b.id);
        delBtn = el('button', 'btn btn-xs btn-danger', t.inspector_dismantle);
        delBtn.type = 'button';
        delBtn.onclick = () => this.actions.onRemoveBuilding(b.id);
        btnRow.append(rotBtn, delBtn);
        this.inspectorEl.append(btnRow);
      }

      this.inspRefs = {
        statusDot,
        statusText,
        geoBadge,
        recipeSelect,
        ocLabel,
        ocSlider,
        ocLockedNote,
        buffersWrap,
        buffersGrid,
        rotBtn,
        delBtn,
        closeBtn,
      };
    }

    const r = this.inspRefs!;
    r.statusDot.style.background = statusColor(b.status, view.colorblind);
    setTextIfChanged(r.statusText, `${t.statuses[b.status]} | ${b.activePowerMw.toFixed(1)} MW`);
    r.geoBadge.classList.toggle('hidden', b.geoBonus <= 0);

    if (r.recipeSelect && document.activeElement !== r.recipeSelect) {
      if (r.recipeSelect.value !== b.recipeId) {
        r.recipeSelect.value = b.recipeId;
      }
    }

    if (r.ocLabel && r.ocSlider && r.ocLockedNote) {
      const canClock =
        config.free_build.value >= 1 || isFeatureUnlocked(world, 'overclock');
      const clockPct = Math.round(b.clock * 100);
      const forecastMw = computeOverclockPower(def.power_mw, b.clock, true);
      setTextIfChanged(
        r.ocLabel,
        `${t.inspector_overclock}: ${clockPct}% (${forecastMw.toFixed(1)} MW)`
      );
      r.ocSlider.disabled = !canClock;
      if (document.activeElement !== r.ocSlider && r.ocSlider.value !== String(clockPct)) {
        r.ocSlider.value = String(clockPct);
      }
      r.ocLockedNote.classList.toggle('hidden', canClock);
    }

    const bufDigest = JSON.stringify([
      b.inputBuffer,
      b.outputBuffer,
      b.inventory,
      b.type === 'accumulator' ? Math.round(b.energyMj * 10) : 0,
    ]);
    if (bufDigest !== this.lastInspBufferDigest) {
      this.lastInspBufferDigest = bufDigest;
      r.buffersGrid.textContent = '';

      const hasInputs = Object.values(b.inputBuffer).some((v) => (v ?? 0) > 0);
      const hasInv = Object.values(b.inventory).some((v) => (v ?? 0) > 0);
      const hasAny = hasInputs || b.outputBuffer !== null || hasInv || b.type === 'accumulator';
      r.buffersWrap.classList.toggle('hidden', !hasAny);

      if (hasAny) {
        for (const [k, v] of Object.entries(b.inputBuffer)) {
          if (v && v > 0) {
            const item = k as ItemId;
            r.buffersGrid.append(
              makeItemChip(item, `${t.buf_in} ${v}`, view.colorblind, t.items[item]).chip
            );
          }
        }
        if (b.outputBuffer) {
          r.buffersGrid.append(
            makeItemChip(
              b.outputBuffer.item,
              `${t.buf_out} ${b.outputBuffer.count}`,
              view.colorblind,
              t.items[b.outputBuffer.item]
            ).chip
          );
        }
        for (const [k, v] of Object.entries(b.inventory)) {
          if (v && v > 0) {
            const item = k as ItemId;
            r.buffersGrid.append(
              makeItemChip(item, String(v), view.colorblind, t.items[item]).chip
            );
          }
        }
        if (b.type === 'accumulator') {
          r.buffersGrid.append(
            el(
              'span',
              'item-chip',
              `${b.energyMj.toFixed(1)} / ${def.energy_capacity_mj ?? 120} MJ`
            )
          );
        }
      }
    }
  }

  private renderModal(world: WorldState, config: GameConfig, view: HudViewState): void {
    const t = getBundle(view.locale);

    if (view.activeModal === 'none') {
      if (this.renderedModalId !== 'none') {
        this.modalEl.classList.add('hidden');
        this.renderedModalId = 'none';
        this.techRefs = null;
        this.statsRefs = null;
        this.victoryRefs = null;
        this.tweakRefs = null;
        this.bpSavedContainer = null;
        this.bpTextarea = null;

        const prev = this.previouslyFocusedEl;
        this.previouslyFocusedEl = null;
        if (prev && prev.isConnected) {
          prev.focus();
        }
      }
      return;
    }

    const wasClosed = this.renderedModalId === 'none';
    if (wasClosed) {
      this.previouslyFocusedEl = document.activeElement as HTMLElement | null;
      this.modalEl.classList.remove('hidden');
    }

    const titleText =
      view.activeModal === 'tech'
        ? `${t.btn_tech} & ${t.phase_label}`
        : view.activeModal === 'stats'
          ? t.btn_stats
          : view.activeModal === 'blueprints'
            ? t.btn_blueprints
            : view.activeModal === 'tweak'
              ? t.tweak_title
              : view.activeModal === 'save'
                ? t.save_title
                : view.activeModal === 'victory'
                  ? t.victory_title
                  : t.help_title;
    setTextIfChanged(this.modalTitleEl, titleText);
    this.modalCloseBtn.setAttribute('aria-label', t.btn_close);

    const bpSig =
      view.activeModal === 'blueprints'
        ? view.savedBlueprints.map((b) => `${b.name}:${b.entries.length}`).join('|')
        : '';

    const needRebuild =
      this.renderedModalId !== view.activeModal ||
      this.renderedModalLocale !== view.locale ||
      this.renderedModalCb !== view.colorblind;

    if (needRebuild) {
      const prevScroll =
        this.renderedModalId === view.activeModal ? this.modalBodyEl.scrollTop : 0;
      const prevFocusId =
        !wasClosed && document.activeElement instanceof HTMLElement
          ? document.activeElement.id
          : '';

      this.renderedModalId = view.activeModal;
      this.renderedModalLocale = view.locale;
      this.renderedModalCb = view.colorblind;
      this.renderedSavedBpSig = bpSig;

      this.techRefs = null;
      this.statsRefs = null;
      this.victoryRefs = null;
      this.tweakRefs = null;
      this.bpSavedContainer = null;
      this.bpTextarea = null;

      this.modalBodyEl.textContent = '';
      this.buildModalBody(world, config, view);
      this.modalBodyEl.scrollTop = prevScroll;

      if (wasClosed) {
        const focusables = queryFocusables(this.modalBoxEl);
        if (focusables.length > 0) focusables[0].focus();
        else this.modalBoxEl.focus();
      } else if (prevFocusId) {
        const target = document.getElementById(prevFocusId);
        if (target) target.focus();
      }
      return;
    }

    // In-place non-destructive updates for open modals
    if (view.activeModal === 'tech') {
      this.patchTechModal(world);
    } else if (view.activeModal === 'stats') {
      this.patchStatsModal(world);
    } else if (view.activeModal === 'victory') {
      this.patchVictoryModal(world, view);
    } else if (view.activeModal === 'tweak') {
      this.patchTweakModal(config, view);
    } else if (view.activeModal === 'blueprints') {
      if (this.bpTextarea && document.activeElement !== this.bpTextarea && view.lastBpCode) {
        if (this.bpTextarea.value !== view.lastBpCode) {
          this.bpTextarea.value = view.lastBpCode;
        }
      }
      if (bpSig !== this.renderedSavedBpSig && this.bpSavedContainer) {
        this.renderedSavedBpSig = bpSig;
        this.rebuildSavedBlueprintsSection(view);
      }
    }
  }

  private buildModalBody(world: WorldState, config: GameConfig, view: HudViewState): void {
    const t = getBundle(view.locale);
    const body = this.modalBodyEl;

    if (view.activeModal === 'tech') {
      const grid = el('div', 'tech-grid');
      const cards: TechCardRef[] = [];

      for (const tech of TECHS) {
        const card = el('div', 'tech-card');
        const titleEl = el('h3', undefined, t.techs[tech.id].name);
        const descEl = el('p', 'muted-note', t.techs[tech.id].desc);
        const costs = el('div', 'chip-grid');
        const chips: TechCardRef['chips'] = [];
        for (const req of tech.cost) {
          const { chip, img, txt } = makeItemChip(
            req.item,
            `0/${req.count}`,
            view.colorblind,
            t.items[req.item]
          );
          costs.append(chip);
          chips.push({ item: req.item, count: req.count, img, txt, lastCb: view.colorblind });
        }

        const doneBadge = el('span', 'badge-ok hidden', t.unlocked);
        const btnRow = el('div', 'btn-row hidden');
        const focusBtn = el('button', 'btn btn-xs btn-secondary', t.tech_focus_lab);
        focusBtn.type = 'button';
        focusBtn.onclick = () => this.actions.onSetActiveTech(tech.id);

        const unlockBtn = el('button', 'btn btn-xs btn-primary', t.btn_unlock_stockpile);
        unlockBtn.type = 'button';
        unlockBtn.onclick = () => this.actions.onUnlockTech(tech.id);

        btnRow.append(focusBtn, unlockBtn);
        const lockedNote = el('span', 'muted-note hidden', t.locked_prereq);

        card.append(titleEl, descEl, costs, doneBadge, btnRow, lockedNote);
        grid.append(card);
        cards.push({
          techId: tech.id,
          card,
          titleEl,
          descEl,
          chips,
          doneBadge,
          btnRow,
          focusBtn,
          unlockBtn,
          lockedNote,
        });
      }

      const phasesHead = el('h3', 'section-title', t.phase_label);
      const phaseList = el('div', 'phase-list');
      const phases: PhaseRowRef[] = [];

      for (const ph of ORBITAL_PHASES) {
        const row = el('div', 'phase-row');
        const titleEl = el('strong', undefined, t.phases[ph.id]);
        const chipGrid = el('div', 'chip-grid');
        const chips: PhaseRowRef['chips'] = [];
        for (const req of ph.requirements) {
          const { chip, img, txt } = makeItemChip(
            req.item,
            `0/${req.count}`,
            view.colorblind,
            t.items[req.item]
          );
          chipGrid.append(chip);
          chips.push({ item: req.item, count: req.count, img, txt, lastCb: view.colorblind });
        }
        row.append(titleEl, chipGrid);
        phaseList.append(row);
        phases.push({ phaseId: ph.id, row, titleEl, chips });
      }

      body.append(grid, phasesHead, phaseList);
      this.techRefs = { cards, phases };
      this.patchTechModal(world);
      return;
    }

    if (view.activeModal === 'stats') {
      body.append(el('h3', 'section-title', t.stats_stockpile));
      const stockGrid = el('div', 'chip-grid');
      const stockChips = new Map<ItemId, { img: HTMLImageElement; txt: HTMLSpanElement }>();
      for (const item of ITEM_IDS) {
        const { chip, img, txt } = makeItemChip(
          item,
          `${t.items[item]}: 0`,
          view.colorblind
        );
        stockGrid.append(chip);
        stockChips.set(item, { img, txt });
      }
      body.append(stockGrid);

      body.append(el('h3', 'section-title', t.stats_rates));
      const table = el('div', 'rates-table');
      const rateRows = new Map<
        ItemId,
        {
          row: HTMLDivElement;
          img: HTMLImageElement;
          chipTxt: HTMLSpanElement;
          pos: HTMLSpanElement;
          neg: HTMLSpanElement;
        }
      >();
      for (const item of ITEM_IDS) {
        const row = el('div', 'rate-row hidden');
        const { chip, img, txt: chipTxt } = makeItemChip(item, t.items[item], view.colorblind);
        const pos = el('span', 'rate-val pos', `+0${t.unit_per_min}`);
        const neg = el('span', 'rate-val neg', `-0${t.unit_per_min}`);
        row.append(chip, pos, neg);
        table.append(row);
        rateRows.set(item, { row, img, chipTxt, pos, neg });
      }
      const emptyRatesNote = el('p', 'muted-note hidden', `0 ${t.unit_per_min}`);
      table.append(emptyRatesNote);
      body.append(table);

      body.append(el('h3', 'section-title', t.stats_diagnostics));
      const diag = el('div', 'chip-grid');
      const no_power = el('span', 'item-chip');
      const input_starved = el('span', 'item-chip');
      const output_full = el('span', 'item-chip');
      const unpaired = el('span', 'item-chip');
      diag.append(no_power, input_starved, output_full, unpaired);
      body.append(diag);

      this.statsRefs = {
        stockChips,
        rateRows,
        emptyRatesNote,
        diagChips: { no_power, input_starved, output_full, unpaired },
      };
      this.patchStatsModal(world);
      return;
    }

    if (view.activeModal === 'blueprints') {
      const capBtn = el('button', 'btn btn-primary', t.bp_capture);
      capBtn.type = 'button';
      capBtn.onclick = () => {
        this.actions.onOpenModal('none');
        this.actions.onSelectTool('bp_copy');
      };
      body.append(capBtn);

      body.append(el('h3', 'section-title', t.bp_import_export));
      const textArea = el('textarea', 'bp-textarea');
      textArea.value = view.lastBpCode;
      textArea.placeholder = 'AFBP1:...';
      textArea.setAttribute('aria-label', t.bp_import_export);
      this.bpTextarea = textArea;

      const impBtn = el('button', 'btn btn-xs btn-primary', t.bp_import_btn);
      impBtn.type = 'button';
      impBtn.onclick = () => this.actions.onImportBlueprint(textArea.value);
      body.append(textArea, impBtn);

      this.bpSavedContainer = el('div', 'bp-saved-section');
      body.append(this.bpSavedContainer);
      this.rebuildSavedBlueprintsSection(view);

      body.append(el('h3', 'section-title', t.bp_starters));
      body.append(this.createBpGrid(STARTER_BLUEPRINTS, t));
      return;
    }

    if (view.activeModal === 'tweak') {
      body.append(el('h3', 'section-title', t.a11y_section_title));
      const a11yGroup = el('div', 'a11y-panel');

      const scaleRow = el('div', 'tweak-row');
      const scaleHead = el('div', 'tweak-head');
      scaleHead.append(el('strong', undefined, t.btn_scale));
      const scaleBtnsWrap = el('div', 'btn-row');
      const scaleBtns = new Map<UiScale, HTMLButtonElement>();
      for (const s of UI_SCALES) {
        const b = el('button', 'btn btn-xs btn-ghost', `${Math.round(s * 100)}%`);
        b.type = 'button';
        b.onclick = () => this.actions.onSetTextScale(s);
        scaleBtns.set(s, b);
        scaleBtnsWrap.append(b);
      }
      scaleRow.append(scaleHead, scaleBtnsWrap);

      const cbRow = el('div', 'tweak-row');
      const cbHead = el('div', 'tweak-head');
      cbHead.append(el('strong', undefined, t.btn_color_mode));
      const cbBtnsWrap = el('div', 'btn-row');
      const cbBtns = new Map<ColorblindMode, HTMLButtonElement>();
      for (const m of COLORBLIND_MODES) {
        const b = el('button', 'btn btn-xs btn-ghost', t.cb_modes[m]);
        b.type = 'button';
        b.onclick = () => this.actions.onSetColorblindMode(m);
        cbBtns.set(m, b);
        cbBtnsWrap.append(b);
      }
      cbRow.append(cbHead, cbBtnsWrap);

      const motionRow = el('div', 'tweak-row');
      const motionHead = el('div', 'tweak-head');
      motionHead.append(el('strong', undefined, t.btn_reduced_motion));
      const motionBtn = el('button', 'btn btn-xs btn-ghost');
      motionBtn.type = 'button';
      motionBtn.onclick = () => this.actions.onToggleReducedMotion();
      motionRow.append(motionHead, motionBtn);

      a11yGroup.append(scaleRow, cbRow, motionRow);
      body.append(a11yGroup);

      body.append(el('h3', 'section-title', t.tweak_title));
      const list = el('div', 'tweak-list');
      const sliders = new Map<keyof GameConfig, { input: HTMLInputElement; valSpan: HTMLSpanElement }>();

      for (const [key, knob] of Object.entries(config) as Array<
        [keyof GameConfig, GameConfig[keyof GameConfig]]
      >) {
        const row = el('div', 'tweak-row');
        const top = el('div', 'tweak-head');
        const lbl = el('label', undefined, t.tweak_labels[key] ?? key);
        const inputId = `tweak-knob-${key}`;
        lbl.htmlFor = inputId;
        const valSpan = el('span', 'badge-ok', String(knob.value));
        top.append(lbl, valSpan);

        const desc = el('div', 'muted-note', t.tweak_descs[key] ?? knob.description);
        const slider = el('input', 'field-range');
        slider.id = inputId;
        slider.type = 'range';
        slider.min = String(knob.min);
        slider.max = String(knob.max);
        slider.step = String(knob.step);
        slider.value = String(knob.value);
        slider.oninput = () => {
          const val = Number(slider.value);
          valSpan.textContent = String(val);
          this.actions.onSetConfigKnob(key, val);
        };
        row.append(top, desc, slider);
        list.append(row);
        sliders.set(key, { input: slider, valSpan });
      }

      const resetBtn = el('button', 'btn btn-secondary', t.tweak_reset);
      resetBtn.type = 'button';
      resetBtn.onclick = () => this.actions.onResetConfig();
      body.append(list, resetBtn);

      this.tweakRefs = { sliders, scaleBtns, cbBtns, motionBtn };
      this.patchTweakModal(config, view);
      return;
    }

    if (view.activeModal === 'save') {
      const row = el('div', 'btn-col');
      const btnLocal = el('button', 'btn btn-primary', t.save_local);
      btnLocal.type = 'button';
      btnLocal.onclick = () => this.actions.onSaveLocal();

      const btnExport = el('button', 'btn btn-secondary', t.save_export);
      btnExport.type = 'button';
      btnExport.onclick = () => {
        const blob = new Blob([serializeWorld(world)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a');
        a.href = url;
        a.download = `aetherforge-tick-${world.tick}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };

      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.className = 'hidden';
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        if (file.size > MAX_SAVE_FILE_BYTES) {
          this.showToast(getBundle(this.lastView?.locale ?? 'pt-BR').msg_save_too_large, true);
          return;
        }
        const text = await file.text();
        this.actions.onImportSaveText(text);
      };

      const btnImport = el('button', 'btn btn-secondary', t.save_import);
      btnImport.type = 'button';
      btnImport.onclick = () => fileInput.click();

      const btnNew = el('button', 'btn btn-danger', t.save_new_seed);
      btnNew.type = 'button';
      btnNew.onclick = () => this.actions.onNewPlanetSeed();

      const btnHelp = el('button', 'btn btn-ghost', t.btn_help);
      btnHelp.type = 'button';
      btnHelp.onclick = () => this.actions.onOpenModal('help');

      row.append(btnLocal, btnExport, btnImport, fileInput, btnNew, btnHelp);
      body.append(row);
      return;
    }

    if (view.activeModal === 'victory') {
      body.append(el('p', undefined, t.victory_desc));
      const metrics = el('div', 'chip-grid');
      const ticks = el('span', 'item-chip');
      const launches = el('span', 'item-chip');
      const power = el('span', 'item-chip');
      const buildings = el('span', 'item-chip');
      metrics.append(ticks, launches, power, buildings);

      const contBtn = el('button', 'btn btn-primary', t.victory_continue);
      contBtn.type = 'button';
      contBtn.onclick = () => this.actions.onDismissVictory();

      body.append(metrics, contBtn);
      this.victoryRefs = { ticks, launches, power, buildings };
      this.patchVictoryModal(world, view);
      return;
    }

    if (view.activeModal === 'help') {
      const list = el('ul', 'help-list');
      for (const ln of t.help_lines) {
        list.append(el('li', undefined, ln));
      }
      body.append(list);
    }
  }

  private createBpGrid(list: BlueprintData[], t: ReturnType<typeof getBundle>): HTMLDivElement {
    const grid = el('div', 'bp-grid');
    for (const bp of list) {
      const card = el('div', 'bp-card');
      const displayName = t.bp_starter_names[bp.name] ?? bp.name;
      card.append(
        el('strong', undefined, displayName),
        el('span', 'muted-note', `${bp.width}x${bp.height} (${bp.entries.length})`)
      );
      const row = el('div', 'btn-row');
      const stampBtn = el('button', 'btn btn-xs btn-accent', t.bp_stamp_btn);
      stampBtn.type = 'button';
      stampBtn.onclick = () => {
        this.actions.onOpenModal('none');
        this.actions.onStampBlueprint(bp);
      };
      const copyBtn = el('button', 'btn btn-xs btn-secondary', t.bp_copy_btn);
      copyBtn.type = 'button';
      copyBtn.onclick = () => this.actions.onCopyBlueprint(bp);
      row.append(stampBtn, copyBtn);
      card.append(row);
      grid.append(card);
    }
    return grid;
  }

  private rebuildSavedBlueprintsSection(view: HudViewState): void {
    if (!this.bpSavedContainer) return;
    const t = getBundle(view.locale);
    this.bpSavedContainer.textContent = '';
    if (view.savedBlueprints.length === 0) return;
    this.bpSavedContainer.append(
      el('h3', 'section-title', t.bp_saved),
      this.createBpGrid(view.savedBlueprints, t)
    );
  }

  private patchTechModal(world: WorldState): void {
    if (!this.techRefs) return;
    const activeEl = document.activeElement as HTMLElement | null;
    let lostFocusInsideCard = false;

    for (const ref of this.techRefs.cards) {
      const done = world.unlockedTechs.includes(ref.techId);
      const avail = canStartTech(world, ref.techId);
      const isActive = world.activeTechId === ref.techId;

      setClassIfChanged(
        ref.card,
        `tech-card ${done ? 'done' : isActive ? 'active' : ''}`
      );

      const prog = world.techProgress[ref.techId] ?? {};
      for (const ch of ref.chips) {
        const cur = done ? ch.count : prog[ch.item] ?? 0;
        setTextIfChanged(ch.txt, `${cur}/${ch.count}`);
      }

      if (activeEl && ref.btnRow.contains(activeEl) && (done || !avail)) {
        lostFocusInsideCard = true;
      }

      ref.doneBadge.classList.toggle('hidden', !done);
      ref.btnRow.classList.toggle('hidden', done || !avail);
      ref.lockedNote.classList.toggle('hidden', done || avail);

      setClassIfChanged(
        ref.focusBtn,
        `btn btn-xs ${isActive ? 'btn-accent' : 'btn-secondary'}`
      );
      setPressed(ref.focusBtn, isActive);
    }

    if (lostFocusInsideCard) {
      const focusables = queryFocusables(this.modalBoxEl);
      if (focusables.length > 0) focusables[0].focus();
      else this.modalCloseBtn.focus();
    }

    this.techRefs.phases.forEach((phRef, idx) => {
      const done = idx < world.phaseIndex;
      const active = idx === world.phaseIndex;
      setClassIfChanged(phRef.row, `phase-row ${done ? 'done' : active ? 'active' : ''}`);
      for (const ch of phRef.chips) {
        const val = done ? ch.count : active ? world.phaseDelivered[ch.item] ?? 0 : 0;
        setTextIfChanged(ch.txt, `${val}/${ch.count}`);
      }
    });
  }

  private patchStatsModal(world: WorldState): void {
    if (!this.statsRefs) return;
    const t = getBundle(this.lastView?.locale ?? 'pt-BR');

    for (const item of ITEM_IDS) {
      const ref = this.statsRefs.stockChips.get(item);
      if (ref) {
        const count = world.stockpile[item] ?? 0;
        setTextIfChanged(ref.txt, `${t.items[item]}: ${count}`);
      }
    }

    const rates = getRollingRates(world);
    let anyRates = false;
    for (const item of ITEM_IDS) {
      const ref = this.statsRefs.rateRows.get(item);
      if (!ref) continue;
      const p = rates.producedPerMin[item] ?? 0;
      const c = rates.consumedPerMin[item] ?? 0;
      if (p === 0 && c === 0) {
        ref.row.classList.add('hidden');
      } else {
        anyRates = true;
        ref.row.classList.remove('hidden');
        setTextIfChanged(ref.pos, `+${p}${t.unit_per_min}`);
        setTextIfChanged(ref.neg, `-${c}${t.unit_per_min}`);
      }
    }
    this.statsRefs.emptyRatesNote.classList.toggle('hidden', anyRates);

    const counts = { no_power: 0, input_starved: 0, output_full: 0, unpaired: 0 };
    for (const b of Object.values(world.buildings)) {
      if (b.status in counts) counts[b.status as keyof typeof counts] += 1;
    }
    setTextIfChanged(this.statsRefs.diagChips.no_power, `${t.statuses.no_power}: ${counts.no_power}`);
    setTextIfChanged(
      this.statsRefs.diagChips.input_starved,
      `${t.statuses.input_starved}: ${counts.input_starved}`
    );
    setTextIfChanged(
      this.statsRefs.diagChips.output_full,
      `${t.statuses.output_full}: ${counts.output_full}`
    );
    setTextIfChanged(this.statsRefs.diagChips.unpaired, `${t.statuses.unpaired}: ${counts.unpaired}`);
  }

  private patchVictoryModal(world: WorldState, view: HudViewState): void {
    if (!this.victoryRefs) return;
    const t = getBundle(view.locale);
    setTextIfChanged(this.victoryRefs.ticks, `${t.victory_metric_ticks}: ${world.tick}`);
    setTextIfChanged(
      this.victoryRefs.launches,
      `${t.victory_metric_launches}: ${world.orbitalLaunches}`
    );
    setTextIfChanged(
      this.victoryRefs.power,
      `${t.victory_metric_power}: ${world.power.generatedMw.toFixed(0)} MW`
    );
    setTextIfChanged(
      this.victoryRefs.buildings,
      `${t.victory_metric_buildings}: ${Object.keys(world.buildings).length}`
    );
  }

  private patchTweakModal(config: GameConfig, view: HudViewState): void {
    if (!this.tweakRefs) return;
    const t = getBundle(view.locale);

    for (const [key, ref] of this.tweakRefs.sliders) {
      const val = config[key].value;
      setTextIfChanged(ref.valSpan, String(val));
      if (document.activeElement !== ref.input && ref.input.value !== String(val)) {
        ref.input.value = String(val);
      }
    }

    for (const [scale, btn] of this.tweakRefs.scaleBtns) {
      const active = view.uiScale === scale;
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-accent' : 'btn-ghost'}`);
      setPressed(btn, active);
    }

    for (const [mode, btn] of this.tweakRefs.cbBtns) {
      const active = view.colorblindMode === mode;
      setClassIfChanged(btn, `btn btn-xs ${active ? 'btn-accent' : 'btn-ghost'}`);
      setPressed(btn, active);
    }

    if (this.tweakRefs.motionBtn) {
      setTextIfChanged(
        this.tweakRefs.motionBtn,
        view.reducedMotion ? t.state_on : t.state_off
      );
      setClassIfChanged(
        this.tweakRefs.motionBtn,
        `btn btn-xs ${view.reducedMotion ? 'btn-accent' : 'btn-ghost'}`
      );
      setPressed(this.tweakRefs.motionBtn, view.reducedMotion);
    }
  }
}
