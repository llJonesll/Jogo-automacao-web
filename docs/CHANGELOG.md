# Internal & Player-Facing Changelog: v1.1.0

Date: 2026-11-17
Version: `1.1.0` (`package.json`)
Baseline: `v1.0.0` (`20288dd..HEAD`)

## New Features
- **Zero-Allocation Engine & Complete Mechanics (`src/core/`, `src/game/`)**: Cached sorted building lists, `4096`-tile flat scratch buffers, bidirectional 5-tile tunnel pairing (`4`-item unpaired buffer, span-independent `4.0/s` speed), `8.0/s` 2-slot splitters/mergers, full buffer/slot dismantle refunds, Research Lab scaling (`speed * (1 + geoBonus) * craftMult * overdrive * clock * sat`) + active-tech input filtering, `BUILDING_STATUS_TRANSITIONS`, Tier 6 `orbital_overdrive` (`+50%` global speed), and tech-gated `assemble_processor` (`T4`) & `assemble_quantum` (`T5`).
- **Offscreen Caches, Pooled Particles & Sub-Tick Smoothing (`src/render/`)**: `ParticlePool` (`512`-slot TypedArray SoA), offscreen terrain & `64x64` minimap caches, pre-baked glow sprites + dawn/dusk twilight, `19`-item sprite atlas, `simAlpha` belt/inserter interpolation, 2-segment articulated inserter arms, curved corner belt rails, Power Grid overlay (`V`), HiDPI DPR backing, and localized `FiguresGalleryLabels`.
- **Web Audio Event Bus & Adaptive Mix (`src/audio/synth.ts`)**: `20` `AudioEventId` events routed through `uiGain` / `sfxGain` / `ambientGain` -> `masterGain` -> `DynamicsCompressorNode` -> optional `ChannelMergerNode` (`Mono`), adaptive exoplanet wind + machine hum (`updateAmbient`), and persisted volume sliders + Mono toggle in Settings (`G`).
- **Decoupled UX, Accessibility & Multi-Input (`src/ui/`, `src/input/`, `src/style.css`)**: Strict `HudActions` command callbacks, non-destructive DOM patching, FIFO queued toasts captioning audio events, Keyboard grid cursor (`I/J/K/L`, `Enter`, `Delete`, `Home`, `[`/`]`), `GamepadController` (`deadzone: 0.18`), `--ui-scale` (`100%–150%`), `4` colorblind modes + non-color symbol cues, `prefers-reduced-motion` + rocket launch skip, and 100% `PT-BR`/`EN` parity.
- **Validation, Fuzzing & Studio Governance (`tests/unit/`, `data/schemas/`, `design/`, `docs/`, `production/`)**: Added `data-schema.test.ts` (JSON schema & `PT-BR`/`EN` key parity), `security-fuzz.test.ts`, `soak.test.ts`, `design/registry/entities.yaml`, `game-concept.md`, `systems-index.md`, `art-bible.md`, `sound-bible.md`, `accessibility-requirements.md`, `ux/hud.md`, `ux/interaction-patterns.md`, `adr-001`..`adr-005`, `control-manifest.md`, QA Plan/Smoke/Soak/Sign-off, Full Security Audit, Polish Report, and `release-checklist-v1.1.0.md`.

## Improvements & Balance
- Rebalanced starter stockpile (`60/30/25/20/10`), Hub RTG (`20 MW`), Solar (`14 MW`), Accumulator (`180 MJ`, `15 MW`), Coal fuel burn (`fuel_value / generates_mw = 4.0s`), Tier 3–5 progression costs, and weighted outer `iron_ore` veins (`~41%`) protecting magma vents.
- Fixed Inspector close button, Phase 5 Victory modal trigger via Topbar `[Load Rocket]`, `setMachineRecipe` config forwarding, initial `view.muted` sync, and removed the unused `"blueprints"` tech flag.

## Metrics
- Source files (`src/`): `20` (`19` TypeScript + `1` CSS)
- Data & Schema files (`data/`): `10` (`5` JSON data tables + `5` JSON Schemas)
- Unit tests (`tests/unit/`): `7` suites, `32/32` passing tests (`0.0951 ms/tick` on `545`-entity megafactory soak)
- Production bundle (`dist/`): `206.65 kB` JS (`61.68 kB` gzip), `12.34 kB` CSS (`3.12 kB` gzip), `0` runtime dependencies
