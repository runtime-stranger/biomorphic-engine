/**
 * BiomorphicEngine v2 — headless konsol testi
 * Çok-kanallı girdi, validation, filtre, CSS çıktısı, convergence
 */
import BiomorphicEngine from '../BiomorphicEngine.js';

const rafQueue = [];
let rafId = 0;
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return ++rafId; };
globalThis.cancelAnimationFrame = (id) => {
  for (let i = rafQueue.length - 1; i >= 0; i--) {
    if (rafQueue.indexOf(rafQueue[i]) + 1 === id) { rafQueue.splice(i, 1); break; }
  }
};
globalThis.performance = { now: () => Date.now() };

const cssProps = {};
globalThis.document = {
  documentElement: {
    style: { setProperty(k, v) { cssProps[k] = v; } }
  }
};

function flushRAF() {
  while (rafQueue.length > 0) {
    const fn = rafQueue.shift();
    fn(performance.now());
  }
}

const passed = [], failed = [];
function test(name, fn) {
  try { fn(); passed.push(name); console.log(`  ✅ ${name}`); }
  catch (e) { failed.push(name); console.log(`  ❌ ${name}: ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

console.log('\n🧪 BiomorphicEngine v2 — Konsol Testi\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ---- 1. Constructor --------------------------------------------------------
const eng = new BiomorphicEngine();
test('Constructor CSS değişkenlerini yazar (10 adet)', () => {
  assert(cssProps['--bui-bg-color'] === 'rgb(248, 249, 250)');
  assert(cssProps['--bui-accent-color'] === 'rgb(0, 102, 204)');
  assert(cssProps['--bui-font-tracking'] === '0.020rem');
  assert(cssProps['--bui-transition-speed'] === '200ms');
  assert(cssProps['--bui-saturation'] === '1.000');
  assert(cssProps['--bui-contrast'] === '4.50');
  assert(cssProps['--bui-grid-gap'] === '0.50rem');
  assert(cssProps['--bui-blur'] === '0px');
  assert(cssProps['--bui-density'] === '1.000');
  assert(cssProps['--bui-shadow'] === '0.000');
});
test('İlk state tüm kanallar 0 (filter henüz çalışmadı)', () => {
  const s = eng.getState();
  assert(s.cognitiveLoad === 0, `cognitiveLoad=${s.cognitiveLoad}`);
  assert(s.focus === 0, `focus=${s.focus}`);
  assert(s.anxiety === 0, `anxiety=${s.anxiety}`);
  assert(s.sleepDeprivation === 0, `sleepDep=${s.sleepDeprivation}`);
  assert(s.fatigue === 0, `fatigue=${s.fatigue}`);
  assert(s.arousal === 0, `arousal=${s.arousal}`);
  assert(s.valence === 0, `valence=${s.valence}`);
});

// ---- 2. Legacy single-number input ------------------------------------------
test('ingest(number) → cognitiveLoad güncellenir', () => {
  cssProps['--bui-saturation'] = '';
  eng.ingest(50);
  flushRAF();
  const s = eng.getState();
  assert(s.cognitiveLoad > 0 && s.cognitiveLoad <= 50);
  assert(cssProps['--bui-saturation'] !== '');
});

// ---- 3. Multi-channel object input ------------------------------------------
test('ingest({...}) çok kanallı çalışır', () => {
  eng.ingest({ cognitiveLoad: 80, focus: 90, anxiety: 20, sleepDeprivation: 10 });
  flushRAF();
  const s = eng.getState();
  assert(s.cognitiveLoad > 0); assert(s.focus > 0);
  assert(s.anxiety >= 0); assert(s.sleepDeprivation >= 0);
});

test('ingest({}) kısmi kanallar — sadece focus değişir, diğer kanallar etkilenmez', () => {
  // Tüm kanalları sıfırla ve yakınsamaya bırak
  rafQueue.length = 0;
  eng.ingest({ cognitiveLoad: 0, focus: 0, anxiety: 0, sleepDeprivation: 0 });
  // Tam yakınsama için bol frame
  for (let i = 0; i < 500; i++) flushRAF();

  // Şimdi sadece focus gönder
  const s0 = eng.getState();
  eng.ingest({ focus: 95 });
  for (let i = 0; i < 10; i++) flushRAF(); // birkaç frame bekle
  const s = eng.getState();

  assert(s.focus > s0.focus + 0.5, `focus artmalı: ${s0.focus} → ${s.focus}`);
  // Diğer kanallar çok az değişebilir (yuvarlama), epsilon kullan
  const eps = 0.5;
  assert(Math.abs(s.cognitiveLoad - s0.cognitiveLoad) < eps,
    `cognitiveLoad çok değişmemeli: ${s0.cognitiveLoad} → ${s.cognitiveLoad}`);
  assert(Math.abs(s.anxiety - s0.anxiety) < eps,
    `anxiety çok değişmemeli: ${s0.anxiety} → ${s.anxiety}`);
  assert(Math.abs(s.sleepDeprivation - s0.sleepDeprivation) < eps,
    `sleepDep çok değişmemeli: ${s0.sleepDeprivation} → ${s.sleepDeprivation}`);
});

// ---- 4. Validation ----------------------------------------------------------
test('NaN reddedilir', () => {
  const s0 = eng.getState();
  eng.ingest(NaN);
  assert(eng.getState().cognitiveLoad === s0.cognitiveLoad);
});
test('Infinity reddedilir', () => {
  const s0 = eng.getState();
  eng.ingest(Infinity);
  assert(eng.getState().cognitiveLoad === s0.cognitiveLoad);
});
test('String reddedilir', () => {
  const s0 = eng.getState();
  eng.ingest('abc');
  assert(eng.getState().cognitiveLoad === s0.cognitiveLoad);
});
test('Object (prototype pollution) reddedilir', () => {
  const s0 = eng.getState();
  eng.ingest({ __proto__: { polluted: true } });
  assert(eng.getState().cognitiveLoad === s0.cognitiveLoad);
});
test('Negatif → 0 kırpılır', () => {
  eng.ingest(-10); flushRAF();
  assert(eng.getState().cognitiveLoad >= 0);
});
test('100+ → 100 kırpılır', () => {
  eng.ingest(999); flushRAF();
  assert(eng.getState().cognitiveLoad <= 100);
});

// ---- 5. Derived neural states -----------------------------------------------
test('Yüksek anxiety → arousal yükselir', () => {
  eng.ingest({ cognitiveLoad: 20, anxiety: 90, focus: 10 });
  flushRAF();
  const s = eng.getState();
  assert(s.arousal > 40, `arousal=${s.arousal}`);
});
test('Yüksek sleepDeprivation → fatigue yükselir', () => {
  eng.ingest({ cognitiveLoad: 30, sleepDeprivation: 95, focus: 20 });
  flushRAF();
  const s = eng.getState();
  assert(s.fatigue > 20, `fatigue=${s.fatigue}`);
});

// ---- 6. Yeni CSS değişkenleri -----------------------------------------------
test('Yüksek anxiety → saturation düşer', () => {
  eng.ingest({ cognitiveLoad: 10, anxiety: 95, focus: 80 });
  flushRAF();
  const sat = parseFloat(cssProps['--bui-saturation']);
  assert(sat < 0.70, `saturation=${sat}`);
});
test('Yüksek fatigue → blur artar', () => {
  eng.ingest({ cognitiveLoad: 90, sleepDeprivation: 90, anxiety: 50 });
  flushRAF();
  const blur = parseInt(cssProps['--bui-blur']);
  assert(blur > 0, `blur=${blur}px`);
});
test('Yüksek anxiety → shadow artar', () => {
  eng.ingest({ cognitiveLoad: 10, anxiety: 90, focus: 50 });
  flushRAF();
  const shd = parseFloat(cssProps['--bui-shadow']);
  assert(shd > 0.10, `shadow=${shd}`);
});

// ---- 7. Convergence & Destroy -----------------------------------------------
test('Convergence sonrası rAF otomatik durur', () => {
  rafQueue.length = 0;
  eng.ingest(0); flushRAF();
  assert(rafQueue.length === 0, `rAF kuyruğu=${rafQueue.length}`);
});
test('Destroy state sıfırlar', () => {
  eng.ingest(75); flushRAF();
  eng.destroy();
  const s = eng.getState();
  assert(s.cognitiveLoad === 0); assert(s.focus === 0);
  assert(s.anxiety === 0); assert(s.sleepDeprivation === 0);
});

// ---- Rapor ------------------------------------------------------------------
const total = passed.length + failed.length;
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n📊 ${passed.length}/${total} test geçti`);
if (failed.length > 0) {
  console.log(`   ${failed.length} test BAŞARISIZ`);
  process.exit(1);
} else {
  console.log('\n🎉 Tüm testler başarılı!');
}
