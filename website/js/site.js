'use strict';

if (new URLSearchParams(location.search).has('review')) document.documentElement.classList.add('review');
const header=document.querySelector('.site-nav'), toggle=document.querySelector('.nav-toggle');
const closeMenu=()=>{ header.classList.remove('is-open'); toggle.setAttribute('aria-expanded','false'); };
toggle.addEventListener('click',()=>toggle.setAttribute('aria-expanded',String(header.classList.toggle('is-open'))));
document.querySelectorAll('.mobile-nav a').forEach(a=>a.addEventListener('click',closeMenu));
matchMedia('(min-width: 1024px)').addEventListener('change',e=>{ if(e.matches) closeMenu(); });

// Hero carousel: one animation clocks both the progress line and the next slide.
(() => {
  const carousel=document.querySelector('.carousel');
  if(!carousel) return;
  const slides=[...carousel.querySelectorAll('.slide')], dots=[...carousel.querySelectorAll('.carousel-dot')];
  const counter=carousel.querySelector('.carousel-counter'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let index=0, stopped=false, progress, touch;
  let hovered=matchMedia('(hover: hover)').matches&&carousel.matches(':hover');
  const paused=()=>stopped||reduced.matches||document.hidden||hovered||carousel.contains(document.activeElement);
  const sync=()=>{
    const hold=paused();
    carousel.classList.toggle('is-paused',hold);
    if(progress) hold?progress.pause():progress.play();
  };
  const show=(next,manual=false)=>{
    next=(next+slides.length)%slides.length;
    if(manual) stopped=true;
    if(next!==index&&slides[index].contains(document.activeElement)) carousel.focus({preventScroll:true});
    if(progress){ progress.onfinish=null; progress.cancel(); }
    index=next;
    slides.forEach((slide,i)=>{
      const active=i===index;
      slide.classList.toggle('is-active',active);
      slide.setAttribute('aria-hidden',String(!active));
      slide.inert=!active;
      dots[i].classList.toggle('is-active',active);
      if(active) dots[i].setAttribute('aria-current','true'); else dots[i].removeAttribute('aria-current');
    });
    counter.setAttribute('aria-live',manual?'polite':'off');
    counter.textContent=`${index+1} / ${slides.length}`;
    progress=dots[index].querySelector('.carousel-progress').animate([{width:'0%'},{width:'100%'}],{duration:5000,fill:'forwards'});
    progress.pause();
    progress.onfinish=()=>{ if(!paused()) show(index+1); };
    sync();
    carousel.dispatchEvent(new Event('slidechange'));
  };
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>show(i,true)));
  carousel.addEventListener('pointerenter',e=>{ if(e.pointerType!=='touch'){ hovered=true; sync(); } });
  carousel.addEventListener('pointerleave',e=>{ if(e.pointerType!=='touch'){ hovered=false; sync(); } });
  carousel.addEventListener('focusin',sync);
  carousel.addEventListener('focusout',()=>queueMicrotask(sync));
  carousel.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select,[contenteditable]')) return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){ e.preventDefault(); show(index+(e.key==='ArrowRight'?1:-1),true); }
  });
  carousel.addEventListener('touchstart',e=>{ touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null; },{passive:true});
  carousel.addEventListener('touchend',e=>{
    if(!touch||!e.changedTouches.length) return;
    const dx=e.changedTouches[0].clientX-touch.x, dy=e.changedTouches[0].clientY-touch.y;
    touch=null;
    if(Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)) show(index+(dx<0?1:-1),true);
  },{passive:true});
  carousel.addEventListener('touchcancel',()=>{ touch=null; },{passive:true});
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',sync);
  const fromHash=()=>{
    const target=slides.findIndex(slide=>'#'+slide.id===location.hash);
    if(target>=0) show(target,true);
  };
  addEventListener('hashchange',fromHash);
  show(0);
  fromHash();
  requestAnimationFrame(()=>carousel.classList.add('is-ready'));
  // the other slides' art loads only after the first view has finished loading
  const warm=()=>carousel.classList.add('is-warm');
  if(document.readyState==='complete') warm(); else addEventListener('load',warm);
})();

document.querySelectorAll('.art img, .tile img, .what-emblem').forEach(img=>{
  const frame=img.closest('.art, .tile')||img;
  const landscape=img.getAttribute('src');
  const sources=[...(img.closest('picture')?.querySelectorAll('source')||[])];
  const fail=()=>{
    if(!img.complete||img.naturalWidth) return;
    if(!img.dataset.landscapeTried&&sources.some(s=>s.getAttribute('srcset')&&(!s.media||matchMedia(s.media).matches))){
      img.dataset.landscapeTried='1';
      sources.forEach(s=>s.removeAttribute('srcset'));
      img.src=landscape;
      return;
    }
    const fallback=img.dataset.fallback;
    if(fallback&&!img.dataset.fallbackTried){
      img.dataset.fallbackTried='1';
      sources.forEach(s=>s.removeAttribute('srcset'));
      img.src=fallback;
    } else frame.classList.add('is-missing');
  };
  img.addEventListener('error',fail);
  img.addEventListener('load',()=>frame.classList.remove('is-missing'));
  fail();
});

// HyperTrack report chips: not linked yet; a click says "Coming soon" for a moment.
document.querySelectorAll('button.cite-ht').forEach(b => {
  const arrow = b.querySelector('.cite-arrow');
  const text = document.createTextNode('');
  for (const n of [...b.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) { b.replaceChild(text, n); }
  text.textContent = b.dataset.label;
  let t;
  b.addEventListener('click', () => { b.classList.add('is-soon'); text.textContent = 'Coming soon'; clearTimeout(t); t = setTimeout(() => { b.classList.remove('is-soon'); text.textContent = b.dataset.label; }, 2200); });
});

// nav is transparent over the hero and turns white once the page scrolls
(() => { const nav = document.querySelector('.site-nav'); if (!nav) return; const upd = () => nav.classList.toggle('is-scrolled', window.scrollY > 24); upd(); addEventListener('scroll', upd, { passive: true }); })();

// parallax on the big art: ±24px over each image's scroll range
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), mobile=matchMedia('(max-width: 700px)');
  const imgs = [...document.querySelectorAll('.bleed .bleed-art img')];
  let ticking = false;
  const update = () => {
    ticking=false;
    for(const img of imgs){
      const slide=img.closest('.slide'), active=!reduced.matches&&!mobile.matches&&(!slide||slide.classList.contains('is-active'));
      img.classList.toggle('px-art',active);
      if(!active){ img.style.removeProperty('--px'); continue; }
      const r=(slide||img.closest('.bleed, .art')||img).getBoundingClientRect();
      if(r.bottom<0||r.top>innerHeight) continue;
      const p=(r.top+r.height/2-innerHeight/2)/(innerHeight/2+r.height/2);
      img.style.setProperty('--px',(Math.max(-1,Math.min(1,p))*-24).toFixed(1)+'px');
    }
  };
  const schedule=()=>{ if(!ticking){ ticking=true; requestAnimationFrame(update); } };
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  document.querySelector('.carousel')?.addEventListener('slidechange',schedule);
  reduced.addEventListener('change',schedule);
  mobile.addEventListener('change',schedule);
  update();
})();

// carousel arrows: step and pause autoplay like a dot click
(() => { const c = document.querySelector('.carousel'); if (!c) return; const dots = [...c.querySelectorAll('.carousel-dot')]; const step = d => { const i = dots.findIndex(b => b.classList.contains('is-active')); dots[(i + d + dots.length) % dots.length].click(); }; c.querySelector('.carousel-arrow--prev')?.addEventListener('click', () => step(-1)); c.querySelector('.carousel-arrow--next')?.addEventListener('click', () => step(1)); })();

// Shift Work Summit dropdown: opens on hover and on click; Escape and outside clicks close it
(() => {
  const dd=document.querySelector('.nav-dd'); if(!dd) return;
  const btn=dd.querySelector('.nav-dd-btn');
  const set=open=>{ dd.classList.toggle('is-open',open); btn.setAttribute('aria-expanded',String(open)); };
  // a mouse click never closes what hover just opened
  btn.addEventListener('click',e=>set(e.pointerType==='mouse'||btn.getAttribute('aria-expanded')!=='true'));
  dd.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse') set(true); });
  dd.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse') set(false); });
  dd.addEventListener('focusout',e=>{ if(!dd.contains(e.relatedTarget)) set(false); });
  dd.addEventListener('keydown',e=>{ if(e.key==='Escape'){ set(false); btn.focus(); } });
  document.addEventListener('click',e=>{ if(!dd.contains(e.target)) set(false); });
})();

// speaker row: arrows page the native scroller; no auto-scroll
(() => {
  const row=document.querySelector('.spk-row'); if(!row) return;
  const prev=document.querySelector('.spk-arrow--prev'), next=document.querySelector('.spk-arrow--next');
  const upd=()=>{ prev.disabled=row.scrollLeft<=4; next.disabled=row.scrollLeft>=row.scrollWidth-row.clientWidth-4; };
  const page=d=>row.scrollBy({left:d*Math.max(276,row.clientWidth-276),behavior:'smooth'});
  prev.addEventListener('click',()=>page(-1)); next.addEventListener('click',()=>page(1));
  row.addEventListener('scroll',upd,{passive:true}); addEventListener('resize',upd,{passive:true}); upd();
})();

// product vignettes: start on page load and loop, so they are already mid-run when scrolled to
document.querySelectorAll('.vig[data-steps]').forEach(el => {
  const steps = el.dataset.steps.split(',').map(Number), items = el.querySelectorAll('[data-step]');
  const apply = p => { el.dataset.phase = p; items.forEach(n => n.classList.toggle('on', +n.dataset.step <= p)); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(steps.length - 1); return; }
  let p = 0;
  const tick = () => { apply(p); const last = p === steps.length - 1; setTimeout(() => { p = last ? 0 : p + 1; tick(); }, steps[p] + (last ? 1400 : 0)); };
  tick();
});
