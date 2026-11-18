# Release Checklist: v1.1.0 -- Web (Desktop & Responsive Browser)

- **Generated:** 2026-11-17
- **Version:** `1.1.0` (`package.json`)
- **Rigor / Cert Tier:** `standard` / `none` (`project.yaml`)

---

### Codebase Health
- **Scanned:** `20` files under `src/` (`19` `.ts` + `1` `.css`), `10` `.json` files under `data/` (`5` data + `5` schemas), `7` `.ts` test suites under `tests/unit/`, `10` files under `design/`, `12` files under `docs/`, and `index.html`:
  - **TODO count:** `0`
  - **FIXME count:** `0`
  - **HACK count:** `0`
  - **`innerHTML` / `outerHTML` / `eval(` count in `src/`:** `0`
- **Emoji scan across `53` source/data/html/design/docs files:** `0` emoji characters found
- **Ponytail shortcut markers (`src/`):** `8` documented in [`PONYTAIL-DEBT.md`](../../PONYTAIL-DEBT.md) (`8 markers, 0 with no trigger.`)

---

### Build Size, Reproducibility & Dependencies
- [x] Clean production build succeeds (`npm run typecheck` + `npm run build` -> `dist/` emitted cleanly in `502 ms`)
- [x] Zero TypeScript compiler errors (`tsc --noEmit` strict mode)
- [x] Zero external runtime npm dependencies (`package.json` has zero `dependencies`; `npm audit --omit=dev` reports `0` vulnerabilities)
- [x] Build uses relative base (`base: './'`) for static GitHub Pages compatibility
- [x] Bundle footprint (`26` modules): `dist/index.html` `0.57 kB` (`0.34 kB` gzip), CSS `12.34 kB` (`3.12 kB` gzip), JS `206.65 kB` (`61.68 kB` gzip)
- [x] Build version set to `"1.1.0"` in `package.json`

---

### Quality Gates, Performance & Soak
- **Open bugs (`production/qa/bugs/`):** `0` open CRITICAL/HIGH/MEDIUM/LOW bugs (`production/qa/bugs/.gitkeep` present)
- [x] Vitest suite passed: **`7` files, `32/32` tests passing** (`production`, `logistics`, `power-tech`, `data-schema`, `blueprints-save`, `security-fuzz`, `soak`)
- [x] `data/*.json` validated against `data/schemas/*.schema.json` + 100% `PT-BR`/`EN` key parity asserted in `tests/unit/data-schema.test.ts`
- [x] Megafactory deterministic soak (`545` active entities, `1,200` ticks): **`0.0951 ms/tick`** (`< 2.0 ms` `tick_budget_ms` in `project.yaml`)
- [x] Item conservation & save parity soaks (`4,000` ticks closed-loop conservation; `3,600` ticks Demo day/night; `1,500` ticks save/load parity; Phases 1–5 victory) passed (`production/qa/soak-test-2026-11-17.md`)
- [x] Live headless Microsoft Edge CDP smoke check against `vite preview --port 4173`: Title, Demo Showcase (`78` buildings, `174.87 MW`), `window.game.step(30)`, Tweak Audio Mix sliders + Mono `localStorage` persistence, Power Overlay (`V`), Tech modal (`T`), Keyboard grid cursor (`I/J/K/L`, `Enter`, `Delete`), `/?scene=figures`, and `/?scene=figures&lang=en` all passed with **`0` console errors** (`production/qa/smoke-2026-11-17.md`)

---

### Security & Platform Readiness
- [x] Full Security Audit (`production/security/security-audit-2026-11-17-full.md`): `0` CRITICAL/HIGH runtime findings; fail-closed validation on `save.ts`, `blueprints.ts`, `4 MB` upload cap, `3600s` hook step cap; `platform.multiplayer: false`, `platform.online: false`
- [x] Procedural Canvas 2D vector silhouettes for all `19` items & `20` buildings with offscreen caches + `ParticlePool` + `simAlpha` interpolation
- [x] Web Audio `AudioEventId` event bus (`20` events) + Master/SFX/UI/Ambient mix + Mono downmix + visual toast captions
- [x] Full Mouse + Keyboard + Gamepad parity, WCAG 2.1 Level AA contrast, 4 colorblind palettes with non-color cues, `--ui-scale`, `prefers-reduced-motion` + rocket skip, and 100% `PT-BR`/`EN` localization
- [x] QA Sign-Off approved (`production/qa/qa-signoff-v1.1.0-2026-11-17.md`)

---

### Certification
Certification: omitted — `cert_tier` is `'none'` (internal/web release per `project.yaml`).

---

### Launch Readiness & Sign-Offs
- **Design & Governance:** [`design/registry/entities.yaml`](../../design/registry/entities.yaml), [`design/gdd/factory-systems.md`](../../design/gdd/factory-systems.md), [`docs/architecture/control-manifest.md`](../../docs/architecture/control-manifest.md) — Verified
- **QA Sign-Off:** [`production/qa/qa-signoff-v1.1.0-2026-11-17.md`](../qa/qa-signoff-v1.1.0-2026-11-17.md) — Approved
- **Security Sign-Off:** [`production/security/security-audit-2026-11-17-full.md`](../security/security-audit-2026-11-17-full.md) — Clear to Ship
- **Polish & Performance Report:** [`production/polish/factory-report-2026-11-17.md`](../polish/factory-report-2026-11-17.md) — Verified (`0.0951 ms/tick` @ 545 entities)

### Go / No-Go: READY

**Rationale:**
All automated TypeScript checks (`0` errors), `32/32` Vitest tests across `7` suites (unit, schema/i18n parity, security fuzzing, and multi-thousand-tick deterministic soaks), `0`-emoji compliance scan, `0`-runtime-vulnerability audit (`npm audit --omit=dev`), `dist/` Vite production build, and live headless Edge CDP smoke verification passed cleanly with zero open bugs.
