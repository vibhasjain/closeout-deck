(() => {
  const world = document.getElementById('world');
  const scenes = [...document.querySelectorAll('[data-scene]')];
  const stories = [...document.querySelectorAll('[data-story]')];
  const routeButtons = [...document.querySelectorAll('[data-route]')];
  const videos = [...document.querySelectorAll('[data-scrub-video]')];
  const chapterCurrent = document.getElementById('chapter-current');
  const progressBar = document.getElementById('progress-bar');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const count = scenes.length;
  let activeIndex = -1;
  let ticking = false;
  let viewportWidth = window.innerWidth;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const smoothstep = value => {
    const x = clamp(value);
    return x * x * (3 - 2 * x);
  };

  function worldProgress() {
    const rect = world.getBoundingClientRect();
    const scrollable = Math.max(1, world.offsetHeight - window.innerHeight);
    return clamp(-rect.top / scrollable);
  }

  function sceneOpacity(position, index) {
    const distance = Math.abs(position - index);
    return smoothstep(1 - clamp(distance / 0.72));
  }

  function queueSeek(video, progress) {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || reducedMotion.matches) return;

    const nextTime = clamp(progress) * Math.max(0, video.duration - 0.05);
    video.dataset.nextTime = String(nextTime);

    if (video.seeking) return;
    if (Math.abs(video.currentTime - nextTime) < 0.035) return;
    video.currentTime = nextTime;
  }

  function render() {
    ticking = false;

    const progress = worldProgress();
    const position = progress * (count - 1);
    const nextActive = Math.round(position);

    world.style.setProperty('--world-progress', progress.toFixed(4));
    progressBar.style.transform = `scaleX(${progress})`;

    scenes.forEach((scene, index) => {
      const opacity = sceneOpacity(position, index);
      const fadeRadius = 0.72;
      const local = index === 0
        ? clamp(position / fadeRadius)
        : index === count - 1
          ? clamp((position - index + fadeRadius) / fadeRadius)
          : clamp((position - index + fadeRadius) / (fadeRadius * 2));
      const videoProgress = index === 0 ? Math.max(0.02, local) : local;
      const depth = reducedMotion.matches ? 1 : 1.035 + local * 0.105;
      const drift = reducedMotion.matches ? 0 : (0.5 - local) * 2.4;

      scene.style.setProperty('--scene-opacity', opacity.toFixed(4));
      scene.style.setProperty('--scene-scale', depth.toFixed(4));
      scene.style.setProperty('--scene-drift', `${drift.toFixed(3)}%`);

      const video = scene.querySelector('video');
      if (video && opacity > 0.01) queueSeek(video, videoProgress);
    });

    stories.forEach((story, index) => {
      const opacity = sceneOpacity(position, index);
      const offset = clamp(position - index, -1, 1);
      story.style.setProperty('--story-opacity', opacity.toFixed(4));
      story.style.setProperty('--story-shift', `${(-offset * 30).toFixed(2)}px`);
      story.setAttribute('aria-hidden', opacity < 0.48 ? 'true' : 'false');
    });

    if (nextActive !== activeIndex) {
      activeIndex = nextActive;
      chapterCurrent.textContent = String(activeIndex + 1).padStart(2, '0');

      routeButtons.forEach((button, index) => {
        const selected = index === activeIndex;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-current', selected ? 'step' : 'false');
      });
    }
  }

  function requestRender() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(render);
  }

  function primeVideos() {
    videos.forEach(video => {
      const promise = video.play();
      if (promise) promise.then(() => video.pause()).catch(() => {});
    });
  }

  videos.forEach(video => {
    video.addEventListener('loadedmetadata', requestRender);
    video.addEventListener('seeked', () => {
      const pending = Number(video.dataset.nextTime);
      if (!Number.isFinite(pending) || Math.abs(video.currentTime - pending) < 0.035) return;
      video.currentTime = pending;
    });
  });

  routeButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      const rect = world.getBoundingClientRect();
      const worldTop = window.scrollY + rect.top;
      const scrollable = world.offsetHeight - window.innerHeight;
      window.scrollTo({
        top: worldTop + (index / (count - 1)) * scrollable,
        behavior: reducedMotion.matches ? 'auto' : 'smooth'
      });
    });
  });

  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    routeButtons[0].click();
  });

  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', () => {
    if (window.innerWidth === viewportWidth) return;
    viewportWidth = window.innerWidth;
    requestRender();
  }, { passive: true });
  window.addEventListener('orientationchange', requestRender, { passive: true });
  window.addEventListener('touchstart', primeVideos, { passive: true, once: true });
  window.addEventListener('pointerdown', primeVideos, { passive: true, once: true });
  reducedMotion.addEventListener('change', requestRender);

  requestRender();
})();
