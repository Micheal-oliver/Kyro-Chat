/* Kyro keyboard: keeps the message box (and whatever you're typing in) above the on-screen keyboard.
   Needed when the app runs full screen (installed app / APK), because there the phone doesn't shrink the page
   for the keyboard and it covers the bottom of the screen.
   It sets --kb (keyboard height in px) on <html>; kyro-keyboard.css uses it to lift the chat screen.
   How it finds the height, best first:
     1. VirtualKeyboard API (exact)   2. visualViewport (exact)   3. a measured-by-ratio guess (last resort).
   If the phone already resizes the page by itself, --kb stays 0 and nothing changes.
   Remove the <script> + <link> in app.html to undo. */
(() => {
  "use strict";
  const root = document.documentElement;
  const vv = window.visualViewport;
  const vk = navigator.virtualKeyboard;
  const FIELD = "input, textarea, [contenteditable=''], [contenteditable='true']";
  const NOKEY = /^(button|checkbox|radio|range|file|color|submit|reset|image)$/i;

  let kb = 0;            // height currently applied
  let exact = 0;         // height reported by the browser
  let guessed = false;   // are we using the last-resort guess?
  let baseInner = window.innerHeight;
  let timer = 0;

  const isField = (el) => !!el && el.matches && el.matches(FIELD) && !NOKEY.test(el.type || "");

  function apply(px) {
    px = Math.max(0, Math.round(px));
    if (px === kb) return;
    kb = px;
    root.style.setProperty("--kb", px + "px");
    root.classList.toggle("kb-open", px > 0);
    follow();
  }

  // keep the newest message and the field you're typing in visible
  function follow() {
    requestAnimationFrame(() => {
      const box = document.getElementById("messages");
      const ts = document.getElementById("threadScreen");
      if (box && ts && !ts.hidden && kb > 0) box.scrollTop = box.scrollHeight;
      const a = document.activeElement;
      if (kb > 0 && isField(a) && !(ts && !ts.hidden && ts.contains(a))) {
        try { a.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) {}
      }
    });
  }

  // 1) VirtualKeyboard API: we take over the keyboard handling and read its exact size
  if (vk) {
    try { vk.overlaysContent = true; } catch (_) {}
    vk.addEventListener("geometrychange", () => {
      exact = (vk.boundingRect && vk.boundingRect.height) || 0;
      if (exact > 0 || guessed) { guessed = false; apply(exact); }
    });
  }

  // 2) visualViewport: the keyboard covers the page but the visible area shrinks
  function fromViewport() {
    if (!vv) return 0;
    const layout = window.innerHeight;
    return Math.max(0, layout - vv.height - vv.offsetTop);
  }
  if (vv) {
    vv.addEventListener("resize", () => {
      const px = fromViewport();
      if (px > 100) { exact = px; guessed = false; apply(px); }
      else if (!exact || px < 20) { if (!vk || !vk.boundingRect || !vk.boundingRect.height) { exact = 0; if (!guessed) apply(0); } }
    });
  }

  // 3) last resort: the field is focused, nothing moved or resized -> assume a typical phone keyboard
  function guess() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const a = document.activeElement;
      if (!isField(a)) return;
      const landscape = window.innerWidth > window.innerHeight;
      if (landscape) return; // landscape keyboards usually take over the whole screen with their own box
      const resized = Math.abs(window.innerHeight - baseInner) > 120; // phone already resized the page
      if (resized || exact > 0 || kb > 0) return;
      guessed = true;
      apply(Math.min(420, Math.max(240, Math.round(window.innerHeight * 0.3))));
    }, 380);
  }

  document.addEventListener("focusin", (e) => { if (isField(e.target)) { baseInner = Math.max(baseInner, window.innerHeight); guess(); } });
  // tapping the field again after the keyboard was hidden with the Back button
  document.addEventListener("click", (e) => { if (isField(e.target) && kb === 0) guess(); }, true);
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (isField(document.activeElement)) return;
      guessed = false;
      if (!exact) apply(0);
    }, 120);
  });
  // tapping the message list closes the keyboard (like most chat apps)
  document.addEventListener("touchstart", (e) => {
    const a = document.activeElement;
    if (kb > 0 && isField(a) && e.target.closest && e.target.closest("#messages") && !e.target.closest(FIELD)) a.blur();
  }, { passive: true });
  window.addEventListener("orientationchange", () => { baseInner = window.innerHeight; apply(0); exact = 0; });
  window.addEventListener("resize", () => { if (!isField(document.activeElement)) baseInner = window.innerHeight; });

  window.KyroKeyboard = { height: () => kb };
})();
