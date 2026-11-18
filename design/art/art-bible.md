# Art Bible — AETHERFORGE: Orbital Foundry

- **Status:** Approved
- **Last Updated:** 2026-11-17
- **Rigour Coverage:** Sections 1–9 (Full Procedural Canvas 2D Direction)
- **Visual Audit Route:** `/?scene=figures` and `/?scene=figures&lang=en`
- **References:** [game-concept.md](../gdd/game-concept.md), [accessibility-requirements.md](../accessibility-requirements.md), [hud.md](../ux/hud.md), [ADR-002](../../docs/architecture/adr-002-zero-dep-procedural.md)

---

## 1. Visual Identity Statement

> **AETHERFORGE: Orbital Foundry** renders a dark basalt volcanic exoplanet industrial network in crisp 2.5D vector precision—anchoring heavy dark-slate machinery against FICSIT Amber logistics and Plasma Cyan high-tech instrumentation, with zero emojis and unmistakable shape silhouettes across all zoom levels.

### Visual Design Tests (Anchored to Pillars)
1. **Instant Silhouette Test (`?scene=figures`)**: Every building (`20`) and item (`19`) remains immediately distinguishable at `24px` (belt/HUD chip) and `48px` (1.0x tile) even in monochrome or colorblind rendering.
2. **Zero-Ambiguity Flow Test**: Conveyor direction, tunnel entrance vs exit mode, splitter 1->3 ports, merger 3->1 ports, and inserter pickup/drop swing read visually without opening an Inspector.
3. **Color-Independent Status Test**: No operational state, belt tier, ore vein, or ghost validity check depends exclusively on hue—every color token pairs with shape, chevron count, hatch pattern, or text label.

---

## 2. Mood & Atmosphere by Game State

| Game State | Dominant Atmosphere | Lighting & Palette Behavior | Motion & VFX Feel |
|---|---|---|---|
| **Title Screen** | Calm orbital anticipation | Deep radial twilight vignette (`#090d16` to `#0f172a`), amber frame (`#f59e0b`), glowing cyan emblem (`#38bdf8`) | Minimal static card framing live procedural canvas behind |
| **Day Play (`dayTime < 0.70`)** | Crisp industrial clarity | Full basalt terrain contrast (`#0f1623`), sharp metallic accents, clear mineral flecks, solar grids bright blue (`#1e40af` / `#60a5fa`) | Steady 60 FPS interpolated belt flow, subtle ore dust & embers |
| **Twilight & Night (`dayTime >= 0.70`)** | Cozy glowing clockwork forge | Smooth dusk/dawn twilight ramp cooling into deep indigo night overlay; cyan (`#38bdf8`), amber (`#fb923c`), and violet (`#818cf8`) radial glow sprites illuminate active hubs, smelters, labs, and magma vents | Glowing furnace cores, scanner beam sweep, warm ember sparks |
| **Brownout (`satisfaction < 0.99`)** | Urgent mechanical slowdown | Pulsing crimson warning border on HUD power pill; red/rose `no_power` LEDs with lightning bolt glyph; machines visibly decelerate proportionally | Ambient hum pitch drops; reduced/slowed pistons & rotors |
| **Rocket Launch (`rocketTimer > 0`)** | Triumphant industrial spectacle | Intense white-amber-crimson thruster plume (`#ffffff` -> `#fbbf24` -> `#ef4444`) and expanding pad shockwave ring (steady fade when `reducedMotion` active) | Smooth accelerating ascent of 3x3 Hub pod + pooled exhaust smoke |
| **Victory** | Clean milestone celebration | Focused modal frame over live factory showcase; full production metrics summary | Non-intrusive backdrop so player can return to megafactory |

---

## 3. Shape Language & Silhouette Rules

### 3.1 Building Silhouette Rules (All 20 Buildings)

Every building fits inside a `48x48 px` (`1x1`) footprint (except `orbital_hub` at `144x144 px` `3x3`) with `8%` inset chassis padding (`box = size * 0.84`), subtle 2.5D south-east drop shadow, south extruded bevel skirt, directional amber/cyan port arrow at output edge, top-left orange thermal circle when `geoBonus > 0`, and top-right status LED symbol.

| Building ID | Category | Chassis Base / Accent | Signature Procedural Silhouette | Colorblind / Non-Color Cue |
|---|---|---|---|---|
| `belt_mk1` | Logistics | `#1e293b` track, `#475569` rails, `#f59e0b` (CB `#eab308`) | Twin steel rails + scrolling directional chevrons (curved corner rails when turning) | `1` chevron pip per cadence |
| `belt_mk2` | Logistics | `#1e293b` track, `#ef4444` (CB `#f97316`) | High-contrast crimson/orange scrolling chevrons | `2` tight chevron pips per cadence |
| `belt_mk3` | Logistics | `#1e293b` track, `#06b6d4` | Hyper-cyan dense chevron stream | `3` stacked chevron pips per cadence |
| `tunnel` | Logistics | `#1e293b` / `#334155` / `#64748b` | Recessed dark `#090d16` subterranean hood + amber entrance arrow / cyan exit arrow | Entrance vs Exit arrow offset + `E`/`X` link line in Alt-Mode |
| `splitter` | Logistics | `#1e293b` / `#334155` / `#f59e0b` | Cross-manifold junction lines + 3 directional amber output triangles (`L/F/R`) | Three outgoing port arrows |
| `merger` | Logistics | `#1e293b` / `#334155` / `#38bdf8` | Converging chevron funnel + 1 cyan forward port triangle | Single converging arrow + funnel lines |
| `inserter` | Logistics | `#0f172a` pedestal, `#f59e0b` ring | Circular pivot + 2-segment articulated elbow arm + rotating claw + cyan drop arrow | Moving physical arm gripping item |
| `storage` | Logistics | `#292524` / `#57534e` / `#a8a29e` | Heavy armored crate with centered `#d97706` amber reinforced cargo lock | Square nested vault silhouette |
| `miner_mk1` | Extraction | `#1e293b` / `#3f2e18` / `#f59e0b` | 4-blade amber rotary drill head + forward port arrow | Coarse 4-blade rotor + warm brass chassis |
| `miner_mk2` | Extraction | `#1e293b` / `#0c4a6e` / `#38bdf8` | High-speed 4-blade cyan drill head + cyan port arrow | Deep cobalt housing + Mk.II badge bar |
| `smelter` | Production | `#27272a` / `#3f3f46` / `#ea580c` | Circular molten blast crucible (`#f97316` / `#fdba74` ring) + progress bar | Round furnace core silhouette |
| `constructor` | Production | `#1e293b` / `#334155` / `#eab308` | Reciprocating yellow stamping piston over steel anvil bar | Horizontal stamping bar + gap |
| `foundry` | Production | `#1c1917` / `#44403c` / `#f97316` | Wide rectangular molten hearth bath (`#fb923c` / `#fed7aa`) | Wide horizontal molten trough |
| `assembler` | Production | `#0f172a` / `#1e3a5f` / `#38bdf8` | Twin diagonal precision robotic arms converging on glowing cyan core | Dual pincer arms + center node |
| `coal_generator` | Power | `#18181b` / `#27272a` / `#71717a` | Twin offset circular combustion turbine stacks with orange fire cores when burning | Dual staggered exhaust stacks |
| `solar_panel` | Power | `#0f172a` / `#1e40af` / `#60a5fa` | Deep photovoltaic blue surface subdivided by 3x3 metallic grid lines | Crisp 2x2 / 3x3 solar cell lattice |
| `accumulator` | Power | `#0f172a` / `#1e293b` / `#22d3ee` | Vertical recessed `#090d16` battery gauge filled dynamically by `energyMj / capacity` (`#06b6d4`) | Vertical live charge bar height |
| `geothermal_plant` | Power | `#292524` / `#7c2d12` / `#fb923c` | 6-spoke rotating steam turbine wheel (`#fed7aa`) anchored over magma vent | 6-spoke radial turbine silhouette |
| `research_lab` | Special | `#0f172a` / `#1e1b4b` / `#818cf8` | Glowing indigo dome core orbited by tilted cyan elliptical telemetry ring | Orbiting ellipse around central orb |
| `orbital_hub` | Special | `#0f172a` / `#1e293b` / `#f59e0b` | `3x3` indestructible launchpad with 12 cyan perimeter intake bays, circular telemetry scanner arc, and central white/amber launch rocket pod | `3x3` scale + 12 edge ports + central rocket |

### 3.2 Item Silhouette Rules (All 19 Items)

Items draw inside a centered circular bounding radius `r = size * 0.44` (`24px` on belts, `18px`–`32px` in HUD chips/catalog) using distinct geometric categories so items never collapse into colored circles:

| Category | Item ID | Hex Fill / Accent | Procedural Geometric Silhouette |
|---|---|---|---|
| **Raw (5)** | `iron_ore` | `#6b88a8` / `#9ebbd9` | Jagged 6-vertex faceted stone cluster + bright interior facet highlight |
| | `copper_ore` | `#c96d44` / `#f19b6e` | Jagged 6-vertex faceted stone cluster (warm copper highlight) |
| | `coal` | `#2f333a` / `#575e6b` | Jagged 6-vertex dark carbon rock cluster |
| | `stone` | `#878b91` / `#b8bcc2` | Jagged 6-vertex grey rock cluster |
| | `quartz` | `#9b6bc9` / `#dab6ff` | Tall 5-point hexagonal translucent crystal prism + vertical specular ridge |
| **Refined (6)** | `iron_ingot` | `#98a9bc` / `#dce8f5` | Beveled trapezoidal metal bar + top specular highlight strip |
| | `copper_ingot` | `#d97848` / `#ffc099` | Beveled trapezoidal copper bar + top specular highlight strip |
| | `concrete` | `#9ca3ad` / `#cfd6e0` | Rectangular slab block with twin `#64748b` slotted masonry ribs |
| | `glass_crystal` | `#73d2de` / `#cff9ff` | Tall translucent cyan hexagonal prism + crisp white vertical edge |
| | `steel_beam` | `#5f7082` / `#a4b8cc` | Structural flanged I-Beam cross-section |
| | `silicon_wafer` | `#445d8a` / `#8cb3f5` | Circular iridescent wafer disc with orthogonal etched cross-traces |
| **Manufactured (8)** | `iron_plate` | `#7b91a8` / `#c6daed` | Square riveted armor plate with 4 corner rivet dots |
| | `iron_gear` | `#8c9fb3` / `#dde7f0` | Precision 8-tooth (16-vertex) industrial cog with dark `#0f172a` bore hole |
| | `copper_wire` | `#e37e44` / `#ffbe94` | Concentric double-ring wound copper spool coil |
| | `circuit` | `#2f9e62` (CB `#0284c7`) / `#6df2a7` | Rectangular PCB with centered `#1e293b` IC chip and `#facc15` gold corner pads |
| | `rotor` | `#d48a28` / `#ffd07a` | Circular turbine housing with 3 Y-spoke coils and bright hub center |
| | `modular_frame` | `#58708a` / `#9ec3e8` | Braced square structural frame with full X-diagonal cross-trusses |
| | `processor` | `#1c78c0` / `#66c7ff` | High-density square silicon die (`#0f172a` core) with 6 gold top/bottom pin headers |
| | `quantum_core` | `#8b3dff` / `#4ef2ff` | Glowing rotated diamond core enclosing pure `#ffffff` singularity center |

---

## 4. Color System & Colorblind Accessibility

### 4.1 Core Palette Tokens
- **Primary Background / Basalt Canvas**: `#090d16` (deep space void), `#0f1623` (terrain slab), `#0f172a` (panel slate / HUD chrome)
- **Structural Borders & Text**: `#334155` (borders), `#1e293b` (elevated surfaces), `#e2e8f0` (primary text, `>13:1` contrast), `#94a3b8` (secondary text)
- **Signature Industrial Accents**:
  - **FICSIT Amber**: `#f59e0b` / `#fbbf24` / `#d97706` (primary CTA, Mk.I logistics, Hub trim, active selection `#fde047`)
  - **Plasma Cyan**: `#38bdf8` / `#06b6d4` / `#0369a1` (high-tech electronics, accents, input/output telemetry, Mk.III belts)
  - **Thermal Magma**: `#fb923c` / `#f97316` / `#ea580c` (smelters, foundries, geothermal vents & `+35%` resonance badges)
  - **Semantic Statuses**: Working `#22c55e` (CB `#38bdf8`), Idle `#f59e0b`, Input Starved `#fb923c`, Output Full `#eab308`, Unpaired `#a855f7`, No Power / No Resource `#ef4444` (CB `#f43f5e`).

### 4.2 Mandatory Colorblind Modes & Non-Color Backup Cues
AETHERFORGE exposes `default`, `protanopia`, `deuteranopia`, and `tritanopia` (plus High Contrast UI) synced to `document.documentElement[data-theme-cb]` and `FactoryRenderer` options:
- **Status LED Symbols**: Every status dot pairs hue with an interior vector cue (`working`: filled ring/check, `idle`: horizontal pause bar, `no_power`: jagged bolt, `input_starved`: hollow ring, `output_full`: triangle up, `no_resource`: X mark, `unpaired`: split diamond).
- **Belt Tier Differentiation**: `belt_mk1` (`#f59e0b` / `#eab308`), `belt_mk2` (`#ef4444` / `#f97316` or `#0ea5e9` under red-green swap), and `belt_mk3` (`#06b6d4`) display distinct `1`, `2`, and `3` chevron marks per cycle.
- **Ghost Placement & Ore Identification**: Valid ghosts use crisp outline + directional arrow; blocked ghosts (`occupied`, `needs_ore`, `needs_vent`, `locked`, `no_materials`) draw an explicit diagonal `X` cross-hatch inside the tile box alongside localized toast/hover diagnostics. Ore veins pair unique base/fleck palettes with mineral crystal shapes and hover readout.

---

## 5. Entity & Structure Silhouette Direction (2.5D Depth)

- **South-Facing Chassis Extrusion**: 1x1 buildings render a darker south rim bevel (`~10%` tile height) below the top face plate, grounding structures visually onto the `48px` basalt grid without breaking orthogonal grid alignment.
- **Articulated Inserter Arms**: Drawn in layer 4 on top of belt/machine bases as a 2-segment jointed elbow + pincer claw swinging smoothly (`simAlpha` interpolated) between source (`inserterProgress = 0`) and target (`inserterProgress = 1`), projecting a soft dark drop shadow underneath.
- **Curved Belt Corner Rails**: When incoming item `sourceDir` or adjacent feeding belts are perpendicular to `b.dir`, belt rails and chevron trajectory curve smoothly along a quarter-circle arc rather than snapping at right angles.
- **Live Indicators**: Active miners/processors render a compact cyan progress bar along the south base edge (`tilePx >= 26`); Alt-Mode (`Alt`) renders crisp recipe item icons, overclock `%` badges, and dashed tunnel link lines (`TUNNEL_DASH = [5, 4]`).

---

## 6. Exoplanet Environment Language

- **Basalt Surface**: `#0f1623` volcanic rock slab modulated by subtle `rgba(255,255,255,0.015)` alternating tile variation and faint `rgba(148, 163, 184, 0.08)` grid lines when `tilePx >= 18`.
- **Mineral Veins**:
  - `iron_ore` (`#273a4f` / `#7ea8d6`), `copper_ore` (`#4a2617` / `#eb7d44`), `coal` (`#14171c` / `#4b5563`), `stone` (`#373a40` / `#9ca3af`), `quartz` (`#3b1e54` / `#d8b4fe`) with deterministic bit-hashed 4-shard crystal clusters per tile.
  - `geothermal_vent` (`#451208` / `#fb923c`): concentric pulsing magma ring (`#fde68a` rim) emitting subtle steam particles and protecting `9x9` central Hub plaza from clutter.
- **Day/Night Lighting**: Smooth twilight ramp across dawn (`dayTime ~ 0.03`) and dusk (`dayTime ~ 0.67`), blending into deep night tint stamped with pre-baked additive/screen radial glow sprites (cyan, amber, indigo).

---

## 7. UI & HUD Visual Direction (UX Lens)

- HUD cards share the obsidian panel vocabulary (`rgba(15, 23, 42, 0.9)`, `1px solid #334155`, `backdrop-filter: blur(8px)`) with tabular numerals (`font-variant-numeric: tabular-nums`) on MW/MJ readouts.
- All text meets `>= 4.5:1` contrast (`#ffffff` on `#0369a1` accent, `#090d16` on `#d97706` primary), scales cleanly via `--ui-scale`, and uses zero inline emojis (`document.createElementNS` SVG for the orbital emblem and procedural `<img>` data URLs for building/item icons). See [hud.md](../ux/hud.md).

---

## 8. Procedural Canvas 2D Asset Standards & Performance Budgets (Tech-Artist Lens)

Aligned to `project.yaml` performance targets (`60 FPS`, `16.67 ms` frame budget, `<= 1500` draw calls, `128 MB` memory ceiling):
- **Offscreen Terrain Cache**: Bake static `64x64` basalt terrain, checkerboard variation, grid, and mineral ore shards once per `world.seed` change into an offscreen `<canvas>`; blit in `1` `drawImage` per frame and draw only visible animated `geothermal_vent` rings on top.
- **Offscreen Minimap Cache**: Bake `64x64` building/resource minimap pixels onto an offscreen canvas refreshed on building change/throttle; draw via `1` `drawImage` + `1` viewport `strokeRect`.
- **Pre-Baked Radial Glow & Item Atlas**: Bake `3` radial glow offscreen canvases (cyan, orange, indigo) and a `19`-item sprite atlas (`normal` + `colorblind`) once at startup so belt rendering blits sprites via `drawImage` instead of stroking paths per visible item/frame.
- **Zero-Allocation Frame Loop**: Reuse scratch `{ x, y }` structs for `beltItemPos`, hoist `TUNNEL_DASH` & chassis helper closures to module scope, pre-cache `%` clock strings, and pool VFX sparks/embers/dust/steam/launch smoke in a flat `TypedArray` `ParticlePool` (`cap = 512`).
- **Graceful Degradation (`reducedMotion`)**: Freeze continuous rotor/chevron/pulse loops and replace rocket flame flicker with steady fade when OS or user `reducedMotion` is active.

---

## 9. Reference Direction

- **Visual Benchmarks**:
  - *Factorio* — Top-down orthographic readability, distinct tier color/chevron speed cues, crisp Alt-Mode machine recipe overlays.
  - *Satisfactory* — FICSIT Amber (`#f59e0b`) + dark industrial slate palette and clean modular building proportions.
  - *Into the Breach / Shapez* — Razor-sharp geometric icons at small grid sizes with non-color shape cues.
- **Anti-References**: Never use noisy photoreal terrain textures that obscure conveyor lines, never use Unicode emoji/icon fonts, and never allocate Canvas gradients or dynamic string keys inside per-frame entity draw loops.
