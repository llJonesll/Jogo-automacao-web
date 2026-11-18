# Security Audit Report — AETHERFORGE: Orbital Foundry v1.1.0

- **Date:** 2026-11-17
- **Scope:** Full Security Audit (`standard` rigor, offline single-player static Web build)
- **Platform Profile (`project.yaml`):** `targets: ["Web"]`, `multiplayer: false`, `online: false`, `cert_tier: "none"`
- **Verdict:** **CLEAR TO SHIP** — `0` open `CRITICAL` or `HIGH` runtime findings

---

## 1. Dependency Inventory & `npm audit` Results

AETHERFORGE ships **zero external runtime dependencies** (`package.json` contains no `dependencies` block; all runtime code is pure TypeScript compiled by Vite into static assets under `dist/`).

### Production / Runtime Dependency Audit (`npm audit --omit=dev --json`)
- **Exit Code:** `0`
- **Vulnerabilities:** `0` (`info: 0`, `low: 0`, `moderate: 0`, `high: 0`, `critical: 0`)
- **Shipped Third-Party Runtime Packages:** `0`

### Full Dev Toolchain Audit (`npm audit --json`)
- **Exit Code:** `1` (`devDependencies` only — `vite`, `vitest`, and transitive dev-only packages; **none of these ship in `dist/`**):
  - `tinypool` (`<=2.1.1`, via `vitest`): `critical` (`GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr` — prototype pollution in worker options)
  - `vitest` (`>=0.0.95`): `critical`/`moderate` (via `tinypool`, `picomatch`, `tinyglobby`, `@vitest/mocker` `GHSA-82fw-gwwq-j7x9`, `GHSA-qxg6-89mg-rqv8`)
  - `vite` (`>=6.3.0-beta.0`), `fdir`, `tinyglobby`, `picomatch` (`<=4.0.7`): `high` (`GHSA-fc5q-39xc-vjpf` — ReDoS in extglob matching)
- **Exposure Assessment:** These advisories exist solely inside local developer/CI build & test runner tooling (`devDependencies`), never in `dist/` production output or end-user browser execution. Post-`v1.1.0` maintenance should evaluate upgrading `vitest` (`5.x`) and `vite` when Node/toolchain compatibility is scheduled.

---

## 2. Trust Boundary Checklist

| Boundary / Module | Threats Evaluated | Implemented Controls | Verified By |
|---|---|---|---|
| **Save JSON Import (`src/game/save.ts`)** | Prototype pollution (`__proto__`, `constructor`, `prototype`), root array `[...]`, malformed `resources[]` renderer crash, out-of-range `telemetry.bucketIndex`, duplicate/overlapping coordinates, `buildings > 4096`, `NaN`/`Infinity` numbers, oversized payloads | `deserializeWorld` caps input size, rejects `Array.isArray(data)`, filters `FORBIDDEN_KEYS` on all item maps while allowing valid `BuildingId` `'constructor'`, validates every `resources[i]` against valid `ResourceType`, enforces `slots <= 2`, `tunnelQueue <= 10`, `bucketIndex in 0..59`, `bucketTick in 0..19`, `phaseIndex <= ORBITAL_PHASES.length`, and 1:1 `grid <-> buildings` bijection before returning `ok: true` | `tests/unit/security-fuzz.test.ts` (`3/3` PASS), `tests/unit/blueprints-save.test.ts` (`4/4` PASS) |
| **Blueprint `AFBP1:` Codec (`src/game/blueprints.ts`)** | Corrupt Base64 / invalid UTF-8 sequences, oversized strings, duplicate `(dx, dy)` entries, `recipeId` on non-processors, cross-building `recipeId` mismatch, Tier 4 `overclock` bypass | `decodeBlueprint` enforces `AFBP1:` prefix and `<= 64,000` chars, decodes via `new TextDecoder('utf-8', { fatal: true })`, rejects root arrays and `entries.length > width * height`, rejects duplicate `(dx, dy)` coords, forbids `recipeId` on non-processors, verifies `RECIPES[id].building === type`; `placeBlueprint` clamps `clock` to `1.0` if Tier 4 `overclock` is locked and `free_build < 1` | `tests/unit/security-fuzz.test.ts`, `tests/unit/blueprints-save.test.ts` |
| **DOM / XSS & File Upload (`src/ui/hud.ts`)** | DOM-based XSS via imported blueprint/save strings, OOM freeze on giant file upload | Zero `innerHTML`, `outerHTML`, or `eval(` calls across `src/` (`git grep` verified); all DOM & SVG nodes built via `document.createElement`, `createElementNS`, and `textContent`; save upload checks `file.size <= 4_000_000` before `await file.text()` | `git grep` static scan + `src/ui/hud.ts` review |
| **Automation Hook (`src/hook.ts`, `src/main.ts`)** | Synchronous tab freeze via unbounded `window.game.step(sec)` / `hold(k, sec)` | `step(sec)` clamps `MAX_HOOK_STEP_SECONDS = 3600` (`72,000` ticks max); `hold(k, sec)` clamps `60s`; non-finite/non-positive inputs ignored cleanly | `src/hook.ts`, `src/main.ts` |
| **Multiplayer / Network Surface (`project.yaml`)** | Network/auth/PII leakage | `platform.multiplayer: false`, `platform.online: false` — zero network requests, zero cookies/analytics, strictly local `localStorage` preferences/autosave | `project.yaml`, code scan |

---

## 3. Static Scan Evidence

- `git grep -n "innerHTML\|outerHTML\|eval(" -- src/`: **`0` matches**
- `git grep -n "Math\.random" -- src/`: **`0` gameplay/runtime usages** (comment-only mention in `src/core/rng.ts:3`)
- `git grep -nE "TODO|FIXME|HACK" -- src/ data/ index.html`: **`0` matches**

---

## 4. Open Findings Summary

- **CRITICAL (Runtime / Shipped Code):** `0`
- **HIGH (Runtime / Shipped Code):** `0`
- **MODERATE / LOW (Runtime / Shipped Code):** `0`
- **Dev-Only Toolchain Notes:** `vitest` / `vite` `devDependencies` advisories logged above; zero runtime impact on shipped `dist/` static files.
