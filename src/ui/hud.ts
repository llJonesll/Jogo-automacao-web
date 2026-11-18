import {
  BUILDINGS,
  ITEM_IDS,
  ORBITAL_PHASES,
  TECHS,
  createDefaultConfig,
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
import {
  STARTER_BLUEPRINTS,
  decodeBlueprint,
  encodeBlueprint,
} from '../game/blueprints';
import { computeOverclockPower } from '../game/power';
import {
  canStartTech,
  getActiveOrbitalPhase,
  getRollingRates,
  getTechById,
  loadPhaseFromStockpile,
  unlockTechFromStockpile,
} from '../game/progression';
import { hasSavedGame, serializeWorld } from '../game/save';
import {
  isBuildingUnlocked,
  isFeatureUnlocked,
  removeBuilding,
  rotateBuilding,
  setMachineClock,
  setMachineRecipe,
} from '../game/world';
import {
  getBuildingIconDataUrl,
  getItemIconDataUrl,
  statusColor,
} from '../render/sprites';
import { getBundle, type Locale } from './i18n';

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

export interface HudActions {
  onStartNew: () => void;
  onContinueSave: () => void;
  onStartDemo: () => void;
  onToggleLocale: () => void;
  onToggleColorblind: () => void;
  onSelectTool: (tool: ToolSelection) => void;
  onSetSimSpeed: (speed: number) => void;
  onToggleAltMode: () => void;
  onToggleMute: () => void;
  onOpenModal: (modal: ModalId) => void;
  onSaveLocal: () => void;
  onImportSaveText: (json: string) => void;
  onStampBlueprint: (bp: BlueprintData) => void;
  onMutateWorld: () => void;
  onPlayTechSound: () => void;
  onPlayLaunchSound: () => void;
  onPlayUiTick: () => void;
}

export interface HudViewState {
  scene: 'title' | 'play';
  locale: Locale;
  colorblind: boolean;
  muted: boolean;
  simSpeed: number;
  showAltMode: boolean;
  selectedTool: ToolSelection;
  selectedBuildingId: number | null;
  activeModal: ModalId;
  savedBlueprints: BlueprintData[];
  lastBpCode: string;
}

const HOTBAR_CATEGORIES: Array<{
  id: 'all' | 'logistics' | 'extraction' | 'production' | 'power';
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

function makeItemChip(
  item: ItemId,
  labelText: string,
  colorblind: boolean,
  titleText?: string
): HTMLSpanElement {
  const chip = el('span', 'item-chip');
  if (titleText) chip.title = titleText;
  const img = el('img', 'icon-sm');
  img.src = getItemIconDataUrl(item, 24, colorblind);
  img.alt = item;
  const txt = el('span', undefined, labelText);
  chip.append(img, txt);
  return chip;
}

export class FactoryHud {
  private root: HTMLElement;
  private titleEl: HTMLElement;
  private topBarEl: HTMLElement;
  private hotbarEl: HTMLElement;
  private inspectorEl: HTMLElement;
  private modalEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private activeCategory: 'all' | 'logistics' | 'extraction' | 'production' | 'power' = 'all';
  private lastModalRendered: ModalId = 'none';
  private lastInspectorKey = '';

  constructor(
    container: HTMLElement,
    private actions: HudActions
  ) {
    this.root = container;
    this.root.textContent = '';

    this.titleEl = el('div', 'title-overlay');
    this.topBarEl = el('header', 'hud-topbar');
    this.hotbarEl = el('footer', 'hud-hotbar');
    this.inspectorEl = el('aside', 'hud-inspector hidden');
    this.modalEl = el('div', 'hud-modal-backdrop hidden');
    this.toastEl = el('div', 'hud-toast hidden');

    this.root.append(
      this.topBarEl,
      this.inspectorEl,
      this.hotbarEl,
      this.modalEl,
      this.titleEl,
      this.toastEl
    );

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.actions.onOpenModal('none');
      }
    });
  }

  public showToast(message: string, isError = false): void {
    this.toastEl.textContent = message;
    this.toastEl.className = `hud-toast ${isError ? 'toast-error' : ''}`;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 3200);
  }

  public render(world: WorldState, config: GameConfig, view: HudViewState): void {
    if (view.scene === 'title') {
      this.titleEl.classList.remove('hidden');
      this.topBarEl.classList.add('hidden');
      this.hotbarEl.classList.add('hidden');
      this.inspectorEl.classList.add('hidden');
      this.modalEl.classList.add('hidden');
      this.renderTitle(view);
      return;
    }

    this.titleEl.classList.add('hidden');
    this.topBarEl.classList.remove('hidden');
    this.hotbarEl.classList.remove('hidden');

    this.renderTopBar(world, view);
    this.renderHotbar(world, config, view);
    this.renderInspector(world, config, view);
    this.renderModal(world, config, view);
  }

  private renderTitle(view: HudViewState): void {
    const t = getBundle(view.locale);
    this.titleEl.textContent = '';

    const card = el('div', 'title-card');
    const emblem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    emblem.setAttribute('viewBox', '0 0 64 64');
    emblem.setAttribute('class', 'title-emblem');
    emblem.innerHTML =
      '<polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/><circle cx="32" cy="32" r="14" fill="none" stroke="#38bdf8" stroke-width="3"/><polygon points="32,14 38,34 26,34" fill="#f59e0b"/><rect x="27" y="36" width="10" height="8" fill="#e2e8f0"/>';

    const h1 = el('h1', 'title-logo', 'AETHERFORGE');
    const sub = el('p', 'title-sub', t.title_sub);

    const actions = el('div', 'title-actions');
    const btnNew = el('button', 'btn btn-primary', t.btn_new_factory);
    btnNew.id = 'btn-new-factory';
    btnNew.onclick = () => this.actions.onStartNew();

    const btnDemo = el('button', 'btn btn-accent', t.btn_demo);
    btnDemo.id = 'btn-demo-factory';
    btnDemo.onclick = () => this.actions.onStartDemo();

    const btnCont = el('button', 'btn btn-secondary', t.btn_continue);
    btnCont.id = 'btn-continue-save';
    btnCont.disabled = !hasSavedGame();
    btnCont.onclick = () => this.actions.onContinueSave();

    actions.append(btnNew, btnDemo, btnCont);

    const toggles = el('div', 'title-toggles');
    const btnLang = el('button', 'btn btn-ghost', t.btn_lang);
    btnLang.onclick = () => this.actions.onToggleLocale();
    const btnCb = el(
      'button',
      `btn btn-ghost ${view.colorblind ? 'active' : ''}`,
      t.btn_colorblind
    );
    btnCb.onclick = () => this.actions.onToggleColorblind();
    toggles.append(btnLang, btnCb);

    const hint = el('p', 'title-hint', t.title_hint);
    card.append(emblem, h1, sub, actions, toggles, hint);
    this.titleEl.append(card);
  }

  private renderTopBar(world: WorldState, view: HudViewState): void {
    const t = getBundle(view.locale);
    this.topBarEl.textContent = '';

    // Left: Orbital Elevator Phase + Active Tech
    const left = el('div', 'topbar-group');
    const phase = getActiveOrbitalPhase(world);
    const phaseCard = el('div', 'hud-pill phase-pill');
    if (phase) {
      const title = el('span', 'pill-label', `${t.phases[phase.id]}`);
      phaseCard.append(title);
      const reqWrap = el('div', 'phase-reqs');
      let canLoadAny = false;
      for (const req of phase.requirements) {
        const cur = world.phaseDelivered[req.item] ?? 0;
        if (cur < req.count && (world.stockpile[req.item] ?? 0) > 0) canLoadAny = true;
        const chip = makeItemChip(
          req.item,
          `${cur}/${req.count}`,
          view.colorblind,
          t.items[req.item]
        );
        if (cur >= req.count) chip.classList.add('done');
        reqWrap.append(chip);
      }
      phaseCard.append(reqWrap);
      if (canLoadAny) {
        const loadBtn = el('button', 'btn btn-xs btn-accent', t.load_stockpile);
        loadBtn.onclick = () => {
          const ev: Array<{ kind: 'launch' | 'tech' }> = [];
          const count = loadPhaseFromStockpile(world, ev);
          if (count > 0) {
            this.actions.onMutateWorld();
            if (ev.some((e) => e.kind === 'launch')) {
              this.actions.onPlayLaunchSound();
              this.showToast(t.msg_rocket_launch);
            } else {
              this.actions.onPlayUiTick();
              this.showToast(t.msg_phase_loaded);
            }
          }
        };
        phaseCard.append(loadBtn);
      }
    } else {
      phaseCard.append(el('span', 'pill-label done-text', t.phase_complete));
    }

    const techPill = el('button', 'hud-pill tech-pill');
    const activeTech = getTechById(world.activeTechId);
    techPill.textContent = activeTech
      ? `${t.tech_label}: ${t.techs[activeTech.id].name}`
      : t.no_active_tech;
    techPill.onclick = () => this.actions.onOpenModal('tech');

    left.append(phaseCard, techPill);

    // Center: Power Grid + Day/Night + Sim Speed
    const center = el('div', 'topbar-group');
    const p = world.power;
    const satPct = Math.round(p.satisfaction * 100);
    const powerPill = el(
      'div',
      `hud-pill power-pill ${p.satisfaction < 0.99 ? 'warn' : ''}`
    );
    const isDay = world.dayTime < 0.7;
    const pText = `${p.generatedMw.toFixed(0)}/${p.demandedMw.toFixed(0)} MW (${satPct}%)`;
    const accText =
      p.capacityMj > 0 ? ` | ${t.power_stored}: ${p.storedMj.toFixed(0)}/${p.capacityMj.toFixed(0)} MJ` : '';
    const timeText = ` | ${isDay ? t.daytime : t.nighttime}`;
    powerPill.textContent = pText + accText + timeText;
    center.append(powerPill);

    const speedWrap = el('div', 'speed-group');
    for (const [val, lbl] of [
      [0, '||'],
      [1, '1x'],
      [2, '2x'],
      [4, '4x'],
    ] as const) {
      const btn = el(
        'button',
        `btn btn-xs ${view.simSpeed === val ? 'btn-accent' : 'btn-ghost'}`,
        lbl
      );
      btn.onclick = () => this.actions.onSetSimSpeed(val);
      speedWrap.append(btn);
    }
    center.append(speedWrap);

    // Right: Modal & Tool buttons
    const right = el('div', 'topbar-group');
    const makeTopBtn = (id: string, label: string, active: boolean, onClick: () => void) => {
      const b = el('button', `btn btn-xs ${active ? 'btn-accent' : 'btn-secondary'}`, label);
      b.id = id;
      b.onclick = onClick;
      return b;
    };

    right.append(
      makeTopBtn('btn-open-tech', t.btn_tech, view.activeModal === 'tech', () =>
        this.actions.onOpenModal(view.activeModal === 'tech' ? 'none' : 'tech')
      ),
      makeTopBtn('btn-open-stats', t.btn_stats, view.activeModal === 'stats', () =>
        this.actions.onOpenModal(view.activeModal === 'stats' ? 'none' : 'stats')
      ),
      makeTopBtn('btn-open-bp', t.btn_blueprints, view.activeModal === 'blueprints', () =>
        this.actions.onOpenModal(view.activeModal === 'blueprints' ? 'none' : 'blueprints')
      ),
      makeTopBtn('btn-open-tweak', t.btn_tweak, view.activeModal === 'tweak', () =>
        this.actions.onOpenModal(view.activeModal === 'tweak' ? 'none' : 'tweak')
      ),
      makeTopBtn('btn-toggle-alt', t.btn_alt, view.showAltMode, () =>
        this.actions.onToggleAltMode()
      ),
      makeTopBtn('btn-open-save', t.btn_save, view.activeModal === 'save', () =>
        this.actions.onOpenModal(view.activeModal === 'save' ? 'none' : 'save')
      ),
      makeTopBtn('btn-toggle-mute', view.muted ? `${t.btn_mute} (OFF)` : t.btn_mute, !view.muted, () =>
        this.actions.onToggleMute()
      ),
      makeTopBtn('btn-open-help', t.btn_help, view.activeModal === 'help', () =>
        this.actions.onOpenModal(view.activeModal === 'help' ? 'none' : 'help')
      ),
      makeTopBtn('btn-toggle-lang', t.btn_lang, false, () =>
        this.actions.onToggleLocale()
      )
    );

    this.topBarEl.append(left, center, right);
  }

  private renderHotbar(world: WorldState, config: GameConfig, view: HudViewState): void {
    const t = getBundle(view.locale);
    this.hotbarEl.textContent = '';

    const catBar = el('div', 'hotbar-cats');
    const catLabels: Record<(typeof HOTBAR_CATEGORIES)[number]['id'], string> = {
      all: t.cat_all,
      logistics: t.cat_logistics,
      extraction: t.cat_extraction,
      production: t.cat_production,
      power: t.cat_power,
    };
    for (const c of HOTBAR_CATEGORIES) {
      const btn = el(
        'button',
        `btn btn-xs ${this.activeCategory === c.id ? 'btn-accent' : 'btn-ghost'}`,
        catLabels[c.id]
      );
      btn.onclick = () => {
        this.activeCategory = c.id;
        this.actions.onPlayUiTick();
        this.renderHotbar(world, config, view);
      };
      catBar.append(btn);
    }

    // Utility quick tools
    const utilTools: Array<{ id: ToolSelection; label: string }> = [
      { id: 'cursor', label: t.tool_cursor },
      { id: 'deconstruct', label: t.tool_deconstruct },
      { id: 'bp_copy', label: t.tool_blueprint_copy },
    ];
    for (const ut of utilTools) {
      const btn = el(
        'button',
        `btn btn-xs ${view.selectedTool === ut.id ? 'btn-primary' : 'btn-secondary'}`,
        ut.label
      );
      btn.onclick = () => this.actions.onSelectTool(ut.id);
      catBar.append(btn);
    }

    const row = el('div', 'hotbar-slots');
    const list =
      HOTBAR_CATEGORIES.find((c) => c.id === this.activeCategory)?.items ??
      HOTBAR_CATEGORIES[0].items;
    const freeBuild = config.free_build.value >= 1;

    list.forEach((bType, idx) => {
      const def = BUILDINGS[bType];
      const unlocked = freeBuild || isBuildingUnlocked(world, bType);
      const affordable =
        freeBuild ||
        def.cost.every((c) => (world.stockpile[c.item] ?? 0) >= c.count);

      const slot = el(
        'button',
        `hotbar-slot ${view.selectedTool === bType ? 'selected' : ''} ${!unlocked ? 'locked' : !affordable ? 'unaffordable' : ''}`
      );
      slot.dataset.building = bType;
      const costStr = def.cost.map((c) => `${c.count} ${t.items[c.item]}`).join(', ');
      slot.title = `${t.buildings[bType].name} — ${t.buildings[bType].desc}\n${costStr}`;

      const img = el('img', 'slot-icon');
      img.src = getBuildingIconDataUrl(bType, 36, view.colorblind);
      img.alt = bType;

      const label = el('span', 'slot-name', t.buildings[bType].name);
      slot.append(img, label);

      if (idx < 10) {
        const keyBadge = el('span', 'slot-key', String((idx + 1) % 10));
        slot.append(keyBadge);
      }

      slot.onclick = () => {
        if (!unlocked) {
          this.showToast(t.msg_tech_locked, true);
          return;
        }
        this.actions.onSelectTool(bType);
      };
      row.append(slot);
    });

    this.hotbarEl.append(catBar, row);
  }

  private renderInspector(world: WorldState, config: GameConfig, view: HudViewState): void {
    const b: BuildingEntity | null =
      view.selectedBuildingId !== null ? world.buildings[view.selectedBuildingId] ?? null : null;

    if (!b) {
      this.inspectorEl.classList.add('hidden');
      this.lastInspectorKey = '';
      return;
    }

    this.inspectorEl.classList.remove('hidden');

    // Avoid rebuilding interactive select/slider DOM if nothing relevant changed while user drags slider
    const bufKey = JSON.stringify([
      b.id,
      b.dir,
      b.status,
      b.recipeId,
      b.lockedRecipeId,
      b.clock,
      b.inputBuffer,
      b.outputBuffer,
      b.inventory,
      Math.round(b.energyMj),
      b.activePowerMw.toFixed(1),
      view.locale,
      view.colorblind,
      world.unlockedTechs.length,
    ]);
    if (bufKey === this.lastInspectorKey) return;
    this.lastInspectorKey = bufKey;

    const t = getBundle(view.locale);
    this.inspectorEl.textContent = '';

    const header = el('div', 'inspector-head');
    const titleWrap = el('div', 'inspector-title-wrap');
    const icon = el('img', 'icon-md');
    icon.src = getBuildingIconDataUrl(b.type, 40, view.colorblind);
    const title = el('strong', undefined, t.buildings[b.type].name);
    titleWrap.append(icon, title);

    const closeBtn = el('button', 'btn btn-xs btn-ghost', 'X');
    closeBtn.onclick = () => {
      this.lastInspectorKey = '';
      this.actions.onSelectTool('cursor');
    };
    header.append(titleWrap, closeBtn);

    const statusBadge = el('div', 'status-row');
    const dot = el('span', 'status-dot');
    dot.style.background = statusColor(b.status, view.colorblind);
    const stText = el(
      'span',
      undefined,
      `${t.statuses[b.status]} | ${b.activePowerMw.toFixed(1)} MW`
    );
    statusBadge.append(dot, stText);
    this.inspectorEl.append(header, statusBadge);

    if (b.geoBonus > 0) {
      this.inspectorEl.append(el('div', 'geo-badge', t.inspector_geo_bonus));
    }

    // Recipe Selector for Processors
    if (isProcessorType(b.type)) {
      const recLabel = el('label', 'field-label', t.inspector_recipe);
      const select = el('select', 'field-select');
      const optAuto = el('option', undefined, t.inspector_recipe_auto);
      optAuto.value = 'auto';
      select.append(optAuto);

      for (const r of getRecipesForBuilding(b.type)) {
        const opt = el('option', undefined, t.recipes[r.id] ?? r.id);
        opt.value = r.id;
        select.append(opt);
      }
      select.value = b.recipeId;
      select.onchange = () => {
        setMachineRecipe(world, b.id, select.value);
        this.lastInspectorKey = '';
        this.actions.onMutateWorld();
      };
      this.inspectorEl.append(recLabel, select);
    }

    // Overclock Slider for Miners & Processors & Labs
    const def = BUILDINGS[b.type];
    if (def.power_mw > 0 && b.type !== 'inserter') {
      const canClock =
        config.free_build.value >= 1 || isFeatureUnlocked(world, 'overclock');
      const clockPct = Math.round(b.clock * 100);
      const forecastMw = computeOverclockPower(def.power_mw, b.clock, true);
      const ocLabel = el(
        'label',
        'field-label',
        `${t.inspector_overclock}: ${clockPct}% (${forecastMw.toFixed(1)} MW)`
      );
      const slider = el('input', 'field-range');
      slider.type = 'range';
      slider.min = '50';
      slider.max = '250';
      slider.step = '25';
      slider.value = String(clockPct);
      slider.disabled = !canClock;
      slider.oninput = () => {
        setMachineClock(world, b.id, Number(slider.value) / 100, !canClock ? false : true);
        if (config.free_build.value >= 1) {
          setMachineClock(world, b.id, Number(slider.value) / 100, true);
        }
        this.lastInspectorKey = '';
        this.actions.onMutateWorld();
      };
      this.inspectorEl.append(ocLabel, slider);
      if (!canClock) {
        this.inspectorEl.append(el('div', 'muted-note', t.inspector_overclock_locked));
      }
    }

    // Buffers display
    const bufWrap = el('div', 'inspector-buffers');
    const hasInputs = Object.values(b.inputBuffer).some((v) => (v ?? 0) > 0);
    const hasInv = Object.values(b.inventory).some((v) => (v ?? 0) > 0);
    if (hasInputs || b.outputBuffer || hasInv || b.type === 'accumulator') {
      bufWrap.append(el('div', 'field-label', t.inspector_buffers));
      const chips = el('div', 'chip-grid');
      for (const [k, v] of Object.entries(b.inputBuffer)) {
        if (v && v > 0) {
          const item = k as ItemId;
          chips.append(makeItemChip(item, `IN ${v}`, view.colorblind, t.items[item]));
        }
      }
      if (b.outputBuffer) {
        chips.append(
          makeItemChip(
            b.outputBuffer.item,
            `OUT ${b.outputBuffer.count}`,
            view.colorblind,
            t.items[b.outputBuffer.item]
          )
        );
      }
      for (const [k, v] of Object.entries(b.inventory)) {
        if (v && v > 0) {
          const item = k as ItemId;
          chips.append(makeItemChip(item, String(v), view.colorblind, t.items[item]));
        }
      }
      if (b.type === 'accumulator') {
        chips.append(
          el(
            'span',
            'item-chip',
            `${b.energyMj.toFixed(1)} / ${def.energy_capacity_mj ?? 120} MJ`
          )
        );
      }
      bufWrap.append(chips);
      this.inspectorEl.append(bufWrap);
    }

    if (b.type !== 'orbital_hub') {
      const btnRow = el('div', 'inspector-actions');
      const rotBtn = el('button', 'btn btn-xs btn-secondary', t.inspector_rotate);
      rotBtn.onclick = () => {
        rotateBuilding(world, b.x, b.y);
        this.lastInspectorKey = '';
        this.actions.onMutateWorld();
      };
      const delBtn = el('button', 'btn btn-xs btn-danger', t.inspector_dismantle);
      delBtn.onclick = () => {
        removeBuilding(world, b.x, b.y, true);
        this.lastInspectorKey = '';
        this.actions.onSelectTool('cursor');
        this.actions.onMutateWorld();
      };
      btnRow.append(rotBtn, delBtn);
      this.inspectorEl.append(btnRow);
    }
  }

  private renderModal(world: WorldState, config: GameConfig, view: HudViewState): void {
    if (view.activeModal === 'none') {
      this.modalEl.classList.add('hidden');
      this.lastModalRendered = 'none';
      return;
    }

    this.modalEl.classList.remove('hidden');
    // For interactive modals with inputs/file pickers, avoid wiping DOM every frame unless switching modal
    const staticInputModals: ModalId[] = ['blueprints', 'tweak', 'save'];
    if (
      staticInputModals.includes(view.activeModal) &&
      this.lastModalRendered === view.activeModal
    ) {
      return;
    }
    this.lastModalRendered = view.activeModal;

    const t = getBundle(view.locale);
    this.modalEl.textContent = '';

    const box = el('div', 'hud-modal');
    const head = el('div', 'modal-head');
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

    head.append(el('h2', undefined, titleText));
    const close = el('button', 'btn btn-xs btn-ghost', 'X');
    close.onclick = () => this.actions.onOpenModal('none');
    head.append(close);
    box.append(head);

    const body = el('div', 'modal-body');

    if (view.activeModal === 'tech') {
      const grid = el('div', 'tech-grid');
      for (const tech of TECHS) {
        const done = world.unlockedTechs.includes(tech.id);
        const avail = canStartTech(world, tech.id);
        const card = el(
          'div',
          `tech-card ${done ? 'done' : world.activeTechId === tech.id ? 'active' : ''}`
        );
        card.append(el('h3', undefined, t.techs[tech.id].name));
        card.append(el('p', 'muted-note', t.techs[tech.id].desc));

        const prog = world.techProgress[tech.id] ?? {};
        const costs = el('div', 'chip-grid');
        for (const req of tech.cost) {
          const cur = done ? req.count : prog[req.item] ?? 0;
          costs.append(
            makeItemChip(req.item, `${cur}/${req.count}`, view.colorblind, t.items[req.item])
          );
        }
        card.append(costs);

        if (done) {
          card.append(el('span', 'badge-ok', t.unlocked));
        } else if (avail) {
          const btnRow = el('div', 'btn-row');
          const setActive = el(
            'button',
            `btn btn-xs ${world.activeTechId === tech.id ? 'btn-accent' : 'btn-secondary'}`,
            'Focar Lab'
          );
          setActive.onclick = () => {
            world.activeTechId = tech.id;
            this.lastModalRendered = 'none';
            this.actions.onMutateWorld();
          };
          const buyBtn = el('button', 'btn btn-xs btn-primary', t.btn_unlock_stockpile);
          buyBtn.onclick = () => {
            const ev: Array<{ kind: 'launch' | 'tech' }> = [];
            if (unlockTechFromStockpile(world, tech.id, ev)) {
              this.actions.onPlayTechSound();
              this.lastModalRendered = 'none';
              this.actions.onMutateWorld();
            } else {
              this.showToast(t.msg_no_materials, true);
            }
          };
          btnRow.append(setActive, buyBtn);
          card.append(btnRow);
        } else {
          card.append(el('span', 'muted-note', t.locked_prereq));
        }
        grid.append(card);
      }

      const phasesHead = el('h3', 'section-title', t.phase_label);
      const phaseList = el('div', 'phase-list');
      for (const ph of ORBITAL_PHASES) {
        const done = ph.phase - 1 < world.phaseIndex;
        const active = ph.phase - 1 === world.phaseIndex;
        const row = el('div', `phase-row ${done ? 'done' : active ? 'active' : ''}`);
        row.append(el('strong', undefined, t.phases[ph.id]));
        const chips = el('div', 'chip-grid');
        for (const req of ph.requirements) {
          const val = done ? req.count : active ? world.phaseDelivered[req.item] ?? 0 : 0;
          chips.append(
            makeItemChip(req.item, `${val}/${req.count}`, view.colorblind, t.items[req.item])
          );
        }
        row.append(chips);
        phaseList.append(row);
      }

      body.append(grid, phasesHead, phaseList);
    } else if (view.activeModal === 'stats') {
      body.append(el('h3', 'section-title', t.stats_stockpile));
      const stockGrid = el('div', 'chip-grid');
      for (const item of ITEM_IDS) {
        const count = world.stockpile[item] ?? 0;
        stockGrid.append(
          makeItemChip(item, `${t.items[item]}: ${count}`, view.colorblind)
        );
      }
      body.append(stockGrid);

      body.append(el('h3', 'section-title', t.stats_rates));
      const rates = getRollingRates(world);
      const table = el('div', 'rates-table');
      for (const item of ITEM_IDS) {
        const p = rates.producedPerMin[item] ?? 0;
        const c = rates.consumedPerMin[item] ?? 0;
        if (p === 0 && c === 0) continue;
        const row = el('div', 'rate-row');
        row.append(
          makeItemChip(item, t.items[item], view.colorblind),
          el('span', 'rate-val pos', `+${p}/min`),
          el('span', 'rate-val neg', `-${c}/min`)
        );
        table.append(row);
      }
      if (table.childElementCount === 0) {
        table.append(el('p', 'muted-note', '0 / min'));
      }
      body.append(table);

      body.append(el('h3', 'section-title', t.stats_diagnostics));
      const counts = { no_power: 0, input_starved: 0, output_full: 0, unpaired: 0 };
      for (const b of Object.values(world.buildings)) {
        if (b.status in counts) counts[b.status as keyof typeof counts] += 1;
      }
      const diag = el('div', 'chip-grid');
      diag.append(
        el('span', 'item-chip', `${t.statuses.no_power}: ${counts.no_power}`),
        el('span', 'item-chip', `${t.statuses.input_starved}: ${counts.input_starved}`),
        el('span', 'item-chip', `${t.statuses.output_full}: ${counts.output_full}`),
        el('span', 'item-chip', `${t.statuses.unpaired}: ${counts.unpaired}`)
      );
      body.append(diag);
    } else if (view.activeModal === 'blueprints') {
      const capBtn = el('button', 'btn btn-primary', t.bp_capture);
      capBtn.onclick = () => {
        this.actions.onOpenModal('none');
        this.actions.onSelectTool('bp_copy');
      };
      body.append(capBtn);

      const renderBpSection = (heading: string, list: BlueprintData[]) => {
        if (list.length === 0) return;
        body.append(el('h3', 'section-title', heading));
        const grid = el('div', 'bp-grid');
        for (const bp of list) {
          const card = el('div', 'bp-card');
          card.append(
            el('strong', undefined, bp.name),
            el('span', 'muted-note', `${bp.width}x${bp.height} (${bp.entries.length})`)
          );
          const row = el('div', 'btn-row');
          const stampBtn = el('button', 'btn btn-xs btn-accent', t.bp_stamp_btn);
          stampBtn.onclick = () => {
            this.actions.onOpenModal('none');
            this.actions.onStampBlueprint(bp);
          };
          const copyBtn = el('button', 'btn btn-xs btn-secondary', t.bp_copy_btn);
          copyBtn.onclick = () => {
            const code = encodeBlueprint(bp);
            void navigator.clipboard?.writeText(code);
            textArea.value = code;
            this.showToast(t.msg_bp_copied);
          };
          row.append(stampBtn, copyBtn);
          card.append(row);
          grid.append(card);
        }
        body.append(grid);
      };

      body.append(el('h3', 'section-title', t.bp_import_export));
      const textArea = el('textarea', 'bp-textarea');
      textArea.value = view.lastBpCode;
      textArea.placeholder = 'AFBP1:...';
      const impBtn = el('button', 'btn btn-xs btn-primary', t.bp_import_btn);
      impBtn.onclick = () => {
        const res = decodeBlueprint(textArea.value);
        if (!res.ok) {
          this.showToast(t.msg_bp_invalid, true);
          return;
        }
        view.savedBlueprints.unshift(res.blueprint);
        this.showToast(t.msg_bp_imported);
        this.actions.onOpenModal('none');
        this.actions.onStampBlueprint(res.blueprint);
      };
      body.append(textArea, impBtn);

      renderBpSection(t.bp_saved, view.savedBlueprints);
      renderBpSection(t.bp_starters, STARTER_BLUEPRINTS);
    } else if (view.activeModal === 'tweak') {
      const defaults = createDefaultConfig();
      const list = el('div', 'tweak-list');
      for (const [key, knob] of Object.entries(config) as Array<
        [keyof GameConfig, GameConfig[keyof GameConfig]]
      >) {
        const row = el('div', 'tweak-row');
        const top = el('div', 'tweak-head');
        const lbl = el('strong', undefined, key);
        const valSpan = el('span', 'badge-ok', String(knob.value));
        top.append(lbl, valSpan);

        const desc = el('div', 'muted-note', knob.description);
        const slider = el('input', 'field-range');
        slider.type = 'range';
        slider.min = String(knob.min);
        slider.max = String(knob.max);
        slider.step = String(knob.step);
        slider.value = String(knob.value);
        slider.oninput = () => {
          knob.value = Number(slider.value);
          valSpan.textContent = String(knob.value);
        };
        row.append(top, desc, slider);
        list.append(row);
      }

      const resetBtn = el('button', 'btn btn-secondary', t.tweak_reset);
      resetBtn.onclick = () => {
        for (const key of Object.keys(defaults) as Array<keyof GameConfig>) {
          config[key].value = defaults[key].value;
        }
        this.lastModalRendered = 'none';
        this.renderModal(world, config, view);
      };
      body.append(list, resetBtn);
    } else if (view.activeModal === 'save') {
      const row = el('div', 'btn-col');
      const btnLocal = el('button', 'btn btn-primary', t.save_local);
      btnLocal.onclick = () => {
        this.actions.onSaveLocal();
        this.showToast(t.msg_saved);
      };
      const btnExport = el('button', 'btn btn-secondary', t.save_export);
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
        if (!file) return;
        const text = await file.text();
        this.actions.onImportSaveText(text);
      };
      const btnImport = el('button', 'btn btn-secondary', t.save_import);
      btnImport.onclick = () => fileInput.click();

      const btnNew = el('button', 'btn btn-danger', t.save_new_seed);
      btnNew.onclick = () => {
        config.seed.value = ((config.seed.value + 7919) % 999999) + 1;
        this.actions.onStartNew();
      };

      row.append(btnLocal, btnExport, btnImport, fileInput, btnNew);
      body.append(row);
    } else if (view.activeModal === 'victory') {
      body.append(el('p', undefined, t.victory_desc));
      const metrics = el('div', 'chip-grid');
      metrics.append(
        el('span', 'item-chip', `Ticks: ${world.tick}`),
        el('span', 'item-chip', `Launches: ${world.orbitalLaunches}`),
        el('span', 'item-chip', `Power: ${world.power.generatedMw.toFixed(0)} MW`),
        el('span', 'item-chip', `Buildings: ${Object.keys(world.buildings).length}`)
      );
      const contBtn = el('button', 'btn btn-primary', t.victory_continue);
      contBtn.onclick = () => {
        world.victoryDismissed = true;
        this.actions.onOpenModal('none');
      };
      body.append(metrics, contBtn);
    } else if (view.activeModal === 'help') {
      const list = el('ul', 'help-list');
      const lines =
        view.locale === 'en'
          ? [
              'WASD / Arrows / Middle-Drag: Pan camera; Wheel: Zoom',
              'Left Click & Drag (Belt selected): Auto-orient conveyor line & corners',
              'Left Click (Empty Cursor on Ore): Manual Mining Laser',
              'Right Click / Drag: Dismantle building with 100% refund',
              'R / Shift+R: Rotate building or blueprint',
              'Q: Pipette tool from hovered building',
              '1-9, 0: Quick select hotbar slot | Esc: Clear tool',
              'Alt: Toggle Alt-Mode (recipes, overclock badges, tunnel links)',
              'T: Tech & Orbital Phases | P: Stats | B / Ctrl+C: Blueprints | G: Config Tweaks',
              'Geothermal Resonance: Machines adjacent to magma vents run +35% faster for free',
            ]
          : [
              'WASD / Setas / Botão do Meio: Mover câmera; Scroll: Zoom',
              'Clique Esq. e Arraste (com Esteira): Cria curvas automáticas contínuas',
              'Clique Esq. (Cursor livre sobre jazida): Laser de Mineração manual',
              'Botão Direito (ou arraste): Desmontar com 100% de reembolso',
              'R / Shift+R: Girar construção ou blueprint ativo',
              'Q: Pipeta (copia o tipo de construção sob o cursor)',
              '1-9, 0: Barra rápida | Esc: Limpar ferramenta',
              'Alt: Ativar Alt-Mode (receitas, overclock e linhas de túnel)',
              'T: Tech & Elevador Orbital | P: Estatísticas | B / Ctrl+C: Blueprints | G: Config',
              'Ressonância Geotérmica: Máquinas ao lado de fissuras ganham +35% velocidade grátis',
            ];
      for (const ln of lines) list.append(el('li', undefined, ln));
      body.append(list);
    }

    box.append(body);
    this.modalEl.append(box);
  }
}
