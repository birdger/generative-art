// js/main.js —— 画廊外壳：p5 装配、控件面板、以及给验证脚本用的 window.__gen
import { meta as flowMeta, create as createFlow, defaults as flowDefaults } from './sketches/flowfield.js';
import { meta as textMeta, create as createText, defaults as textDefaults } from './sketches/particletext.js';
import { meta as fracMeta, create as createFrac, defaults as fracDefaults } from './sketches/fractal.js';
import { rasterizeText, canvasToPng } from './lib/raster.js';

const SKETCHES = {
  flowfield: { meta: flowMeta, create: createFlow, defaults: flowDefaults },
  particletext: { meta: textMeta, create: createText, defaults: textDefaults },
  fractal: { meta: fracMeta, create: createFrac, defaults: fracDefaults },
};

const state = {
  activeId: 'flowfield',
  seed: '生成艺术-2026',
  engine: null,
  p5i: null,
  frozen: false,
  frames: 0,
  paramsBy: {},
  hostSize: { width: 0, height: 0 },
};

const $ = (sel) => document.querySelector(sel);

function hostSize() {
  const box = $('#host');
  // 用 clientWidth/clientHeight：getBoundingClientRect 含 1px 边框，会让画布比容器高 2px
  return {
    width: Math.max(320, Math.floor(box.clientWidth)),
    height: Math.max(240, Math.floor(box.clientHeight)),
  };
}

function targetsForText(width, height) {
  const params = state.paramsBy.particletext;
  const raster = rasterizeText(params.text ?? '生成艺术', {
    width,
    height,
    fontSize: Math.round(height * 0.62),
    stride: Math.max(2, Math.round(params.density ?? 4)),
    threshold: 128,
    maxPoints: 90000,
  });
  return raster.points;
}

function makeEngine(id) {
  const spec = SKETCHES[id];
  const { width, height } = hostSize();
  state.hostSize = { width, height };
  const params = { ...spec.defaults, ...(state.paramsBy[id] || {}) };
  state.paramsBy[id] = params;
  const opts = { width, height, params, seed: state.seed };
  if (id === 'particletext') opts.targets = targetsForText(width, height);
  return spec.create(opts);
}

function p5Sketch() {
  return (p) => {
    p.setup = () => {
      const engine = state.engine;
      const c = p.createCanvas(engine.width, engine.height);
      c.parent($('#host'));
      c.elt.id = 'sketch-canvas';
      p.pixelDensity(1);          // 固定像素密度：跨机器像素可比，验证才成立
      p.noLoop();
      p.textFont('ui-monospace, Menlo, Consolas, monospace');
      state.p5i = p;
      startDrive();
    };
    p.draw = () => {
      if (!state.engine) return;
      if (!state.frozen) state.engine.step(1);
      state.engine.draw(p);
      state.frames = state.engine.frames;
    };
  };
}

// 全页只允许存在一条 rAF 驱动链：切 sketch 时旧实例被 remove，若每个实例各起一条链，
// 绘制次数会随切换次数累加（第 N 次切换后每帧画 N 次）—— 这是实测过的真 bug，用 driving 闸住。
let driving = false;

function startDrive() {
  if (driving) return;
  driving = true;
  window.requestAnimationFrame(drive);
}

function drive() {
  const p = state.p5i;
  if (!p) {
    window.requestAnimationFrame(drive);
    return;
  }
  try {
    p.redraw(1);
  } catch (err) {
    recordError(err);
  }
  window.requestAnimationFrame(drive);
}

function recordError(err) {
  const msg = err && err.message ? err.message : String(err);
  window.__gen.errors.push(msg);
  console.error(msg);
}

function switchSketch(id) {
  if (!SKETCHES[id]) return false;
  if (state.p5i) {
    try { state.p5i.remove(); } catch (e) { /* 忽略重复移除 */ }
    state.p5i = null;
  }
  const old = $('#host');
  old.innerHTML = '';
  state.activeId = id;
  state.engine = makeEngine(id);
  // eslint-disable-next-line no-undef
  new p5(p5Sketch());
  buildControls();
  buildTabs();
  renderStats();
  return true;
}

function setSeed(seed) {
  state.seed = String(seed);
  // 直接把新种子交给引擎（引擎内部 rebuild）；只调 resize 是不会换种的 —— 这是实测出来的真 bug
  if (typeof state.engine.setSeed === 'function') state.engine.setSeed(state.seed);
  else {
    const size = hostSize();
    state.engine.resize(size.width, size.height);
  }
  if (state.p5i) state.p5i.redraw(1);
  const input = $('#seed-input');
  if (input) input.value = state.seed;
  renderStats();
}

function newSeed() {
  const words = ['风', '苔', '窑', '沙', '雾', '槐', '烬', '砚', '纸', '川'];
  const w = words[Math.floor(Math.random() * words.length)];
  setSeed(`${w}-${Math.floor(Math.random() * 9000 + 1000)}`);
}

function togglePause(force) {
  state.frozen = typeof force === 'boolean' ? force : !state.frozen;
  const b = $('#btn-pause');
  if (b) b.textContent = state.frozen ? '继续' : '暂停';
  return state.frozen;
}

function buildTabs() {
  const nav = $('#tabs');
  nav.innerHTML = '';
  for (const [id, spec] of Object.entries(SKETCHES)) {
    const b = document.createElement('button');
    b.className = 'tab' + (id === state.activeId ? ' active' : '');
    b.dataset.id = id;
    b.textContent = spec.meta.title;
    b.addEventListener('click', () => switchSketch(id));
    nav.appendChild(b);
  }
  const meta = SKETCHES[state.activeId].meta;
  $('#blurb').textContent = meta.blurb;
}

function buildControls() {
  const meta = SKETCHES[state.activeId].meta;
  const params = state.paramsBy[state.activeId];
  const box = $('#controls');
  box.innerHTML = '';
  for (const def of meta.params) {
    const row = document.createElement('label');
    row.className = 'ctrl';
    const name = document.createElement('span');
    name.className = 'ctrl-name';
    name.textContent = def.label;
    row.appendChild(name);
    let input;
    if (def.type === 'select') {
      input = document.createElement('select');
      for (const opt of def.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      }
      input.value = params[def.key];
    } else if (def.type === 'text') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = params[def.key];
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = params[def.key];
    }
    input.dataset.key = def.key;
    const readout = document.createElement('span');
    readout.className = 'ctrl-val';
    readout.textContent = def.type === 'select' || def.type === 'text' ? '' : String(params[def.key]);
    const handler = () => {
      const raw = input.value;
      // 数值参数必须转成 number：否则 params.count 会是字符串 "3600"，
      // 严格比较与后续数学都会踩坑（这是无头验证抓出来的真 bug）
      const numeric = def.type !== 'select' && def.type !== 'text';
      params[def.key] = numeric ? Number(raw) : raw;
      readout.textContent = numeric ? String(params[def.key]) : '';
      if (def.key === 'text') {
        state.engine.setTargets(targetsForText(state.hostSize.width, state.hostSize.height));
      } else {
        state.engine.setParam(def.key, params[def.key]);
      }
      renderStats();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
    row.appendChild(input);
    row.appendChild(readout);
    box.appendChild(row);
  }
}

function renderStats() {
  if (!state.engine) return;
  const s = state.engine.stats();
  const bits = [`种子 ${state.seed}`, `${s.frames} 帧`];
  if (s.particles) bits.push(`${s.particles} 粒子`);
  if (s.settled !== undefined) bits.push(`归位 ${s.settled} · 平均偏差 ${s.meanDist}px`);
  if (s.targets) bits.push(`目标点 ${s.targets}`);
  if (s.zoom) bits.push(`放大 ×${s.zoom}`);
  if (s.insideRatio !== undefined) bits.push(`集合占比 ${(s.insideRatio * 100).toFixed(2)}%`);
  if (s.hash) bits.push(`指纹 ${s.hash}`);
  $('#stats').textContent = bits.join('  ·  ');
}

// ---------------- 验证 API（无头浏览器唯一的抓手） ----------------
window.__gen = {
  errors: [],
  ready: false,
  get sketchIds() { return Object.keys(SKETCHES); },
  get active() { return state.activeId; },
  status() {
    const e = state.engine;
    const canvases = [...document.querySelectorAll('canvas')].map((c) => [c.id, c.width, c.height]);
    return {
      active: state.activeId,
      seed: state.seed,
      frozen: state.frozen,
      frames: e ? e.frames : 0,
      params: e ? { ...e.params } : {},
      canvases,
      pixelDensity: state.p5i ? state.p5i.pixelDensity() : null,
      errors: window.__gen.errors.length,
    };
  },
  stats: () => (state.engine ? state.engine.stats() : null),
  sketchMeta: () => Object.fromEntries(Object.entries(SKETCHES).map(([id, s]) => [id, { title: s.meta.title, params: s.meta.params.map((p) => p.key) }])),
  setSketch(id) { const ok = switchSketch(id); return ok; },
  setSeed(seed) { setSeed(seed); return state.seed; },
  setParam(key, value) {
    const def = SKETCHES[state.activeId].meta.params.find((p) => p.key === key);
    const numeric = !def || (def.type !== 'select' && def.type !== 'text');
    const val = numeric ? Number(value) : value;
    state.paramsBy[state.activeId][key] = val;
    if (key === 'text') state.engine.setTargets(targetsForText(state.hostSize.width, state.hostSize.height));
    else state.engine.setParam(key, val);
    const input = $(`#controls input[data-key="${key}"], #controls select[data-key="${key}"]`);
    if (input) input.value = String(val);
    renderStats();
    return val;
  },
  freeze(v = true) { state.frozen = !!v; return state.frozen; },
  advance(n = 60) {
    const e = state.engine;
    state.frozen = true;
    e.step(n);
    if (state.p5i) state.p5i.redraw(1);
    state.frames = e.frames;
    renderStats();
    return e.stats();
  },
  finishRender() {
    if (state.engine && state.engine.renderAll) {
      const done = state.engine.renderAll();
      if (state.p5i) state.p5i.redraw(1);
      return done;
    }
    return true;
  },
  reset() { state.engine.reset(); if (state.p5i) state.p5i.redraw(1); renderStats(); return state.engine.stats(); },
  zoom(factor, px, py) {
    if (!state.engine.zoomAt) return null;
    const s = state.engine.zoomAt(px ?? state.hostSize.width / 2, py ?? state.hostSize.height / 2, factor);
    state.engine.renderAll && state.engine.renderAll();
    if (state.p5i) state.p5i.redraw(1);
    renderStats();
    return s;
  },
  pixelProbe(selector = '#sketch-canvas', { stride = 2, bits = 4 } = {}) {
    const el = document.querySelector(selector);
    if (!el) return { error: 'no canvas ' + selector };
    const g = el.getContext('2d');
    const w = el.width;
    const h = el.height;
    const data = g.getImageData(0, 0, w, h).data;
    const shift = 8 - bits;
    const counts = new Map();
    let samples = 0;
    let sum = [0, 0, 0];
    let alphaSum = 0;
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const i = (y * w + x) * 4;
        const key = ((data[i] >> shift) << (bits * 2)) | ((data[i + 1] >> shift) << bits) | (data[i + 2] >> shift);
        counts.set(key, (counts.get(key) || 0) + 1);
        sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
        alphaSum += data[i + 3];
        samples++;
      }
    }
    let dominant = 0;
    for (const v of counts.values()) if (v > dominant) dominant = v;
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < data.length; i += 4 * 53) hash = Math.imul(hash ^ data[i + 1], 16777619);
    return {
      size: [w, h],
      samples,
      colors: counts.size,
      dominantRatio: Math.round((dominant / samples) * 1e4) / 1e4,
      nonBackground: Math.round((1 - dominant / samples) * 1e4) / 1e4,
      mean: sum.map((v) => Math.round(v / samples)),
      alpha: Math.round(alphaSum / samples),
      hash: (hash >>> 0).toString(16).padStart(8, '0'),
    };
  },
  exportPNG(name = 'sketch.png') {
    const el = document.querySelector('#sketch-canvas');
    if (!el) return null;
    return canvasToPng(el, name);
  },
};

// ---------------- 启动 ----------------
function boot() {
  buildTabs();
  state.engine = makeEngine(state.activeId);
  // eslint-disable-next-line no-undef
  new p5(p5Sketch());
  buildControls();
  renderStats();
  setInterval(renderStats, 1000);

  $('#seed-input').value = state.seed;
  $('#seed-input').addEventListener('change', (e) => setSeed(e.target.value));
  $('#btn-seed').addEventListener('click', newSeed);
  $('#btn-reset').addEventListener('click', () => { state.engine.reset(); state.p5i && state.p5i.redraw(1); renderStats(); });
  $('#btn-pause').addEventListener('click', () => togglePause());
  $('#btn-save').addEventListener('click', () => canvasToPng(document.querySelector('#sketch-canvas'), `generative-art-${state.activeId}-${state.seed}.png`));
  $('#btn-in').addEventListener('click', () => { state.engine.zoomAt && state.engine.zoomAt(state.hostSize.width / 2, state.hostSize.height / 2, 0.6); state.engine.renderAll && state.engine.renderAll(); state.p5i && state.p5i.redraw(1); });
  $('#btn-out').addEventListener('click', () => { state.engine.zoomAt && state.engine.zoomAt(state.hostSize.width / 2, state.hostSize.height / 2, 1 / 0.6); state.engine.renderAll && state.engine.renderAll(); state.p5i && state.p5i.redraw(1); });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const { width, height } = hostSize();
      state.hostSize = { width, height };
      if (state.p5i) state.p5i.resizeCanvas(width, height);
      if (state.engine.resize) state.engine.resize(width, height);
      if (state.activeId === 'particletext') state.engine.setTargets(targetsForText(width, height));
      state.p5i && state.p5i.redraw(1);
      renderStats();
    }, 180);
  });

  window.addEventListener('error', (e) => recordError(e.message));
  window.addEventListener('unhandledrejection', (e) => recordError(e.reason));

  // 快捷键：1/2/3 切 sketch，空格暂停，R 重播，S 存图，N 换种子
  window.addEventListener('keydown', (e) => {
    const ids = Object.keys(SKETCHES);
    if (['1', '2', '3'].includes(e.key)) switchSketch(ids[Number(e.key) - 1]);
    else if (e.key === ' ') {
      const tag = (e.target && e.target.tagName) || '';
      // 输入框里要能正常打空格；按钮自己会响应空格，若这里再切一次就是"双重切换"（实测踩过）
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON') { e.preventDefault(); return; }
      togglePause();
      e.preventDefault();
    }
    else if (e.key.toLowerCase() === 'r') { state.engine.reset(); state.p5i && state.p5i.redraw(1); }
    else if (e.key.toLowerCase() === 's') window.__gen.exportPNG(`generative-art-${state.activeId}-${state.seed}.png`);
    else if (e.key.toLowerCase() === 'n') newSeed();
  });

  // 画布上滚轮 = 缩放（分形）；拖拽平移
  $('#host').addEventListener('wheel', (e) => {
    const eng = state.engine;
    if (!eng.zoomAt) return;
    e.preventDefault();
    const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
    eng.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 1.18 : 0.85);
    eng.renderAll && eng.renderAll();
    state.p5i && state.p5i.redraw(1);
    renderStats();
  }, { passive: false });

  window.__gen.ready = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
