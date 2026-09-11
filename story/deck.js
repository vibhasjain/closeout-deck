(() => {
  const slides = [...document.querySelectorAll(".slide")];
  const cur = document.getElementById("cur");
  document.getElementById("tot").textContent = String(slides.length).padStart(2, "0");
  let i = Math.min(slides.length - 1, Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));

  function show(n) {
    i = Math.min(slides.length - 1, Math.max(0, n));
    slides.forEach((s, k) => s.classList.toggle("is-active", k === i));
    cur.textContent = String(i + 1).padStart(2, "0");
    history.replaceState(null, "", "#" + (i + 1));
  }
  document.getElementById("next").onclick = () => show(i + 1);
  document.getElementById("prev").onclick = () => show(i - 1);
  addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); show(i + 1); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); show(i - 1); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
    else if (e.key.toLowerCase() === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  });
  let x0 = 0;
  addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(dx < 0 ? i + 1 : i - 1); });
  addEventListener("hashchange", () => show((parseInt(location.hash.slice(1), 10) || 1) - 1));

  // ponytail: missing frame → dashed placeholder, so the deck reads while Codex is still rendering
  document.querySelectorAll(".frame img").forEach((img) => {
    const miss = () => img.closest(".frame").classList.add("is-missing");
    img.addEventListener("error", miss, { once: true });
    if (img.complete && img.naturalWidth === 0) miss();
  });
  show(i);
})();
