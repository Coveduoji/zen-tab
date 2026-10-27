'use strict';
// pureMode is declared as var in main.js to avoid TDZ with initTopClock
let _pureHideTimer = null;

function enterPureMode() {
  pureMode = true;
  document.body.classList.add('pure-mode');
  document.getElementById('fab-pure').classList.add('active');
  closeAllPanels(); closeCtxMenu();
  const pe = document.getElementById('pure-esc');
  if (pe) pe.textContent = lang==='zh' ? 'ESC 或 Ctrl+P 退出纯净模式' : 'Press ESC or Ctrl+P to exit';
  // Keep the 0.3s fade, then remove the widgets from rendering/update work.
  if (typeof setWidgetTickersSuspended === 'function') setWidgetTickersSuspended(true);
  clearTimeout(_pureHideTimer);
  _pureHideTimer = setTimeout(() => {
    if (!pureMode) return;
    document.querySelectorAll('#grid-canvas .widget').forEach(el => el.classList.add('pure-hidden'));
  }, 320);
  applyBackgroundNow();
}

function exitPureMode() {
  pureMode = false;
  clearTimeout(_pureHideTimer);
  document.querySelectorAll('#grid-canvas .pure-hidden').forEach(el => el.classList.remove('pure-hidden'));
  document.body.classList.remove('pure-mode');
  document.getElementById('fab-pure').classList.remove('active');
  if (typeof setWidgetTickersSuspended === 'function') setWidgetTickersSuspended(false);
  applyBackgroundNow();
}

function initPureMode() {
  document.getElementById('fab-pure').addEventListener('click', () => {
    pureMode ? exitPureMode() : enterPureMode();
  });
}
