// js/lib/rng.js —— 可复现伪随机（种子 → 固定序列，Node 与浏览器结果一致）
// 生成艺术的第一原则：同一 seed 必须画出同一张图，否则"作品"不可复现。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h ^ (h >>> 15)) >>> 0;
}

export function toSeedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.abs(Math.trunc(seed)) >>> 0 || 1;
  return hashString(String(seed ?? '')) || 1;
}

export function makeRng(seed) {
  const seedNum = toSeedNumber(seed);
  const next = mulberry32(seedNum);
  return {
    seed: seedNum,
    next,
    unit: () => next(),
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))],
    sign: () => (next() < 0.5 ? -1 : 1),
    // Box–Muller：需要"自然聚散"的粒子云时比均匀分布好看
    gauss: (mean = 0, sd = 1) => {
      const u = Math.max(1e-9, next());
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

// 由种子派生"子种子"：让多个子系统共享一个总种子，又能独立复现
export function deriveSeed(seed, label) {
  return (toSeedNumber(seed) ^ hashString(String(label))) >>> 0 || 1;
}
