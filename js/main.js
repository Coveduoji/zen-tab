'use strict';
// pureMode must be var (not let/const) so initTopClock IIFE can read it without TDZ
var pureMode = false;

// Pause CSS animations while the tab is hidden (cheap, covers edit-mode
// jiggle and any other compositor animation).
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('tab-hidden', document.hidden);
});

// REG and reg() are defined in registry.js (loaded before this file)

// ── Boot sequence ─────────────────────────────────────────
(function boot() {
  try { performance.mark('zt:boot:start'); } catch (_) {}

  // 1. State is already loaded by state.js (runs before this file)
  //    lang is already set from state.settings.lang

  // 2. Apply theme + background immediately (before first paint).
  //    Use the commit-only path: the first paint already has the correct theme
  //    (theme-init.js set it in <head>), so a View Transition here would only
  //    snapshot/ripple an unchanged page on every new tab — and would write
  //    the whole state synchronously during boot.
  _commitTheme(state.settings.theme, state.settings.monetHue || 'lavender');
  const bootBg = state.settings.background;
  // Decoding a multi-MB data-URL background can delay FCP by ~100ms. Paint
  // the theme/overlay first; the image is applied a frame or two later.
  const deferBootImage = bootBg?.type === 'image' && (bootBg.value || '').length > 100000;
  applyBackgroundNow({ deferImage: deferBootImage });
  if (state.settings.background?.palette) applyBgPalette(state.settings.background.palette);
  // Large backgrounds live in IndexedDB; apply them once loaded.
  loadStoredBackground();

  // 3. Layout is derived from widget order; no position normalization.
  //    Persist the first run or a one-time visual-order migration.
  if (!localStorage.getItem('dash_v3') || _orderMigrated) saveState();

  // 4. Init UI subsystems
  initSearch();       // search.js
  initEditMode();     // editmode.js
  initLinkModal();    // linkmodal.js
  initCmdPalette();   // cmdpalette.js
  initPureMode();     // puremode.js
  initPanels();       // panels.js  (FAB, context menu, keyboard, top clock)
  initFolderModal();  // folder.js  (phone-style folder overlay)
  initTopClock();     // panels.js

  // 5. Apply i18n strings to DOM
  applyI18n();

  // 6. First render
  renderAll();
  try { performance.mark('zt:render:done'); } catch (_) {}

  // 7. Apply a large background image after the first paint.
  if (deferBootImage) {
    requestAnimationFrame(() => requestAnimationFrame(() => applyBackgroundNow()));
    setTimeout(() => applyBackgroundNow(), 300); // fallback for hidden/prerendered tabs
  }
})();
