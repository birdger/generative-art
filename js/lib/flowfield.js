// js/lib/flowfield.js —— 流场：把噪声场变成"角度场"，粒子顺着它走就是风/水流
import { makeNoise2D } from './noise.js';

export const TAU = Math.PI * 2;

export function makeField({ seed = 1, scale = 0.0022, turns = 1.7, timeScale = 0, swirl = 0 } = {}) {
  const n = makeNoise2D(seed);
  const angleAt = (x, y, t = 0) => {
    const v = n.noise01(x * scale, y * scale + t * timeScale);
    const radial = swirl ? Math.atan2(y - 0.5 * 0, x - 0.5 * 0) : 0;
    return v * TAU * turns + radial * swirl;
  };
  const vectorAt = (x, y, t = 0) => {
    const a = angleAt(x, y, t);
    return [Math.cos(a), Math.sin(a), a];
  };
  // 旋度场：F = (∂n/∂y, -∂n/∂x)，天然无散度 → 粒子不会挤成一坨
  const curlAt = (x, y, eps = 1.5, t = 0) => {
    const dx = (n.noise01(x + eps, y + t * timeScale) - n.noise01(x - eps, y + t * timeScale)) / (2 * eps);
    const dy = (n.noise01(x, y + eps + t * timeScale) - n.noise01(x, y - eps + t * timeScale)) / (2 * eps);
    return [dy, -dx];
  };
  return { seed, scale, turns, timeScale, swirl, angleAt, vectorAt, curlAt, noise: n };
}

// 单步推进：粒子沿场走一格，返回新坐标（不改原对象则是纯函数，这里就地改省内存）
export function stepFlow(p, field, speed = 1.2, t = 0) {
  const a = field.angleAt(p.x, p.y, t);
  p.px = p.x;
  p.py = p.y;
  p.a = a;
  p.x += Math.cos(a) * speed * (p.v || 1);
  p.y += Math.sin(a) * speed * (p.v || 1);
  return p;
}

export function makeParticles(count, w, h, rng) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: rng.range(0, w),
      y: rng.range(0, h),
      px: 0,
      py: 0,
      a: 0,
      v: rng.range(0.65, 1.35),
      life: rng.int(120, 520),
      age: 0,
      hue: rng.unit(),
    });
  }
  return list;
}

// 出界或寿终 → 换个地方重生（保持画面里的粒子数恒定）
export function recycle(p, w, h, rng) {
  p.age = 0;
  p.life = rng.int(120, 520);
  p.v = rng.range(0.65, 1.35);
  if (rng.unit() < 0.5) {
    p.x = rng.range(0, w);
    p.y = rng.unit() < 0.5 ? -2 : h + 2;
  } else {
    p.x = rng.unit() < 0.5 ? -2 : w + 2;
    p.y = rng.range(0, h);
  }
  p.px = p.x;
  p.py = p.y;
  return p;
}
