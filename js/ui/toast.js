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
  document.getElementById('confirm-overlay').classList.add('open');
  const ok     = document.getElementById('cb-ok');
  const cancel = document.getElementById('cb-cancel');
  const close  = () => {
    document.getElementById('confirm-overlay').classList.remove('open');
    ok.onclick = null; cancel.onclick = null;
  };
  ok.onclick     = () => { close(); cb(true);  };
  cancel.onclick = () => { close(); cb(false); };
}
