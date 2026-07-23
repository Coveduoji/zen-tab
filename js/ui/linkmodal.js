'use strict';
let linkCb = null;
let linkCustomEmoji = null;
let linkCustomImg   = null;

const LINK_EMOJIS = ['🌐','🔗','⭐','🏠','💻','📱','🎯','🚀','💡','📌','🔖','📰','🎮','🎨','🎵','🛒','📊','💰','📚','🔬','🌍','✈️','🏆','💬','📧','🔐','⚙️','🧪','🖥️','📷'];

function updateLinkPreview() {
  const url  = normalizeUrl(document.getElementById('link-url').value);
  const name = document.getElementById('link-name').value.trim();
  let host = '';
  try { host = new URL(url).hostname; } catch(e) {}
  const prevName = document.getElementById('lm-preview-name');
  const prevHost = document.getElementById('lm-preview-host');
  const prevIco  = document.getElementById('link-icon-preview');
  if (prevName) prevName.textContent = name || host || '—';
  if (prevHost) prevHost.textContent = host || (lang==='zh' ? '输入 URL 自动获取图标' : 'Enter a URL to fetch icon');
  if (prevIco) {
    if (linkCustomImg) {
      prevIco.innerHTML = `<img src="${linkCustomImg}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    } else if (linkCustomEmoji) {
      prevIco.innerHTML = `<span style="font-size:1.8rem">${linkCustomEmoji}</span>`;
    } else if (host) {
      const favUrl = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
      const _img = document.createElement('img');
      _img.src = favUrl; _img.alt = '';
      _img.addEventListener('error', () => {
        const _sp = document.createElement('span');
        _sp.style.fontSize = '1.8rem'; _sp.textContent = linkEmoji(host);
        prevIco.innerHTML = ''; prevIco.appendChild(_sp);
      });
      prevIco.innerHTML = ''; prevIco.appendChild(_img);
    } else {
      prevIco.innerHTML = `<span style="font-size:1.8rem">🌐</span>`;
    }
  }
}

function _syncImgPreviewUI() {
  const preview  = document.getElementById('lm-img-preview');
  const clearBtn = document.getElementById('lm-img-clear');
  if (!preview) return;
  if (linkCustomImg) {
    preview.innerHTML = `<img src="${linkCustomImg}" alt="">`;
    preview.classList.add('has-img');
    if (clearBtn) clearBtn.style.display = '';
  } else {
    preview.innerHTML = `<span class="lm-img-empty-ico">🖼️</span><span class="lm-img-empty-txt">${lang==='zh'?'点击上传图片':'Upload image'}</span>`;
    preview.classList.remove('has-img');
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

function buildEmojiPicker() {
  const row = document.getElementById('lm-emoji-row');
  if (!row) return;
  row.innerHTML = LINK_EMOJIS.map(em =>
    `<button class="lm-emoji-btn${em===linkCustomEmoji?' sel':''}" data-em="${em}" title="${em}">${em}</button>`
  ).join('');
  row.querySelectorAll('.lm-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (linkCustomEmoji === btn.dataset.em) {
        linkCustomEmoji = null; btn.classList.remove('sel');
      } else {
        linkCustomEmoji = btn.dataset.em; linkCustomImg = null;
        _syncImgPreviewUI();
        row.querySelectorAll('.lm-emoji-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      }
      updateLinkPreview();
    });
  });
}

function showLinkModal(cfg={}, cb, isEdit=false, widgetId=null) {
  linkCb = cb;
  linkCustomEmoji = cfg.emoji     || null;
  linkCustomImg   = cfg.customImg || null;
  document.getElementById('link-modal-title').textContent = isEdit ? t('edit_link') : t('add_link');
  document.getElementById('link-name').value = cfg.name || '';
  document.getElementById('link-url').value  = cfg.url  || '';
  const saveBtn = document.getElementById('link-save');
  if (saveBtn) saveBtn.textContent = isEdit ? (lang==='zh'?'保存':'Save') : t('add_link_btn');
  const lbl = document.getElementById('lm-emoji-lbl');
  if (lbl) lbl.textContent = lang==='zh' ? '自定义图标（可选）' : 'Custom icon (optional)';
  const imgLbl = document.getElementById('lm-img-lbl');
  if (imgLbl) imgLbl.textContent = lang==='zh' ? '自定义图片图标（可选）' : 'Custom image icon (optional)';

  // Delete button — only visible in edit mode
  const delBtn = document.getElementById('link-delete');
  const delLbl = document.getElementById('link-delete-label');
  if (delBtn) {
    delBtn.style.display = isEdit ? '' : 'none';
    if (delLbl) delLbl.textContent = lang==='zh' ? '删除链接' : 'Delete';
    // Replace to avoid stacking listeners across multiple opens
    const newDelBtn = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(newDelBtn, delBtn);
    if (isEdit && widgetId) {
      newDelBtn.style.display = '';
      document.getElementById('link-delete-label').textContent = lang==='zh' ? '删除链接' : 'Delete';
      newDelBtn.addEventListener('click', () => {
        document.getElementById('link-modal').classList.remove('open');
        linkCb = null; linkCustomEmoji = null; linkCustomImg = null;
        removeWidget(widgetId);
        toast(lang==='zh' ? '链接已删除' : 'Link removed', '');
      });
    }
  }

  buildEmojiPicker(); _syncImgPreviewUI(); updateLinkPreview();
  document.getElementById('link-modal').classList.add('open');
  setTimeout(() => document.getElementById('link-name').focus(), 40);
}

function initLinkModal() {
  document.getElementById('link-url').addEventListener('input', updateLinkPreview);
  document.getElementById('link-name').addEventListener('input', updateLinkPreview);

  document.getElementById('lm-img-preview').addEventListener('click', () => {
    document.getElementById('lm-img-file').click();
  });
  document.getElementById('lm-img-file').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      linkCustomImg = ev.target.result; linkCustomEmoji = null;
      document.querySelectorAll('.lm-emoji-btn').forEach(b => b.classList.remove('sel'));
      _syncImgPreviewUI(); updateLinkPreview();
    };
    reader.readAsDataURL(file); e.target.value = '';
  });
  document.getElementById('lm-img-clear').addEventListener('click', e => {
    e.stopPropagation(); linkCustomImg = null; _syncImgPreviewUI(); updateLinkPreview();
  });
  document.getElementById('link-save').addEventListener('click', () => {
    const name = document.getElementById('link-name').value.trim();
    const url  = normalizeUrl(document.getElementById('link-url').value);
    if (!name || !url) { toast(t('fill_fields'), 'err'); return; }
    const result = { name, url };
    if (linkCustomImg) result.customImg = linkCustomImg;
    if (linkCustomEmoji && !linkCustomImg) result.emoji = linkCustomEmoji;
    if (linkCb) linkCb(result);
    linkCb = null; linkCustomEmoji = null; linkCustomImg = null;
    document.getElementById('link-modal').classList.remove('open');
  });
  document.getElementById('link-cancel').addEventListener('click', () => {
    linkCb = null; linkCustomEmoji = null; linkCustomImg = null;
    document.getElementById('link-modal').classList.remove('open');
  });
}
