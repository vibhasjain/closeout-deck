'use strict';

if (new URLSearchParams(location.search).has('review')) document.documentElement.classList.add('review');

const header = document.querySelector('.site-nav');
const toggle = document.querySelector('.nav-toggle');
const closeMenu = () => {
  header.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
};
toggle.addEventListener('click', () => {
  const open = header.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.mobile-nav a').forEach(link => link.addEventListener('click', closeMenu));
matchMedia('(min-width: 1024px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const links = [...document.querySelectorAll('.hiw-link')];
const stations = [...document.querySelectorAll('.hiw-sub')];
let spyPending = false;
function updateSpy() {
  let active = stations[0];
  stations.forEach(station => { if (station.getBoundingClientRect().top <= 140) active = station; });
  links.forEach(link => {
    const selected = link.getAttribute('href') === '#' + active.id;
    link.classList.toggle('is-active', selected);
    if (selected) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  });
  spyPending = false;
}
function scheduleSpy() {
  if (!spyPending) { spyPending = true; requestAnimationFrame(updateSpy); }
}
addEventListener('scroll', scheduleSpy, { passive:true });
addEventListener('resize', scheduleSpy, { passive:true });
updateSpy();

document.querySelectorAll('.art img, .tile img').forEach(img => {
  const mark = () => img.closest('.art, .tile').classList.add('is-missing');
  img.addEventListener('error', mark, { once:true });
  if (img.complete && img.naturalWidth === 0) mark();
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
