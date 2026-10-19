import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('dist/index.html');
const js = read('dist/demo.js');
const offline = read('digital-ripples-standalone.html');
const match = js.match(/const translations = (\{[\s\S]*?\});\s*function t\(/);
assert.ok(match, 'translation dictionary must be bundled into demo.js');
const messages = JSON.parse(match[1]);
const findKeys = text => [...text.matchAll(/data-i18n(?:-aria|-title|-placeholder|-content)?="([^"]+)"/g)].map(m => m[1]);

test('demo starts in English with an explicit bilingual switch', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /id="language-toggle"/);
  assert.match(html, /Just click anywhere/);
  assert.match(html, /data-i18n="presetToggle">Presets<\/span>/);
  assert.doesNotMatch(html, /PresetsPresets/);
  assert.match(js, /const query = params\.get\('lang'\)/);
  assert.match(js, /localStorage\.setItem\(LANGUAGE_KEY, language\)/);
});

test('English and Chinese catalogs both cover all tagged UI strings and runtime messages', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.zh).sort());
  const keys = new Set(findKeys(html));
  for (const key of keys) {
    assert.ok(messages.en[key], `missing English: ${key}`);
    assert.ok(messages.zh[key], `missing Chinese: ${key}`);
  }
  assert.ok(keys.size >= 45, 'all visible demo controls should be localized');
  for (const key of ['pause','resume','play','stop','toastReset','toastCopied','toastManualCopy','errorDraw']) {
    assert.ok(messages.en[key] && messages.zh[key], `missing dynamic message: ${key}`);
  }
});

test('offline demo includes inlined bilingual scripts, stylesheet and attribution', () => {
  assert.match(offline, /id="language-toggle"/);
  assert.match(offline, /clow-waves-web\.demo\.language/);
  assert.match(offline, /Based on Orgtree/);
  assert.doesNotMatch(offline.split('<script>')[0], /<script[^>]+src=/);
  assert.doesNotMatch(offline, /<link[^>]+href="\.\/demo\.css"/);
});

test('dark is the default demo presentation and explicit presets remain supported', () => {
  assert.match(html, /<body data-preset="dark">/);
  assert.match(html, /aria-checked="true" class="preset-item" data-preset="dark"/);
  assert.match(html, /aria-checked="false" class="preset-item" data-preset="reference"/);
  assert.match(html, /selected="" value="dark"/);
  assert.match(js, /const initialPreset = presetNames\.includes\(requestedPreset\) \? requestedPreset : 'dark';/);
  assert.match(offline, /<body data-preset="dark">/);
  assert.match(offline, /const initialPreset = presetNames\.includes\(requestedPreset\) \? requestedPreset : 'dark';/);
});

test('source credit remains visible as a readable pill in both online and offline demo', () => {
  const css = read('dist/demo.css');
  assert.match(css, /\.demo-credits \{/);
  assert.match(css, /\.demo-credits \{[\s\S]*?background: var\(--surface\)/);
  assert.match(css, /\.demo-credits \{[\s\S]*?font-size: 11px/);
  assert.doesNotMatch(css, /\.demo-credits span \{ display: none/);
  assert.match(offline, /backdrop-filter: blur\(12px\)/);
  assert.match(html, /Based on Orgtree/);
});

test('source credit stays anchored at the bottom center', () => {
  const css = read('dist/demo.css');
  assert.match(css, /\.demo-bottom \{[^}]*left: 50%/);
  assert.match(css, /\.demo-bottom \{[^}]*bottom: max\(18px, calc\(env\(safe-area-inset-bottom\) \+ 8px\)\)/);
  assert.match(css, /\.demo-credits \{[^}]*position: relative/);
  for (const page of [html, offline]) {
    const footer = page.indexOf('class="demo-bottom"');
    const credit = page.indexOf('class="demo-credits', footer);
    const endMain = page.indexOf('</main>', footer);
    assert.ok(footer >= 0 && credit > footer && endMain > credit);
    assert.equal(page.match(/class="demo-credits/g)?.length, 1);
    assert.doesNotMatch(page, /id="ripple-form"|id="ripple-text"|id="text-ripple-button"/);
  }
});
test('bilingual click hint fades after the first background interaction', () => {
  const css = read('dist/demo.css');
  assert.equal(messages.en.clickHint, 'Just click anywhere');
  assert.equal(messages.zh.clickHint, '随意点击，看看波纹');
  assert.match(html, /data-i18n="clickHint"[^>]*>Just click anywhere<\/p>/);
  assert.match(offline, /data-i18n="clickHint"[^>]*>Just click anywhere<\/p>/);
  assert.match(css, /\.first-click-hint \{[^}]*pointer-events: none;[^}]*transition: opacity 600ms ease/);
  assert.match(css, /\.first-click-hint\.is-dismissed \{ opacity: 0; \}/);
  assert.match(js, /host\.addEventListener\('pointerdown', dismissHint/);
  assert.match(js, /host\.addEventListener\('ripple', dismissHint/);
  assert.doesNotMatch(js, /\$\('ripple-form'\)|\$\('ripple-text'\)/);
});

test('demo starts with glyph scale 0.65 and symmetric 0.45–0.85 adjustment range', () => {
  const range = /id="scale-range" max="0\.85" min="0\.45" step="0\.05" type="range" value="0\.65"/;
  for (const page of [html, offline]) {
    assert.match(page, range);
    assert.match(page, /id="scale-output">0\.65×/);
  }
  assert.match(js, /const DEFAULT_DEMO_GLYPH_SCALE = 0\.65;/);
  assert.match(js, /preset: initialPreset, scale: DEFAULT_DEMO_GLYPH_SCALE/);
  assert.match(js, /engine\.setOptions\(\{ scale: DEFAULT_DEMO_GLYPH_SCALE \}\)/);
  assert.match(js, /applyDemoPreset\(preset\)/);
  assert.match(offline, /const DEFAULT_DEMO_GLYPH_SCALE = 0\.65;/);
  for (const file of ['src/controller.js', 'dist/digital-ripples.js', 'dist/digital-ripples.module.js']) {
    assert.match(read(file), /o\.scale = clip\(o\.scale, 0\.45, 2\.5, 1\);/);
  }
});
