/**
 * @fileoverview BiomorphicEngine — A neuromorphic UI modulation engine that
 * dynamically adjusts CSS Custom Properties on the document root based on
 * human neuro-cognitive load and systemic fatigue vectors.
 *
 * Employs 1/f (pink) and 1/f² (brown) noise distribution models for all
 * decay curves. Zero external dependencies. Runs on native ECMAScript modules.
 *
 * @module BiomorphicEngine
 * @license MIT
 * @copyright (c) 2024-2046
 */

// =============================================================================
// Constants
// =============================================================================

/** @type {number} Precision multiplier for 3-decimal-place floating-point math. */
const P3 = 1000;

/**
 * Rounds a number to exactly three (3) decimal places.
 * @param {number} v - Input value.
 * @returns {number} Value rounded to 3 decimal places.
 */
function r3(v) { return Math.round(v * P3) / P3; }

/**
 * Clamps a value to the inclusive range [min, max].
 * @param {number} v - Value to clamp.
 * @param {number} mn - Lower boundary.
 * @param {number} mx - Upper boundary.
 * @returns {number} Clamped value.
 */
function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }

// =============================================================================
// BiomorphicEngine
// =============================================================================

/**
 * A neuromorphic engine that ingests cognitive-load telemetry and modulates
 * CSS Custom Properties on the document root using biologically-plausible 1/f
 * and 1/f² noise decay models.
 *
 * ## Key design properties:
 *
 * - **Zero dependencies** — uses only native ECMAScript/Web APIs.
 * - **Zero XSS surface** — DOM interaction exclusively via
 *   `Element.style.setProperty()`; no `eval`, `new Function`, or `innerHTML`.
 * - **Zero idle CPU** — `requestAnimationFrame` loop auto-terminates when
 *   target values converge (threshold < 0.005).
 * - **Immutable config** — static schema is deeply `Object.freeze()`d against
 *   prototype pollution in untrusted contexts.
 * - **Fail-safe** — invalid telemetry payloads are silently discarded; last
 *   good state is preserved.
 *
 * @example
 * ```js
 * import BiomorphicEngine from './BiomorphicEngine.js';
 *
 * const engine = new BiomorphicEngine();
 * engine.ingest(42.500);
 * engine.ingest(87.300);
 *
 * const { cognitiveLoad, fatigue } = engine.getState();
 *
 * engine.destroy();
 * ```
 */
export default class BiomorphicEngine {
  /**
   * Immutable configuration schema. Deeply frozen to block prototype
   * tampering, pollution, and runtime reconfiguration.
   *
   * @const
   * @type {Readonly<BiomorphicConfig>}
   */
  static #CFG = Object.freeze({
    LOAD_MIN: 0,
    LOAD_MAX: 100,
    CONVERGENCE_THRESHOLD: 0.005,
    MAX_FRAMES: 30000,
    PINK_OCTAVES: 7,

    CSS_PREFIX: '--bui-',

    /** Normal (low-fatigue) visual target. */
    NORMAL: Object.freeze({
      BG:       Object.freeze([248, 249, 250]),
      ACCENT:   Object.freeze([0, 102, 204]),
      TRACKING: 0.02,
      SPEED:    200
    }),

    /** Neon-Gothic (high-fatigue) protective visual target. */
    NEON_GOTHIC: Object.freeze({
      BG:       Object.freeze([13, 14, 16]),
      ACCENT:   Object.freeze([30, 59, 47]),
      TRACKING: 0.10,
      SPEED:    750
    }),

    /** Multi-time-constant filter coefficients (1/f spectrum approximation). */
    FILTER: Object.freeze({
      FAST:       0.25,
      MEDIUM:     0.08,
      SLOW:       0.02,
      ULTRA_SLOW: 0.005
    }),

    /** Weights for combining filter stages into perceived cognitive load. */
    WEIGHTS: Object.freeze({
      FAST:       0.40,
      MEDIUM:     0.30,
      SLOW:       0.20,
      ULTRA_SLOW: 0.10
    })
  });

  // ---------------------------------------------------------------------------
  // Instance fields
  // ---------------------------------------------------------------------------

  /** @type {number} Current smoothed cognitive load (0–100, 3 decimals). */
  #cognitiveLoad = 0;
  /** @type {number} Current fatigue estimate (0–100, 3 decimals). */
  #fatigue = 0;
  /** @type {number} Last validated telemetry target (0–100, 3 decimals). */
  #target = 0;

  /** Fast IIR filter state. @type {number} */
  #f1 = 0;
  /** Medium IIR filter state. @type {number} */
  #f2 = 0;
  /** Slow IIR filter state. @type {number} */
  #f3 = 0;
  /** Ultra-slow IIR filter state (1/f² integrator). @type {number} */
  #f4 = 0;

  /** Brown noise random-walk accumulator. @type {number} */
  #brownAccum = 0;

  /** Pink noise Voss-McCartney octave values. @type {number[]} */
  #pinkVals = [0, 0, 0, 0, 0, 0, 0];
  /** Pink noise sample counter. @type {number} */
  #pinkCtr = 0;

  /** Active requestAnimationFrame ID, or null. @type {number|null} */
  #rafId = null;
  /** Cached bound tick (zero alloc in hot path). @type {(() => void)|null} */
  #boundTick = null;
  /** Whether the animation loop is currently running. @type {boolean} */
  #running = false;
  /** Frame counter for safety-limit enforcement. @type {number} */
  #frameCount = 0;
  /** Timestamp of the most recent animation frame (ms). @type {number} */
  #lastFrameTime = 0;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new BiomorphicEngine instance and immediately writes the normal
   * (low-fatigue) visual state to the document root CSS Custom Properties.
   *
   * @param {Partial<BiomorphicConfig>} [_config={}] - Optional overrides
   *     (currently reserved for forward-compatibility; unknown keys are
   *     silently ignored).
   */
  constructor(_config = {}) {
    const N = BiomorphicEngine.#CFG.NORMAL;
    this.#applyCSS(
      N.BG[0], N.BG[1], N.BG[2],
      N.ACCENT[0], N.ACCENT[1], N.ACCENT[2],
      N.TRACKING, N.SPEED
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Ingests a single cognitive-load or systemic-fatigue telemetry sample.
   *
   * ## Processing pipeline:
   *
   * 1. **Validation** — Rejects non-numbers, NaN, ±Infinity, objects, arrays,
   *    and any value whose string representation indicates prototype tampering
   *    (`__proto__`, `constructor`, `prototype`).
   * 2. **Sanitisation** — Clamps to [`LOAD_MIN`, `LOAD_MAX`].
   * 3. **Quantisation** — Rounds to exactly 3 decimal places.
   *
   * On rejection the engine silently preserves its last known-good state
   * (fail-safe). On acceptance the interpolation loop is scheduled if idle.
   *
   * @param {*} telemetry - Raw cognitive load or fatigue measurement.
   * @returns {this} The engine instance (fluent API).
   *
   * @example
   * ```js
   * engine.ingest(73.200);
   * engine.ingest(42);       // integer accepted
   * engine.ingest('abc');    // rejected, no-op
   * engine.ingest(NaN);      // rejected, no-op
   * ```
   */
  ingest(telemetry) {
    if (!this.#validate(telemetry)) return this;

    this.#target = r3(this.#sanitize(/** @type {number} */(telemetry)));
    this.#scheduleFrame();
    return this;
  }

  /**
   * Returns a snapshot of the engine's current internal state.
   *
   * @returns {BiomorphicState} Current {@link cognitiveLoad} and
   *     {@link fatigue}, each in [0, 100].
   *
   * @example
   * ```js
   * const { cognitiveLoad, fatigue } = engine.getState();
   * ```
   */
  getState() {
    return { cognitiveLoad: this.#cognitiveLoad, fatigue: this.#fatigue };
  }

  /**
   * Destroys the engine and releases all resources.
   *
   * - Cancels any pending `requestAnimationFrame`.
   * - Nullifies internal references (enables GC).
   * - Resets all state to zero.
   * - Does **not** reset CSS Custom Properties (DOM is left as-is).
   *
   * After calling `destroy()` the instance must not be reused.
   *
   * @returns {void}
   */
  destroy() {
    if (this.#rafId !== null) { cancelAnimationFrame(this.#rafId); this.#rafId = null; }
    this.#boundTick = null;
    this.#running = false;
    this.#cognitiveLoad = 0; this.#fatigue = 0; this.#target = 0;
    this.#f1 = 0; this.#f2 = 0; this.#f3 = 0; this.#f4 = 0;
    this.#brownAccum = 0;
    this.#pinkVals.fill(0); this.#pinkCtr = 0;
    this.#frameCount = 0; this.#lastFrameTime = 0;
  }

  // ---------------------------------------------------------------------------
  // Security & validation (private)
  // ---------------------------------------------------------------------------

  /**
   * Validates a telemetry value for type-safety and security.
   *
   * Rejection criteria:
   * - Not a `number` primitive.
   * - `NaN` or non-finite (`Infinity`, `-Infinity`).
   * - Object, array, or function (prototype-pollution vector).
   * - String coercion contains `__proto__`, `constructor`, or `prototype`
   *   (defence-in-depth against prototype tampering).
   *
   * @param {*} v - Raw value to validate.
   * @returns {boolean} `true` if the value is safe to process.
   */
  #validate(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (v !== null && typeof v === 'object') return false;

    const s = String(v);
    if (s.includes('__proto__') || s.includes('constructor') || s.includes('prototype')) return false;

    return true;
  }

  /**
   * Sanitises a validated telemetry value by clamping to [LOAD_MIN, LOAD_MAX].
   *
   * @param {number} v - Validated numeric value.
   * @returns {number} Clamped value.
   */
  #sanitize(v) {
    return clamp(v, BiomorphicEngine.#CFG.LOAD_MIN, BiomorphicEngine.#CFG.LOAD_MAX);
  }

  // ---------------------------------------------------------------------------
  // Noise generators (private)
  // ---------------------------------------------------------------------------

  /**
   * Generates a pink noise (1/f) sample via the Voss-McCartney multi-octave
   * algorithm.
   *
   * Octave `i` holds a uniform-random value in [-1, 1] for `2^i` consecutive
   * samples. The sum across all octaves, divided by the octave count, yields
   * a signal with approximately 1/f power spectral density.
   *
   * @returns {number} Pink noise sample in [-1, 1] (3 decimals).
   */
  #pinkNoise() {
    const O = BiomorphicEngine.#CFG.PINK_OCTAVES;
    let s = 0;

    for (let i = 0; i < O; i++) {
      if (this.#pinkCtr % (1 << i) === 0) this.#pinkVals[i] = Math.random() * 2 - 1;
      s += this.#pinkVals[i];
    }

    this.#pinkCtr++;
    return r3(clamp(s / O, -1, 1));
  }

  /**
   * Generates a brown noise (1/f²) sample via a random-walk integrator.
   *
   * Each step adds a uniform-random delta of ±0.025. The accumulator is
   * softly reflected at ±1 to avoid hard-clipping artefacts.
   *
   * @returns {number} Brown noise sample in [-1, 1] (3 decimals).
   */
  #brownNoise() {
    this.#brownAccum = r3(this.#brownAccum + r3((Math.random() * 2 - 1) * 0.025));

    if (this.#brownAccum > 1)      this.#brownAccum = r3(2 - this.#brownAccum);
    else if (this.#brownAccum < -1) this.#brownAccum = r3(-2 - this.#brownAccum);

    return this.#brownAccum;
  }

  // ---------------------------------------------------------------------------
  // Core processing (private)
  // ---------------------------------------------------------------------------

  /**
   * Runs the multi-time-constant recursive filter that gives the system its
   * 1/f (pink) frequency response.
   *
   * Four first-order IIR stages run in parallel:
   *
   * | Stage      | α       | τ (frames) | Function          |
   * |------------|---------|------------|-------------------|
   * | Fast       | 0.250   | ~3         | Immediate changes |
   * | Medium     | 0.080   | ~12        | Short-term trend  |
   * | Slow       | 0.020   | ~50        | Medium-term trend |
   * | Ultra-slow | 0.005   | ~200       | Long-term drift   |
   *
   * The weighted sum (`WEIGHTS`) produces the perceived cognitive load.
   * The `fatigue` estimate blends the ultra-slow integrator (1/f² character)
   * with the instantaneous perceived load.
   *
   * All arithmetic is rounded to 3 decimal places.
   *
   * @returns {void}
   */
  #processFilter() {
    const tgt = this.#target;
    const { FAST, MEDIUM, SLOW, ULTRA_SLOW } = BiomorphicEngine.#CFG.FILTER;
    const { FAST: W1, MEDIUM: W2, SLOW: W3, ULTRA_SLOW: W4 } = BiomorphicEngine.#CFG.WEIGHTS;

    this.#f1 = r3(this.#f1 * (1 - FAST)      + tgt * FAST);
    this.#f2 = r3(this.#f2 * (1 - MEDIUM)     + tgt * MEDIUM);
    this.#f3 = r3(this.#f3 * (1 - SLOW)       + tgt * SLOW);
    this.#f4 = r3(this.#f4 * (1 - ULTRA_SLOW) + tgt * ULTRA_SLOW);

    const perceived = r3(this.#f1 * W1 + this.#f2 * W2 + this.#f3 * W3 + this.#f4 * W4);
    const fatigue   = r3(this.#f4 * 0.70 + perceived * 0.30);

    this.#cognitiveLoad = r3(clamp(perceived, 0, 100));
    this.#fatigue       = r3(clamp(fatigue,   0, 100));
  }

  /**
   * Computes a noise-modulated decay factor used to drive the non-linear
   * interpolation.
   *
   * A combined pink + brown noise signal is scaled to produce a decay rate
   * in `[0.02, 0.08]`, ensuring organic, non-constant-velocity motion toward
   * the target each frame.
   *
   * @returns {number} Decay factor in [0.02, 0.08] (3 decimals).
   */
  #decayFactor() {
    const m = r3(clamp(0.50 * this.#pinkNoise() + 0.50 * this.#brownNoise() + 0.50, 0, 1));
    return r3(0.02 + m * 0.06);
  }

  /**
   * Applies a non-linear power-law shaping to the interpolation factor `t`.
   *
   * The exponent γ is modulated by the pink noise sample:
   * ```
   * γ = clamp(0.85 + pinkNoise × 0.30, 0.10, 2.00)
   * ```
   *
   * The result is `t^γ`, which is concave when γ < 1 and convex when γ > 1.
   * This ensures **no linear interpolation path** exists in the visual output.
   *
   * @param {number} t - Interpolation factor in [0, 1].
   * @returns {number} Shaped factor in [0, 1] (3 decimals).
   */
  #shapeNonLinear(t) {
    const ts = clamp(t, 0, 1);
    const g  = r3(clamp(0.85 + this.#pinkNoise() * 0.30, 0.10, 2.00));
    return r3(Math.pow(ts, g));
  }

  // ---------------------------------------------------------------------------
  // Animation loop (private)
  // ---------------------------------------------------------------------------

  /**
   * Single tick of the `requestAnimationFrame` interpolation loop.
   *
   * Pipeline per frame:
   * 1. Run the multi-time-constant filter → updates cognitive load & fatigue.
   * 2. Derive base interpolation factor `t` from load + fatigue.
   * 3. Shape `t` via the noise-modulated power-law function.
   * 4. Compute CSS property values (bg-color, accent-color, font-tracking,
   *    transition-speed).
   * 5. Write to document root via `style.setProperty()`.
   * 6. Check convergence. If the normalised difference from the target is
   *    below `CONVERGENCE_THRESHOLD` (or `MAX_FRAMES` is exceeded), stop.
   * 7. Otherwise schedule the next frame.
   *
   * @returns {void}
   */
  #tick() {
    if (!this.#running) return;

    this.#processFilter();

    const t  = r3(clamp((this.#cognitiveLoad * 0.40 + this.#fatigue * 0.60) / 100, 0, 1));
    const ts = this.#shapeNonLinear(t);

    const N = BiomorphicEngine.#CFG.NORMAL;
    const G = BiomorphicEngine.#CFG.NEON_GOTHIC;

    const bgR   = r3(N.BG[0] + (G.BG[0] - N.BG[0]) * ts);
    const bgG   = r3(N.BG[1] + (G.BG[1] - N.BG[1]) * ts);
    const bgB   = r3(N.BG[2] + (G.BG[2] - N.BG[2]) * ts);
    const accR  = r3(N.ACCENT[0] + (G.ACCENT[0] - N.ACCENT[0]) * ts);
    const accG  = r3(N.ACCENT[1] + (G.ACCENT[1] - N.ACCENT[1]) * ts);
    const accB  = r3(N.ACCENT[2] + (G.ACCENT[2] - N.ACCENT[2]) * ts);
    const track = r3(N.TRACKING + (G.TRACKING - N.TRACKING) * ts);
    const speed = r3(N.SPEED   + (G.SPEED   - N.SPEED)     * ts);

    this.#applyCSS(bgR, bgG, bgB, accR, accG, accB, track, speed);

    // Convergence check: |cognitiveLoad − target| normalised to [0, 1]
    const diff = Math.abs(this.#cognitiveLoad - this.#target) / 100;
    const thr  = BiomorphicEngine.#CFG.CONVERGENCE_THRESHOLD;

    this.#frameCount++;

    if (diff < thr || this.#frameCount >= BiomorphicEngine.#CFG.MAX_FRAMES) {
      this.#applyCSS(
        Math.round(bgR), Math.round(bgG), Math.round(bgB),
        Math.round(accR), Math.round(accG), Math.round(accB),
        +track.toFixed(3), Math.round(speed)
      );
      this.#stop();
      return;
    }

    this.#rafId = requestAnimationFrame(this.#boundTick);
  }

  /**
   * Writes visual values to CSS Custom Properties on the document root using
   * `Element.style.setProperty()` exclusively.
   *
   * - No `innerHTML`, `eval`, or `new Function` is used anywhere.
   * - If `document.documentElement` is unavailable (SSR, worker) the method
   *   silently returns.
   *
   * CSS variables set:
   * - `--bui-bg-color`          → `rgb(R, G, B)`
   * - `--bui-accent-color`      → `rgb(R, G, B)`
   * - `--bui-font-tracking`     → `<val>rem`
   * - `--bui-transition-speed`  → `<val>ms`
   *
   * @param {number} br - Background red   (0–255).
   * @param {number} bg - Background green (0–255).
   * @param {number} bb - Background blue  (0–255).
   * @param {number} ar - Accent red       (0–255).
   * @param {number} ag - Accent green     (0–255).
   * @param {number} ab - Accent blue      (0–255).
   * @param {number} tr - Letter-spacing (rem).
   * @param {number} sp - Transition duration (ms).
   * @returns {void}
   */
  #applyCSS(br, bg, bb, ar, ag, ab, tr, sp) {
    if (typeof document === 'undefined' || !document.documentElement) return;

    const root = document.documentElement;
    const pfx  = BiomorphicEngine.#CFG.CSS_PREFIX;

    root.style.setProperty(pfx + 'bg-color',
      `rgb(${Math.round(br)}, ${Math.round(bg)}, ${Math.round(bb)})`);
    root.style.setProperty(pfx + 'accent-color',
      `rgb(${Math.round(ar)}, ${Math.round(ag)}, ${Math.round(ab)})`);
    root.style.setProperty(pfx + 'font-tracking',
      tr.toFixed(3) + 'rem');
    root.style.setProperty(pfx + 'transition-speed',
      Math.round(sp) + 'ms');
  }

  // ---------------------------------------------------------------------------
  // Loop lifecycle (private)
  // ---------------------------------------------------------------------------

  /**
   * Schedules the `requestAnimationFrame` interpolation loop if not already
   * active.
   *
   * The loop is one-shot: each frame schedules the next only if convergence
   * has not been reached. At steady state the CPU is completely idle.
   *
   * @returns {void}
   */
  #scheduleFrame() {
    if (this.#running) return;

    this.#running = true;
    this.#frameCount = 0;
    this.#lastFrameTime = performance.now();

    if (this.#boundTick === null) this.#boundTick = this.#tick.bind(this);

    this.#rafId = requestAnimationFrame(this.#boundTick);
  }

  /**
   * Stops the animation loop and releases the rAF callback handle.
   *
   * After `#stop()`:
   * - rAF callback is cancelled.
   * - `#rafId` is nullified (enables GC).
   * - `#running` is `false`.
   * - All filter states and visual values are preserved.
   *
   * The loop restarts automatically on the next `ingest()` call.
   *
   * @returns {void}
   */
  #stop() {
    if (this.#rafId !== null) { cancelAnimationFrame(this.#rafId); this.#rafId = null; }
    this.#running = false;
    this.#frameCount = 0;
    this.#lastFrameTime = 0;
  }
}

// =============================================================================
// Type definitions (JSDoc)
// =============================================================================

/**
 * BiomorphicEngine configuration object.
 *
 * @typedef {Object} BiomorphicConfig
 * @property {number} [LOAD_MIN=0]           - Minimum valid cognitive load.
 * @property {number} [LOAD_MAX=100]         - Maximum valid cognitive load.
 * @property {number} [CONVERGENCE_THRESHOLD=0.005] - Loop-stop threshold
 *     (normalised difference from target).
 * @property {number} [MAX_FRAMES=30000]     - Safety limit on animation frames.
 * @property {number} [PINK_OCTAVES=7]       - Octave count for pink noise.
 */

/**
 * Snapshot of the engine's current state.
 *
 * @typedef {Object} BiomorphicState
 * @property {number} cognitiveLoad - Current processed cognitive load (0–100).
 * @property {number} fatigue       - Current fatigue estimate (0–100).
 */

/**
 * Visual values currently applied to CSS Custom Properties.
 *
 * @typedef {Object} BiomorphicVisuals
 * @property {string} bgColor        - CSS background colour value.
 * @property {string} accentColor    - CSS accent colour value.
 * @property {number} fontTracking   - Letter-spacing in rem.
 * @property {number} transitionSpeed - Transition duration in ms.
 */
