/* ── FOLDER ──
   Phone-home-screen style folder. The folder widget stores only child link
   ids; the links stay in state.widgets so the existing custom-icon storage
   (dash_limg_<id>) keeps working. Filed links are not mounted on the grid. */
let _folderId = null;
let _folderEdit = false;
let _folderPicking = false;
let _folderSearch = '';
const _folderIconBound = new WeakSet();

function _folderGet(id) {
  return state.widgets.find(w => w.id === id && w.type === 'folder') || null;
}

function _folderChildren(folder) {
  return (folder?.config?.childIds || [])
    .map(id => state.widgets.find(w => w.id === id && w.type === 'link'))
    .filter(Boolean);
}

// Small icon markup shared by the folder tile and the folder overlay.
function folderChildIcon(cfg) {
  if (!cfg) return '<span class="fw-em">🔗</span>';
  if (cfg.customImg) return `<img class="fw-img" src="${cfg.customImg}" alt="" decoding="async">`;
  if (cfg.emoji) return `<span class="fw-em">${esc(cfg.emoji)}</span>`;
  let host = '';
  try { host = new URL(cfg.url || '').hostname; } catch (_) {}
  const fallback = linkEmoji(host);
  if (!host) return `<span class="fw-em">${esc(fallback)}</span>`;
  // Emoji sits behind the favicon; the image fades in on load. A slow or
  // hung favicon request therefore still shows something useful.
  const fav = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  return `<span class="fw-em">${esc(fallback)}</span><img class="fw-img" src="${fav}" alt="" decoding="async" data-fb="${esc(fallback)}">`;
}

// Favicon requests may fail (offline, blocked host). Error events don't bubble,
// but a capture listener on the container catches them; swap in the emoji
// fallback that folderChildIcon() already put in data-fb.
function _bindFolderIconFallbacks(root) {
  if (!root || _folderIconBound.has(root)) return;
  _folderIconBound.add(root);
  // Favicons are rendered as a transparent <img> over an emoji placeholder.
  // Mark successfully loaded images so they fade in; drop failed ones so the
  // placeholder stays visible.
  root.addEventListener('load', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.classList.contains('fw-img')) img.classList.add('loaded');
  }, true);
  root.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.dataset.fb) return;
    img.remove();
  }, true);
}

reg({
  type: 'folder',
  get name() { return t('w_folder'); },
  get desc() { return t('w_folder_d'); },
  icon: '📁',
  cat: 'basic',
  render(body, cfg, id) {
    cfg.childIds = Array.isArray(cfg.childIds) ? cfg.childIds : [];
    if (!cfg.name) cfg.name = t('folder_default');
    const kids = _folderChildren({ config: cfg });
    const cells = [];
    for (let i = 0; i < 9; i++) {
      if (i === 8 && kids.length > 9) {
        cells.push(`<div class="fw-cell fw-more">+${kids.length - 8}</div>`);
        continue;
      }
      const link = kids[i];
      cells.push(`<div class="fw-cell${link ? '' : ' fw-cell-empty'}">${link ? folderChildIcon(link.config) : ''}</div>`);
    }
    body.style.cssText = 'padding:0;height:100%';
    body.innerHTML = `<div class="folder-widget-body" role="button" tabindex="0" title="${esc(cfg.name)}">
      <div class="fw-fav">
        ${kids.length
          ? `<div class="fw-grid">${cells.join('')}</div>`
          : '<div class="fw-empty">📁</div>'}
      </div>
      <div class="lw-tooltip">${esc(cfg.name)}${kids.length ? ' · ' + kids.length : ''}</div>
    </div>`;
    _bindFolderIconFallbacks(body);

    const tile = body.querySelector('.folder-widget-body');
    tile?.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.w-delete')) {
        e.preventDefault();
        openFolder(id, { edit: editMode });
      }
    });
  },
});

// ── Folder overlay ────────────────────────────────────────
function _folderCommitName() {
  const f = _folderGet(_folderId);
  if (!f) return;
  const inp = document.getElementById('folder-name');
  if (!inp) return;
  const name = (inp.value || '').trim() || t('folder_default');
  if (inp.value !== name) inp.value = name;
  if (f.config.name !== name) {
    f.config.name = name;
    saveState();
    renderWidget(f.id);
  }
}

function _folderOpenLink(link) {
  if (!link?.config?.url) return;
  window.open(link.config.url, '_blank', 'noopener,noreferrer');
}

function _folderEditLink(link) {
  const fid = _folderId;
  if (!link || !fid) return;
  showLinkModal({ ...link.config }, saved => {
    if (!_folderGet(fid)) return;
    link.config.name = saved.name;
    link.config.url = normalizeUrl(saved.url);
    if (saved.customImg) link.config.customImg = saved.customImg;
    else delete link.config.customImg;
    if (saved.emoji && !saved.customImg) link.config.emoji = saved.emoji;
    else if (!saved.customImg) delete link.config.emoji;
    saveState();
    renderWidget(fid);
    if (_folderId === fid) renderFolderPanel();
  }, true, link.id);
}

function _folderAddNewLink() {
  const fid = _folderId;
  if (!fid) return;
  showLinkModal({}, saved => {
    const f = _folderGet(fid);
    if (!f) return;
    const link = {
      id: genId('link'), type: 'link', w: 1, h: 1,
      config: { name: saved.name, url: normalizeUrl(saved.url) },
    };
    if (saved.customImg) link.config.customImg = saved.customImg;
    else if (saved.emoji) link.config.emoji = saved.emoji;
    f.config.childIds = Array.isArray(f.config.childIds) ? f.config.childIds : [];
    f.config.childIds.push(link.id);
    state.widgets.push(link);
    saveState();
    renderWidget(fid);
    if (_folderId === fid) renderFolderPanel();
    toast(t('folder_link_added'), 'ok');
  }, false);
}

function _folderUnfiledLinks() {
  const filed = filedLinkIds();
  return state.widgets.filter(w => w.type === 'link' && !filed.has(w.id));
}

function renderPickerList() {
  const f = _folderGet(_folderId);
  if (!f) return;
  const q = _folderSearch.trim().toLowerCase();
  let list = _folderUnfiledLinks();
  if (q) {
    list = list.filter(w =>
      (w.config?.name || '').toLowerCase().includes(q) ||
      (w.config?.url || '').toLowerCase().includes(q));
  }
  const wrap = document.getElementById('folder-pick-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="fp-empty">${esc(t('folder_no_links'))}</div>`;
    return;
  }
  wrap.innerHTML = list.map(w => `<label class="fp-row">
    <input type="checkbox" value="${w.id}">
    <span class="fp-ico">${folderChildIcon(w.config)}</span>
    <span class="fp-name">${esc(w.config?.name || '')}</span>
    <span class="fp-url">${esc(w.config?.url || '')}</span>
  </label>`).join('');
}

function _folderPickerAdd() {
  const ids = [...document.querySelectorAll('#folder-pick-list input[type="checkbox"]:checked')].map(b => b.value);
  if (!ids.length) { toast(t('folder_no_links'), 'err'); return; }
  if (!_folderId) return;
  const n = fileLinks(ids, _folderId);
  if (!n) return;
  _folderPicking = false;
  renderFolderPanel();
  toast(t('folder_link_added'), 'ok');
}

function renderFolderPanel() {
  const f = _folderGet(_folderId);
  if (!f) { closeFolder(); return; }
  f.config.childIds = Array.isArray(f.config.childIds) ? f.config.childIds : [];

  const nameInput = document.getElementById('folder-name');
  if (nameInput) {
    nameInput.value = f.config.name || t('folder_default');
    nameInput.readOnly = !_folderEdit;
    nameInput.classList.toggle('editable', _folderEdit);
    nameInput.placeholder = t('folder_name_ph');
  }
  const editBtn = document.getElementById('folder-edit');
  if (editBtn) {
    editBtn.textContent = _folderEdit ? '✓' : '✏️';
    editBtn.title = _folderEdit ? t('folder_done') : t('folder_edit');
  }

  const grid = document.getElementById('folder-grid');
  const picker = document.getElementById('folder-picker');
  const foot = document.getElementById('folder-foot');
  const pickFoot = document.getElementById('folder-pick-foot');
  const showPicker = _folderPicking;

  if (grid) grid.style.display = showPicker ? 'none' : '';
  if (picker) picker.style.display = showPicker ? '' : 'none';
  if (foot) foot.style.display = !showPicker && _folderEdit ? '' : 'none';
  if (pickFoot) pickFoot.style.display = showPicker ? '' : 'none';

  if (showPicker) {
    renderPickerList();
    return;
  }

  const kids = _folderChildren(f);
  if (grid) {
    const items = kids.map(link => `<div class="folder-item" role="button" tabindex="0" data-id="${link.id}" title="${esc(link.config?.name || '')}">
      <div class="fi-ico">${folderChildIcon(link.config)}</div>
      <div class="fi-name">${esc(link.config?.name || '')}</div>
      ${_folderEdit ? `<button class="fi-del" data-del="${link.id}" title="${esc(t('folder_remove_link'))}">×</button>` : ''}
    </div>`).join('');
    const addTile = _folderEdit
      ? `<button class="folder-add-tile" data-add="1"><span class="fat-plus">＋</span><span>${esc(t('folder_add_new'))}</span></button>`
      : '';
    const empty = !kids.length
      ? `<div class="folder-empty">${esc(t('folder_empty'))}</div>`
      : '';
    grid.innerHTML = items + addTile + empty;
  }
}

function openFolder(id, opts = {}) {
  const f = _folderGet(id);
  if (!f) return;
  _folderId = id;
  _folderEdit = !!opts.edit;
  _folderPicking = false;
  _folderSearch = '';
  const pickSearch = document.getElementById('folder-pick-search');
  if (pickSearch) pickSearch.value = '';
  renderFolderPanel();
  document.getElementById('folder-modal')?.classList.add('open');
  if (_folderEdit) {
    setTimeout(() => {
      const inp = document.getElementById('folder-name');
      inp?.focus();
      inp?.select();
    }, 60);
  }
}

function closeFolder() {
  if (_folderEdit) _folderCommitName();
  _folderId = null;
  _folderEdit = false;
  _folderPicking = false;
  _folderSearch = '';
  document.getElementById('folder-modal')?.classList.remove('open');
}

function refreshFolderPanel() {
  if (!_folderId) return;
  if (!_folderGet(_folderId)) { closeFolder(); return; }
  renderFolderPanel();
}

function _folderActivateItem(item) {
  const link = state.widgets.find(w => w.id === item?.dataset.id && w.type === 'link');
  if (!link) return;
  if (_folderEdit) _folderEditLink(link);
  else { _folderOpenLink(link); closeFolder(); }
}

function initFolderModal() {
  const overlay = document.getElementById('folder-modal');
  if (!overlay) return;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeFolder(); });
  document.getElementById('folder-close')?.addEventListener('click', closeFolder);
  document.getElementById('folder-edit')?.addEventListener('click', () => {
    if (_folderEdit) _folderCommitName();
    _folderEdit = !_folderEdit;
    _folderPicking = false;
    renderFolderPanel();
    if (_folderEdit) {
      const inp = document.getElementById('folder-name');
      inp?.focus();
      inp?.select();
    }
  });
  document.getElementById('folder-done')?.addEventListener('click', () => {
    _folderCommitName();
    _folderEdit = false;
    renderFolderPanel();
  });
  document.getElementById('folder-add-new')?.addEventListener('click', _folderAddNewLink);
  document.getElementById('folder-add-existing')?.addEventListener('click', () => {
    _folderPicking = true;
    _folderSearch = '';
    const s = document.getElementById('folder-pick-search');
    if (s) s.value = '';
    renderFolderPanel();
  });
  document.getElementById('folder-pick-back')?.addEventListener('click', () => {
    _folderPicking = false;
    renderFolderPanel();
  });
  document.getElementById('folder-pick-add')?.addEventListener('click', _folderPickerAdd);
  document.getElementById('folder-pick-all')?.addEventListener('click', () => {
    const boxes = [...document.querySelectorAll('#folder-pick-list input[type="checkbox"]')];
    const all = boxes.length > 0 && boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = !all; });
  });
  document.getElementById('folder-pick-search')?.addEventListener('input', e => {
    _folderSearch = e.target.value || '';
    renderPickerList();
  });
  document.getElementById('folder-del')?.addEventListener('click', () => {
    const id = _folderId;
    if (!id) return;
    confirm2(t('folder_del_confirm_t'), t('folder_del_confirm_s'), t('del_btn'), ok => {
      if (!ok) return;
      closeFolder();
      removeWidget(id);
      toast(t('widget_removed'), '');
    });
  });

  const nameInput = document.getElementById('folder-name');
  nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
  });
  nameInput?.addEventListener('blur', () => { if (_folderEdit) _folderCommitName(); });

  const pickSearch = document.getElementById('folder-pick-search');
  if (pickSearch) pickSearch.placeholder = t('folder_pick_search');
  const closeBtn = document.getElementById('folder-close');
  if (closeBtn) closeBtn.title = t('cancel');

  const grid = document.getElementById('folder-grid');
  _bindFolderIconFallbacks(grid);
  grid?.addEventListener('click', e => {
    const del = e.target.closest('.fi-del');
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      if (unfileLink(id)) {
        refreshFolderPanel();
        toast(t('folder_link_removed'), '');
      }
      return;
    }
    if (e.target.closest('.folder-add-tile')) { _folderAddNewLink(); return; }
    const item = e.target.closest('.folder-item');
    if (item) _folderActivateItem(item);
  });
  grid?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.folder-item');
    if (!item || e.target.closest('.fi-del')) return;
    e.preventDefault();
    _folderActivateItem(item);
  });
  _bindFolderIconFallbacks(document.getElementById('folder-pick-list'));

  // The panels' Escape handler closes generic .modal-bg overlays; this keeps
  // the folder state in sync when ours is the one that closed.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _folderId) closeFolder();
  });
}
