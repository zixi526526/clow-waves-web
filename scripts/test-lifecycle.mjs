/**
 * Stub lifecycle regression tests — no browser, WebGL, image, or performance QA.
 * Uses the real controller and field math with a fake DOM, controlled scheduling,
 * and stub drawing contexts. Requires Node >= 22.18; no third-party dependencies.
 * Run after building: node scripts/build.mjs && node scripts/test-lifecycle.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const sourceURL = name => new URL(`../src/${name}`, import.meta.url);
const field = stripTypeScriptTypes(await readFile(sourceURL('field.ts'), 'utf8'), { mode: 'strip' })
  .replace(/^export\s+/gm, '');
const controller = (await readFile(sourceURL('controller.js'), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '')
  .replace('export class DigitalRipples', 'class DigitalRipples');
const controlledSource = `${field}\n${controller}\nglobalThis.RendererClass = DigitalRipples;`;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(reducedMotion = false) {
  let sequence = 0, clock = 0, readyEvents = 0;
  const rafs = new Map(), timers = new Map(), renderers = [];
  class CustomEventStub extends Event {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
  }
  class ElementStub extends EventTarget {
    constructor(doc) {
      super();
      this.ownerDocument = doc;
      this.nodeType = 1;
      this.style = { position: '', overflow: '', backgroundColor: '' };
      this.dataset = {};
      this.children = [];
    }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
    appendChild(child) { this.children.push(child); child.parent = this; }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    }
  }
  const doc = new EventTarget();
  doc.hidden = false;
  doc.fonts = { load: () => Promise.resolve([]) };
  const media = new EventTarget();
  media.matches = reducedMotion;
  const win = new EventTarget();
  Object.assign(win, {
    getComputedStyle: () => ({ position: 'static' }),
    AbortController,
    CustomEvent: CustomEventStub,
    devicePixelRatio: 1,
    performance: { now: () => clock },
    matchMedia: () => media,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback) {
      const id = ++sequence; rafs.set(id, callback); return id;
    },
    cancelAnimationFrame: id => rafs.delete(id),
    setTimeout(callback, delay) {
      const id = ++sequence; timers.set(id, { callback, due: clock + delay }); return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  doc.defaultView = win;
  const rendererFactory = kind => () => {
    const renderer = {
      kind,
      canvas: new ElementStub(doc),
      draws: 0,
      resize: () => true,
      setInk() {}, setGlow() {}, setTuning() {},
      draw() { renderer.draws += 1; },
      restore: () => true,
      destroy() { renderer.canvas.remove(); },
    };
    renderers.push(renderer);
    return renderer;
  };
  const scope = vm.createContext({
    createAsciiRenderer: rendererFactory('webgl2'),
    createCanvasRenderer: rendererFactory('canvas2d'),
  });
  vm.runInContext(controlledSource, scope, { filename: 'controller-with-stub-renderers.js' });
  const host = new ElementStub(doc);
  host.addEventListener('ready', () => { readyEvents += 1; });
  return {
    Class: scope.RendererClass, host, doc, win, renderers, CustomEventStub,
    get readyEvents() { return readyEvents; },
    get scheduled() { return rafs.size + timers.size; },
    advance(timestamp) {
      clock = timestamp;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= clock) { timers.delete(id); timer.callback(); }
      }
      const frame = [...rafs.values()];
      rafs.clear();
      frame.forEach(callback => callback(clock));
    },
  };
}

test('SSR: built ESM imports without a window global', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  const module = await import(new URL('../dist/digital-ripples.module.js', import.meta.url));
  assert.equal(typeof module.DigitalRipples, 'function');
  assert.equal(module.default, module.DigitalRipples);
});

test('stub lifecycle: interaction during delayed rebuild does not schedule a broken renderer', async () => {
  const f = fixture();
  const engine = new f.Class(f.host);
  try {
    await engine.ready;
    const font = deferred();
    f.doc.fonts.load = () => font.promise;
    engine.setOptions({ fontFamily: 'SlowFont' });
    engine.ripple(200, 200);
    f.win.dispatchEvent(new Event('resize'));
    assert.doesNotThrow(() => f.advance(16));
    assert.equal(f.host.children.length, 0, 'old canvas is retired while replacement waits');
    font.resolve([]);
    await engine.ready;
    f.advance(32);
    assert.equal(f.host.children.length, 1);
    assert.ok(f.renderers.at(-1).draws > 0, 'replacement becomes drawable');
    assert.equal(f.readyEvents, 2);
  } finally { engine.destroy(); }
});

test('stub lifecycle: rebuilding after context loss resumes with the replacement renderer', async () => {
  const f = fixture();
  const engine = new f.Class(f.host);
  try {
    await engine.ready;
    engine.canvas.dispatchEvent(new f.CustomEventStub('webglcontextlost', { cancelable: true }));
    engine.setOptions({ renderer: 'canvas2d' });
    await engine.ready;
    f.advance(100);
    f.advance(200);
    assert.equal(engine.getStats().renderer, 'canvas2d');
    assert.ok(f.renderers.at(-1).draws > 0, 'replacement draws after prior context loss');
    assert.ok(engine.getStats().time > 0, 'replacement animation advances');
    assert.equal(f.host.children.length, 1);
  } finally { engine.destroy(); }
});

test('stub lifecycle: enabling reduced-motion respect stops an already running loop', async () => {
  const f = fixture(true);
  const engine = new f.Class(f.host, { respectReducedMotion: false });
  try {
    await engine.ready;
    f.advance(100);
    f.advance(200);
    const before = engine.getStats().time;
    assert.ok(before > 0);
    engine.setOptions({ respectReducedMotion: true });
    f.advance(300);
    f.advance(400);
    assert.equal(engine.getStats().time, before);
    assert.equal(engine.getStats().phase, 'reduced-motion');
    assert.equal(engine.getStats().reducedMotion, true);
    assert.equal(f.scheduled, 0, 'no continuing animation frames or timers');
  } finally { engine.destroy(); }
});

test('stub lifecycle: initial readiness and pause survive asynchronous initialization', async () => {
  const f = fixture();
  const font = deferred();
  f.doc.fonts.load = () => font.promise;
  const engine = new f.Class(f.host);
  try {
    engine.pause();
    font.resolve([]);
    await engine.ready;
    assert.equal(f.readyEvents, 1);
    assert.equal(f.host.children.length, 1);
    assert.equal(engine.getStats().paused, true);
    f.advance(100);
    f.advance(200);
    assert.equal(engine.getStats().time, 0);
    engine.resume();
    f.advance(300);
    f.advance(400);
    assert.ok(engine.getStats().time > 0);
    engine.pause();
    const before = engine.getStats().time;
    engine.setOptions({ glyphPool: 'figured' });
    await engine.ready;
    f.advance(500);
    f.advance(600);
    assert.equal(engine.getStats().paused, true);
    assert.equal(engine.getStats().time, before);
    assert.equal(engine.ripple(100, 100), null);
  } finally { engine.destroy(); }
});

test('stub timing: slow frames report real elapsed cadence without an unbounded simulation jump', async () => {
  const f = fixture();
  const engine = new f.Class(f.host);
  try {
    await engine.ready;
    f.advance(100);
    f.advance(600);
    assert.equal(engine.getStats().fps, 2, 'a 500ms frame interval is measured as 2fps');
    assert.ok(engine.getStats().time > 0 && engine.getStats().time <= .25,
      'a long stall advances the simulation by a bounded step');
  } finally { engine.destroy(); }
});
