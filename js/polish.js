/* Kyro polish: ambient glow, shrinking header, mic/send swap, pull to refresh. No data changes. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const buzz = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  /* Ambient glow */
  const app = $(".wa-app");
  if (app && !$(".kx-ambient", app)) {
    const amb = document.createElement("div");
    amb.className = "kx-ambient";
    amb.innerHTML = "<i></i><i></i>";
    app.prepend(amb);
  }

  /* Header shrinks on scroll */
  const top = $("#mainTop"), main = $(".wa-main");
  if (top && main) main.addEventListener("scroll", (e) => {
    if (e.target.classList && e.target.classList.contains("tab-page")) top.classList.toggle("kx-compact", e.target.scrollTop > 12);
  }, true);
  document.addEventListener("click", (e) => { if (e.target.closest(".tab")) top && top.classList.remove("kx-compact"); });

  /* Mic <-> Send */
  const input = $("#messageInput"), comp = $("#composer");
  if (input && comp) {
    const update = () => comp.classList.toggle("kx-typing", !!input.value.trim());
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); update(); } });
    input.addEventListener("input", update);
    update();
  }

  /* Pull to refresh on the chat list */
  const ptr = document.createElement("div");
  ptr.className = "kx-ptr";
  ptr.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6a5.96 5.96 0 0 1 4.22 1.78L13 11h7V4z"/></svg>';
  if (main) main.appendChild(ptr);
  let startY = 0, pull = 0, active = false, busy = false;
  const page = () => $('.tab-page.is-on[data-tab="chats"]');
  const modalOpen = () => !!document.querySelector(".modal:not([hidden]):not(.is-off)");
  document.addEventListener("touchstart", (e) => {
    const p = page();
    if (busy || !p || modalOpen() || !p.contains(e.target) || p.scrollTop > 0) { active = false; return; }
    active = true; startY = e.touches[0].clientY; pull = 0;
    ptr.classList.remove("snap");
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!active) return;
    const p = page();
    const dy = e.touches[0].clientY - startY;
    if (!p || p.scrollTop > 0 || dy <= 0) { if (pull) reset(); active = dy > 0 && !!p; return; }
    pull = Math.min(dy * 0.5, 90);
    ptr.style.setProperty("--p", pull);
    ptr.classList.add("show");
  }, { passive: true });
  function reset() { pull = 0; ptr.classList.add("snap"); ptr.classList.remove("show", "spin"); ptr.style.setProperty("--p", 0); }
  document.addEventListener("touchend", async () => {
    if (!active) return;
    active = false;
    if (pull >= 60 && !busy) {
      busy = true; buzz(14);
      ptr.classList.add("snap", "spin"); ptr.style.setProperty("--p", 56);
      try { if (typeof loadChats === "function") await loadChats(); } catch (_) {}
      setTimeout(() => { reset(); busy = false; }, 500);
    } else reset();
  }, { passive: true });
  document.addEventListener("touchcancel", () => { active = false; reset(); }, { passive: true });
})();
