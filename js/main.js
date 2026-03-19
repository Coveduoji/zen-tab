'use strict';
// pureMode must be var (not let/const) so initTopClock IIFE can read it without TDZ
var pureMode = false;

// REG and reg() are defined in registry.js (loaded before this file)

// ── Boot sequence ─────────────────────────────────────────
(function boot() {
  // 1. State is already loaded by state.js (runs before this file)
  //    lang is already set from state.settings.lang

  // 2. Apply theme + background immediately (before first paint)
  applyTheme(state.settings.theme, null);
  applyBackground();
  if (state.settings.background?.palette) {
    setTimeout(() => applyBgPalette(state.settings.background.palette), 0);
  }

  // 3. Layout: normalise coords to visible columns, then resolve any collisions
  normalizeToVc();
  resolveCollisions();
  if (!localStorage.getItem('dash_v3')) saveState();

  // 4. Init UI subsystems
  initSearch();       // search.js
  initEditMode();     // editmode.js
  initLinkModal();    // linkmodal.js
  initCmdPalette();   // cmdpalette.js
  initPureMode();     // puremode.js
  initPanels();       // panels.js  (FAB, context menu, keyboard, top clock)
  initTopClock();     // panels.js

  // 5. Apply i18n strings to DOM
  applyI18n();

  // 6. First render
  renderAll();
})();
