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
  assert.match(html, /Click anywhere to make waves/);
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
