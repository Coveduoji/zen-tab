'use strict';
/* One second-aligned timer shared by every clock. Previously the top clock
   and every clock widget each ran their own setInterval + visibilitychange
   listener, which multiplied background CPU with each widget instance. */
const _secondSubs = new Set();
let _secondTimer = null;
let _lastSecond = -1;
let _widgetTickersSuspended = false;

function _hasActiveSecondSubs() {
  for (const sub of _secondSubs) {
    if (!(_widgetTickersSuspended && sub.widget)) return true;
  }
  return false;
}

function _scheduleSecond() {
  if (_secondTimer || document.hidden || !_hasActiveSecondSubs()) return;
  const delay = 1000 - (Date.now() % 1000);
  _secondTimer = setTimeout(_tickSecond, delay);
}

function _tickSecond() {
  _secondTimer = null;
  if (document.hidden) return;
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== _lastSecond) {
    _lastSecond = sec;
    for (const sub of _secondSubs) {
      if (_widgetTickersSuspended && sub.widget) continue;
      try { sub.fn(); } catch (e) { console.error('[ticker]', e); }
    }
  }
  _scheduleSecond();
}

// opts.widget = true marks a subscriber that can be suspended in pure mode.
// Returns an unsubscribe function.
function onSecond(fn, opts = {}) {
  const sub = { fn, widget: !!opts.widget };
  _secondSubs.add(sub);
  _scheduleSecond();
  return () => {
    _secondSubs.delete(sub);
    if (_secondSubs.size === 0 && _secondTimer) {
      clearTimeout(_secondTimer);
      _secondTimer = null;
    }
  };
}

function setWidgetTickersSuspended(suspend) {
  _widgetTickersSuspended = !!suspend;
  if (!_widgetTickersSuspended) {
    _lastSecond = -1;
    // Catch up immediately when leaving pure mode (don't show stale clocks).
    if (!document.hidden && _hasActiveSecondSubs()) {
      if (_secondTimer) { clearTimeout(_secondTimer); _secondTimer = null; }
      _tickSecond();
    }
  } else if (!_hasActiveSecondSubs() && _secondTimer) {
    // Only hidden widget clocks left: stop waking up entirely.
    clearTimeout(_secondTimer);
    _secondTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (_secondTimer) { clearTimeout(_secondTimer); _secondTimer = null; }
  } else {
    _lastSecond = -1;
    if (_hasActiveSecondSubs() && !_secondTimer) _tickSecond();
  }
});
