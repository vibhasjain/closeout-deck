'use strict';
// Product page only. site.js runs the nav, the report chip and the .vig demos; this adds the station scroll-spy and the compiler.
(() => {
  const links=[...document.querySelectorAll('.hiw-link')], stations=[...document.querySelectorAll('.hiw-sub')];
  if(!stations.length) return;
  let pending=false;
  const update=()=>{ pending=false; let active=stations[0]; stations.forEach(s=>{ if(s.getBoundingClientRect().top<=140) active=s; });
    links.forEach(a=>{ const on=a.getAttribute('href')==='#'+active.id; a.classList.toggle('is-active',on); if(on) a.setAttribute('aria-current','step'); else a.removeAttribute('aria-current'); }); };
  const schedule=()=>{ if(!pending){ pending=true; requestAnimationFrame(update); } };
  addEventListener('scroll',schedule,{passive:true}); addEventListener('resize',schedule,{passive:true}); update();
})();

function loop(el){
  const steps = el.dataset.steps.split(',').map(Number), items = el.querySelectorAll('[data-step]');
  const apply = p => { el.dataset.phase = p; items.forEach(n => n.classList.toggle('on', +n.dataset.step <= p)); };
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'), resettable=el.hasAttribute('data-resettable');
  if (reduced.matches&&!resettable) { apply(steps.length - 1); el.classList.add('is-done'); return; }
  let p = 0, t, on = false;
  const tick = () => { apply(p); const last = p === steps.length - 1; t = setTimeout(() => { p = last ? 0 : p + 1; tick(); }, steps[p] + (last ? 1400 : 0)); };
  new IntersectionObserver(([e]) => { if (e.isIntersecting && !on) { on = true; if(!resettable||!reduced.matches) tick(); } else if (!e.isIntersecting && on) { on = false; clearTimeout(t); } }, { threshold: .25 }).observe(el);
  if(resettable){
    const restart=()=>{
      clearTimeout(t);
      p=reduced.matches?steps.length-1:0;
      el.classList.toggle('is-done',reduced.matches);
      apply(p);
      if(on&&!reduced.matches) tick();
    };
    reduced.addEventListener('change',restart);
    restart();
    return restart;
  }
}
// The compiler opts into resetting the same phase driver when its source changes.
(() => {
  const compiler=document.querySelector('#rulebook .compiler');
  if(!compiler) return;
  const tabs=[...compiler.querySelectorAll('.compiler-tab')], panels=[...compiler.querySelectorAll('.compiler-panel')];
  const lifecycle=[...compiler.querySelectorAll('[data-life]')];
  const updateLifecycle=()=>{
    const phase=Number(compiler.dataset.phase??24), active=phase>=23?'live':phase>=22?'shadow':'draft';
    lifecycle.forEach(chip=>{
      const current=chip.dataset.life===active;
      chip.classList.toggle('tag-ok',current);
      if(current) chip.setAttribute('aria-current','step'); else chip.removeAttribute('aria-current');
    });
  };
  new MutationObserver(updateLifecycle).observe(compiler,{attributes:true,attributeFilter:['data-phase']});
  const restart=loop(compiler);
  const select=(index,focus=false)=>{
    tabs.forEach((tab,i)=>{
      const selected=i===index;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
      panels[i].hidden=!selected;
    });
    compiler.classList.add('is-resetting');
    restart();
    updateLifecycle();
    requestAnimationFrame(()=>compiler.classList.remove('is-resetting'));
    if(focus) tabs[index].focus();
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>select(i));
    tab.addEventListener('keydown',e=>{
      if(e.altKey||e.ctrlKey||e.metaKey) return;
      const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;
      if(next>=0){ e.preventDefault(); select(next,true); }
    });
  });
  updateLifecycle();
})();

