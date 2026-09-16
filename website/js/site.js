'use strict';

if (new URLSearchParams(location.search).has('review')) document.documentElement.classList.add('review');
const header=document.querySelector('.site-nav'), toggle=document.querySelector('.nav-toggle');
const closeMenu=()=>{ header.classList.remove('is-open'); toggle.setAttribute('aria-expanded','false'); };
toggle.addEventListener('click',()=>toggle.setAttribute('aria-expanded',String(header.classList.toggle('is-open'))));
document.querySelectorAll('.mobile-nav a').forEach(a=>a.addEventListener('click',closeMenu));
matchMedia('(min-width: 1024px)').addEventListener('change',e=>{ if(e.matches) closeMenu(); });

const links=[...document.querySelectorAll('.hiw-link')], stations=[...document.querySelectorAll('.hiw-sub')];
let spyPending=false;
function updateSpy(){
  let active=stations[0];
  stations.forEach(s=>{ if(s.getBoundingClientRect().top<=140) active=s; });
  links.forEach(a=>{
    const selected=a.getAttribute('href')==='#'+active.id;
    a.classList.toggle('is-active',selected);
    if(selected) a.setAttribute('aria-current','step'); else a.removeAttribute('aria-current');
  });
  spyPending=false;
}
function scheduleSpy(){ if(!spyPending){ spyPending=true; requestAnimationFrame(updateSpy); } }
addEventListener('scroll',scheduleSpy,{passive:true});
addEventListener('resize',scheduleSpy,{passive:true});
updateSpy();

document.querySelectorAll('.art img, .tile img, .st-emblem, .st-thumb').forEach(img=>{
  const frame=img.closest('.art, .tile')||img;
  const fail=()=>{
    if(!img.complete||img.naturalWidth) return;
    const fallback=img.dataset.fallback;
    if(fallback&&!img.dataset.fallbackTried){
      img.dataset.fallbackTried='1';
      img.closest('picture')?.querySelectorAll('source').forEach(s=>{ s.srcset=fallback; });
      img.src=fallback;
    } else frame.classList.add('is-missing');
  };
  img.addEventListener('error',fail);
  img.addEventListener('load',()=>frame.classList.remove('is-missing'));
  fail();
});

function loop(el){
  const steps = el.dataset.steps.split(',').map(Number), items = el.querySelectorAll('[data-step]');
  const apply = p => { el.dataset.phase = p; items.forEach(n => n.classList.toggle('on', +n.dataset.step <= p)); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(steps.length - 1); el.classList.add('is-done'); return; }
  let p = 0, t, on = false;
  const tick = () => { apply(p); const last = p === steps.length - 1; t = setTimeout(() => { p = last ? 0 : p + 1; tick(); }, steps[p] + (last ? 1400 : 0)); };
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !on) { on = true; tick(); } else if (!e.isIntersecting && on) { on = false; clearTimeout(t); } }, { threshold: .25 }).observe(el);
}
document.querySelectorAll('.vig[data-steps]').forEach(loop);

// HyperTrack report chips: not linked yet; a click says "Coming soon" for a moment.
document.querySelectorAll('button.cite-ht').forEach(b => {
  const arrow = b.querySelector('.cite-arrow');
  const text = document.createTextNode('');
  for (const n of [...b.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) { b.replaceChild(text, n); }
  text.textContent = b.dataset.label;
  let t;
  b.addEventListener('click', () => { b.classList.add('is-soon'); text.textContent = 'Coming soon'; clearTimeout(t); t = setTimeout(() => { b.classList.remove('is-soon'); text.textContent = b.dataset.label; }, 2200); });
});
