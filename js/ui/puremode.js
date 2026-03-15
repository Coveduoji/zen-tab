'use strict';
// pureMode is declared as var in main.js to avoid TDZ with initTopClock

function enterPureMode() {
  pureMode = true;
  document.body.classList.add('pure-mode');
  document.getElementById('fab-pure').classList.add('active');
  closeAllPanels(); closeCtxMenu();
  const pe = document.getElementById('pure-esc');
  if (pe) pe.textContent = lang==='zh' ? 'ESC 或 Ctrl+P 退出纯净模式' : 'Press ESC or Ctrl+P to exit';
  applyBackground();
}

function exitPureMode() {
  pureMode = false;
  document.body.classList.remove('pure-mode');
  document.getElementById('fab-pure').classList.remove('active');
  applyBackground();
}

function initPureMode() {
  document.getElementById('fab-pure').addEventListener('click', () => {
    pureMode ? exitPureMode() : enterPureMode();
  });
}
