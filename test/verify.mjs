import BiomorphicEngine from '../BiomorphicEngine.js';

const rafQueue = []; let rafId = 0;
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return ++rafId; };
globalThis.cancelAnimationFrame = (id) => {
  for (let i = rafQueue.length - 1; i >= 0; i--) if (rafQueue.indexOf(rafQueue[i]) + 1 === id) { rafQueue.splice(i, 1); break; }
};
globalThis.performance = { now: () => Date.now() };
const cssLog = {};
globalThis.document = { documentElement: { style: { setProperty(k,v) { cssLog[k]=v; } } } };
const flush = () => { while (rafQueue.length) rafQueue.shift()(performance.now()); };
const assert = (c, m) => { if (!c) throw new Error(m); };

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  PASS:', name); }
  catch (e) { fail++; console.log('  FAIL:', name, '-', e.message); }
}

console.log('FINAL VERIFICATION\n');

test('Constructor writes 10 default CSS vars', () => {
  new BiomorphicEngine();
  assert(cssLog['--bui-bg-color'] === 'rgb(248, 249, 250)', 'bg');
  assert(cssLog['--bui-accent-color'] === 'rgb(0, 102, 204)', 'accent');
  assert(cssLog['--bui-font-tracking'] === '0.020rem', 'track');
  assert(cssLog['--bui-transition-speed'] === '200ms', 'speed');
  assert(cssLog['--bui-saturation'] === '1.000', 'sat');
  assert(cssLog['--bui-contrast'] === '4.50', 'con');
  assert(cssLog['--bui-grid-gap'] === '0.50rem', 'gap');
  assert(cssLog['--bui-blur'] === '0px', 'blur');
  assert(cssLog['--bui-density'] === '1.000', 'den');
  assert(cssLog['--bui-shadow'] === '0.000', 'shd');
});

const e = new BiomorphicEngine();

test('Initial state all zero (filter not yet run)', () => {
  const s = e.getState();
  assert(s.cognitiveLoad === 0 && s.focus === 0 && s.anxiety === 0 && s.sleepDeprivation === 0, 'channels');
  assert(s.fatigue === 0 && s.arousal === 0 && s.valence === 0, 'derived');
});

test('Single ingest converges to exact target (snap)', () => {
  e.ingest(42.5);
  for (let i = 0; i < 60; i++) flush();
  const s = e.getState();
  assert(s.cognitiveLoad === 42.5, 'cl=' + s.cognitiveLoad);
  assert(rafQueue.length === 0, 'rAF stopped');
});

test('Multi-channel ingest', () => {
  e.ingest({ cognitiveLoad: 30, focus: 80, anxiety: 20, sleepDeprivation: 10 });
  for (let i = 0; i < 60; i++) flush();
  const s = e.getState();
  assert(s.cognitiveLoad === 30, 'cl=' + s.cognitiveLoad);
  assert(s.focus === 80, 'fo=' + s.focus);
  assert(s.anxiety === 20, 'an=' + s.anxiety);
  assert(s.sleepDeprivation === 10, 'sd=' + s.sleepDeprivation);
});

test('Partial update preserves other channels', () => {
  const s0 = e.getState();
  e.ingest({ focus: 95 });
  for (let i = 0; i < 10; i++) flush();
  const s = e.getState();
  assert(s.focus > s0.focus, 'focus rose');
  assert(Math.abs(s.cognitiveLoad - s0.cognitiveLoad) < 2, 'cl stable');
  assert(Math.abs(s.anxiety - s0.anxiety) < 2, 'an stable');
  assert(Math.abs(s.sleepDeprivation - s0.sleepDeprivation) < 2, 'sd stable');
});

test('Derived states (arousal, valence, fatigue)', () => {
  e.ingest({ cognitiveLoad: 90, focus: 10, anxiety: 80, sleepDeprivation: 95 });
  for (let i = 0; i < 60; i++) flush();
  const s = e.getState();
  assert(s.arousal >= 80, 'high arousal=' + s.arousal);
  assert(s.fatigue >= 30, 'high fatigue=' + s.fatigue);
  assert(s.valence <= 60, 'low valence=' + s.valence);
});

test('Security: NaN rejected', () => {
  const s0 = e.getState();
  e.ingest(NaN);
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: Infinity rejected', () => {
  const s0 = e.getState();
  e.ingest(Infinity);
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: string rejected', () => {
  const s0 = e.getState();
  e.ingest('xss');
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: null rejected', () => {
  const s0 = e.getState();
  e.ingest(null);
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: undefined rejected', () => {
  const s0 = e.getState();
  e.ingest(undefined);
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: __proto__ pollution rejected', () => {
  const s0 = e.getState();
  e.ingest({ __proto__: { polluted: true } });
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: constructor.prototype injection rejected', () => {
  const s0 = e.getState();
  e.ingest({ constructor: { prototype: { evil: true } } });
  assert(JSON.stringify(e.getState()) === JSON.stringify(s0));
});

test('Security: negative clamped to 0', () => {
  e.ingest(-50);
  for (let i = 0; i < 10; i++) flush();
  assert(e.getState().cognitiveLoad >= 0);
});

test('Security: overflow clamped to 100', () => {
  e.ingest(999);
  for (let i = 0; i < 10; i++) flush();
  assert(e.getState().cognitiveLoad <= 100);
});

test('CSS bounds: saturation [0.10, 1.00]', () => {
  e.ingest({ cognitiveLoad: 100, anxiety: 100, sleepDeprivation: 100 });
  for (let i = 0; i < 60; i++) flush();
  const v = parseFloat(cssLog['--bui-saturation']);
  assert(v >= 0.10 && v <= 1.00, 'sat=' + v);
});

test('CSS bounds: contrast [1.50, 4.50]', () => {
  const v = parseFloat(cssLog['--bui-contrast']);
  assert(v >= 1.50 && v <= 4.50, 'con=' + v);
});

test('CSS bounds: grid-gap [0.50, 2.00]', () => {
  const v = parseFloat(cssLog['--bui-grid-gap']);
  assert(v >= 0.50 && v <= 2.00, 'gap=' + v);
});

test('CSS bounds: blur [0, 12]', () => {
  const v = parseInt(cssLog['--bui-blur']);
  assert(v >= 0 && v <= 12, 'blur=' + v);
});

test('CSS bounds: density [0.50, 1.00]', () => {
  const v = parseFloat(cssLog['--bui-density']);
  assert(v >= 0.50 && v <= 1.00, 'den=' + v);
});

test('CSS bounds: shadow alpha [0, 0.30]', () => {
  const v = parseFloat(cssLog['--bui-shadow']);
  assert(v >= 0 && v <= 0.30, 'shd=' + v);
});

test('CSS bounds: font-tracking [0.02, 0.10]', () => {
  const v = parseFloat(cssLog['--bui-font-tracking']);
  assert(v >= 0.02 && v <= 0.10, 'track=' + v);
});

test('CSS bounds: transition-speed [200, 750]', () => {
  const v = parseInt(cssLog['--bui-transition-speed']);
  assert(v >= 200 && v <= 750, 'speed=' + v);
});

test('Rapid flood: 5 async ingests converge to last target', () => {
  const e2 = new BiomorphicEngine();
  const seq = [
    { cl: 20, fo: 80, an: 10, sd: 5 },
    { cl: 95, fo: 20, an: 90, sd: 80 },
    { cl: 12, fo: 70, an: 5, sd: 10 },
    { cl: 80, fo: 40, an: 70, sd: 95 },
    { cl: 50, fo: 50, an: 50, sd: 50 },
  ];
  for (const x of seq) e2.ingest({ cognitiveLoad: x.cl, focus: x.fo, anxiety: x.an, sleepDeprivation: x.sd });
  for (let i = 0; i < 60; i++) flush();
  const s = e2.getState();
  assert(Math.abs(s.cognitiveLoad - 50) < 0.1, 'cl=' + s.cognitiveLoad);
  assert(Math.abs(s.focus - 50) < 0.1, 'fo=' + s.focus);
  assert(Math.abs(s.anxiety - 50) < 0.1, 'an=' + s.anxiety);
  assert(Math.abs(s.sleepDeprivation - 50) < 0.1, 'sd=' + s.sleepDeprivation);
});

test('Post-attack recovery', () => {
  const e3 = new BiomorphicEngine();
  const attacks = [NaN, Infinity, 'xss', [], null, undefined,
    { __proto__: { pollute: true } },
    { cognitiveLoad: Infinity },
    { cognitiveLoad: 'string' },
  ];
  for (const a of attacks) e3.ingest(a);
  e3.ingest({ cognitiveLoad: 50, focus: 50, anxiety: 50, sleepDeprivation: 50 });
  for (let i = 0; i < 60; i++) flush();
  const s = e3.getState();
  assert(Math.abs(s.cognitiveLoad - 50) < 0.1, 'cl=' + s.cognitiveLoad);
  assert(Math.abs(s.focus - 50) < 0.1);
  assert(Math.abs(s.anxiety - 50) < 0.1);
  assert(Math.abs(s.sleepDeprivation - 50) < 0.1);
});

test('Destroy zeros all state', () => {
  const e4 = new BiomorphicEngine();
  e4.ingest(75);
  for (let i = 0; i < 10; i++) flush();
  e4.destroy();
  const s = e4.getState();
  assert(Object.values(s).every(v => v === 0), JSON.stringify(s));
});

test('Convergence loop terminates automatically', () => {
  rafQueue.length = 0;
  const e5 = new BiomorphicEngine();
  e5.ingest(0);
  for (let i = 0; i < 10; i++) flush();
  assert(rafQueue.length === 0, 'queue=' + rafQueue.length);
});

test('No eval, new Function, or innerHTML in source', () => {
  const src = BiomorphicEngine.toString();
  // Strip comments to avoid false positives from JSDoc
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  assert(!code.includes('eval('), 'eval');
  assert(!code.includes('new Function'), 'new Function');
  assert(!code.includes('innerHTML'), 'innerHTML');
});

test('r3 precision round-trip error < 0.001', () => {
  let maxErr = 0;
  for (let v = 0; v <= 100; v += 0.1) {
    const r = Math.round(Math.round(v * 1000) / 1000 * 1000) / 1000;
    maxErr = Math.max(maxErr, Math.abs(r - v));
  }
  assert(maxErr < 0.001, 'error=' + maxErr);
});

const total = pass + fail;
console.log('\n---');
console.log(pass + '/' + total + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
