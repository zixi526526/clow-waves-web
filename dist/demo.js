/* Demo-only interface. The reusable renderer is digital-ripples.js. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const host = $('ripple-background');
  const params = new URLSearchParams(window.location.search);
  const presetNames = ['reference', 'warm', 'dark'];
  const requestedPreset = params.get('preset');
  const initialPreset = presetNames.includes(requestedPreset) ? requestedPreset : 'reference';
  const seed = Number.parseInt(params.get('seed'), 10);
  const isQA = params.get('qa') === '1';
  const options = { preset: initialPreset, interactive: true, respectReducedMotion: true, shape: 'auto' };
  if (Number.isFinite(seed)) options.seed = seed;
  else if (isQA) options.seed = 1701;

  if (typeof window.DigitalRipples !== 'function') {
    $('load-error').hidden = false;
    $('first-click-hint').hidden = true;
    return;
  }

  let engine;
  try {
    engine = new window.DigitalRipples(host, options);
  } catch (error) {
    $('load-error').hidden = false;
    $('load-error').textContent = `背景初始化失败：${error.message || '请重新加载页面。'}`;
    $('first-click-hint').hidden = true;
    return;
  }

  let preset = initialPreset;
  let paused = false;
  let hiddenUI = false;
  let toastTimer;
  let demoTimers = [];
  let playingDemo = false;
  let settingsReturnFocus;

  const sliders = [
    { id: 'scale-range', output: 'scale-output', key: 'scale', fallback: 1, suffix: '×' },
    { id: 'ambient-opacity-range', output: 'ambient-opacity-output', key: 'ambientOpacity', fallback: 0.075, suffix: '', precision: 3 },
    { id: 'ripple-opacity-range', output: 'ripple-opacity-output', key: 'rippleOpacity', fallback: 0.4, suffix: '' },
    { id: 'speed-range', output: 'speed-output', key: 'speed', fallback: 1, suffix: '×' },
  ];

  function getOptions() {
    return typeof engine.getOptions === 'function' ? engine.getOptions() : options;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('demo-status').textContent = message;
    $('demo-status').classList.add('is-visible');
    toastTimer = setTimeout(() => $('demo-status').classList.remove('is-visible'), 2600);
  }

  function dismissHint() {
    $('first-click-hint').classList.add('is-dismissed');
  }

  function setPaused(next) {
    paused = next;
    if (paused) engine.pause();
    else engine.resume();
    $('pause-toggle').setAttribute('aria-pressed', String(paused));
    $('pause-toggle').textContent = paused ? '继续动画' : '暂停动画';
  }

  function refreshControls() {
    const state = getOptions();
    document.body.dataset.preset = preset;
    $('preset-select').value = preset;
    $('shape-select').value = ['auto', 'ripple', 'heart'].includes(state.shape) ? state.shape : 'auto';
    $('glyph-select').value = ['mixed', 'lettered', 'figured'].includes(state.glyphPool) ? state.glyphPool : 'mixed';
    document.querySelectorAll('.preset-item').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.preset === preset));
    });
    for (const slider of sliders) {
      const value = Number.isFinite(state[slider.key]) ? state[slider.key] : slider.fallback;
      $(slider.id).value = value;
      $(slider.output).textContent = value.toFixed(slider.precision || 2) + slider.suffix;
    }
  }

  function setPreset(name) {
    if (!presetNames.includes(name)) return;
    stopDemo();
    preset = name;
    engine.setPreset(name);
    refreshControls();
  }

  function setPresetMenu(open, focus = true) {
    $('preset-menu').hidden = !open;
    $('preset-toggle').setAttribute('aria-expanded', String(open));
    if (open) {
      setSettings(false, false);
      if (focus) {
        const current = $('preset-menu').querySelector('[aria-checked="true"]');
        (current || $('preset-menu').querySelector('button')).focus();
      }
    }
  }

  function setSettings(open, restoreFocus = true) {
    if (open) {
      settingsReturnFocus = document.activeElement;
      setPresetMenu(false, false);
    }
    $('settings-panel').hidden = !open;
    $('settings-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('settings-close').focus();
    else if (restoreFocus && settingsReturnFocus && settingsReturnFocus.isConnected) settingsReturnFocus.focus();
  }

  function setUIHidden(next, updateURL = false) {
    hiddenUI = next;
    setPresetMenu(false, false);
    setSettings(false, false);
    document.body.classList.toggle('interface-hidden', next);
    $('restore-interface').hidden = !next;
    if (next) $('restore-interface').focus({ preventScroll: true });
    else $('clean-toggle').focus({ preventScroll: true });
    if (updateURL) {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set('clean', '1');
      else url.searchParams.delete('clean');
      try { window.history.replaceState(null, '', url); } catch (_) { /* file:// may not permit history updates. */ }
    }
  }

  function emitRipple(x, y, shape = 'auto', strength = 1) {
    if (paused) setPaused(false);
    engine.ripple(x, y, { shape, strength });
    dismissHint();
  }

  function stopDemo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    playingDemo = false;
    $('replay-demo').textContent = '播放点击示范';
    $('replay-demo').setAttribute('aria-pressed', 'false');
  }

  function replayDemo() {
    if (playingDemo) {
      stopDemo();
      return;
    }
    stopDemo();
    engine.clear();
    if (paused) setPaused(false);
    playingDemo = true;
    $('replay-demo').textContent = '停止点击示范';
    $('replay-demo').setAttribute('aria-pressed', 'true');
    const beats = [
      { at: 150, x: 0.31, y: 0.42, shape: 'ripple' },
      { at: 1950, x: 0.60, y: 0.35, shape: 'ripple' },
      { at: 4050, x: 0.45, y: 0.57, shape: 'heart' },
      { at: 6000, x: 0.72, y: 0.52, shape: 'ripple' },
    ];
    for (const beat of beats) {
      demoTimers.push(setTimeout(() => {
        const bounds = host.getBoundingClientRect();
        emitRipple(bounds.width * beat.x, bounds.height * beat.y, beat.shape);
      }, beat.at));
    }
    demoTimers.push(setTimeout(stopDemo, 7600));
  }

  function makeEmbedSnippet() {
    const state = getOptions();
    const embedOptions = { preset, shape: state.shape || 'auto', glyphPool: state.glyphPool || 'mixed' };
    for (const slider of sliders) {
      if (Number.isFinite(state[slider.key])) embedOptions[slider.key] = Number(state[slider.key].toFixed(3));
    }
    return [
      '<!-- 将 digital-ripples.js 放入你的网站目录；交互控件可加 data-ripple-ignore。 -->',
      '<div id="digital-ripples" aria-hidden="true" style="position:fixed;inset:0;z-index:0"></div>',
      '<main style="position:relative;z-index:1">',
      '  <!-- 在这里放网页内容。按钮、链接、输入框会自动避开波纹。 -->',
      '</main>',
      '<script src="./digital-ripples.js"></script>',
      '<script>',
      `  const ripples = new DigitalRipples(document.getElementById('digital-ripples'), ${JSON.stringify(embedOptions, null, 2).replace(/\n/g, '\n  ')});`,
      '</script>',
    ].join('\n');
  }

  async function copyEmbed() {
    const code = makeEmbedSnippet();
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(code);
      $('copy-fallback').hidden = true;
      toast('嵌入代码已复制。请同时复制 digital-ripples.js 文件。');
    } catch (_) {
      const textarea = $('embed-code');
      $('copy-fallback').hidden = false;
      textarea.value = code;
      textarea.focus();
      textarea.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* Keep the visible, selected fallback. */ }
      toast(copied ? '嵌入代码已复制。' : '代码已选中，请按 Ctrl+C / ⌘C 复制。');
    }
  }

  $('preset-toggle').addEventListener('click', () => setPresetMenu($('preset-menu').hidden));
  $('preset-menu').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-preset]');
    if (!button) return;
    setPreset(button.dataset.preset);
    setPresetMenu(false, false);
    $('preset-toggle').focus();
  });
  $('preset-menu').addEventListener('keydown', (event) => {
    const buttons = Array.from($('preset-menu').querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'Tab') { setPresetMenu(false, false); return; }
    else return;
    event.preventDefault();
    buttons[next].focus();
  });
  $('settings-toggle').addEventListener('click', () => setSettings($('settings-panel').hidden));
  $('settings-close').addEventListener('click', () => setSettings(false));
  $('clean-toggle').addEventListener('click', () => setUIHidden(true, true));
  $('restore-interface').addEventListener('click', () => setUIHidden(false, true));
  $('preset-select').addEventListener('change', (event) => setPreset(event.target.value));
  $('shape-select').addEventListener('change', (event) => engine.setOptions({ shape: event.target.value }));
  $('glyph-select').addEventListener('change', (event) => engine.setOptions({ glyphPool: event.target.value }));
  for (const slider of sliders) {
    $(slider.id).addEventListener('input', (event) => {
      const value = Number(event.target.value);
      engine.setOptions({ [slider.key]: value });
      $(slider.output).textContent = value.toFixed(slider.precision || 2) + slider.suffix;
    });
  }
  $('pause-toggle').addEventListener('click', () => {
    stopDemo();
    setPaused(!paused);
  });
  $('reset-settings').addEventListener('click', () => {
    stopDemo();
    engine.clear();
    engine.setPreset(preset);
    engine.setOptions({ shape: 'auto' });
    setPaused(false);
    refreshControls();
    $('copy-fallback').hidden = true;
    toast('已恢复当前预设。');
  });
  $('replay-demo').addEventListener('click', replayDemo);
  $('copy-embed').addEventListener('click', copyEmbed);
  $('ripple-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('ripple-text').value.trim();
    const state = getOptions();
    let shape = state.shape || 'auto';
    if (/爱|心|heart|love|♥|♡|❤/iu.test(text)) shape = 'heart';
    else if (/圆|圈|波|ring|ripple|circle/iu.test(text)) shape = 'ripple';
    const bounds = host.getBoundingClientRect();
    emitRipple(bounds.width * 0.5, bounds.height * 0.49, shape, 1);
    if (text) $('ripple-text').value = '';
  });

  host.addEventListener('ripple', dismissHint);
  host.addEventListener('error', (event) => {
    $('load-error').hidden = false;
    $('load-error').textContent = `背景加载失败：${event.detail?.message || '当前浏览器没有可用的绘图环境。'}`;
  });
  host.addEventListener('ready', () => { $('load-error').hidden = true; });
  host.addEventListener('pointerdown', dismissHint, { passive: true });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.preset-wrap')) setPresetMenu(false, false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('preset-menu').hidden) {
        setPresetMenu(false, false);
        $('preset-toggle').focus();
      } else if (!$('settings-panel').hidden) setSettings(false);
      else if (hiddenUI) setUIHidden(false, true);
      else if (playingDemo) stopDemo();
      return;
    }
    const target = event.target;
    const typing = target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable);
    if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      setUIHidden(!hiddenUI, true);
    }
  });
  window.addEventListener('pagehide', () => {
    stopDemo();
    clearTimeout(toastTimer);
  });

  refreshControls();
  if (params.get('clean') === '1') setUIHidden(true);
  if (params.get('demo') === '1') {
    Promise.resolve(engine.ready).then(() => {
      if (engine.getStats().phase !== 'unavailable') replayDemo();
    });
  }

  // An explicit QA URL exposes isolated controls; ordinary visitors never see these.
  if (isQA) {
    const qa = document.createElement('div');
    qa.className = 'qa-controls demo-interface';
    qa.dataset.rippleIgnore = '';
    qa.setAttribute('aria-label', 'Deterministic renderer test controls');
    const deterministicFrame = async (shape) => {
      stopDemo();
      await engine.ready;
      setPaused(true);
      const events = shape ? [{ at: 7.2, x: host.clientWidth * 0.5, y: host.clientHeight * 0.5, shape, strength: 1 }] : [];
      engine.renderAt(8, events);
      if (shape) dismissHint();
    };
    const commands = [
      ['clear', () => engine.clear()],
      ['still', () => deterministicFrame()],
      ['ripple', () => deterministicFrame('ripple')],
      ['heart', () => deterministicFrame('heart')],
      ['pause', () => setPaused(true)],
      ['resume', () => setPaused(false)],
    ];
    commands.forEach(([name, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.dataset.qa = name;
      button.addEventListener('click', action);
      qa.appendChild(button);
    });
    document.body.appendChild(qa);
  }

  // Useful for documented programmatic experiments and browser verification.
  window.ripplesDemo = Object.freeze({
    engine,
    setPreset,
    replay: replayDemo,
    stopDemo,
    setUIHidden,
    getEmbedSnippet: makeEmbedSnippet,
    getState: () => ({ preset, paused, hiddenUI, playingDemo, options: getOptions(), stats: engine.getStats() }),
  });
})();
