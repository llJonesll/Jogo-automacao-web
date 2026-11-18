/**
 * Deterministic 32-bit seeded PRNG (Mulberry32).
 * Never use Math.random() in world generation or simulation.
 */
export function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
