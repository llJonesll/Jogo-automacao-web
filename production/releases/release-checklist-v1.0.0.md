# Release Checklist: v1.0.0 -- Web (Desktop Browser)
Generated: 2026-11-17

### Codebase Health
- Scanned: 18 source files under `src/` (17 `.ts` + `style.css`), plus `data/*.json` and `index.html`: 0 TODO, 0 FIXME, 0 HACK
- TODO count: 0
- FIXME count: 0
- HACK count: 0
- Emoji scan across `.ts`/`.html`/`.css`/`.json`: 0 emoji characters found
- Ponytail shortcut markers: 3 documented in `PONYTAIL-DEBT.md` (`0` without upgrade trigger)

### Build Verification
- [x] Clean build succeeds (`npm run typecheck` + `npm run build` -> `dist/` emitted cleanly)
- [x] Zero TypeScript compiler errors (`tsc --noEmit` strict mode)
- [x] Zero runtime npm dependencies (`package.json` contains devDependencies only)
- [x] Build uses relative base (`base: './'`) for static GitHub Pages compatibility
- [x] Build version number set (`1.0.0` in `package.json`, git tag `v1.0.0`)

### Quality Gates
- Open bugs (`production/qa/bugs/`): NOT ASSESSED — no standalone bug records directory (issues found during live browser QA were fixed and re-verified before `v1.0.0`)
- [x] Vitest unit test suite passed: 4 files, 15/15 tests passing (`logistics`, `production`, `power-tech`, `blueprints-save`)
- [x] Live browser QA verified at `http://localhost:4173/` and `http://localhost:4173/?scene=figures`: Title screen, Demo Showcase factory, Tech/Stats/Tweak modals, wrapped hotbar, and unclipped figure labels all passed with `0` console errors

### Content Complete
- [x] Procedural Canvas 2D vector art implemented for all 19 items and 20 buildings
- [x] All user-facing strings localized via `src/ui/i18n.ts` (`pt-BR` default + live `EN` toggle)
- [x] Web Audio procedural SFX implemented with mute toggle (`M`)

### Certification
Certification: omitted — cert_tier is 'none' (internal build, alpha or jam release).

### Go / No-Go: READY

**Rationale:**
All automated TypeScript checks, 15 deterministic simulation/persistence unit tests, zero-emoji verification, production Vite bundle build, and live browser playtest checks passed cleanly without console errors. Direct headless `window.game.state()` call was unavailable inside the isolated browser worker (`webview_browser`), while visual simulation state, live MW telemetry, and Phase 2 item deliveries were directly observed running in the live browser preview.
