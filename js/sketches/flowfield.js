// js/sketches/flowfield.js —— sketch 1：流场
// 引擎只维护状态（粒子/场），绘制由 p5 负责；step() 完全确定 → 同种子必然同画面。
import { makeField, makeParticles, stepFlow, recycle } from '../lib/flowfield.js';
import { makeRng, deriveSeed } from '../lib/rng.js';
import { paletteRgb, ramp, rampLut } from '../lib/palette.js';

export const meta = {
  id: 'flowfield',
  title: '流场',
  blurb: '噪声角度场里的粒子拖尾 —— 像风穿过麦田，也像深海里的洋流',
  params: [
    { key: 'count', label: '粒子数', min: 400, max: 6000, step: 100, value: 2400 },
    { key: 'speed', label: '步长', min: 0.2, max: 4, step: 0.05, value: 1.5 },
    { key: 'scale', label: '场尺度', min: 0.0004, max: 0.008, step: 0.0001, value: 0.0019 },
    { key: 'turns', label: '旋转圈数', min: 0.2, max: 4, step: 0.1, value: 1.8 },
    { key: 'trail', label: '拖尾长度', min: 2, max: 80, step: 1, value: 18 },
    { key: 'weight', label: '笔宽', min: 0.4, max: 3, step: 0.1, value: 0.9 },
    { key: 'palette', label: '色板', type: 'select', options: ['paper', 'ember', 'porcelain', 'ink'], value: 'paper' },
    { key: 'bg', label: '底色', type: 'select', options: ['paper', 'night'], value: 'paper' },
  ],
};

const BGS = { paper: [247, 242, 232], night: [24, 21, 19] };

export const defaults = Object.fromEntries(meta.params.map((p) => [p.key, p.value]));

export function create({ width = 1440, height = 900, params = {}, seed = 1 } = {}) {
  const P = { ...defaults, ...params };
  let curSeed = seed;   // 种子必须可变：否则 setSeed 只重建不换种，画面根本不会变（实测踩过）
  let w = width;
  let h = height;
  let rng;
  let field;
  let particles;
  let lut;
  let frames = 0;
  let needsClear = true;

  function rebuild() {
    rng = makeRng(deriveSeed(curSeed, 'flow-particles'));
    field = makeField({ seed: deriveSeed(curSeed, 'flow-field'), scale: P.scale, turns: P.turns });
    particles = makeParticles(Math.max(1, Math.round(P.count)), w, h, rng);
    lut = rampLut(paletteRgb(P.palette), 64);
    frames = 0;
    needsClear = true;
  }
  rebuild();

  function step(n = 1) {
    for (let f = 0; f < n; f++) {
      const t = frames * 0.0025;
      for (const q of particles) {
        stepFlow(q, field, P.speed, t);
        q.age++;
        if (q.x < -40 || q.x > w + 40 || q.y < -40 || q.y > h + 40 || q.age > q.life) recycle(q, w, h, rng);
      }
      frames++;
    }
  }

  function draw(p) {
    const bg = BGS[P.bg] || BGS.paper;
    const fade = Math.max(3, Math.min(90, Math.round(255 / P.trail)));
    p.noStroke();
    p.fill(bg[0], bg[1], bg[2], needsClear ? 255 : fade);
    p.rect(0, 0, w, h);
    needsClear = false;
    p.strokeWeight(P.weight);
    for (const q of particles) {
      const c = ramp(lut, 0.92 - 0.78 * q.hue);
      const lifeK = 1 - Math.min(1, q.age / Math.max(1, q.life));
      p.stroke(c[0], c[1], c[2], 40 + 170 * lifeK);
      p.line(q.px, q.py, q.x, q.y);
    }
    p.noFill();
  }

  function stateHash() {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < particles.length; i += 3) {
      const q = particles[i];
      const s = `${Math.round(q.x)},${Math.round(q.y)};`;
      for (let k = 0; k < s.length; k++) hash = Math.imul(hash ^ s.charCodeAt(k), 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  return {
    id: 'flowfield',
    get width() { return w; },
    get height() { return h; },
    get frames() { return frames; },
    params: P,
    get seed() { return curSeed; },
    setSeed(next) { curSeed = next; rebuild(); return curSeed; },
    step,
    draw,
    reset: rebuild,
    resize(nw, nh) { w = nw; h = nh; rebuild(); },
    setParam(key, value) {
      P[key] = value;
      if (['count', 'scale', 'turns'].includes(key)) rebuild();
      if (key === 'palette') lut = rampLut(paletteRgb(P.palette), 64);
    },
    stats() {
      const q = particles[0];
      return {
        id: 'flowfield',
        frames,
        seed: curSeed,
        particles: particles.length,
        head: [Math.round(q.x), Math.round(q.y)],
        angle: Math.round(field.angleAt(w / 2, h / 2) * 1000) / 1000,
        palette: P.palette,
        bg: P.bg,
        hash: stateHash(),
      };
    },
    stateHash,
  };
}
