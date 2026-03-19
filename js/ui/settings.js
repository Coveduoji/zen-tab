'use strict';
// CATALOG and CAT_COLOR are defined in registry.js
let activeCat = 'all';

function renderMarket(q='') {
  const searchEl = document.getElementById('mkt-search');
  if (searchEl) {
    searchEl.placeholder = lang==='zh' ? '搜索组件…' : 'Search widgets…';
    if (!searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', e => renderMarket(e.target.value.trim()));
    }
  }
  const cats = [{id:'all',get l(){return t('cat_all');}},{id:'basic',get l(){return t('cat_basic');}},{id:'info',get l(){return t('cat_info');}},{id:'pro',get l(){return t('cat_pro');}}];
  document.getElementById('mkt-cats').innerHTML = cats.map(c=>`<button class="mkt-cat${activeCat===c.id?' active':''}" data-cat="${c.id}">${c.l}</button>`).join('');
  document.querySelectorAll('.mkt-cat').forEach(b => b.addEventListener('click',()=>{activeCat=b.dataset.cat;renderMarket(searchEl?.value.trim()||'');}));

  let filtered = activeCat==='all' ? CATALOG : CATALOG.filter(i=>i.cat===activeCat);
  if (q) { const ql=q.toLowerCase(); filtered=filtered.filter(item=>{const d=REG[item.type];if(!d)return false;return d.name.toLowerCase().includes(ql)||d.desc.toLowerCase().includes(ql);}); }

  document.getElementById('mkt-list').innerHTML = filtered.map(item=>{
    const d=REG[item.type]; if(!d)return'';
    return `<div class="mkt-item" data-t="${item.type}">
      <div class="mkt-ico" style="background:${CAT_COLOR[item.cat]||'#7c6af5'}22">${d.icon}</div>
      <div class="mkt-info"><div class="mkt-name">${d.name}</div><div class="mkt-desc">${d.desc}</div></div>
      <button class="mkt-add">＋ ${lang==='zh'?'添加':'Add'}</button>
    </div>`;
  }).join('') || `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-dim);font-size:.85rem">${lang==='zh'?'未找到组件':'No widgets found'}</div>`;

  document.querySelectorAll('.mkt-add').forEach(btn => {
    btn.addEventListener('click',()=>{
      const type=btn.closest('.mkt-item').dataset.t; const d=REG[type]; if(!d)return;
      if (type==='link') { closeMkt(); createQuickLink(); return; }
      if (type==='embed') {
        closeMkt();
        showEmbedModal('', url=>{
          const r=SIZE_RULES['embed']||{defW:5,defH:5}; const slot=findFreeSlot(r.defW,r.defH,state.widgets);
          addWidget({id:genId('embed'),type:'embed',x:slot.x,y:slot.y,w:r.defW,h:r.defH,config:{url}});
          toast(t('widget_added','🌐 '+t('w_embed')),'ok');
        }); return;
      }
      const r=SIZE_RULES[type]||{defW:2,defH:2}; const slot=findFreeSlot(r.defW,r.defH,state.widgets);
      addWidget({id:genId(type),type,x:slot.x,y:slot.y,w:r.defW,h:r.defH,config:{}});
      closeMkt(); toast(t('widget_added',`${d.icon} ${d.name}`),'ok');
    });
  });
}

function createQuickLink(prefill={}) {
  showLinkModal(prefill, saved=>{
    const r=SIZE_RULES['link']; const slot=findFreeSlot(r.defW,r.defH,state.widgets);
    const cfg={name:saved.name,url:saved.url};
    if (saved.emoji) cfg.emoji=saved.emoji;
    addWidget({id:genId('link'),type:'link',x:slot.x,y:slot.y,w:r.defW,h:r.defH,config:cfg});
    toast(t('link_added'),'ok');
  }, false);
}

function createBulkLinks() {
  // Build modal
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2500;background:var(--modal-overlay);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn .18s ease';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r);padding:24px;width:420px;box-shadow:var(--shadow);animation:cmdIn .18s var(--ease);display:flex;flex-direction:column;gap:12px';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:.95rem;font-weight:700;color:var(--text)';
  title.textContent = t('bulk_add_title');

  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;height:160px;background:var(--bg2);border:1.5px solid var(--card-border);border-radius:var(--r-sm);color:var(--text);font-family:var(--mono);font-size:.8rem;padding:10px 12px;outline:none;resize:vertical;box-sizing:border-box;transition:border-color var(--t);line-height:1.6';
  ta.placeholder = t('bulk_add_hint');
  ta.addEventListener('focus', () => ta.style.borderColor = 'var(--accent)');
  ta.addEventListener('blur',  () => ta.style.borderColor = 'var(--card-border)');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-s'; cancelBtn.textContent = t('cancel');
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-p'; addBtn.textContent = t('bulk_add_btn');

  const close = () => ov.remove();
  cancelBtn.addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });

  addBtn.addEventListener('click', () => {
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    const r = SIZE_RULES['link'];
    let count = 0;
    lines.forEach(line => {
      // Parse: "Name URL" or just "URL"
      const parts = line.split(/\s+/);
      let name, url;
      if (parts.length >= 2) {
        // Last token is URL if it looks like one, rest is name
        const last = parts[parts.length - 1];
        if (/^https?:\/\//i.test(last) || /^[\w-]+\./i.test(last)) {
          url = normalizeUrl(last);
          name = parts.slice(0, -1).join(' ');
        } else {
          url = normalizeUrl(parts[0]);
          name = parts.slice(1).join(' ');
        }
      } else {
        url = normalizeUrl(parts[0]);
        name = '';
      }
      if (!url || url === 'https://') return;
      if (!name) {
        try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url; }
      }
      const slot = findFreeSlot(r.defW, r.defH, state.widgets);
      addWidget({id:genId('link'), type:'link', x:slot.x, y:slot.y, w:r.defW, h:r.defH, config:{name, url}});
      count++;
    });
    close();
    if (count > 0) toast(t('bulk_add_result', count), 'ok');
    else toast(t('bulk_add_none'), '');
  });

  ta.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  row.append(cancelBtn, addBtn);
  box.append(title, ta, row);
  ov.appendChild(box);
  document.body.appendChild(ov);
  setTimeout(() => ta.focus(), 60);
}

function renderSettings() {
  const dark=state.settings.theme==='dark', isMonet=state.settings.theme==='monet';
  const monetHue=state.settings.monetHue||'lavender', zh=lang==='zh';
  const bg=state.settings.background||{...BG_DEFAULTS};
  const thL=(!dark&&!isMonet)?' active':'', thD=dark?' active':'', thM=isMonet?' active':'';
  const lzh=zh?' active-2':'', len=!zh?' active-2':'';

  document.getElementById('settings-body').innerHTML = `
    <div class="s-section">
      <div class="s-sec-title">${t('appearance')}</div>
      <div class="theme-picker">
        <button class="theme-card tc-dark${thD}" id="sd" aria-label="${t('theme_dark')}">
          <div class="tc-preview"><div class="tc-bar tc-bar-wide"></div><div class="tc-bar tc-bar-mid"></div><div class="tc-bar tc-bar-thin"></div></div>
          <span class="tc-label">🌙 ${t('theme_dark')}</span></button>
        <button class="theme-card tc-light${thL}" id="sl" aria-label="${t('theme_light')}">
          <div class="tc-preview"><div class="tc-bar tc-bar-wide"></div><div class="tc-bar tc-bar-mid"></div><div class="tc-bar tc-bar-thin"></div></div>
          <span class="tc-label">☀️ ${t('theme_light')}</span></button>
        <button class="theme-card tc-monet${thM}" id="sm" aria-label="${t('theme_monet')}">
          <div class="tc-preview" style="background:${MONET_HUES.find(h=>h.id===monetHue)?.grad||'linear-gradient(135deg,#dfe7ff,#f3e8ff,#e8f6ff)'}">
            <div class="tc-bar tc-bar-wide" style="background:${MONET_HUES.find(h=>h.id===monetHue)?.accent||'#6c5ce7'};opacity:.9"></div>
            <div class="tc-bar tc-bar-mid" style="background:rgba(255,255,255,0.6)"></div>
            <div class="tc-bar tc-bar-thin" style="background:rgba(255,255,255,0.35)"></div>
          </div>
          <span class="tc-label">🍂 ${t('theme_monet')}</span></button>
      </div>
      <div class="s-sec-title" style="margin-bottom:8px;margin-top:2px">${zh?'莫奈色调':'Monet Palette'}</div>
      <div class="monet-hues-full" id="monet-hues">
        ${MONET_HUES.map(h=>`<button class="monet-hue-btn${monetHue===h.id?' active':''}" data-hue="${h.id}" title="${zh?h.label:h.labelEn}">
          <div class="mhb-preview" style="background:${h.grad||h.bg}"><div class="mhb-bar" style="background:${h.accent};width:80%;opacity:.9"></div><div class="mhb-bar" style="background:rgba(255,255,255,0.65);width:55%"></div><div class="mhb-bar" style="background:rgba(255,255,255,0.35);width:38%"></div></div>
          <span class="mhb-label">${zh?h.label:h.labelEn}</span></button>`).join('')}
      </div>
      <div class="s-sec-title" style="margin-top:14px">${zh?'自定义背景':'Custom Background'}</div>
      <div class="bgc" id="bgc" tabindex="0" role="button" aria-label="${zh?'上传背景图片':'Upload background image'}">
        ${(bg.type==='image'&&bg.value)?(
          '<img src="'+bg.value+'" alt="bg" loading="lazy">'+
          '<div class="bgc-hover"><div class="bgc-hover-ico">📷</div><div class="bgc-hover-lbl">'+(zh?'更换背景':'Change background')+'</div></div>'+
          '<div class="bgc-drag-hint"><div class="bgc-drag-ico">📥</div><div class="bgc-drag-lbl">'+(zh?'放开以更换':'Drop to replace')+'</div></div>'+
          '<button class="bgc-del" id="s-bg-remove">✕ '+(zh?'移除':'Remove')+'</button>'
        ):(
          '<div class="bgc-empty"><div class="bgc-empty-ico">📷</div><div class="bgc-empty-lbl">'+(zh?'上传背景图片':'Upload background image')+'</div></div>'+
          '<div class="bgc-drag-hint"><div class="bgc-drag-ico">📥</div><div class="bgc-drag-lbl">'+(zh?'拖放图片':'Drop image here')+'</div></div>'
        )}
      </div>
      <div class="bg-ctrl-ttl">${zh?'背景控制':'Background Controls'}</div>
      ${(bg.type==='image'&&bg.value)?`
      <div class="bg-palette-row">
        <button class="bg-palette-btn${bg.palette?' active':''}" id="s-bg-sample">${bg.palette?(zh?'✨ 已启用取色':'✨ Palette Active'):(zh?'🎨 从背景取色':'🎨 Sample Colors')}</button>
        ${bg.palette?`<button class="bg-palette-clear" id="s-bg-palette-clear" title="${zh?'恢复默认配色':'Reset palette'}">✕</button>`:''}
      </div>
      <div class="bg-palette-hint">${zh?(bg.palette?`已提取主色调 H:${bg.palette.h}° — 点击重新取色`:'从背景图自动提取主色，智能调整文字与强调色'):(bg.palette?`Dominant hue H:${bg.palette.h}° — click to re-sample`:'Auto-extract dominant color to adjust text & accent')}</div>`:''}
      <div class="bg-sl-block"><div class="bg-sl-hd"><span class="bg-sl-lbl">${t('bg_blur')}</span><span class="bg-sl-val" id="s-blur-val">${parseFloat(bg.blur)||0}px</span></div>
        <input type="range" class="bg-slider" id="s-blur" min="0" max="20" step="1" value="${parseFloat(bg.blur)||0}" ${!(bg.type==='image'&&bg.value)?'disabled':''}></div>
      <div class="bg-sl-block"><div class="bg-sl-hd"><span class="bg-sl-lbl">${t('bg_overlay')}</span><span class="bg-sl-val" id="s-ov-val">${Math.round((parseFloat(bg.overlay)||0)*100)}%</span></div>
        <input type="range" class="bg-slider" id="s-overlay" min="0" max="0.8" step="0.05" value="${parseFloat(bg.overlay)||0}"></div>
      <div class="bg-sl-block"><div class="bg-sl-hd"><span class="bg-sl-lbl">${t('bg_brightness')}</span><span class="bg-sl-val" id="s-bright-val">${Math.round((parseFloat(bg.brightness)||1)*100)}%</span></div>
        <input type="range" class="bg-slider" id="s-brightness" min="0.3" max="1.5" step="0.05" value="${parseFloat(bg.brightness)||1}" ${!(bg.type==='image'&&bg.value)?'disabled':''}></div>
    </div>
    <div class="s-section">
      <div class="s-sec-title">${zh?'布局':'Layout'}</div>
      <div class="s-toggle-row" style="margin-top:4px"><div><div class="s-label">${zh?'纯净模式':'Pure Mode'}</div><div class="s-sub">${zh?'只显示时间和搜索框':'Show only clock and search'}</div></div><label class="s-toggle"><input type="checkbox" id="s-pure" ${pureMode?'checked':''}><span class="s-toggle-track"></span></label></div>
    </div>
    <div class="s-section">
      <div class="s-sec-title">${t('active_widgets')}</div>
      <div class="s-row"><div><div class="s-label">${t('active_widgets')}</div><div class="s-sub">${t('widget_count',state.widgets.length)}</div></div><button class="s-btn" id="s-add">${t('add_more')}</button></div>
      <div class="s-row"><div class="s-label">${t('add_quick_link')}</div><div style="display:flex;gap:6px"><button class="s-btn" id="s-add-link">＋ ${t('add_link')}</button><button class="s-btn" id="s-bulk-link">≡ ${t('bulk_add_link')}</button></div></div>
    </div>
    <div class="s-section">
      <div class="s-sec-title">${t('search_engine')}</div>
      ${Object.entries(ENGINES).map(([k,v])=>`<div class="s-row"><div class="s-label">${v.label}</div><button class="s-btn" style="${curEng===k?'border-color:var(--accent);color:var(--accent)':''}" data-e="${k}">${curEng===k?'✓ Active':'Use'}</button></div>`).join('')}
    </div>
    <div class="s-section">
      <div class="s-sec-title">${t('language')}</div>
      <div class="dual-btns"><button class="dual-btn${lzh}" id="slzh">🇨🇳 中文</button><button class="dual-btn${len}" id="slen">🇺🇸 English</button></div>
    </div>
    <div class="s-section">
      <div class="s-sec-title">${t('data_section')}</div>
      <div class="s-row"><div><div class="s-label">${t('export_layout')}</div><div class="s-sub">${t('export_sub')}</div></div><button class="s-btn" id="s-exp">${t('export_btn')}</button></div>
      <div class="s-row"><div><div class="s-label">${t('reset_dashboard')}</div><div class="s-sub">${t('reset_sub')}</div></div><button class="s-btn danger" id="s-rst">${t('reset_btn')}</button></div>
    </div>
    <div class="s-section">
      <div class="s-sec-title">${t('shortcuts')}</div>
      <div class="s-row"><div class="s-label">${t('cmd_palette')}</div><span class="s-kbd">Ctrl+K</span></div>
      <div class="s-row"><div class="s-label">${t('add_widget')}</div><span class="s-kbd">Ctrl+A</span></div>
      <div class="s-row"><div class="s-label">${t('toggle_theme')}</div><span class="s-kbd">Ctrl+T</span></div>
      <div class="s-row"><div class="s-label">${t('edit_mode_label')}</div><span class="s-kbd">Ctrl+E</span></div>
      <div class="s-row"><div class="s-label">${zh?'关闭面板':'Close Panel'}</div><span class="s-kbd">Esc</span></div>
      <div class="s-row"><div class="s-label">${zh?'纯净模式':'Pure Mode'}</div><span class="s-kbd">Ctrl+P</span></div>
    </div>`;

  const body = document.getElementById('settings-body');
  body.querySelector('#sl')?.addEventListener('click', function(){applyTheme('light',this);});
  body.querySelector('#sd')?.addEventListener('click', function(){applyTheme('dark',this);});
  body.querySelector('#sm')?.addEventListener('click', function(){applyTheme('monet',this);});
  body.querySelectorAll('.monet-hue-btn').forEach(btn=>btn.addEventListener('click',function(e){e.stopPropagation();applyMonetHue(this.dataset.hue,this);}));
  body.querySelector('#slzh')?.addEventListener('click',()=>setLang('zh'));
  body.querySelector('#slen')?.addEventListener('click',()=>setLang('en'));
  body.querySelector('#s-pure')?.addEventListener('change', e=>{ e.target.checked?enterPureMode():exitPureMode(); });

  const bgFileInput=document.getElementById('bg-file-input');
  const bgc=body.querySelector('#bgc');
  bgc?.addEventListener('click',e=>{if(e.target.closest('#s-bg-remove'))return;bgFileInput?.click();});
  bgc?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('#s-bg-remove')){e.preventDefault();bgFileInput?.click();}});
  body.querySelector('#s-bg-remove')?.addEventListener('click',e=>{
    e.stopPropagation();if(!state.settings.background)return;
    state.settings.background.type='default';state.settings.background.value='';delete state.settings.background.palette;
    applyBgPalette(null);saveState();applyBackground();renderSettings();
    toast(zh?'背景已移除':'Background removed','ok');
  });
  if (bgc) {
    bgc.addEventListener('dragenter',e=>{e.preventDefault();bgc.classList.add('bgc-drag');});
    bgc.addEventListener('dragover', e=>{e.preventDefault();bgc.classList.add('bgc-drag');});
    bgc.addEventListener('dragleave',e=>{if(!bgc.contains(e.relatedTarget))bgc.classList.remove('bgc-drag');});
    bgc.addEventListener('drop',e=>{e.preventDefault();bgc.classList.remove('bgc-drag');_loadBgFile(e.dataTransfer?.files?.[0]);});
  }
  body.querySelector('#s-bg-sample')?.addEventListener('click',function(){triggerBgPaletteExtraction(this);});
  body.querySelector('#s-bg-palette-clear')?.addEventListener('click',function(){clearBgPalette(this);});
  body.querySelector('#s-blur')?.addEventListener('input',e=>{if(!state.settings.background)state.settings.background={...BG_DEFAULTS};state.settings.background.blur=parseFloat(e.target.value);const v=body.querySelector('#s-blur-val');if(v)v.textContent=Math.round(parseFloat(e.target.value))+'px';debouncedSaveState();applyBackground();});
  body.querySelector('#s-overlay')?.addEventListener('input',e=>{if(!state.settings.background)state.settings.background={...BG_DEFAULTS};state.settings.background.overlay=parseFloat(e.target.value);const v=body.querySelector('#s-ov-val');if(v)v.textContent=Math.round(parseFloat(e.target.value)*100)+'%';debouncedSaveState();applyBackground();});
  body.querySelector('#s-brightness')?.addEventListener('input',e=>{if(!state.settings.background)state.settings.background={...BG_DEFAULTS};state.settings.background.brightness=parseFloat(e.target.value);const v=body.querySelector('#s-bright-val');if(v)v.textContent=Math.round(parseFloat(e.target.value)*100)+'%';debouncedSaveState();applyBackground();});
  body.querySelectorAll('[data-e]').forEach(b=>b.addEventListener('click',()=>{setEng(b.dataset.e);renderSettings();toast(t('engine_switched',ENGINES[b.dataset.e].label),'ok');}));
  body.querySelector('#s-add')?.addEventListener('click',()=>{closeSettings();openMkt();});
  body.querySelector('#s-add-link')?.addEventListener('click',()=>{closeSettings();setTimeout(()=>createQuickLink(),150);});
  body.querySelector('#s-bulk-link')?.addEventListener('click',()=>{closeSettings();setTimeout(()=>createBulkLinks(),150);});
  body.querySelector('#s-exp')?.addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({widgets:state.widgets,settings:state.settings},null,2)],{type:'application/json'});
    const blobUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=blobUrl;a.download='dashboard.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),100);toast(t('layout_exported'),'ok');
  });
  body.querySelector('#s-rst')?.addEventListener('click',()=>{
    confirm2(t('reset_confirm'),t('reset_sub'),t('reset_btn'),ok=>{
      if(!ok)return;
      state.widgets=DEF_WIDGETS.map(w=>({...w,config:{...w.config}}));state.settings={...DEF_SETTINGS,lang};
      saveState();applyTheme(state.settings.theme,null);renderAll();renderSettings();toast(t('dashboard_reset'),'ok');
    });
  });
}
