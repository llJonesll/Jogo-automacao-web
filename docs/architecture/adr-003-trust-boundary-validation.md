# ADR-003: Trust-Boundary Validation & Anti-XSS Serialization

- **Status:** Accepted
- **Date:** 2026-11-17
- **System Owners:** `src/game/save.ts`, `src/game/blueprints.ts`, `src/ui/hud.ts`, `data/schemas/*.schema.json`

## Context
Players load factory saves from `localStorage` or uploaded `.json` files and import Base64 `AFBP1:` blueprint strings from external sources. Unchecked `JSON.parse` spreads, missing schema bounds, invalid `ItemId`/`ResourceType` indices, `telemetry.bucketIndex` overflows, prototype pollution keys (`__proto__`, `constructor`), oversized files, and `innerHTML` usage can crash rendering (`ORE_PALETTE[res]`), bypass tech gates (`clock > 1.0`), freeze the browser, or create DOM XSS vulnerabilities.

## Decision
1. **Strict Fail-Closed Deserialization (`save.ts` & `blueprints.ts`)**:
   - Reject non-object roots and root arrays (`Array.isArray(data)`), ignore/block prototype pollution keys (`__proto__`, `constructor`, `prototype`), and validate UTF-8 payloads using `new TextDecoder('utf-8', { fatal: true })`.
   - Enforce structural bounds and allow-lists without object-spreading untrusted data: validate `version === 1`, `size === 64`, finite clamped numbers, valid `ResourceType` per tile, `buildings <= 4096`, `slots.length <= 2`, `tunnelQueue.length <= 10`, valid `ItemId` / `BuildingId` / `Direction`, recipe-to-building ownership (`RECIPES[id].building === type`), `telemetry.bucketIndex` (`0..59`), `phaseIndex` bounds, and 1:1 `grid` <-> `buildings` bijection preserving the `3x3` Orbital Hub at `(31,31)`.
   - Clamp blueprint/save overclock values (`clock = 1.0`) when `overclock` is not unlocked and `free_build < 1`.
2. **Resource & DoS Guards**:
   - Enforce `raw.length <= 4_000_000` bytes on save JSON, `file.size <= 4_000_000` before `file.text()`, `trimmed.length <= 64_000` on `AFBP1:` strings, reject duplicate blueprint `(dx, dy)` entries, and cap `window.game.step(sec)` at `<= 3600` simulation seconds per call.
   - Surface storage write failures cleanly via localized error toast instead of silently ignoring `false` returns.
3. **Zero `innerHTML` Policy**:
   - All HUD and SVG DOM nodes use `document.createElement`, `document.createElementNS`, and `textContent`; user-supplied blueprint/save strings are never passed to `innerHTML` or `eval`.

## Consequences
- **Positive:** Untrusted or corrupted saves and blueprints return structured error codes with zero partial world mutation and zero XSS attack surface.
- **Negative:** Any addition to `WorldState` or `BlueprintData` requires updating explicit schema sanitization logic alongside `data/schemas/*.schema.json` and `tests/unit/security-fuzz.test.ts`.

## References
- [factory-systems.md](../../design/gdd/factory-systems.md)
- [control-manifest.md](./control-manifest.md)
