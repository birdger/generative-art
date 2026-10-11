// tools/core.test.mjs —— 纯函数核心库 + 引擎确定性单测（node --test，零依赖）
// 判据不是"看起来对"，而是数学真值：分形集合面积、噪声值域、粒子位移量、配对完整性。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, deriveSeed, toSeedNumber, hashString } from '../js/lib/rng.js';
import { makeNoise2D } from '../js/lib/noise.js';
import { makeField, makeParticles, stepFlow, recycle, TAU } from '../js/lib/flowfield.js';
import { alphaToTargets, bounds, centroids, assignTargets, meanDistance, within } from '../js/lib/textmask.js';
import { hexToRgb, rgbToHex, lerpRgb, ramp, rampLut, shade, paletteRgb, PALETTES } from '../js/lib/palette.js';
import { mandelbrot, julia, smooth, insideRatio, viewToPlane, KNOWN_VIEW } from '../js/lib/fractal.js';

import * as flowSketch from '../js/sketches/flowfield.js';
import * as textSketch from '../js/sketches/particletext.js';
import * as fracSketch from '../js/sketches/fractal.js';

// 桩 p5：记录调用次数即可（引擎只负责状态，绘制靠这层接口）
function stubP() {
  const calls = { line: 0, circle: 0, fill: 0, rect: 0, text: 0, put: 0 };
  const np = () => {};
  return {
    calls,
    noStroke: np, noFill: np, stroke: np, strokeWeight: np, textSize: np, textFont: np, push: np, pop: np,
    translate: np, rotate: np, background: np,
    fill: () => calls.fill++,
    rect: () => calls.rect++,
    line: () => calls.line++,
    circle: () => calls.circle++,
    text: () => calls.text++,
    drawingContext: { putImageData: () => calls.put++ },
  };
}

const rgbaFromMask = (mask) => {
  const h = mask.length;
  const w = mask[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[(y * w + x) * 4 + 3] = mask[y][x] ? 255 : 0;
    }
  }
  return { data, w, h };
};

test('rng：同种子必然同序列，异种子必然不同', () => {
  const a = makeRng(20261011);
  const b = makeRng(20261011);
  const c = makeRng(20261012);
  const sa = Array.from({ length: 8 }, () => a.next());
  const sb = Array.from({ length: 8 }, () => b.next());
  const sc = Array.from({ length: 8 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('rng：range/int/gauss 的边界与分布', () => {
  const r = makeRng('边界测试');
  for (let i = 0; i < 500; i++) {
    const v = r.range(-3, 7);
    assert.ok(v >= -3 && v <= 7, `range 越界 ${v}`);
  }
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3], 'int 应能取到闭区间两端');
  let sum = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) sum += r.gauss(0, 1);
  assert.ok(Math.abs(sum / n) < 0.12, `高斯均值应接近 0，实测 ${(sum / n).toFixed(3)}`);
});

test('rng：deriveSeed 与字符串种子稳定', () => {
  assert.equal(deriveSeed(7, 'a'), deriveSeed(7, 'a'));
  assert.notEqual(deriveSeed(7, 'a'), deriveSeed(7, 'b'));
  assert.ok(toSeedNumber('生成艺术') > 0);
  assert.equal(toSeedNumber(-5), 5);
  assert.equal(hashString('abc'), hashString('abc'));
});

test('noise：值域、确定性、连续性与 fbm 结构', () => {
  const n1 = makeNoise2D(11);
  const n2 = makeNoise2D(11);
  const n3 = makeNoise2D(12);
  let diff = 0;
  let total = 0;
  let maxAbs = 0;
  let prev = null;
  let maxJump = 0;
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      const x = i * 0.37;
      const y = j * 0.29;
      const v = n1.noise01(x, y);
      assert.ok(v >= 0 && v <= 1, `noise01 越界 ${v}`);
      assert.equal(v, n2.noise01(x, y), '同种子噪声必须逐点相等');
      if (n3.noise01(x, y) !== v) diff++;
      total++;
      maxAbs = Math.max(maxAbs, Math.abs(n1.noise2D(x, y)));
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
  }
  assert.equal(diff / total > 0.95, true, `不同种子应有差异，实测差异率 ${(diff / total).toFixed(3)}`);
  assert.ok(maxAbs < 1.2, `柏林噪声幅值不该超过 1.2，实测 ${maxAbs.toFixed(3)}`);
  assert.ok(maxJump < 0.35, `沿轴相邻采样应连续，最大跳变 ${maxJump.toFixed(3)}`);
  const fbmVals = [];
  for (let i = 0; i < 200; i++) fbmVals.push(n1.fbm(i * 0.05, i * 0.031, 5));
  const mean = fbmVals.reduce((s, v) => s + v, 0) / fbmVals.length;
  const varr = fbmVals.reduce((s, v) => s + (v - mean) ** 2, 0) / fbmVals.length;
  assert.ok(varr > 0.005, `fbm 应有结构（方差 ${varr.toFixed(4)}）`);
});

test('flowfield：角度场值域、位移量精确、回收逻辑', () => {
  const field = makeField({ seed: 3, scale: 0.002, turns: 1.7 });
  for (let i = 0; i < 200; i++) {
    const a = field.angleAt(i * 7.3, i * 3.1);
    assert.ok(a >= 0 && a <= TAU * 1.7 + 1e-9, `角度越界 ${a}`);
  }
  const p = { x: 100, y: 100 };
  stepFlow(p, field, 2.5, 0);
  const d = Math.hypot(p.x - 100, p.y - 100);
  assert.ok(Math.abs(d - 2.5) < 1e-9, `一步位移应等于步长，实测 ${d}. px/py 应记录上一点`);
  assert.equal(p.px, 100);
  assert.equal(p.py, 100);

  const rng = makeRng(5);
  const out = { x: 99999, y: -99999, age: 900, life: 100 };
  recycle(out, 800, 600, rng);
  assert.ok(out.x >= -2 && out.x <= 802 && out.y >= -2 && out.y <= 602);
  const onEdge = out.x <= 2 || out.x >= 798 || out.y <= 2 || out.y >= 598;
  assert.ok(onEdge, `回收后应从边缘重生，实测 ${out.x},${out.y}`);

  const ps = makeParticles(50, 800, 600, makeRng(9));
  assert.equal(ps.length, 50);
  assert.ok(ps.every((q) => q.x >= 0 && q.x <= 800 && q.y >= 0 && q.y <= 600 && q.v > 0));
  const c = field.curlAt(400, 300);
  assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]));
  assert.ok(Math.hypot(c[0], c[1]) > 1e-6, '旋度场不应处处为零');
});

test('textmask：掩膜取点、边界、质心、配对完整性', () => {
  const mask = [
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const { data, w, h } = rgbaFromMask(mask);
  const pts = alphaToTargets(data, w, h, { stride: 1, threshold: 128 });
  assert.equal(pts.length, 3);
  assert.deepEqual(pts.map((p) => [p.x, p.y]), [[1, 1], [3, 1], [2, 3]]);
  const coarse = alphaToTargets(data, w, h, { stride: 2, threshold: 128 });
  assert.equal(coarse.length, 0, 'stride=2 只采 (0,2,4) 行列，恰好错过全部亮点 → 0 个目标');
  const diag = rgbaFromMask([
    [1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0],
  ]);
  const diagPts = alphaToTargets(diag.data, diag.w, diag.h, { stride: 2, threshold: 128 });
  assert.deepEqual(diagPts.map((p) => [p.x, p.y]), [[0, 0], [2, 2], [4, 4]], 'stride=2 应对角采到 3 个点');
  assert.equal(alphaToTargets(data, w, h, { stride: 1, maxPoints: 2 }).length, 2, 'maxPoints 应截断');

  const b = bounds(pts);
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [1, 1, 3, 3]);
  assert.equal(b.w, 2);
  assert.equal(b.h, 2);

  const cs = centroids(pts, 2);
  assert.ok(cs.length >= 1 && cs.length <= 4);
  assert.ok(cs.every((c) => c.x >= b.minX - 1e-9 && c.x <= b.maxX + 1e-9 && c.n >= 1));

  const particles = Array.from({ length: 10 }, (_, i) => ({ x: i * 30, y: i * 10 }));
  assignTargets(particles, pts, { order: 'scan' });
  assert.ok(particles.every((p) => Number.isFinite(p.tx) && Number.isFinite(p.ty)));
  const used = new Set(particles.map((p) => `${p.tx},${p.ty}`));
  assert.equal(used.size, 3, '粒子数多于目标点时，每个目标都应被认领');

  const two = [{ x: 0, y: 0, tx: 3, ty: 4 }, { x: 10, y: 10, tx: 10, ty: 10 }];
  assert.equal(meanDistance(two), 2.5);
  assert.equal(within(two, 3), 1);
  assert.equal(within([], 3), 0);
});

test('palette：取色、往返、色带端点与夹紧', () => {
  assert.deepEqual(hexToRgb('#f7f2e8'), [247, 242, 232]);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.throws(() => hexToRgb('nope'), /bad hex/);
  assert.equal(rgbToHex([247, 242, 232]), '#f7f2e8');
  assert.deepEqual(lerpRgb([0, 0, 0], [10, 20, 30], 0.5), [5, 10, 15]);

  const stops = paletteRgb('paper');
  assert.equal(stops.length, PALETTES.paper.length);
  assert.deepEqual(ramp(stops, 0), stops[0]);
  assert.deepEqual(ramp(stops, 1), stops[stops.length - 1]);
  assert.deepEqual(ramp(stops, -5), stops[0], 't<0 应夹到起点');
  assert.deepEqual(ramp(stops, 9), stops[stops.length - 1], 't>1 应夹到终点');
  const mid = ramp(stops, 0.5);
  assert.ok(mid.every((v) => v >= 0 && v <= 255));
  const lut = rampLut(stops, 17);
  assert.equal(lut.length, 17);
  assert.deepEqual(lut[0], stops[0]);
  assert.deepEqual(lut[16], stops[stops.length - 1]);
  assert.ok(shade([100, 100, 100], 0.5)[0] > 100);
  assert.ok(shade([100, 100, 100], -0.5)[0] < 100);
});

test('fractal：逃逸时间的数学真值', () => {
  assert.equal(mandelbrot(0, 0, 200).escaped, false, '原点属于集合');
  assert.equal(mandelbrot(-1, 0, 200).escaped, false, '-1 属于集合');
  assert.equal(mandelbrot(0.25, 0, 200).escaped, false, '0.25 是实轴上的临界内点');
  assert.equal(mandelbrot(0.26, 0, 400).escaped, true, '0.26 已在集合外');
  const far = mandelbrot(2, 2, 200);
  assert.equal(far.escaped, true);
  assert.ok(far.iter <= 3, `远离集合应立刻逃逸，实测 iter=${far.iter}`);
  // 注意：0.3+0.5i 看着像"集合外"，实测 |z| 收敛（iter=200 未逃逸），属于某个小周期泡 —— 不在集合外
  assert.equal(mandelbrot(0.3, 0.5, 200).escaped, false, '0.3+0.5i 属于集合（实测有界）');
  const mid = mandelbrot(0.35, 0.55, 200);
  assert.equal(mid.escaped, true);
  assert.ok(mid.iter > 5 && mid.iter < 60, `0.35+0.55i 的逃逸步数应在 5~60，实测 ${mid.iter}`);
  assert.ok(mandelbrot(0.4, 0.4, 200).iter < 30, '0.4+0.4i 应很快逃逸');
  for (const [x, y] of [[0.35, 0.55], [-1.2, 0.2], [0.1, 0.8], [0.4, 0.4]]) {
    assert.equal(mandelbrot(x, y, 300).iter, mandelbrot(x, -y, 300).iter, '实轴上下应对称');
  }
});

test('fractal：集合面积 = 1.5066 —— 用 320×240 网格实测', () => {
  const ratio = insideRatio({ minX: -2.5, maxX: 1, minY: -1.25, maxY: 1.25, w: 320, h: 240, maxIter: 120 });
  const expected = 1.50659 / (3.5 * 2.5);
  assert.ok(Math.abs(ratio - expected) < 0.015, `实测 ${ratio.toFixed(4)}，理论 ${expected.toFixed(4)}`);
});

test('fractal：Julia 集与平滑着色', () => {
  assert.equal(julia(0, 0, 0, 0, 200).escaped, false, 'c=0 时圆心属于单位圆盘');
  assert.equal(julia(0.5, 0.5, 0, 0, 200).escaped, false, 'c=0 时 |z|<1 不逃逸');
  assert.equal(julia(0.9, 0, 0, 0, 200).escaped, false, 'c=0 时 |z|=0.9 会平方收敛到 0，不逃逸');
  assert.equal(julia(1.2, 0, 0, 0, 200).escaped, true, 'c=0 时 |z|>1 必然逃逸');
  assert.equal(julia(0, 0, -1, 0, 200).escaped, false, 'c=-1 时 0 进入 0↔-1 循环永不逃逸');
  assert.equal(julia(0, 1.2, -1, 0, 200).escaped, true);

  const r = mandelbrot(0.3, 0.5, 200);
  const s = smooth(r.iter, r.modulus, 200);
  assert.ok(s < r.iter + 1 && s > r.iter - 1, `平滑值应贴住整数步数，实测 ${s} vs ${r.iter}`);
  assert.equal(smooth(200, 2, 200), 200, '未逃逸点不参与平滑');

  const view = { width: 1000, height: 500, centerX: -0.75, centerY: 0, span: 3.5 };
  const [cx, cy] = viewToPlane(500, 250, view);
  assert.ok(Math.abs(cx - -0.75) < 1e-9 && Math.abs(cy - 0) < 1e-9, '画布中心应映射到视图中心');
  const [lx] = viewToPlane(400, 250, view);
  const [rx] = viewToPlane(600, 250, view);
  assert.ok(Math.abs((cx - lx) - (rx - cx)) < 1e-9, '左右应等距');
  assert.equal(KNOWN_VIEW.span, 3.5);
});

test('引擎·流场：同种子同状态、异种子异状态、推进可累加', () => {
  const mk = (seed) => flowSketch.create({ width: 900, height: 600, params: {}, seed });
  const a = mk(42);
  const b = mk(42);
  const c = mk(43);
  a.step(30);
  a.step(30);
  b.step(60);
  assert.equal(a.stateHash(), b.stateHash(), 'step(30)+step(30) 必须等于 step(60)');
  c.step(60);
  assert.notEqual(a.stateHash(), c.stateHash(), '不同种子应画出不同画面');
  const st = a.stats();
  assert.equal(st.particles, flowSketch.defaults.count);
  assert.ok(st.angle >= 0 && st.angle <= TAU * flowSketch.defaults.turns + 1);
  assert.equal(st.frames, 60);
  const p = stubP();
  a.draw(p);
  assert.ok(p.calls.line > 0 && p.calls.rect > 0, '流场每帧应画线并铺底色');
});

test('引擎·粒子字：会归位、同种子可复现、换目标点会变', () => {
  const targets = textSketch.syntheticTargets(900, 600, 240);
  const mk = (seed, t = targets) => textSketch.create({ width: 900, height: 600, params: {}, seed, targets: t });
  const a = mk(7);
  const b = mk(7);
  const c = mk(8);
  a.step(600);
  b.step(600);
  c.step(600);
  assert.equal(a.stateHash(), b.stateHash(), '同种子归位过程必须完全一致');
  assert.notEqual(a.stateHash(), c.stateHash());
  const st = a.stats();
  assert.ok(st.meanDist < 3, `600 帧后应基本归位，实测平均偏差 ${st.meanDist}px`);
  assert.ok(st.settled > st.particles * 0.7, `归位粒子应超过 70%，实测 ${st.settled}/${st.particles}`);
  assert.equal(st.targets, new Set(targets.map((t) => `${Math.round(t.x)},${Math.round(t.y)}`)).size);
  assert.equal(st.covered, st.particles, '粒子数少于目标点时，每个粒子都该独占一个目标（不重复）');

  const other = mk(7, textSketch.syntheticTargets(900, 600, 120));
  other.step(600);
  assert.notEqual(a.stateHash(), other.stateHash(), '目标点变了画面就该变');
  const p = stubP();
  a.draw(p);
  assert.ok(p.calls.circle > 0, '粒子字每帧应画点');
  assert.ok(st.meanDist > 0, '粒子应真正在动（不是静止摆拍）');
});

test('引擎·分形：整幅渲染、视图映射、缩放与像素指纹', () => {
  const alloc = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
  const f = fracSketch.create({ width: 360, height: 240, params: {}, seed: 1, allocBuffer: alloc });
  assert.equal(f.params.mode, 'mandelbrot');
  const done = f.renderAll();
  assert.equal(done, true, 'renderAll 应把整幅算完');
  const st = f.stats();
  assert.equal(st.progress, 1);
  assert.ok(st.insideRatio > 0.17 && st.insideRatio < 0.23, `默认视图集合占比应接近 19.7%，实测 ${(st.insideRatio * 100).toFixed(2)}%`);
  assert.equal(st.zoom, 1);
  const h1 = f.pixelHash();
  f.setView({ centerX: -0.75, centerY: 0, span: 3.5 });
  f.renderAll();
  assert.equal(f.pixelHash(), h1, '同一视图重算应得到逐像素相同的图');

  const before = f.view.span;
  const z = f.zoomAt(180, 120, 0.5);
  assert.ok(Math.abs(z - before / 2) < 1e-9, `中心放大一半，实测 ${z}`);
  f.renderAll();
  assert.notEqual(f.pixelHash(), h1, '放大后像素指纹应改变');
  assert.ok(f.stats().zoom === 2);
  f.zoomAt(180, 120, 2);
  assert.ok(Math.abs(f.view.span - before) < 1e-6, '缩小回去应回到原跨度');

  f.setParam('maxIter', 400);
  f.renderAll();
  assert.ok(f.stats().maxIter >= 400);
  f.setParam('mode', 'julia');
  assert.equal(f.stats().mode, 'julia');
  assert.ok(Math.abs(f.view.span - 3.2) < 1e-9, '切到 Julia 应回到 Julia 的默认视图');
  f.renderAll();
  assert.ok(f.stats().insideRatio > 0.01, `Julia(Douady 兔子) 应有实心区，实测 ${f.stats().insideRatio}`);

  const p = stubP();
  f.draw(p);
  assert.ok(p.calls.put > 0, '分形应把缓冲区贴到画布');
  assert.ok(p.calls.text > 0, '分形应显示状态文字');
});

test('引擎·参数与重播', () => {
  const f = flowSketch.create({ width: 600, height: 400, params: { count: 500 }, seed: 1 });
  assert.equal(f.stats().particles, 500);
  f.step(20);
  const h1 = f.stateHash();
  f.reset();
  assert.equal(f.frames, 0);
  f.step(20);
  assert.equal(f.stateHash(), h1, '重播必须回到同一画面');
  f.setParam('count', 800);
  assert.equal(f.stats().particles, 800);
  f.setParam('palette', 'porcelain');
  assert.equal(f.stats().palette, 'porcelain');

  // 回归测试：setSeed 必须真的换种（曾出现"只 rebuild 不换种"的 bug，画面完全不变）
  const g = flowSketch.create({ width: 600, height: 400, params: {}, seed: '甲' });
  g.step(20);
  const withJia = g.stateHash();
  g.setSeed('甲');
  g.step(20);
  assert.equal(g.stateHash(), withJia, '重设同一种子应回到同一画面');
  g.setSeed('乙');
  assert.equal(g.stats().seed, '乙');
  assert.equal(g.frames, 0, '换种子应从 0 帧重新演化');
  g.step(20);
  assert.notEqual(g.stateHash(), withJia, '换种子后画面必须不同');

  const t = textSketch.create({ width: 600, height: 400, params: {}, seed: 1 });
  assert.ok(t.stats().targets > 100, '无掩膜时应退化为合成目标而不是空转');
  t.setParam('palette', 'ink');
  assert.equal(t.stats().palette, 'ink');
  t.setSeed('乙');
  assert.equal(t.stats().seed, '乙');
  const fr = fracSketch.create({ width: 200, height: 140, params: {}, seed: 1, allocBuffer: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) });
  fr.setView({ centerX: -0.75, centerY: 0.1, span: 0.5 });
  assert.ok(Math.abs(fr.view.centerY - 0.1) < 1e-9);
  fr.reset();
  assert.equal(fr.view.span, 3.5);
  assert.equal(fr.setParam('cycle', 5), undefined);
  assert.equal(fr.params.cycle, 5);
});

test('引擎：每个 draw() 都不抛错（三个 sketch 的冒烟测试）', () => {
  const alloc = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
  const engines = [
    flowSketch.create({ width: 320, height: 200, params: {}, seed: 1 }),
    textSketch.create({ width: 320, height: 200, params: {}, seed: 1 }),
    fracSketch.create({ width: 320, height: 200, params: {}, seed: 1, allocBuffer: alloc }),
  ];
  for (const e of engines) {
    e.step(3);
    const p = stubP();
    assert.doesNotThrow(() => e.draw(p), `${e.id} 绘制不应抛错`);
    const s = e.stats();
    assert.equal(typeof s.id, 'string');
    assert.equal(typeof s.frames, 'number');
    assert.ok(s.frames >= 3);
  }
});
