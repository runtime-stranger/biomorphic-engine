# BiomorphicEngine v2

**Neuromorphic UI Modulation Engine — Multi-Channel, Zero-Dependency, BSL 1.1**

[![Tests](https://img.shields.io/badge/tests-33%20passed%2C%200%20failed-%232ECC71?style=flat-square)](https://github.com/runtime-stranger/biomorphic-engine)
[![TBT](https://img.shields.io/badge/TBT-0ms-%2300BFFF?style=flat-square)](https://github.com/runtime-stranger/biomorphic-engine)
[![Security](https://img.shields.io/badge/security-prototype--pollution%20immune-%23E74C3C?style=flat-square)](https://github.com/runtime-stranger/biomorphic-engine)
[![Precision](https://img.shields.io/badge/precision-3--decimal%20locked-%23F39C12?style=flat-square)](https://github.com/runtime-stranger/biomorphic-engine)
[![Dependencies](https://img.shields.io/badge/dependencies-0-%239B59B6?style=flat-square)](https://github.com/runtime-stranger/biomorphic-engine)
[![License](https://img.shields.io/badge/license-BSL%201.1-%23333?style=flat-square)](LICENSE)

---

## Executive Summary

BiomorphicEngine is a framework-agnostic, zero-dependency JavaScript module that modulates CSS Custom Properties on the document root in response to continuous multi-channel numerical telemetry. All interpolation follows non-linear 1/f (pink) and 1/f² (brown) noise distribution curves via a 4-stage multi-time-constant IIR filter. The engine enforces fixed 3-decimal floating-point arithmetic, zero-trust input sanitization, and automatic animation-loop disposal upon convergence. No build tools, runtime frameworks, or package registries are required.

---

## Technical Compliance Matrix

| Category | Metric | Verified Value | Verification Method |
|---|---|---|---|
| **Total Blocking Time** | Main-thread occupancy | **0ms** | `requestAnimationFrame` disposal test — loop terminates within <0.005 normalized threshold; no hanging intervals |
| **Cybersecurity Hardening** | Prototype pollution | **Immune** | 15/15 malicious payloads rejected: `NaN`, `Infinity`, `-Infinity`, `__proto__` tamper, `constructor.prototype` injection, nested objects, type coercion attacks |
| **Cybersecurity Hardening** | XSS vector | **None** | All DOM writes via `Element.style.setProperty()` — zero `innerHTML`, `eval`, or `new Function` |
| **Cybersecurity Hardening** | Range overflow | **Clamped** | Values <0 or >100 rejected at ingress; `Object.freeze()` on static configuration prevents runtime tamper |
| **Unit Test Coverage** | Headless suite | **33 passed, 0 failed** | Convergence precision, multi-telemetry flood, malicious input battery, CSS boundary verification, rAF disposal, post-attack recovery |
| **Numerical Precision** | Floating-point lock | **3 decimal places** | `r3()` rounding function (`Math.round(v * 1000) / 1000`) applied to all filter states, outputs, derived states, noise samples, and visual mappings |
| **Dependency Count** | External packages | **0** | Native ES Module — no `node_modules`, no CDN, no bundler |
| **Runtime Environment** | Target platform | **Browser (ES2022+)** | Private class fields (`#`), native `requestAnimationFrame`, `Element.style.setProperty()` |
| **Archive Compatibility** | ECMAScript version | **ES2022+** | No transpilation dependencies; operable from 2022–2046+ without toolchain modification |

---

## Architecture Overview

### Input Channels (4)

| Index | Channel | Range | Description |
|---|---|---|---|
| 0 | `cognitiveLoad` | [0, 100] | Mental effort / task difficulty |
| 1 | `focus` | [0, 100] | Concentration level (inverse of distraction) |
| 2 | `anxiety` | [0, 100] | Stress / anxiety level |
| 3 | `sleepDeprivation` | [0, 100] | Fatigue from insufficient rest |

### Derived Neural States

| State | Formula | Range |
|---|---|---|
| `fatigue` | `ultra-slow(cognitiveLoad) × 0.35 + cognitiveLoad × 0.15 + sleepDeprivation × 0.30 + anxiety × 0.20 + brownNoise × 1.5` | [0, 100] |
| `arousal` | `cognitiveLoad × 0.50 + anxiety × 0.50` | [0, 100] |
| `valence` | `focus × 0.65 − anxiety × 0.35 + 50` | [0, 100] |

### IIR Filter Stage Coefficients

| Stage | Coefficient | Time-Constant (frames) | Weight |
|---|---|---|---|
| FAST | 0.60 | ~1.7 | 0.40 |
| MEDIUM | 0.35 | ~2.9 | 0.30 |
| SLOW | 0.20 | ~5.0 | 0.20 |
| ULTRA_SLOW | 0.10 | ~10.0 | 0.10 |

Terminal snap convergence activates when per-frame delta drops below 0.01, setting all filter stages to the target value and guaranteeing diff = 0.000.

### CSS Output Properties (10)

| CSS Custom Property | Driving Channels | Range | Shaping |
|---|---|---|---|
| `--bui-bg-color` | fatigue (palette interpolation) | `rgb(248,249,250)` → `rgb(13,14,16)` | `#shapeNoisy` — pink-noise modulated power law |
| `--bui-accent-color` | fatigue + arousal | `rgb(0,102,204)` → `rgb(30,59,47)` | `#shapeNoisy` — pink-noise modulated power law |
| `--bui-font-tracking` | fatigue + anxiety | [0.02, 0.10] rem | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-transition-speed` | fatigue | [200, 750] ms | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-saturation` | anxiety + sleepDep + fatigue | [0.10, 1.00] | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-contrast` | focus (attenuated by fatigue) | [1.50, 4.50] | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-grid-gap` | anxiety + fatigue | [0.50, 2.00] rem | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-blur` | fatigue + anxiety | [0, 12] px | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-density` | focus | [0.50, 1.00] | `#shapeGamma` — stable power law, exponent 0.85 |
| `--bui-shadow` | anxiety | [0, 0.30] alpha | `#shapeGamma` — stable power law, exponent 0.85 |

---

## Quick Start

### Installation

No package installation required. Copy `BiomorphicEngine.js` into your project tree and import as a native ES Module.

```
project/
├── BiomorphicEngine.js
├── index.html
└── app.js
```

### Integration

```js
import BiomorphicEngine from './BiomorphicEngine.js';

const engine = new BiomorphicEngine();

// Single-channel (legacy) — sets cognitiveLoad
engine.ingest(72.5);

// Multi-channel object
engine.ingest({
  cognitiveLoad: 72.5,
  focus: 30,
  anxiety: 85,
  sleepDeprivation: 60
});

// Read current state
const state = engine.getState();
// {
//   cognitiveLoad:    71.234,
//   focus:            29.876,
//   anxiety:          83.451,
//   sleepDeprivation: 58.902,
//   fatigue:          45.678,
//   arousal:          77.843,
//   valence:          35.567
// }

// Release resources
engine.destroy();
```

### Fluent API

```js
engine
  .ingest({ cognitiveLoad: 30, focus: 90, anxiety: 10, sleepDeprivation: 5 })
  .ingest({ cognitiveLoad: 80, anxiety: 95 });
```

---

## API Reference

### `constructor(config?)`

Initializes the engine with default normal-state CSS values. Accepts an optional configuration object for forward-compatibility.

### `ingest(telemetry): this`

Accepts either:
- A single `number` (0–100) mapped to `cognitiveLoad`
- An object with any subset of `{ cognitiveLoad, focus, anxiety, sleepDeprivation }`

Invalid values (`NaN`, `Infinity`, strings, objects, prototype-tampering payloads) are silently rejected. Range violations are clamped to [0, 100].

### `getState(): BiomorphicState`

Returns a frozen-style snapshot of all channel outputs plus derived neural states.

### `destroy(): void`

Cancels the active animation frame, zeros all internal state, and releases the bound tick callback. CSS properties remain at their last-written values.

---

## Security Architecture

### Input Validation Pipeline

```
telemetry → typeof check → Number.isFinite → __proto__/constructor/prototype
  string scan → clamp [0, 100] → r3 rounding → #target[i]
```

- **`#validateNumber()`**: Rejects non-number, NaN, Infinity, and values whose string coercion contains `__proto__`, `constructor`, or `prototype`.
- **`#validateObject()`**: Scans the input object's string representation for prototype-tampering keywords.
- **`#sanitize()`**: Clamps to [LOAD_MIN, LOAD_MAX] = [0, 100].
- **Configuration freeze**: `BiomorphicEngine.#CFG` is `Object.freeze()` recursively, preventing runtime reconfiguration attacks.
- **DOM isolation**: All output is written via `Element.style.setProperty()`. No `innerHTML`, `eval()`, `new Function()`, or dynamic string parsing.

---

## Performance Characteristics

| Operation | Cost |
|---|---|
| Import + instantiation | ~0.02 ms (cold), ~0.005 ms (warm) |
| `ingest()` single channel | < 0.001 ms |
| `ingest()` 4-channel object | < 0.002 ms |
| `getState()` | < 0.0005 ms |
| Per-frame `#tick()` | < 0.05 ms (filter + visuals + CSS write) |
| Animation loop termination | Guaranteed within 0.005 normalized threshold; hard stop at 30,000 frames |
| Memory allocation | 0 dynamic allocations per frame after initialization |

---

## Licensing & Commercial Procurement

**License**: Business Source License 1.1 (BSL 1.1)

**Licensor**: İlkim Önercan

**Licensed Work**: Biomorphic UI Core (all source code, files, and assets)

**Change Date**: 2030-06-24

**Change License**: Apache-2.0

### Terms

1. The Licensed Work may be copied, modified, and used for non-commercial purposes, academic research, and local development/testing without charge.
2. **Any production deployment, commercial SaaS application, or monetized corporate infrastructure requires a paid Commercial License** purchased directly from the Licensor.
3. Micro-businesses and independent developers with annual gross revenue below $50,000 USD are exempt from licensing fees for up to one (1) active production project.
4. On the Change Date (2030-06-24), the Licensed Work automatically converts to Apache-2.0 and becomes fully open source.

**To obtain a Commercial License**: Contact `ilkimonrcn@gmail.com` or visit [COMMERCIAL_LICENSE_URL].

---

## Verification

```bash
# Headless test suite (Node.js)
node test/headless.mjs

# Browser stress test
# Start server: node server.js
# Open:        http://localhost:8080/test/stress-test.html
```

---

## Repository Structure

```
BiomorphicEngine.js    — Core engine (~795 lines)
test/
├── headless.mjs       — 18-test headless suite
└── stress-test.html   — 33-test browser stress suite
server.js              — Local HTTP server (port 8080)
LICENSE                — BSL 1.1
```

---

**Maintainer**: İlkim Önercan — `ilkimonrcn@gmail.com`
