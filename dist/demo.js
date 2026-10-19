/* Demo-only interface. The reusable renderer is digital-ripples.js. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const LANGUAGE_KEY = 'clow-waves-web.demo.language';
  function preferredLanguage() {
    const query = params.get('lang');
    if (query === 'en' || query === 'zh') return query;
    try { return localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'; }
    catch (_) { return 'en'; }
  }
  let language = preferredLanguage();
  const translations = {
  "en": {
    "pageTitle": "Clow Waves Web · Interactive ASCII Background",
    "pageDescription": "Explore flowing ASCII waves and interactive digital ripples, built with WebGL2. An unofficial web adaptation of Orgtree.",
    "brandLabel": "Clow Waves Web interactive background demo",
    "brandCaption": "Interactive background",
    "toolbarLabel": "Demo controls",
    "presetToggle": "Presets",
    "presetMenu": "Appearance presets",
    "presetReference": "Reference · Paper",
    "presetWarm": "Warm · Ivory",
    "presetDark": "Dark · Midnight",
    "presetReferenceDescription": "Neutral ink, luminous backdrop",
    "presetWarmDescription": "Soft, warm paper tones",
    "presetDarkDescription": "For dark-themed personal sites",
    "settingsToggle": "Customize",
    "cleanToggle": "Clean view",
    "cleanTitle": "Hide controls (H)",
    "clickHint": "Click anywhere to make waves",
    "inputLabel": "RIPPLE LAB",
    "inputPlaceholder": "Type heart or circle, then press Enter",
    "submitLabel": "Trigger a ripple with the entered text",
    "submitTitle": "Trigger ripple (Enter)",
    "inputExplanation": "This is a local visual effect, not an AI chat. Your text is never sent. Try “heart” or “circle”.",
    "settingsTitle": "Make the waves your own",
    "closeSettings": "Close settings",
    "panelIntro": "Changes take effect instantly. Click the empty background to interact.",
    "presetLabel": "Background preset",
    "shapeLabel": "Ripple shape",
    "glyphLabel": "Character pool",
    "presetReferenceOption": "Reference · Paper",
    "presetWarmOption": "Warm · Ivory",
    "presetDarkOption": "Dark · Midnight",
    "shapeAuto": "Circle · Circle · Heart",
    "shapeCircle": "Circular ripple",
    "shapeHeart": "Heart ripple",
    "glyphMixed": "Mixed characters",
    "glyphLetters": "More letters",
    "glyphDigits": "More digits",
    "scaleLabel": "Glyph size",
    "ambientLabel": "Ambient density",
    "rippleLabel": "Ripple intensity",
    "speedLabel": "Flow speed",
    "pause": "Pause animation",
    "resume": "Resume animation",
    "reset": "Reset preset",
    "play": "Play click sequence",
    "stop": "Stop sequence",
    "copy": "Copy embed code",
    "panelFootnote": "Press H for clean view, Esc to close. The input only triggers visual effects.",
    "copyFallback": "Select and copy the code below",
    "restoreLabel": "Show controls",
    "restoreAria": "Show demo controls (H)",
    "restoreTitle": "Show controls (H)",
    "errorLoad": "Failed to load the effect. Keep digital-ripples.js next to this page.",
    "errorJS": "Enable JavaScript to view the animated ASCII background.",
    "credits": "Based on Orgtree · Independent unofficial demo",
    "sourceLink": "Source ↗",
    "switchLanguage": "Switch to Chinese",
    "toastReset": "Current preset restored.",
    "toastCopiedAsset": "Embed code copied. Also include digital-ripples.js in your site.",
    "toastCopied": "Embed code copied.",
    "toastManualCopy": "Code selected. Press Ctrl+C / ⌘C to copy.",
    "errorInit": "Background initialization failed",
    "errorReload": "Please reload the page.",
    "errorDraw": "Failed to load background",
    "errorUnavailable": "No supported graphics renderer is available in this browser."
  },
  "zh": {
    "pageTitle": "Clow Waves Web · 交互式字符波纹背景",
    "pageDescription": "探索 WebGL2 实现的流动 ASCII 字符背景与交互式数字波纹。基于 Orgtree 的非官方网页改编。",
    "brandLabel": "Clow Waves Web 交互背景演示",
    "brandCaption": "交互式背景",
    "toolbarLabel": "演示控制",
    "presetToggle": "预设",
    "presetMenu": "外观预设",
    "presetReference": "参考 · 纸白",
    "presetWarm": "暖色 · 米白",
    "presetDark": "深色 · 午夜",
    "presetReferenceDescription": "中性字符，明亮背景",
    "presetWarmDescription": "柔和的暖纸色调",
    "presetDarkDescription": "适合深色个人网页",
    "settingsToggle": "调节",
    "cleanToggle": "纯背景",
    "cleanTitle": "隐藏控件（H）",
    "clickHint": "点击空白处，看看波纹",
    "inputLabel": "波纹演示",
    "inputPlaceholder": "输入“爱心”或“圆形”，按 Enter 触发波纹",
    "submitLabel": "根据输入文字触发波纹",
    "submitTitle": "触发波纹（Enter）",
    "inputExplanation": "这里只是本地视觉特效，不是 AI 对话。文字不会被发送。可输入“爱心”或“圆形”。",
    "settingsTitle": "让波纹适合你的网页",
    "closeSettings": "关闭调节面板",
    "panelIntro": "调整会立即生效。点击背景仍可激起波纹。",
    "presetLabel": "背景预设",
    "shapeLabel": "点击形状",
    "glyphLabel": "字符组合",
    "presetReferenceOption": "参考 · 纸白",
    "presetWarmOption": "暖色 · 米白",
    "presetDarkOption": "深色 · 午夜",
    "shapeAuto": "圆形 · 圆形 · 爱心",
    "shapeCircle": "圆形波纹",
    "shapeHeart": "爱心波纹",
    "glyphMixed": "混合字符",
    "glyphLetters": "字母较多",
    "glyphDigits": "数字较多",
    "scaleLabel": "字符大小",
    "ambientLabel": "背景字符浓度",
    "rippleLabel": "点击波纹浓度",
    "speedLabel": "流动速度",
    "pause": "暂停动画",
    "resume": "继续动画",
    "reset": "恢复预设",
    "play": "播放点击示范",
    "stop": "停止点击示范",
    "copy": "复制嵌入代码",
    "panelFootnote": "按 H 隐藏控件，Esc 关闭面板。输入框只用来触发视觉特效。",
    "copyFallback": "请选中并复制以下代码",
    "restoreLabel": "显示控件",
    "restoreAria": "显示演示控件（H）",
    "restoreTitle": "显示控件（H）",
    "errorLoad": "背景加载失败。请确认 digital-ripples.js 与此页面位于同一目录。",
    "errorJS": "请启用 JavaScript 以查看动态字符背景。",
    "credits": "基于 Orgtree · 非官方独立演示",
    "sourceLink": "源代码 ↗",
    "switchLanguage": "切换到英文",
    "toastReset": "已恢复当前预设。",
    "toastCopiedAsset": "嵌入代码已复制。请同时复制 digital-ripples.js 文件。",
    "toastCopied": "嵌入代码已复制。",
    "toastManualCopy": "代码已选中，请按 Ctrl+C / ⌘C 复制。",
    "errorInit": "背景初始化失败",
    "errorReload": "请重新加载页面。",
    "errorDraw": "背景加载失败",
    "errorUnavailable": "当前浏览器没有可用的绘图环境。"
  }
};
  function t(key) { return translations[language][key] || translations.en[key] || key; }
  function renderLanguage() {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    for (const element of document.querySelectorAll('[data-i18n]')) {
      element.textContent = t(element.dataset.i18n);
    }
    for (const [attr, destination] of [
      ['data-i18n-aria', 'aria-label'],
      ['data-i18n-title', 'title'],
      ['data-i18n-placeholder', 'placeholder'],
      ['data-i18n-content', 'content'],
    ]) {
      for (const element of document.querySelectorAll('[' + attr + ']')) {
        element.setAttribute(destination, t(element.getAttribute(attr)));
      }
    }
    const languageButton = $('language-toggle');
    languageButton.textContent = language === 'en' ? '中文' : 'EN';
    languageButton.setAttribute('aria-label', t('switchLanguage'));
    languageButton.setAttribute('title', t('switchLanguage'));
  }
  function setLanguage(next, updateURL = true) {
    if (next !== 'en' && next !== 'zh') return;
    language = next;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch (_) { /* Storage is optional. */ }
    if (updateURL) {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', language);
      try { history.replaceState(null, '', url); } catch (_) { /* file:// fallback */ }
    }
    renderLanguage();
    // Runtime labels reflect the active state, not only their initial HTML.
    if (typeof paused === 'boolean') $('pause-toggle').textContent = t(paused ? 'resume' : 'pause');
    if (typeof playingDemo === 'boolean') $('replay-demo').textContent = t(playingDemo ? 'stop' : 'play');
  }
  renderLanguage();
  const host = $('ripple-background');
  const presetNames = ['reference', 'warm', 'dark'];
  const requestedPreset = params.get('preset');
  const initialPreset = presetNames.includes(requestedPreset) ? requestedPreset : 'dark';
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
    $('load-error').textContent = `${t('errorInit')}: ${error.message || t('errorReload')}`;
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
    $('pause-toggle').textContent = t(paused ? 'resume' : 'pause');
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
    $('replay-demo').textContent = t('play');
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
    $('replay-demo').textContent = t('stop');
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
      '<!-- Place digital-ripples.js next to your website. Add data-ripple-ignore to exclude elements. -->',
      '<div id="digital-ripples" aria-hidden="true" style="position:fixed;inset:0;z-index:0"></div>',
      '<main style="position:relative;z-index:1">',
      '  <!-- Your content goes here. Buttons, links and inputs are automatically excluded. -->',
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
      toast(t('toastCopiedAsset'));
    } catch (_) {
      const textarea = $('embed-code');
      $('copy-fallback').hidden = false;
      textarea.value = code;
      textarea.focus();
      textarea.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* Keep the visible, selected fallback. */ }
      toast(t(copied ? 'toastCopied' : 'toastManualCopy'));
    }
  }

  $('language-toggle').addEventListener('click', () => setLanguage(language === 'en' ? 'zh' : 'en'));
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
    toast(t('toastReset'));
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
    $('load-error').textContent = `${t('errorDraw')}: ${event.detail?.message || t('errorUnavailable')}`;
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
    setLanguage,
    getLanguage: () => language,
    getState: () => ({ language, preset, paused, hiddenUI, playingDemo, options: getOptions(), stats: engine.getStats() }),
  });
})();
