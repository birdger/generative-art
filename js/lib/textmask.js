// js/lib/textmask.js —— 文字 → 目标点：粒子字的核心是"先有掩膜，再让粒子归位"
// 这一层是纯函数（喂 RGBA 数组即可），所以能在 Node 里单测；真正的文字栅格化在 raster.js。
export function alphaToTargets(rgba, w, h, { stride = 4, threshold = 128, maxPoints = Infinity, jitter = 0 } = {}) {
  const pts = [];
  const s = Math.max(1, Math.floor(stride));
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      const i = (y * w + x) * 4 + 3;
      if (rgba[i] >= threshold) {
        pts.push({ x: x + (jitter ? (Math.random() - 0.5) * jitter : 0), y });
        if (pts.length >= maxPoints) return pts;
      }
    }
  }
  return pts;
}

export function bounds(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function centroids(points, cells = 8) {
  // 把目标点按网格分桶后取质心：粒子多、目标点多时先对齐质心能少一半乱飞
  const b = bounds(points);
  const out = [];
  const cw = Math.max(1, b.w / cells);
  const ch = Math.max(1, b.h / cells);
  const grid = new Map();
  for (const p of points) {
    const cx = Math.floor((p.x - b.minX) / cw);
    const cy = Math.floor((p.y - b.minY) / ch);
    const k = cx + ',' + cy;
    const cell = grid.get(k) || { x: 0, y: 0, n: 0 };
    cell.x += p.x;
    cell.y += p.y;
    cell.n++;
    grid.set(k, cell);
  }
  for (const c of grid.values()) out.push({ x: c.x / c.n, y: c.y / c.n, n: c.n });
  return out;
}

// 配对：默认按投影排序后一一对应（比随机配对稳定得多，粒子不会互相穿线）
export function assignTargets(particles, targets, { order = 'scan' } = {}) {
  if (!targets.length) return particles;
  const t = targets.slice();
  const ps = particles.slice();
  if (order === 'scan') {
    const key = (p) => p.x * 0.77 + p.y * 1.31;
    t.sort((a, b) => key(a) - key(b));
    ps.sort((a, b) => key(a) - key(b));
  }
  for (let i = 0; i < ps.length; i++) {
    const tgt = t[i % t.length];
    ps[i].tx = tgt.x;
    ps[i].ty = tgt.y;
  }
  return particles;
}

export function meanDistance(particles) {
  if (!particles.length) return 0;
  let sum = 0;
  for (const p of particles) sum += Math.hypot((p.tx ?? p.x) - p.x, (p.ty ?? p.y) - p.y);
  return sum / particles.length;
}

export function within(particles, tol = 3) {
  let n = 0;
  for (const p of particles) if (Math.hypot((p.tx ?? p.x) - p.x, (p.ty ?? p.y) - p.y) <= tol) n++;
  return n;
}
