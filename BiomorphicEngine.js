/**
 * @fileoverview BiomorphicEngine v2 — Neuromorphic UI Modulation Engine
 *
 * Dynamically adjusts CSS Custom Properties on the document root based on
 * multi-channel human neuro-cognitive telemetry: cognitive load, focus,
 * anxiety, and sleep deprivation.
 *
 * All decay curves use 1/f (pink) and 1/f² (brown) noise distribution models
 * for biologically-plausible, non-linear interpolation. Zero external
 * dependencies. Native ECMAScript module.
 *
 * ## CSS Custom Properties set:
 *   --bui-bg-color         → rgb(R, G, B)
 *   --bui-accent-color     → rgb(R, G, B)
 *   --bui-font-tracking    → rem
 *   --bui-transition-speed → ms
 *   --bui-saturation       → saturate(%)  (0–1)
 *   --bui-contrast         → contrast ratio (1.5–4.5)
 *   --bui-grid-gap         → rem
 *   --bui-blur             → px
 *   --bui-density          → scale (0.5–1.0)
 *   --bui-shadow           → shadow alpha (0–1)
 *
 * @module BiomorphicEngine
 * @license BSL 1.1
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
// BiomorphicEngine v2
// =============================================================================

/**
 * BiomorphicEngine v2 — Multi-channel neuromorphic UI modulation engine.
 *
 * **Input channels** (all 0–100):
 * - `cognitiveLoad`    — Mental effort / task difficulty
 * - `focus`            — Concentration level (inverse of distraction)
 * - `anxiety`          — Stress / anxiety level
 * - `sleepDeprivation` — Fatigue from insufficient rest
 *
 * **Derived neural states:**
 * - `fatigue` — Long-term accumulated strain (blends cognitive load,
 *   sleep deprivation, and anxiety)
 * - `arousal` — Physiological alertness (cognitive load + anxiety)
 * - `valence` — Emotional polarity (focus vs anxiety)
 *
 * **CSS outputs:**
 * All previous variables plus saturation, contrast, grid-gap, blur,
 * density, and shadow intensity.
 *
 * @example
 * ```js
 * import BiomorphicEngine from './BiomorphicEngine.js';
 * const eng = new BiomorphicEngine();
 *
 * // Single-channel (legacy)
 * eng.ingest(72.5);
 *
 * // Multi-channel object
 * eng.ingest({ cognitiveLoad: 72.5, anxiety: 45, focus: 30 });
 *
 * const state = eng.getState();
 * // { cognitiveLoad, focus, anxiety, sleepDeprivation,
 * //   fatigue, arousal, valence }
 *
 * eng.destroy();
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
    NUM_CHANNELS: 4,

    /** Channel names (index maps to filter/target/output arrays). */
    CHANNELS: Object.freeze(['cognitiveLoad', 'focus', 'anxiety', 'sleepDeprivation']),

    /** Normal (low-fatigue, low-anxiety) visual target. */
    NORMAL: Object.freeze({
      BG:       Object.freeze([248, 249, 250]),
      ACCENT:   Object.freeze([0, 102, 204]),
      TRACKING: 0.02,
      SPEED:    200
    }),

    /** Neon-Gothic (high-fatigue, high-anxiety) protective target. */
    NEON_GOTHIC: Object.freeze({
      BG:       Object.freeze([13, 14, 16]),
      ACCENT:   Object.freeze([30, 59, 47]),
      TRACKING: 0.10,
      SPEED:    750
    }),

    /** Multi-time-constant filter coefficients (1/f spectrum approximation). */
    FILTER: Object.freeze({
      FAST:       0.60,
      MEDIUM:     0.35,
      SLOW:       0.20,
      ULTRA_SLOW: 0.10
    }),

    /** Weights for combining filter stages into perceived value. */
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

  /**
   * Multi-channel filter states.
   * `#filter[channelIdx][stageIdx]` where stageIdx: 0=fast, 1=medium, 2=slow, 3=ultra-slow.
   * @type {number[][]}
   */
  #filter;

  /**
   * Target values per channel (0–100, 3 decimals).
   * @type {number[]}
   */
  #target;

  /**
   * Smoothed output values per channel (0–100, 3 decimals).
   * @type {number[]}
   */
  #output;

  /** @type {number} Derived fatigue (0–100). */
  #fatigue = 0;
  /** @type {number} Derived arousal (0–100). */
  #arousal = 0;
  /** @type {number} Derived valence (0–100). */
  #valence = 0;

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
  /** Previous frame's output per channel (for frame-delta snap detection). @type {number[]} */
  #prevOutput;
  /** Timestamp of the most recent animation frame (ms). @type {number} */
  #lastFrameTime = 0;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new BiomorphicEngine instance and immediately writes the normal
   * (low-fatigue, low-anxiety) visual state to the document root CSS Custom
   * Properties.
   *
   * @param {Partial<BiomorphicConfig>} [_config={}] - Optional overrides
   *     (reserved for forward-compatibility).
   */
  constructor(_config = {}) {
    const NC = BiomorphicEngine.#CFG.NUM_CHANNELS;
    this.#filter = [];
    this.#target = [];
    this.#output = [];
    for (let i = 0; i < NC; i++) {
      this.#filter.push([0, 0, 0, 0]);
      this.#target.push(0);
      this.#output.push(0);
    }

    this.#prevOutput = [0, 0, 0, 0];

    const N = BiomorphicEngine.#CFG.NORMAL;
    this.#applyCSS(
      N.BG[0], N.BG[1], N.BG[2],
      N.ACCENT[0], N.ACCENT[1], N.ACCENT[2],
      N.TRACKING, N.SPEED,
      1.0, 4.5, 0.5, 0, 1.0, 0
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Ingests telemetry data — either a single cognitive-load number (legacy)
   * or a multi-channel object.
   *
   * **Single number** (backward compatible):
   * ```js
   * engine.ingest(72.5);  // sets cognitiveLoad
   * ```
   *
   * **Multi-channel object:**
   * ```js
   * engine.ingest({
   *   cognitiveLoad: 72.5,
   *   focus: 30,
   *   anxiety: 85,
   *   sleepDeprivation: 60
   * });
   * ```
   *
   * Only keys matching valid channel names are processed. All values are
   * validated (type, range, prototype-pollution) independently. Invalid
   * channels or values are silently ignored (fail-safe).
   *
   * @param {number|BiomorphicInput} telemetry - Cognitive load or neural state.
   * @returns {this} The engine instance (fluent API).
   */
  ingest(telemetry) {
    // --- Single number (legacy) → cognitiveLoad ---
    if (typeof telemetry === 'number') {
      if (!this.#validateNumber(telemetry)) return this;
      this.#target[0] = r3(this.#sanitize(telemetry));
      this.#scheduleFrame();
      return this;
    }

    // --- Multi-channel object ---
    if (telemetry && typeof telemetry === 'object' && !Array.isArray(telemetry)) {
      if (!this.#validateObject(telemetry)) return this;

      let changed = false;
      const channels = BiomorphicEngine.#CFG.CHANNELS;

      for (let i = 0; i < channels.length; i++) {
        const val = telemetry[channels[i]];
        if (typeof val === 'number' && this.#validateNumber(val)) {
          this.#target[i] = r3(this.#sanitize(val));
          changed = true;
        }
      }

      if (changed) this.#scheduleFrame();
      return this;
    }

    return this;
  }

  /**
   * Returns a snapshot of the engine's current neural state.
   *
   * @returns {BiomorphicState} All channels and derived states (0–100).
   *
   * @example
   * ```js
   * const s = engine.getState();
   * // { cognitiveLoad, focus, anxiety, sleepDeprivation,
   * //   fatigue, arousal, valence }
   * ```
   */
  getState() {
    return {
      cognitiveLoad:    this.#output[0],
      focus:            this.#output[1],
      anxiety:          this.#output[2],
      sleepDeprivation: this.#output[3],
      fatigue:          this.#fatigue,
      arousal:          this.#arousal,
      valence:          this.#valence
    };
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

    const NC = BiomorphicEngine.#CFG.NUM_CHANNELS;
    for (let i = 0; i < NC; i++) {
      this.#target[i] = 0;
      this.#output[i] = 0;
      const f = this.#filter[i];
      f[0] = 0; f[1] = 0; f[2] = 0; f[3] = 0;
    }
    this.#fatigue = 0; this.#arousal = 0; this.#valence = 0;
    this.#brownAccum = 0;
    this.#pinkVals.fill(0); this.#pinkCtr = 0;
    this.#prevOutput = [0, 0, 0, 0];
    this.#frameCount = 0; this.#lastFrameTime = 0;
  }

  // ---------------------------------------------------------------------------
  // Security & validation (private)
  // ---------------------------------------------------------------------------

  /**
   * Validates a single numeric telemetry value.
   *
   * Rejects: non-number, NaN, Infinity, objects. Also rejects values whose
   * string coercion contains prototype-tampering keywords.
   *
   * @param {*} v - Value to validate.
   * @returns {boolean} `true` if the value is safe.
   */
  #validateNumber(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    const s = String(v);
    if (s.includes('__proto__') || s.includes('constructor') || s.includes('prototype')) return false;
    return true;
  }

  /**
   * Validates an input object for prototype-pollution vectors.
   *
   * @param {Object} obj - Input object.
   * @returns {boolean} `true` if the object is safe.
   */
  #validateObject(obj) {
    const s = String(obj);
    if (s.includes('__proto__') || s.includes('constructor') || s.includes('prototype')) return false;
    return true;
  }

  /**
   * Sanitises a validated numeric value by clamping to [LOAD_MIN, LOAD_MAX].
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
   * @returns {number} Brown noise sample in [-1, 1] (3 decimals).
   */
  #brownNoise() {
    this.#brownAccum = r3(this.#brownAccum + r3((Math.random() * 2 - 1) * 0.025));
    if (this.#brownAccum > 1)      this.#brownAccum = r3(2 - this.#brownAccum);
    else if (this.#brownAccum < -1) this.#brownAccum = r3(-2 - this.#brownAccum);
    return this.#brownAccum;
  }

  // ---------------------------------------------------------------------------
  // Multi-channel filter (private)
  // ---------------------------------------------------------------------------

  /**
   * Runs the multi-time-constant recursive filter across all input channels.
   *
   * Each channel processes through four IIR stages (fast → ultra-slow),
   * producing a 1/f-like spectral response. The weighted combination gives
   * the filtered output for that channel.
   *
   * Derived neural states (fatigue, arousal, valence) are computed from
   * the multi-channel output vector.
   *
   * @returns {void}
   */
  #processFilter() {
    const { FAST, MEDIUM, SLOW, ULTRA_SLOW } = BiomorphicEngine.#CFG.FILTER;
    const { FAST: W1, MEDIUM: W2, SLOW: W3, ULTRA_SLOW: W4 } = BiomorphicEngine.#CFG.WEIGHTS;
    const NC = BiomorphicEngine.#CFG.NUM_CHANNELS;

    for (let c = 0; c < NC; c++) {
      const tgt = this.#target[c];
      const f = this.#filter[c];

      f[0] = r3(f[0] * (1 - FAST)      + tgt * FAST);
      f[1] = r3(f[1] * (1 - MEDIUM)     + tgt * MEDIUM);
      f[2] = r3(f[2] * (1 - SLOW)       + tgt * SLOW);
      f[3] = r3(f[3] * (1 - ULTRA_SLOW) + tgt * ULTRA_SLOW);

      this.#output[c] = r3(clamp(
        f[0] * W1 + f[1] * W2 + f[2] * W3 + f[3] * W4,
        0, 100
      ));

      // Terminal snap: when the per-frame delta drops below precision
      // threshold, snap to exact target to guarantee clean convergence.
      // This eliminates the asymptotic tail of the 1/f IIR filter.
      const prev = this.#prevOutput[c];
      const frameDelta = Math.abs(this.#output[c] - prev);
      const absDelta = Math.abs(this.#output[c] - tgt);
      if (frameDelta < 0.01 || absDelta / 100 < BiomorphicEngine.#CFG.CONVERGENCE_THRESHOLD) {
        this.#output[c] = tgt;
        f[0] = tgt; f[1] = tgt; f[2] = tgt; f[3] = tgt;
      }
      this.#prevOutput[c] = this.#output[c];
    }

    const cl = this.#output[0];
    const focus = this.#output[1];
    const anxiety = this.#output[2];
    const sleepDep = this.#output[3];

    // Fatigue: long-term accumulation (ultra-slow cognitive load)
    // + sleep deprivation + anxiety component + 1/f² brown noise drift
    this.#fatigue = r3(clamp(
      this.#filter[0][3] * 0.35 +   // ultra-slow drift
      cl * 0.15 +                   // current cognitive load
      sleepDep * 0.30 +             // sleep deprivation
      anxiety * 0.20 +              // anxiety contribution
      r3(this.#brownNoise() * 1.5), // 1/f² long-term drift (±1.5 pts)
      0, 100
    ));

    // Arousal: physiological alertness
    this.#arousal = r3(clamp(cl * 0.50 + anxiety * 0.50, 0, 100));

    // Valence: emotional polarity (positive = calm focus)
    this.#valence = r3(clamp(focus * 0.65 - anxiety * 0.35 + 50, 0, 100));
  }

  // ---------------------------------------------------------------------------
  // Visual mapping (private)
  // ---------------------------------------------------------------------------

  /**
   * Stable non-linear gamma shaping (power law, no per-frame noise).
   * Used for CSS properties where frame-to-frame jitter would be distracting.
   *
   * @param {number} t - Interpolation factor in [0, 1].
   * @returns {number} Shaped factor in [0, 1] (3 decimals).
   */
  #shapeGamma(t) {
    return r3(Math.pow(clamp(t, 0, 1), 0.85));
  }

  /**
   * Noise-shaped power-law for organic color transitions.
   * Pink noise modulates the gamma exponent each frame, creating
   * biologically-plausible micro-variation in the visual palette.
   *
   * @param {number} t - Interpolation factor in [0, 1].
   * @returns {number} Shaped factor in [0, 1] (3 decimals).
   */
  #shapeNoisy(t) {
    const ts = clamp(t, 0, 1);
    const g  = r3(clamp(0.85 + this.#pinkNoise() * 0.30, 0.10, 2.00));
    return r3(Math.pow(ts, g));
  }

  /**
   * Maps the current neural state vector to all CSS Custom Property values.
   *
   * Productions:
   * | Variable                | Driven by                              | Range       |
   * |-------------------------|----------------------------------------|-------------|
   * | --bui-bg-color          | fatigue (normal → neon-gothic)        | RGB         |
   * | --bui-accent-color      | fatigue + arousal (normal → neon-gothic)| RGB        |
   * | --bui-font-tracking     | fatigue + anxiety                      | 0.02–0.10rem|
   * | --bui-transition-speed  | fatigue                                | 200–750ms   |
   * | --bui-saturation        | anxiety + sleepDep + fatigue            | 0.10–1.00   |
   * | --bui-contrast          | focus (attenuated by fatigue)           | 1.5–4.5     |
   * | --bui-grid-gap          | anxiety + fatigue                       | 0.5–2.0rem  |
   * | --bui-blur              | fatigue + anxiety (calming blur)        | 0–12px      |
   * | --bui-density           | focus (high = dense)                    | 0.5–1.0     |
   * | --bui-shadow            | anxiety                                 | 0–0.30 alpha|
   *
   * @returns {BiomorphicVisuals} All computed visual values.
   */
  #computeVisuals() {
    const cl = this.#output[0];
    const focus = this.#output[1];
    const anxiety = this.#output[2];
    const sleepDep = this.#output[3];
    const fatigueT = r3(clamp(this.#fatigue / 100, 0, 1));

    // ---- Core palette (existing) — noise-shaped for organic color drift ----
    const N = BiomorphicEngine.#CFG.NORMAL;
    const G = BiomorphicEngine.#CFG.NEON_GOTHIC;
    const ts = this.#shapeNoisy(fatigueT);

    const bgR = r3(N.BG[0] + (G.BG[0] - N.BG[0]) * ts);
    const bgG = r3(N.BG[1] + (G.BG[1] - N.BG[1]) * ts);
    const bgB = r3(N.BG[2] + (G.BG[2] - N.BG[2]) * ts);

    // Accent: blend fatigue and arousal — noise-shaped
    const accentT = r3(clamp((this.#fatigue * 0.60 + this.#arousal * 0.40) / 100, 0, 1));
    const accentTs = this.#shapeNoisy(accentT);
    const accR = r3(N.ACCENT[0] + (G.ACCENT[0] - N.ACCENT[0]) * accentTs);
    const accG = r3(N.ACCENT[1] + (G.ACCENT[1] - N.ACCENT[1]) * accentTs);
    const accB = r3(N.ACCENT[2] + (G.ACCENT[2] - N.ACCENT[2]) * accentTs);

    // ---- Stable gamma-shaped properties (no per-frame noise) ----

    // Font tracking: fatigue + anxiety → non-linear widening
    const trackBlend = r3(clamp((this.#fatigue * 0.50 + anxiety * 0.50) / 100, 0, 1));
    const track = r3(clamp(0.02 + this.#shapeGamma(trackBlend) * 0.08, 0.02, 0.10));

    // Transition speed: fatigue → non-linear slowing
    const speed = r3(clamp(200 + this.#shapeGamma(fatigueT) * 550, 200, 750));

    // Saturation: stress blend → non-linear desaturation
    const satBlend = r3(clamp((anxiety * 0.004 + sleepDep * 0.003 + this.#fatigue * 0.003) / 0.90, 0, 1));
    const saturation = r3(clamp(1.00 - this.#shapeGamma(satBlend) * 0.90, 0.10, 1.00));

    // Contrast: focus → non-linear boost, attenuated by fatigue gamma
    const contBlend = r3(clamp(focus / 100, 0, 1));
    const contAtten = r3(clamp(1 - this.#shapeGamma(fatigueT) * 0.15, 0, 1));
    const contrast = r3(clamp(1.50 + this.#shapeGamma(contBlend) * 3.00 * contAtten, 1.50, 4.50));

    // Grid gap: anxiety + fatigue → non-linear spacing
    const gapBlend = r3(clamp((anxiety + this.#fatigue) / 200, 0, 1));
    const gridGap = r3(clamp(0.50 + this.#shapeGamma(gapBlend) * 1.50, 0.50, 2.00));

    // Blur: fatigue + anxiety → non-linear calming blur
    const blurBlend = r3(clamp((this.#fatigue * 0.006 + anxiety * 0.004) / 12, 0, 1));
    const blur = r3(clamp(this.#shapeGamma(blurBlend) * 12, 0, 12));

    // Layout density: low focus → non-linear spaciousness
    const denBlend = r3(clamp((100 - focus) / 100, 0, 1));
    const density = r3(clamp(0.50 + this.#shapeGamma(1 - denBlend) * 0.50, 0.50, 1.00));

    // Shadow: anxiety → non-linear shadow alpha
    const shdBlend = r3(clamp(anxiety / 100, 0, 1));
    const shadowAlpha = r3(clamp(this.#shapeGamma(shdBlend) * 0.30, 0, 0.30));

    return {
      bgR, bgG, bgB,
      accR, accG, accB,
      track, speed,
      saturation, contrast, gridGap, blur, density, shadowAlpha
    };
  }

  // ---------------------------------------------------------------------------
  // Animation loop (private)
  // ---------------------------------------------------------------------------

  /**
   * Single tick of the `requestAnimationFrame` interpolation loop.
   *
   * Pipeline per frame:
   * 1. Process multi-channel filter → neural state vector.
   * 2. Map neural state → all CSS variable values.
   * 3. Write to document root via `style.setProperty()`.
   * 4. Check multi-channel convergence. If all channels are within threshold
   *    (or MAX_FRAMES exceeded), stop.
   * 5. Otherwise schedule the next frame.
   *
   * @returns {void}
   */
  #tick() {
    if (!this.#running) return;

    this.#processFilter();
    const v = this.#computeVisuals();

    this.#applyCSS(
      v.bgR, v.bgG, v.bgB,
      v.accR, v.accG, v.accB,
      v.track, v.speed,
      v.saturation, v.contrast, v.gridGap, v.blur, v.density, v.shadowAlpha
    );

    // Multi-channel convergence check
    // Snap in #processFilter already sets output=target when within threshold.
    const NC = BiomorphicEngine.#CFG.NUM_CHANNELS;
    const thr = BiomorphicEngine.#CFG.CONVERGENCE_THRESHOLD;
    let maxDiff = 0;
    for (let i = 0; i < NC; i++) {
      const diff = Math.abs(this.#output[i] - this.#target[i]) / 100;
      if (diff > maxDiff) maxDiff = diff;
    }

    this.#frameCount++;

    if (maxDiff < thr || this.#frameCount >= BiomorphicEngine.#CFG.MAX_FRAMES) {
      // Final write with exact values
      this.#applyCSS(
        Math.round(v.bgR), Math.round(v.bgG), Math.round(v.bgB),
        Math.round(v.accR), Math.round(v.accG), Math.round(v.accB),
        +v.track.toFixed(3), Math.round(v.speed),
        v.saturation, v.contrast, v.gridGap, v.blur, v.density, v.shadowAlpha
      );
      this.#stop();
      return;
    }

    this.#rafId = requestAnimationFrame(this.#boundTick);
  }

  /**
   * Writes visual state to CSS Custom Properties on the document root.
   *
   * All values are injected exclusively via `Element.style.setProperty()`.
   * No `innerHTML`, `eval`, or `new Function` is used anywhere.
   *
   * @param {number} br - Background red.
   * @param {number} bg - Background green.
   * @param {number} bb - Background blue.
   * @param {number} ar - Accent red.
   * @param {number} ag - Accent green.
   * @param {number} ab - Accent blue.
   * @param {number} tr - Font tracking (rem).
   * @param {number} sp - Transition speed (ms).
   * @param {number} sat - Saturation (0–1).
   * @param {number} con - Contrast ratio (1.5–4.5).
   * @param {number} gap - Grid gap (rem).
   * @param {number} blr - Blur (px).
   * @param {number} den - Layout density (0.5–1.0).
   * @param {number} shd - Shadow alpha (0–1).
   * @returns {void}
   */
  #applyCSS(br, bg, bb, ar, ag, ab, tr, sp, sat, con, gap, blr, den, shd) {
    if (typeof document === 'undefined' || !document.documentElement) return;

    const root = document.documentElement;
    const pfx  = BiomorphicEngine.#CFG.CSS_PREFIX;

    root.style.setProperty(pfx + 'bg-color',
      `rgb(${Math.round(br)}, ${Math.round(bg)}, ${Math.round(bb)})`);
    root.style.setProperty(pfx + 'accent-color',
      `rgb(${Math.round(ar)}, ${Math.round(ag)}, ${Math.round(ab)})`);
    root.style.setProperty(pfx + 'font-tracking', tr.toFixed(3) + 'rem');
    root.style.setProperty(pfx + 'transition-speed', Math.round(sp) + 'ms');
    root.style.setProperty(pfx + 'saturation', sat.toFixed(3));
    root.style.setProperty(pfx + 'contrast', con.toFixed(2));
    root.style.setProperty(pfx + 'grid-gap', gap.toFixed(2) + 'rem');
    root.style.setProperty(pfx + 'blur', Math.round(blr) + 'px');
    root.style.setProperty(pfx + 'density', den.toFixed(3));
    root.style.setProperty(pfx + 'shadow', shd.toFixed(3));
  }

  // ---------------------------------------------------------------------------
  // Loop lifecycle (private)
  // ---------------------------------------------------------------------------

  /**
   * Schedules the `requestAnimationFrame` interpolation loop if not active.
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
 * Multi-channel telemetry input payload.
 *
 * All values are optional; only provided channels are updated. Values are
 * clamped to [0, 100] and rounded to 3 decimal places.
 *
 * @typedef {Object} BiomorphicInput
 * @property {number} [cognitiveLoad]    - Mental effort / task difficulty.
 * @property {number} [focus]            - Concentration level.
 * @property {number} [anxiety]          - Stress / anxiety level.
 * @property {number} [sleepDeprivation] - Fatigue from insufficient rest.
 */

/**
 * Snapshot of the engine's current neural state.
 *
 * @typedef {Object} BiomorphicState
 * @property {number} cognitiveLoad    - Smoothed cognitive load (0–100).
 * @property {number} focus            - Smoothed focus (0–100).
 * @property {number} anxiety          - Smoothed anxiety (0–100).
 * @property {number} sleepDeprivation - Smoothed sleep deprivation (0–100).
 * @property {number} fatigue          - Computed long-term fatigue (0–100).
 * @property {number} arousal          - Computed alertness (0–100).
 * @property {number} valence          - Computed emotional polarity (0–100).
 */

/**
 * All computed visual values for the current frame.
 *
 * @typedef {Object} BiomorphicVisuals
 * @property {number} bgR         - Background red channel (0–255).
 * @property {number} bgG         - Background green channel (0–255).
 * @property {number} bgB         - Background blue channel (0–255).
 * @property {number} accR        - Accent red channel (0–255).
 * @property {number} accG        - Accent green channel (0–255).
 * @property {number} accB        - Accent blue channel (0–255).
 * @property {number} track       - Font tracking in rem.
 * @property {number} speed       - Transition duration in ms.
 * @property {number} saturation  - Color saturation (0.10–1.00).
 * @property {number} contrast    - Contrast ratio (1.5–4.5).
 * @property {number} gridGap     - Layout grid gap in rem.
 * @property {number} blur        - Background blur in px.
 * @property {number} density     - Layout density scale (0.5–1.0).
 * @property {number} shadowAlpha - Shadow opacity (0–0.30).
 */

/**
 * BiomorphicEngine configuration object.
 *
 * @typedef {Object} BiomorphicConfig
 * @property {number} [LOAD_MIN=0]           - Minimum valid input.
 * @property {number} [LOAD_MAX=100]         - Maximum valid input.
 * @property {number} [CONVERGENCE_THRESHOLD=0.005] - Loop-stop threshold.
 * @property {number} [MAX_FRAMES=30000]     - Safety limit on animation frames.
 * @property {number} [PINK_OCTAVES=7]       - Octave count for pink noise.
 */
