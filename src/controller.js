/* Digital Ripples — a portable browser lifecycle around the Orgtree field.
 * Copyright (c) 2026 Digital Ripples contributors. MIT.
 * The adapted field/GL modules retain Maurdekye's MIT notice.
 */
import { ASCII_CONFIG, createTouch, visitFromSeed, gridFor, smooth01 } from './field';
import { createAsciiRenderer } from './gl';
import { createCanvasRenderer } from './fallback';

const PRESETS = Object.freeze({
  reference: Object.freeze({ backgroundColor: '#fafafa', inkColor: '#858582', rippleColor: '#2062f0', scale: 1, ambientOpacity: 0.075, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
  warm: Object.freeze({ backgroundColor: '#fbfbf8', inkColor: '#87877f', rippleColor: '#2047f4', scale: 1, ambientOpacity: 0.075, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
  dark: Object.freeze({ backgroundColor: '#191a1b', inkColor: '#a2a3a5', rippleColor: '#19adff', scale: 1, ambientOpacity: 0.10, rippleOpacity: 0.40, speed: 1, glyphPool: 'mixed' }),
});
const DEFAULTS = Object.freeze({
  ...PRESETS.reference, preset: 'reference', shape: 'auto', seed: 526526,
  interactive: true, pointerWake: true, respectReducedMotion: true,
  maxDpr: 2, fps: 60, idleFps: 25, idleAfter: 180,
  fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace',
  renderer: 'auto', eventTarget: null, introDuration: 1.5,
  calmCentre: [0.5, 0.45], calmRadii: [250, 80],
});
const EXCLUDE = '[data-ripple-ignore],a,button,input,textarea,select,option,label,summary,[role="button"],[role="slider"],[contenteditable="true"],video,audio';
const clip = (x, min, max, otherwise) => Number.isFinite(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : otherwise;
const rgba = (value, fallback) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(value));
  const s = m ? m[1] : fallback.slice(1);
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
};
function cleanOptions(raw, base = DEFAULTS) {
  const o = { ...base, ...raw };
  o.scale = clip(o.scale, 0.55, 2.5, 1);
  o.speed = clip(o.speed, 0.15, 3, 1);
  o.ambientOpacity = clip(o.ambientOpacity, 0, 0.6, .075);
  o.rippleOpacity = clip(o.rippleOpacity, 0, 1, .4);
  o.maxDpr = clip(o.maxDpr, 0.75, 3, 2);
  o.fps = clip(o.fps, 10, 120, 60);
  o.idleFps = clip(o.idleFps, 5, 60, 25);
  o.idleAfter = clip(o.idleAfter, 0, 86400, 180);
  o.introDuration = clip(o.introDuration, 0, 10, 1.5);
  o.seed = Number.isFinite(Number(o.seed)) ? Number(o.seed) >>> 0 : 526526;
  if (!['mixed', 'lettered', 'figured'].includes(o.glyphPool)) o.glyphPool = 'mixed';
  if (!['auto', 'ripple', 'heart'].includes(o.shape)) o.shape = 'auto';
  if (!['auto', 'webgl2', 'canvas2d'].includes(o.renderer)) o.renderer = 'auto';
  for (const k of ['inkColor', 'rippleColor']) if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DEFAULTS[k];
  if (o.backgroundColor !== null && !/^#[0-9a-f]{6}$/i.test(o.backgroundColor)) o.backgroundColor = DEFAULTS.backgroundColor;
  o.calmCentre = Array.isArray(o.calmCentre) && o.calmCentre.length === 2 ? o.calmCentre.map((n, i) => clip(n, -2, 3, DEFAULTS.calmCentre[i])) : [...DEFAULTS.calmCentre];
  o.calmRadii = Array.isArray(o.calmRadii) && o.calmRadii.length === 2 ? o.calmRadii.map((n, i) => clip(n, 1, 4000, DEFAULTS.calmRadii[i])) : [...DEFAULTS.calmRadii];
  return o;
}

export class DigitalRipples {
  static presets = PRESETS;
  static version = '1.0.0';
  constructor(target, options = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host || host.nodeType !== 1) throw new TypeError('DigitalRipples: provide a container element or a matching selector.');
    this.host = host;
    this.doc = host.ownerDocument;
    this.win = this.doc.defaultView;
    this.options = cleanOptions({ ...(PRESETS[options.preset] || PRESETS.reference), ...options });
    this._originalStyle = { position: host.style.position, overflow: host.style.overflow, backgroundColor: host.style.backgroundColor };
    if (this.win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    this._abort = new this.win.AbortController();
    this._touch = createTouch();
    this._time = 0;
    this._fieldTime = 8;
    this._elapsed = 0;
    this._lastActive = 0;
    this._lastFrame = null;
    this._totalClicks = 0;
    this._paused = false;
    this._destroyed = false;
    this._inView = true;
    this._lost = false;
    this._phase = 'initializing';
    this._samples = [];
    this._frameMs = 0;
    this._generation = 0;
    this._errors = [];
    this._media = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this._bind();
    this.ready = this._initialize();
  }
  _event(name, detail = {}) { this.host.dispatchEvent(new this.win.CustomEvent(name, { detail })); }
  _bind() {
    const opts = { signal: this._abort.signal, passive: true };
    this._eventTarget = this.options.eventTarget || this.doc;
    const point = e => {
      if (!this.options.interactive || this._paused || this._destroyed || this._reduced()) return null;
      const el = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
      if (el?.closest(EXCLUDE)) return null;
      const r = this.host.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null;
    };
    this._eventTarget.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const p = point(e);
      if (p) this.ripple(p.x, p.y);
    }, opts);
    this._eventTarget.addEventListener('pointermove', e => {
      if (!this.options.pointerWake || e.pointerType === 'touch') return;
      const p = point(e);
      if (!p) { this._touch.leave(); return; }
      if (this._touch.move(p.x / this.options.scale, p.y / this.options.scale, this._time)) this._rouse();
    }, opts);
    this._eventTarget.addEventListener('pointerleave', () => this._touch.leave(), opts);
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.hidden) { this._stop(); this._phase = 'hidden'; }
      else { this._lastFrame = null; this._rouse(); }
    }, opts);
    this.win.addEventListener('resize', () => this._queueResize(), opts);
    const motionChanged = () => { this._stop(); this._draw(); this._start(); };
    this._media.addEventListener('change', motionChanged, { signal: this._abort.signal });
    this._ro = new this.win.ResizeObserver(() => this._queueResize());
    this._ro.observe(this.host);
    if (this.win.IntersectionObserver) {
      this._io = new this.win.IntersectionObserver(entries => {
        this._inView = entries.some(e => e.isIntersecting);
        if (this._inView) this._start(); else { this._stop(); this._phase = 'offscreen'; }
      });
      this._io.observe(this.host);
    }
  }
  _reduced() { return this.options.respectReducedMotion && this._media.matches; }
  async _initialize() {
    const generation = ++this._generation;
    this._stop();
    this._layout = null;
    this._phase = 'initializing';
    this._renderer?.destroy();
    this._renderer = null;
    try {
      await Promise.race([this.doc.fonts?.load(`400 12px ${this.options.fontFamily}`), new Promise(resolve => this.win.setTimeout(resolve, 200))]);
    } catch { /* Local system monospace remains available. */ }
    if (this._destroyed || generation !== this._generation) return this;
    this._lost = false;
    this._visit = visitFromSeed(this.options.seed, this.options.glyphPool);
    try {
      if (this.options.renderer !== 'canvas2d') this._renderer = createAsciiRenderer(this.doc, this._visit, this.options.fontFamily);
    } catch (e) { this._errors.push(String(e?.message || e)); }
    if (!this._renderer && this.options.renderer !== 'webgl2') this._renderer = createCanvasRenderer(this.doc, this._visit, this.options.fontFamily);
    if (!this._renderer) {
      this._phase = 'unavailable';
      this._event('error', { message: 'No supported rendering context is available.' });
      return this;
    }
    this.canvas = this._renderer.canvas;
    this.canvas.dataset.digitalRipples = '';
    this.canvas.style.opacity = '.78';
    this.host.appendChild(this.canvas);
    this.canvas.addEventListener('webglcontextlost', e => {
      if (generation !== this._generation || this._destroyed) return;
      e.preventDefault();
      this._lost = true;
      this._stop();
      this._phase = 'context-lost';
      this._event('statechange', this.getStats());
    }, { signal: this._abort.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      if (generation !== this._generation || this._destroyed) return;
      this._lost = false;
      if (!this._renderer.restore()) { this._phase = 'unavailable'; return; }
      this._layout = null;
      this._applyColours();
      this._resize();
      this._lastFrame = null;
      this._start();
    }, { signal: this._abort.signal });
    this._applyColours();
    this._resize();
    this._phase = this._reduced() ? 'reduced-motion' : 'running';
    this._start();
    this._event('ready', this.getStats());
    return this;
  }
  _applyColours() {
    if (this.options.backgroundColor !== null) this.host.style.backgroundColor = this.options.backgroundColor;
    else this.host.style.backgroundColor = this._originalStyle.backgroundColor;
    if (!this._renderer) return;
    this._renderer.setInk(rgba(this.options.inkColor, DEFAULTS.inkColor), 1);
    this._renderer.setGlow(rgba(this.options.rippleColor, DEFAULTS.rippleColor));
    this._renderer.setTuning({ ambientScale: this.options.ambientOpacity / .075, rippleScale: this.options.rippleOpacity / .4 });
  }
  _queueResize() {
    this.win.cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = this.win.requestAnimationFrame(() => {
      if (this._destroyed) return;
      this._resize();
      this._start();
    });
  }
  _resize() {
    if (!this._renderer || this._lost || this._destroyed) return;
    const rect = this.host.getBoundingClientRect();
    this._width = rect.width;
    this._height = rect.height;
    const device = this.win.devicePixelRatio || 1;
    const budgetDpr = Math.sqrt(ASCII_CONFIG.grid.maxDevicePixels / Math.max(1, rect.width * rect.height));
    const dpr = Math.max(.5, Math.min(device, this.options.maxDpr, budgetDpr));
    this._dpr = dpr;
    const scale = this.options.scale;
    const g = gridFor(Math.round(rect.width * dpr), Math.round(rect.height * dpr), dpr * scale);
    if (!g) { this._layout = null; this.canvas.style.display = 'none'; this._phase = 'too-small'; return; }
    const unit = dpr * scale;
    const cw = g.cellWidth / unit, ch = g.cellHeight / unit;
    const cssLeft = g.left / dpr, cssTop = g.top / dpr;
    const layout = {
      grid: g, originX: cssLeft / scale, originY: cssTop / scale,
      sampleX: cw, sampleY: ch / 2,
      canvasSizeX: g.columns * cw, canvasSizeY: g.rows * ch,
      calmRadiiX: this.options.calmRadii[0], calmRadiiY: this.options.calmRadii[1],
      cellOriginX: 0, cellOriginY: 0,
      cellCentreX: cssLeft / scale + cw / 2, cellCentreY: cssTop / scale + ch / 2,
      cellWorldW: cw, cellWorldH: ch,
      cssLeft, cssTop, cssW: g.columns * g.cellWidth / dpr, cssH: g.rows * g.cellHeight / dpr,
    };
    this.canvas.style.display = '';
    if (!this._renderer.resize(layout)) return;
    this._layout = layout;
    this._draw();
  }
  _rouse() {
    this._lastActive = this._elapsed;
    if (this._phase === 'calm') this._phase = 'running';
    this._start();
  }
  _draw() {
    if (!this._layout || !this._renderer || this._lost || this._destroyed) return;
    const intro = this._reduced() || this.options.introDuration === 0 ? 1 : smooth01(this._elapsed / this.options.introDuration);
    const idle = this.options.idleAfter === 0 ? 1 : 1 - smooth01((this._elapsed - this._lastActive - this.options.idleAfter) / 8);
    this._reveal = intro * idle;
    const start = this.win.performance.now();
    this._renderer.draw(this._fieldTime, this._reveal, this._touch.frame(this._time), {
      originX: this._layout.originX, originY: this._layout.originY,
      calmCx: this._width * this.options.calmCentre[0] / this.options.scale,
      calmCy: this._height * this.options.calmCentre[1] / this.options.scale,
    });
    this._frameMs = this.win.performance.now() - start;
    this.canvas.dataset.phase = this._phase;
    this.canvas.dataset.renderer = this._renderer.kind || 'webgl2';
  }
  _start() {
    if (this._raf || this._timer || this._destroyed || this._lost || this._paused || !this._renderer || !this._layout || this.doc.hidden || !this._inView) return;
    if (this._reduced()) { this._phase = 'reduced-motion'; this._draw(); return; }
    if (this._phase === 'calm') return;
    this._phase = 'running';
    this._lastFrame = null;
    this._raf = this.win.requestAnimationFrame(t => this._tick(t));
  }
  _tick(timestamp) {
    this._raf = 0;
    if (this._destroyed || this._lost || this._paused || !this._renderer || !this._layout || this.doc.hidden || !this._inView) { this._stop(); return; }
    if (this._reduced()) { this._stop(); this._phase = 'reduced-motion'; this._draw(); return; }
    const rawDelta = this._lastFrame === null ? 0 : Math.max(0, (timestamp - this._lastFrame) / 1000);
    // Preserve measured frame rate; cap only simulation jumps after a long stall.
    const delta = Math.min(.25, rawDelta);
    if (this._lastFrame !== null && rawDelta > 0) {
      this._samples.push(rawDelta);
      if (this._samples.length > 60) this._samples.shift();
    }
    this._lastFrame = timestamp;
    this._elapsed += delta;
    this._time += delta * this.options.speed;
    const settle = this.options.idleAfter === 0 ? 1 : 1 - smooth01((this._elapsed - this._lastActive - this.options.idleAfter) / 8);
    this._fieldTime += delta * this.options.speed * settle;
    this._draw();
    const active = this._touch.busy(this._time);
    if (settle === 0 && !active) { this._phase = 'calm'; this._stop(); this._event('statechange', this.getStats()); return; }
    const fallback = this._renderer.kind === 'canvas2d';
    const fps = Math.min(fallback ? 15 : 120, active ? this.options.fps : this.options.idleFps);
    const targetMs = 1000 / fps;
    const delay = Math.max(0, targetMs - this._frameMs - 8);
    this._timer = this.win.setTimeout(() => {
      this._timer = 0;
      this._raf = this.win.requestAnimationFrame(t => this._tick(t));
    }, delay);
  }
  _stop() {
    this.win.cancelAnimationFrame(this._raf);
    this.win.clearTimeout(this._timer);
    this._raf = this._timer = 0;
    this._lastFrame = null;
  }
  ripple(x, y, options = {}) {
    if (this._destroyed || this._paused || this._reduced() || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const shape = ['auto', 'ripple', 'heart'].includes(options.shape) ? options.shape : this.options.shape;
    this._totalClicks++;
    const actualShape = shape === 'auto' ? this._totalClicks % 3 === 0 ? 'heart' : 'ripple' : shape;
    this._touch.tap(x / this.options.scale, y / this.options.scale, this._time, { shape: actualShape, strength: clip(options.strength ?? 1, 0, 3, 1) });
    this._rouse();
    const detail = { x, y, shape: actualShape, count: this._totalClicks };
    this._event('ripple', detail);
    return detail;
  }
  setOptions(patch = {}) {
    if (this._destroyed) return this;
    const old = this.options;
    this.options = cleanOptions(patch, old);
    if (old.respectReducedMotion !== this.options.respectReducedMotion) this._stop();
    const fresh = ['seed', 'glyphPool', 'fontFamily', 'renderer'].some(k => old[k] !== this.options[k]);
    if (fresh) this.ready = this._initialize();
    else { this._applyColours(); this._resize(); this._rouse(); }
    return this;
  }
  setPreset(name) {
    if (!PRESETS[name]) throw new RangeError(`Unknown Digital Ripples preset: ${name}`);
    this.clear();
    return this.setOptions({ ...PRESETS[name], preset: name });
  }
  getOptions() { const { eventTarget, ...plain } = this.options; return { ...plain, calmCentre: [...plain.calmCentre], calmRadii: [...plain.calmRadii] }; }
  getStats() {
    const span = this._samples.reduce((s, x) => s + x, 0);
    return {
      version: DigitalRipples.version, renderer: this._renderer?.kind || (this._renderer ? 'webgl2' : 'none'),
      rendererName: this._renderer?.rendererName || '', phase: this._phase,
      fps: span ? Math.round(this._samples.length / span * 10) / 10 : 0,
      frameMs: Math.round(this._frameMs * 100) / 100,
      columns: this._layout?.grid.columns || 0, rows: this._layout?.grid.rows || 0,
      dpr: this._dpr || 1, width: this._width || 0, height: this._height || 0,
      activeRipples: this._touch.liveTaps(this._time).length, totalClicks: this._totalClicks,
      time: this._time, fieldTime: this._fieldTime, paused: this._paused,
      reducedMotion: !!this._reduced(), seed: this.options.seed, errors: [...this._errors],
    };
  }
  clear() { this._touch.clear(); this._totalClicks = 0; this._samples = []; this._draw(); return this; }
  pause() { this._paused = true; this._stop(); this._phase = 'paused'; this._event('statechange', this.getStats()); return this; }
  resume() { this._paused = false; this._rouse(); this._event('statechange', this.getStats()); return this; }
  /** Deterministic rendering for comparison/export; events use CSS pixels and seconds. */
  renderAt(time, events = []) {
    this.pause();
    this._time = Math.max(0, Number(time) || 0);
    this._fieldTime = 8 + this._time;
    this._elapsed = Math.max(this.options.introDuration, this._time);
    this._lastActive = this._elapsed;
    this._touch.clear();
    this._totalClicks = 0;
    for (const e of events) {
      if (e.at > this._time || this._time - e.at >= 3.6) continue;
      this._touch.tap(e.x / this.options.scale, e.y / this.options.scale, e.at, { shape: e.shape || 'ripple', strength: e.strength ?? 1 });
      this._totalClicks++;
    }
    this._draw();
    return this;
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._generation++;
    this._stop();
    this.win.cancelAnimationFrame(this._resizeFrame);
    this._abort.abort();
    this._ro.disconnect();
    this._io?.disconnect();
    this._renderer?.destroy();
    this._renderer = null;
    Object.assign(this.host.style, this._originalStyle);
    this._phase = 'destroyed';
  }
}
