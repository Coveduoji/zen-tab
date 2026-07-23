'use strict';
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' '+type : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.animation='tOut .25s forwards'; setTimeout(()=>el.remove(),250); }, 2000);
}

function confirm2(title, sub, okLabel='OK', cb) {
  document.getElementById('cb-title').textContent = title;
  document.getElementById('cb-sub').textContent   = sub;
  document.getElementById('cb-ok').textContent    = okLabel;
  document.getElementById('cb-cancel').textContent = lang==='zh' ? '取消' : 'Cancel';
  const overlay = document.getElementById('confirm-overlay');
  overlay.classList.add('open');
  const ok     = document.getElementById('cb-ok');
  const cancel = document.getElementById('cb-cancel');
  // Escape / click-outside both cancel, matching every other modal in the app.
  function escHandler(e) { if (e.key === 'Escape') { close(); cb(false); } }
  function overlayHandler(e) { if (e.target === overlay) { close(); cb(false); } }
  const close  = () => {
    overlay.classList.remove('open');
    ok.onclick = null; cancel.onclick = null;
    overlay.removeEventListener('click', overlayHandler);
    document.removeEventListener('keydown', escHandler);
  };
  ok.onclick     = () => { close(); cb(true);  };
  cancel.onclick = () => { close(); cb(false); };
  overlay.addEventListener('click', overlayHandler);
  document.addEventListener('keydown', escHandler);
}
