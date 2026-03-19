'use strict';
function getCmds() {
  const cmds = [
    { id:'aw', get n(){return t('cmd_add_widget');}, get h(){return t('cmd_add_w_h');}, ico:'✦', fn:()=>{closeCmd();openMkt();} },
    { id:'th', get n(){return t('cmd_toggle_theme');}, get h(){return t('cmd_toggle_t_h');}, ico:'◑',
      fn(){const btn=document.getElementById('fab-theme');closeCmd();applyTheme(state.settings.theme==='dark'?'light':'dark',btn);toast(t('theme_switched'),'ok');} },
    { id:'st', get n(){return t('cmd_settings');}, get h(){return t('cmd_settings_h');}, ico:'⚙', fn:()=>{closeCmd();openSettings();} },
    { id:'fs', get n(){return t('cmd_focus_search');}, get h(){return t('cmd_fs_h');}, ico:'🔍', fn:()=>{closeCmd();document.getElementById('search-input').focus();} },
    { id:'em', get n(){return t('cmd_edit_mode');}, get h(){return t('cmd_em_h');}, ico:'✏️', fn:()=>{closeCmd();editMode?exitEditMode():enterEditMode();} },
    { id:'ty', get n(){return t('cmd_tidy');}, get h(){return t('cmd_tidy_h');}, ico:'🧹',
      fn(){closeCmd();tidyLayout(state.widgets);compact(state.widgets);saveState();renderAll();toast(lang==='zh'?'布局已整理':'Layout tidied','ok');} },
  ];
  CATALOG.forEach(item => {
    const d = REG[item.type]; if (!d) return;
    cmds.push({
      id: 'add-'+item.type,
      get n(){return `${t('cmd_add')} ${d.name}`;},
      get h(){return d.desc;},
      ico: d.icon,
      fn() {
        closeCmd();
        const r = SIZE_RULES[item.type]||{defW:2,defH:2};
        const slot = findFreeSlot(r.defW, r.defH, state.widgets);
        addWidget({id:genId(item.type), type:item.type, x:slot.x, y:slot.y, w:r.defW, h:r.defH, config:{}});
        toast(t('widget_added',`${d.icon} ${d.name}`),'ok');
      },
    });
  });
  return cmds;
}

let selCmd = 0;
function renderCmd(q='') {
  const all = getCmds();
  const filtered = q ? all.filter(c => c.n.toLowerCase().includes(q.toLowerCase()) || c.h.toLowerCase().includes(q.toLowerCase())) : all;
  selCmd = 0;
  const res = document.getElementById('cmd-results');
  if (!filtered.length) { res.innerHTML = `<div class="cmd-empty">${t('cmd_nf')}</div>`; return filtered; }
  res.innerHTML = filtered.map((c,i) => `<div class="cmd-item${i===0?' sel':''}" data-id="${c.id}">
    <div class="cmd-icon">${c.ico}</div>
    <div><div class="cmd-name">${c.n}</div><div class="cmd-hint">${c.h}</div></div>
  </div>`).join('');
  res.querySelectorAll('.cmd-item').forEach(el =>
    el.addEventListener('click', () => getCmds().find(c => c.id === el.dataset.id)?.fn())
  );
  return filtered;
}

function openCmd()  { document.getElementById('cmd-overlay').classList.add('open'); document.getElementById('cmd-input').value=''; renderCmd(); setTimeout(()=>document.getElementById('cmd-input').focus(),40); }
function closeCmd() { document.getElementById('cmd-overlay').classList.remove('open'); }

function initCmdPalette() {
  document.getElementById('cmd-input').addEventListener('input', e => renderCmd(e.target.value));
  document.getElementById('cmd-input').addEventListener('keydown', e => {
    const items = document.querySelectorAll('#cmd-results .cmd-item');
    if (e.key==='ArrowDown') { e.preventDefault(); selCmd=Math.min(selCmd+1,items.length-1); items.forEach((el,i)=>el.classList.toggle('sel',i===selCmd)); items[selCmd]?.scrollIntoView({block:'nearest'}); }
    else if (e.key==='ArrowUp') { e.preventDefault(); selCmd=Math.max(selCmd-1,0); items.forEach((el,i)=>el.classList.toggle('sel',i===selCmd)); }
    else if (e.key==='Enter') { items[selCmd]?.click(); }
    else if (e.key==='Escape') { closeCmd(); }
  });
  document.getElementById('cmd-overlay').addEventListener('click', e => { if (e.target===e.currentTarget) closeCmd(); });
}
