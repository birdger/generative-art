// js/sketches/particletext.js —— sketch 2：粒子字
// 文字 → 目标点（掩膜）→ 粒子从四周飞回队列；归位后就是一行字。
import { makeRng, deriveSeed } from '../lib/rng.js';
import { assignTargets, meanDistance, within } from '../lib/textmask.js';
import { paletteRgb, ramp, rampLut } from '../lib/palette.js';
import { makeNoise2D } from '../lib/noise.js';

export const meta = {
  id: 'particletext',
  title: '粒子字',
  blurb: '把文字拆成目标点，几百个粒子从画面外飞回来排队 —— 归位后是一行字',
  params: [
    { key: 'text', label: '文字', type: 'text', value: '生成艺术' },
    { key: 'density', label: '采样密度', min: 2, max: 9, step: 1, value: 4 },
    { key: 'spring', label: '归位弹性', min: 0.01, max: 0.3, step: 0.005, value: 0.085 },
    { key: 'damp', label: '阻尼', min: 0.7, max: 0.99, step: 0.01, value: 0.92 },
    { key: 'jitter', label: '游移', min: 0, max: 2.5, step: 0.05, value: 0.9 },
    { key: 'dot', label: '点径', min: 0.6, max: 5, step: 0.1, value: 1.7 },
    { key: 'palette', label: '色板', type: 'select', options: ['paper', 'ember', 'porcelain', 'ink'], value: 'ember' },
    { key: 'bg', label: '底色', type: 'select', options: ['paper', 'night'], value: 'paper' },
  ],
};

const BGS = { paper: [247, 242, 232], night: [24, 21, 19] };
export const defaults = Object.fromEntries(meta.params.map((p) => [p.key, p.value]));

// 没有掩膜时（例如 Node 单测）退化成一个圆环，保证引擎永远能跑
export function syntheticTargets(width, height, count = 220) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.3;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export function create({ width = 1440, height = 900, params = {}, seed = 1, targets = null } = {}) {
  const P = { ...defaults, ...params };
  let curSeed = seed;
  let w = width;
  let h = height;
  let list = [];
  let rng;
  let noise;
  let lut;
  let frames = 0;
  let needsClear = true;
  let targetCount = 0;

  function rebuild(nextTargets = targets) {
    rng = makeRng(deriveSeed(curSeed, 'particles'));
    noise = makeNoise2D(deriveSeed(curSeed, 'wander'));
    lut = rampLut(paletteRgb(P.palette), 64);
    const raw = nextTargets && nextTargets.length ? nextTargets : syntheticTargets(w, h, 260);
    // 目标点按取整后的像素去重：同一像素只留一个目标，统计口径才等于"画面上的点"
    const uniq = new Map();
    for (const t of raw) uniq.set(`${Math.round(t.x)},${Math.round(t.y)}`, { x: Math.round(t.x), y: Math.round(t.y) });
    const tgt = [...uniq.values()];
    targetCount = tgt.length;
    // 粒子数略少于目标点：留出空气，字才透气
    const n = Math.max(24, Math.round(tgt.length * 0.92));
    list = [];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rad = Math.max(w, h) * rng.range(0.45, 0.75);
      list.push({
        x: w / 2 + Math.cos(a) * rad,
        y: h / 2 + Math.sin(a) * rad,
        vx: 0,
        vy: 0,
        tx: 0,
        ty: 0,
        k: rng.range(0.85, 1.15),
        hue: rng.unit(),
      });
    }
    assignTargets(list, tgt, { order: 'scan' });
    frames = 0;
    needsClear = true;
  }
  rebuild();

  function step(n = 1) {
    for (let f = 0; f < n; f++) {
      const decay = Math.exp(-frames / 90);
      for (const q of list) {
        const wob = P.jitter * decay;
        const nx = noise.noise2D(q.tx * 0.004 + frames * 0.0015, q.ty * 0.004);
        const ny = noise.noise2D(q.ty * 0.004, q.tx * 0.004 + frames * 0.0015);
        const gx = q.tx + nx * 14 * wob;
        const gy = q.ty + ny * 14 * wob;
        q.vx = (q.vx + (gx - q.x) * P.spring * q.k) * P.damp;
        q.vy = (q.vy + (gy - q.y) * P.spring * q.k) * P.damp;
        q.x += q.vx;
        q.y += q.vy;
      }
      frames++;
    }
  }

  function draw(p) {
    const bg = BGS[P.bg] || BGS.paper;
    p.noStroke();
    p.fill(bg[0], bg[1], bg[2], needsClear ? 255 : 60);
    p.rect(0, 0, w, h);
    needsClear = false;
    for (const q of list) {
      const c = ramp(lut, 0.15 + 0.7 * q.hue);
      const sp = Math.min(1, Math.hypot(q.vx, q.vy) / 6);
      p.fill(c[0], c[1], c[2], 150 + 105 * (1 - sp));
      p.circle(q.x, q.y, P.dot + sp * 1.6);
    }
  }

  const stateHash = () => {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < list.length; i += 3) {
      const s = `${Math.round(list[i].x)},${Math.round(list[i].y)};`;
      for (let k = 0; k < s.length; k++) hash = Math.imul(hash ^ s.charCodeAt(k), 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  return {
    id: 'particletext',
    get width() { return w; },
    get height() { return h; },
    get frames() { return frames; },
    params: P,
    get seed() { return curSeed; },
    setSeed(next) { curSeed = next; rebuild(); return curSeed; },
    step,
    draw,
    reset: () => rebuild(),
    setTargets(t) { rebuild(t); },
    resize(nw, nh) { w = nw; h = nh; rebuild(); },
    setParam(key, value) {
      const structural = ['density', 'palette'].includes(key);
      P[key] = value;
      if (key === 'palette') lut = rampLut(paletteRgb(P.palette), 64);
      if (structural) rebuild();
    },
    stats() {
      const covered = new Set(list.map((q) => `${q.tx},${q.ty}`)).size;
      return {
        id: 'particletext',
        frames,
        seed: curSeed,
        particles: list.length,
        targets: targetCount,
        covered,
        text: P.text,
        meanDist: Math.round(meanDistance(list) * 100) / 100,
        settled: within(list, 3),
        palette: P.palette,
        hash: stateHash(),
      };
    },
    stateHash,
  };
}
