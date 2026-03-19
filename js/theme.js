'use strict';
// ── View Transitions ripple ──────────────────────────────
let _rippleBusy = false;
let _currentTransition = null;

function _commitTheme(th) {
  document.documentElement.setAttribute('data-theme', th);
}

function _runRippleTransition(fromEl, commitFn, onDone) {
  if (!document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    commitFn();
    if (onDone) onDone();
    return;
  }

  // Skip any in-progress transition so the new one starts immediately
  if (_currentTransition) {
    _currentTransition.skipTransition();
    _currentTransition = null;
  }

  const root = document.documentElement;
  if (fromEl) {
    const r = fromEl.getBoundingClientRect();
    root.style.setProperty('--vt-ox', Math.round(r.left + r.width  / 2) + 'px');
    root.style.setProperty('--vt-oy', Math.round(r.top  + r.height / 2) + 'px');
  } else {
    root.style.setProperty('--vt-ox', window.innerWidth  + 'px');
    root.style.setProperty('--vt-oy', '0px');
  }

  const transition = document.startViewTransition(() => { commitFn(); });
  _currentTransition = transition;

  const fabGroup = document.getElementById('fab-group');
  if (fabGroup) fabGroup.classList.add('keep-visible');

  const cleanup = (isSelf) => {
    root.style.removeProperty('--vt-ox');
    root.style.removeProperty('--vt-oy');
    if (isSelf && fabGroup) fabGroup.classList.remove('keep-visible');
    if (isSelf) { _currentTransition = null; _rippleBusy = false; }
  };

  transition.finished.then(() => {
    cleanup(_currentTransition === transition);
    if (_currentTransition === transition && onDone) onDone();
  }).catch(() => cleanup(_currentTransition === transition));
}

function applyTheme(th, fromEl) {
  _runRippleTransition(fromEl, () => {
    _commitTheme(th);
    state.settings.theme = th;
    saveState();
    applyBackground();
  }, () => {
    if (document.getElementById('settings-bg')?.classList.contains('open')) renderSettings();
  });
}


// ── Background system ─────────────────────────────────────
const BG_DEFAULTS = { type:'default', value:'', overlay:0, blur:0, brightness:1 };

function applyBackground() {
  const bg    = state.settings.background || { ...BG_DEFAULTS };
  const layer = document.getElementById('bg-layer');
  const ovEl  = document.getElementById('bg-overlay');
  if (!layer) return;
  const hasImg   = bg.type === 'image' && bg.value;
  const hasColor = bg.type === 'color' && bg.value;
  if (hasImg) {
    layer.style.backgroundImage = `url("${bg.value}")`;
    layer.style.backgroundSize = 'cover'; layer.style.backgroundPosition = 'center'; layer.style.backgroundColor = '';
    const blurPx = parseFloat(bg.blur)||0, brightness = parseFloat(bg.brightness)||1;
    const filters = [];
    if (blurPx > 0) filters.push(`blur(${blurPx}px) scale(1.06)`);
    if (brightness !== 1) filters.push(`brightness(${brightness})`);
    layer.style.filter = filters.join(' ') || '';
  } else if (hasColor) {
    layer.style.backgroundImage = 'none'; layer.style.backgroundColor = bg.value; layer.style.filter = '';
  } else {
    layer.style.backgroundImage = 'none'; layer.style.backgroundColor = ''; layer.style.filter = '';
  }
  const ov = parseFloat(bg.overlay)||0;
  if (ov > 0 && !pureMode) {
    const th = document.documentElement.getAttribute('data-theme')||'dark';
    ovEl.style.background = th === 'light' ? `rgba(255,255,255,${ov*0.5})` : `rgba(0,0,0,${ov})`;
  } else { ovEl.style.background = ''; }
  document.body.classList.toggle('has-custom-bg', !!(hasImg || hasColor));
}

function _loadBgFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = ev => {
    if (!state.settings.background) state.settings.background = { ...BG_DEFAULTS };
    const bg = state.settings.background;
    bg.type = 'image'; bg.value = ev.target.result;
    if (bg.brightness === undefined) bg.brightness = 1;
    delete bg.palette; applyBgPalette(null);
    saveState(); applyBackground();
    if (document.getElementById('settings-bg')?.classList.contains('open')) renderSettings();
    toast(lang==='zh' ? '背景已更新，可点击「从背景取色」提取配色' : 'Background updated — tap "Sample Colors" to extract palette', 'ok');
  };
  reader.readAsDataURL(file);
}

// ── Palette extraction (K-means) ──────────────────────────
function _lin(c) { c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
function _lum(r,g,b) { return 0.2126*_lin(r)+0.7152*_lin(g)+0.0722*_lin(b); }
function _rgbToHsl(r,g,b) {
  r/=255;g/=255;b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b); let h=0,s=0;
  const l=(max+min)/2;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return [h*360,s,l];
}
function _hslToHex(h,s,l) {
  h/=360;const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
  const hue2rgb=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  return '#'+[hue2rgb(h+1/3),hue2rgb(h),hue2rgb(h-1/3)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
function _kmeans(pixels,k=6,iters=10) {
  const step=Math.max(1,Math.floor(pixels.length/k));
  let centroids=Array.from({length:k},(_,i)=>({...pixels[Math.min(i*step,pixels.length-1)]}));
  const assignments=new Int32Array(pixels.length);
  for(let it=0;it<iters;it++){
    for(let pi=0;pi<pixels.length;pi++){const p=pixels[pi];let best=0,bestDist=Infinity;for(let ci=0;ci<k;ci++){const c=centroids[ci];const d=(p.r-c.r)**2+(p.g-c.g)**2+(p.b-c.b)**2;if(d<bestDist){bestDist=d;best=ci;}}assignments[pi]=best;}
    const sums=Array.from({length:k},()=>({r:0,g:0,b:0,n:0}));
    for(let pi=0;pi<pixels.length;pi++){const s=sums[assignments[pi]],p=pixels[pi];s.r+=p.r;s.g+=p.g;s.b+=p.b;s.n++;}
    centroids=sums.map((s,ci)=>s.n>0?{r:s.r/s.n,g:s.g/s.n,b:s.b/s.n}:centroids[ci]);
  }
  const counts=new Int32Array(k);assignments.forEach(ci=>counts[ci]++);
  return centroids.map((c,i)=>({r:Math.round(c.r),g:Math.round(c.g),b:Math.round(c.b),count:counts[i]}));
}
function extractPaletteFromDataUrl(dataUrl) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const SIZE=64,canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,SIZE,SIZE);
        const {data}=ctx.getImageData(0,0,SIZE,SIZE);
        const pixels=[];
        for(let i=0;i<data.length;i+=16){const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a<200)continue;const lum=_lum(r,g,b);if(lum>0.92||lum<0.02)continue;pixels.push({r,g,b});}
        if(pixels.length<8){reject(new Error('not enough pixels'));return;}
        const scored=_kmeans(pixels,6,12).map(c=>{const[h,s,l]=_rgbToHsl(c.r,c.g,c.b);const vibrancy=s*(1-Math.abs(l-0.5)*2);return{...c,h,s,l,score:vibrancy*Math.sqrt(c.count)};}).sort((a,b)=>b.score-a.score);
        resolve(buildPaletteFromColor(scored[0]));
      }catch(e){reject(e);}
    };
    img.onerror=reject;img.src=dataUrl;
  });
}
function buildPaletteFromColor({r,g,b,h,s,l}){
  const lum=_lum(r,g,b),isDark=lum<0.25;
  const accentL=isDark?0.65:0.48,accentS=Math.min(1,Math.max(0.55,s));
  const accent=_hslToHex(h,accentS,accentL),accent2=_hslToHex((h+30)%360,accentS*0.85,accentL+0.08),accent3=_hslToHex((h+60)%360,accentS*0.7,accentL+0.12);
  const bgL=isDark?Math.min(l,0.20):Math.max(l,0.80),bgS=s*0.5;
  const bg1=_hslToHex(h,bgS,bgL),bg2=_hslToHex((h+20)%360,bgS*0.8,Math.min(bgL+0.06,0.97)),bg3=_hslToHex((h-20+360)%360,bgS*0.6,Math.min(bgL+0.10,0.98));
  const grad=`linear-gradient(135deg, ${bg1} 0%, ${bg2} 50%, ${bg3} 100%)`;
  const textPrimary=isDark?'#f2f2f8':'#12122a',textSecondary=isDark?'#c0c0d4':'#3a3a5c',textDim=isDark?'#8080a0':'#7070a0';
  const _ar=parseInt(accent.slice(1,3),16),_ag=parseInt(accent.slice(3,5),16),_ab=parseInt(accent.slice(5,7),16);
  const textOnAccent=_lum(_ar,_ag,_ab)>0.35?'#12122a':'#ffffff';
  const sa=isDark?'0.18':'0.22';
  const surface=`rgba(255,255,255,${sa})`,surfaceGlass=isDark?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.45)';
  const border=isDark?'rgba(255,255,255,0.18)':'rgba(255,255,255,0.55)',borderHover=isDark?'rgba(255,255,255,0.40)':'rgba(255,255,255,0.85)';
  const modalOverlay=isDark?'rgba(0,0,0,0.55)':`rgba(${r},${g},${b},0.35)`;
  return {h:Math.round(h),s:Math.round(s*100),l:Math.round(l*100),isDark,accent,accent2,accent3,textPrimary,textSecondary,textDim,textOnAccent,surface,surfaceGlass,border,borderHover,grad,bg:bg1,modalOverlay,ripple:_hslToHex(h,bgS*1.2,bgL)};
}
function applyBgPalette(palette) {
  const TAG_ID='bg-palette-vars'; const existing=document.getElementById(TAG_ID); if(existing)existing.remove(); if(!palette)return;
  const p=palette;
  const css=`:root{--accent:${p.accent};--accent2:${p.accent2};--accent3:${p.accent3};--text:${p.textPrimary};--text-primary:${p.textPrimary};--text-muted:${p.textSecondary};--text-secondary:${p.textSecondary};--text-dim:${p.textDim};--text-on-accent:${p.textOnAccent};--surface:${p.surface};--surface-glass:${p.surfaceGlass};--border:${p.border};--border-hover:${p.borderHover};--modal-overlay:${p.modalOverlay};--bg:${p.bg};}[data-theme]{--text:${p.textPrimary}!important;--text-primary:${p.textPrimary}!important;--text-muted:${p.textSecondary}!important;--text-secondary:${p.textSecondary}!important;--text-dim:${p.textDim}!important;--accent:${p.accent}!important;--accent2:${p.accent2}!important;--accent3:${p.accent3}!important;--text-on-accent:${p.textOnAccent}!important;--surface:${p.surface}!important;--surface-glass:${p.surfaceGlass}!important;--border:${p.border}!important;--border-hover:${p.borderHover}!important;--modal-overlay:${p.modalOverlay}!important;}`;
  const style=document.createElement('style');style.id=TAG_ID;style.textContent=css;document.head.appendChild(style);
}
async function triggerBgPaletteExtraction(fromBtn) {
  const bg=state.settings.background;
  if(!bg||bg.type!=='image'||!bg.value){toast(lang==='zh'?'请先上传背景图片':'Upload a background image first','err');return;}
  if(fromBtn){fromBtn.disabled=true;fromBtn.textContent=lang==='zh'?'取色中…':'Sampling…';}
  try{
    const palette=await extractPaletteFromDataUrl(bg.value);bg.palette=palette;saveState();applyBgPalette(palette);
    if(fromBtn&&!_rippleBusy){
      _runRippleTransition(fromBtn, () => { applyBgPalette(palette); }, () => {
        if(document.getElementById('settings-bg')?.classList.contains('open'))renderSettings();
      });
    } else {
      if(document.getElementById('settings-bg')?.classList.contains('open'))renderSettings();
    }
  }catch(e){toast(lang==='zh'?'取色失败，请重试':'Extraction failed, try again','err');}
  finally{if(fromBtn){fromBtn.disabled=false;fromBtn.textContent=lang==='zh'?'🎨 从背景取色':'🎨 Sample Colors';}}
}
function clearBgPalette(fromBtn) {
  const bg=state.settings.background;if(bg)delete bg.palette;
  saveState();applyBgPalette(null);
  toast(lang==='zh'?'已恢复默认配色':'Restored default palette','ok');
  if(document.getElementById('settings-bg')?.classList.contains('open'))renderSettings();
}
