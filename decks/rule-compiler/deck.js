(() => {
  "use strict";

  const slides = Array.from(document.querySelectorAll(".slide"));
  const previousButton = document.getElementById("previousButton");
  const nextButton = document.getElementById("nextButton");
  const currentSlide = document.getElementById("currentSlide");
  const totalSlides = document.getElementById("totalSlides");
  const sectionLabel = document.getElementById("sectionLabel");
  const progressFill = document.getElementById("progressFill");
  const notesButton = document.getElementById("notesButton");
  const notesPanel = document.getElementById("notesPanel");
  const notesContent = document.getElementById("notesContent");
  const notesSlideLabel = document.getElementById("notesSlideLabel");
  const closeNotesButton = document.getElementById("closeNotesButton");
  const fullscreenButton = document.getElementById("fullscreenButton");

  let index = getInitialSlide();
  let notesOpen = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartedAt = 0;
  let wheelLocked = false;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function getInitialSlide() {
    const match = window.location.hash.match(/^#(?:slide-)?(\d+)$/);
    if (!match) return 0;
    return Math.max(0, Math.min(slides.length - 1, Number(match[1]) - 1));
  }

  function setAssetState(asset) {
    const slot = asset.closest(".asset-slot");
    if (!slot) return;

    const markLoaded = () => {
      slot.classList.remove("is-missing");
      slot.classList.add("has-asset");
    };

    const markMissing = () => {
      slot.classList.remove("has-asset");
      slot.classList.add("is-missing");
    };

    asset.addEventListener("load", markLoaded, { once: true });
    asset.addEventListener("loadeddata", markLoaded, { once: true });
    asset.addEventListener("error", markMissing, { once: true });

    if (asset instanceof HTMLImageElement && asset.complete) {
      asset.naturalWidth > 0 ? markLoaded() : markMissing();
    }

    if (asset instanceof HTMLVideoElement && asset.readyState >= 2) {
      markLoaded();
    }
  }

  function syncMedia() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    slides.forEach((slide, slideIndex) => {
      slide.querySelectorAll("video").forEach((video) => {
        if (slideIndex === index && !reduceMotion) {
          const playback = video.play();
          if (playback && typeof playback.catch === "function") playback.catch(() => {});
        } else {
          video.pause();
        }
      });
    });
  }

  function updateNotes() {
    const notes = slides[index].querySelector("[data-notes]");
    notesContent.innerHTML = notes ? notes.innerHTML : "<p>No notes for this slide.</p>";
    notesSlideLabel.textContent = pad(index + 1);
  }

  function render({ updateHash = true } = {}) {
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle("is-active", active);
      slide.classList.toggle("is-before", slideIndex < index);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
    });

    const slide = slides[index];
    const lightChrome = slide.matches(".slide--paper, .slide--product-light, .slide--conversation, .slide--sources");
    document.body.classList.toggle("light-chrome", lightChrome);
    currentSlide.textContent = pad(index + 1);
    totalSlides.textContent = pad(slides.length);
    sectionLabel.textContent = slide.dataset.title || `Slide ${index + 1}`;
    progressFill.style.width = `${((index + 1) / slides.length) * 100}%`;
    previousButton.disabled = index === 0;
    nextButton.disabled = index === slides.length - 1;
    updateNotes();
    syncMedia();

    if (updateHash) {
      history.replaceState(null, "", `#${index + 1}`);
    }

    document.title = `${pad(index + 1)} — ${slide.dataset.title || "Ubeya × HyperTrack"}`;
  }

  function goTo(nextIndex) {
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (clamped === index) return;
    index = clamped;
    render();
  }

  function next() {
    goTo(index + 1);
  }

  function previous() {
    goTo(index - 1);
  }

  function setNotes(open) {
    notesOpen = open;
    notesPanel.classList.toggle("is-open", open);
    notesPanel.setAttribute("aria-hidden", String(!open));
    notesButton.setAttribute("aria-pressed", String(open));
    updateNotes();
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the embedding context. Navigation remains usable.
    }
  }

  function isInteractiveTarget(target) {
    return target instanceof Element && Boolean(target.closest("a, button, video, input, textarea, select, [contenteditable='true']"));
  }

  previousButton.addEventListener("click", previous);
  nextButton.addEventListener("click", next);
  notesButton.addEventListener("click", () => setNotes(!notesOpen));
  closeNotesButton.addEventListener("click", () => setNotes(false));
  fullscreenButton.addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (event) => {
    if (isInteractiveTarget(event.target) && event.key !== "Escape") return;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
        event.preventDefault();
        next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
      case "Backspace":
        event.preventDefault();
        previous();
        break;
      case "Home":
        event.preventDefault();
        goTo(0);
        break;
      case "End":
        event.preventDefault();
        goTo(slides.length - 1);
        break;
      case "n":
      case "N":
        event.preventDefault();
        setNotes(!notesOpen);
        break;
      case "f":
      case "F":
        event.preventDefault();
        toggleFullscreen();
        break;
      case "Escape":
        if (notesOpen) setNotes(false);
        break;
      default:
        break;
    }
  });

  document.addEventListener("wheel", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    if (wheelLocked || notesPanel.contains(event.target)) return;
    if (Math.abs(event.deltaY) < 28 && Math.abs(event.deltaX) < 28) return;

    wheelLocked = true;
    if (event.deltaY > 0 || event.deltaX > 0) next();
    else previous();
    window.setTimeout(() => {
      wheelLocked = false;
    }, 650);
  }, { passive: true });

  document.addEventListener("touchstart", (event) => {
    if (notesPanel.contains(event.target)) return;
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartedAt = performance.now();
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!touchStartedAt || notesPanel.contains(event.target)) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const elapsed = performance.now() - touchStartedAt;
    touchStartedAt = 0;

    if (elapsed > 700 || Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    deltaX < 0 ? next() : previous();
  }, { passive: true });

  window.addEventListener("hashchange", () => {
    const nextIndex = getInitialSlide();
    if (nextIndex !== index) {
      index = nextIndex;
      render({ updateHash: false });
    }
  });

  document.addEventListener("fullscreenchange", () => {
    fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
  });

  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", syncMedia);

  document.querySelectorAll("[data-optional-asset]").forEach(setAssetState);
  render({ updateHash: false });
})();
