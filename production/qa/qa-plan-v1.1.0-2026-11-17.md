# QA Plan — AETHERFORGE: Orbital Foundry v1.1.0

- **Release Scope:** `v1.1.0` Multi-Pillar Studio Refinement (Engine, Render/Audio, UX/Accessibility, Docs/Governance)
- **Date:** 2026-11-17
- **Rigor Tier:** `standard` (`project.yaml`)
- **Platform:** Desktop & Responsive Web Browser (`TypeScript` + `Canvas 2D` + `Web Audio`, zero runtime dependencies)
- **Cert Tier:** `none`

---

## 1. Objectives & Entry / Exit Criteria

### Entry Criteria
- All 4 Wave 1 branches (`swarm/render-audio`, `swarm/studio-docs`, `swarm/ux-a11y`, `swarm/sim-engine`) merged cleanly to `main`.
- Cross-wiring of `RenderOptions`, `FiguresGalleryLabels`, `ParticlePool.spawnBurst`, `SoundEngine.emit`, `updateAmbient`, Audio Mix sliders + Mono toggle, and decoupled `HudActions` complete.
- `npm run typecheck` compiles with `0` errors.

### Exit Criteria
- `npm run typecheck`: `0` TypeScript errors under `strict: true`.
- `npm test`: `100%` pass across all `7` Vitest suites (`32` tests: logistics, production, power-tech, blueprints-save, data-schema, security-fuzz, soak).
- `npm run build`: Clean production bundle emitted in `dist/` with relative `./` base.
- Live headless Microsoft Edge CDP smoke check against `vite preview`: `0` uncaught exceptions, `0` console errors across `?scene=figures`, `?scene=figures&lang=en`, Title, Demo Showcase, Tweak Audio Mix, Tech Modal, Power Overlay, and Keyboard cursor actions.
- Zero emoji characters across `src/`, `data/`, `index.html`, `design/`, and `docs/`.
- `0` open `CRITICAL` or `HIGH` bugs in `production/qa/bugs/`.

---

## 2. Test Coverage Matrix

| Area | Verification Method | Target Budget / Pass Rule | Source |
|---|---|---|---|
| Simulation Determinism & Conservation | Vitest `logistics`, `production`, `soak` | N/E/S/W zero bias; 100% item conservation over 4,000 ticks; dismantle refunds buffers | `tests/unit/logistics.test.ts`, `tests/unit/soak.test.ts` |
| Economy, Tech DAG & Progression | Vitest `power-tech`, `data-schema`, `soak` | Zero orphaned items/recipes/features; Tier 2->3->4 monotonic cost; Phases 1–5 Victory | `tests/unit/data-schema.test.ts`, `tests/unit/soak.test.ts` |
| JSON Schema & i18n Parity | Vitest `data-schema` | 5/5 JSON schemas validated; 100% `PT-BR`/`EN` key parity across 19 items, 20 buildings, 14 recipes, 6 techs, 5 phases, 7 statuses, 7 tweaks | `tests/unit/data-schema.test.ts` |
| Trust Boundaries & Fuzzing | Vitest `security-fuzz`, `blueprints-save` | Root arrays, `__proto__`, invalid resources, mismatched recipe-building, `clock` tampering rejected fail-closed | `tests/unit/security-fuzz.test.ts` |
| Performance & Memory Churn | Node/Vite megafactory soak (`545` entities) | `< 2.0 ms/tick` target (`< 5.0 ms/tick` hard test gate) over 1,200 ticks | `project.yaml`, `tests/unit/soak.test.ts` |
| Rendering & `?scene=figures` | Headless Edge CDP on `vite preview` | All 19 items + 20 buildings rendered in `PT-BR` & `EN` with `0` runtime/console errors | `src/render/sprites.ts`, `src/render/renderer.ts` |
| UX, Accessibility & Audio | Headless Edge CDP + Code Audit | Non-destructive DOM patching, WCAG 2.1 AA contrast, 4 colorblind palettes, `--ui-scale`, Gamepad + Keyboard cursor, 20 `AudioEventId` events + Mix/Mono persistence | `design/accessibility-requirements.md`, `design/ux/hud.md` |

---

## 3. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-module interface drift (`ColorblindMode` `'default'` vs `'none'`) | Medium | Medium | Mapped `'default'` -> `'none'` in `main.ts` & `hud.ts` (`toSpriteCb`) and verified in `tsc --noEmit` |
| Desync between `data/factory_techs.json` feature flags & code | Medium | High | Removed unused `"blueprints"` feature token from `tier_3_electronics`; enforced active feature check in `data-schema.test.ts` |
| Tampered save / `AFBP1:` blueprint XSS or crash | Low | Critical | Fail-closed validation in `save.ts` & `blueprints.ts`, zero `innerHTML`, `4 MB` upload guard, `security-fuzz.test.ts` |
| Manual multi-hour human playtest soak not run interactively | Medium | Low | Mitigated with 3,600–4,000-tick deterministic Node soak tests (`~180–200s` sim time each) + live Edge CDP smoke; explicitly flagged in `soak-test-2026-11-17.md` |
