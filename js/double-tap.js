/* Kyro double-tap to react: double-tap a message to add or remove a heart.
   Uses the app's own reaction functions, so it syncs exactly like the reaction picker. 1-to-1 chats only.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const box = document.getElementById("messages");
  if (!box) return;
  const HEART = "\u2764\uFE0F";
  const SKIP = "a, button, audio, video, input, textarea, .reacts, .swipe-ico";

  const bubbleOf = (el) => (el && el.closest ? el.closest(".bubble") : null);

  function burst(bubble) {
    const r = bubble.getBoundingClientRect();
    const h = document.createElement("span");
    h.className = "ks-heart";
    h.textContent = HEART;
    h.style.left = r.left + r.width / 2 + "px";
    h.style.top = r.top + r.height / 2 + "px";
    h.setAttribute("aria-hidden", "true");
    document.body.appendChild(h);
    h.addEventListener("animationend", () => h.remove(), { once: true });
    try { navigator.vibrate && navigator.vibrate(10); } catch (_) {}
  }

  function react(bubble) {
    if (!bubble || bubble.dataset.react || !bubble.dataset.id) return;
    if (typeof currentPeer === "undefined" || !currentPeer || String(currentPeer.id).startsWith("group:")) return;
    const had = bubble._reacts && bubble._reacts[meId];
    const next = had === HEART ? "" : HEART;
    applyReaction(bubble.dataset.id, meId, next);
    sendChat({ text: "\u27e6x:" + bubble.dataset.id + "|" + next + "\u27e7", kind: "text" }).catch(() => {});
    if (next) burst(bubble);
    try { window.getSelection().removeAllRanges(); } catch (_) {}
  }

  /* Touch: two quick, still taps on the same bubble */
  let sx = 0, sy = 0, st = 0, moved = false, lastB = null, lastT = 0;
  box.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now(); moved = e.touches.length > 1;
  }, { passive: true });
  box.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
  }, { passive: true });
  box.addEventListener("touchend", (e) => {
    const b = bubbleOf(e.target);
    const tap = !moved && Date.now() - st < 260;
    if (!b || !tap || (e.target.closest && e.target.closest(SKIP))) { lastB = null; return; }
    const now = Date.now();
    if (lastB === b && now - lastT < 320) { lastB = null; react(b); }
    else { lastB = b; lastT = now; }
  });

  /* Mouse (desktop) */
  box.addEventListener("dblclick", (e) => {
    const b = bubbleOf(e.target);
    if (b && !(e.target.closest && e.target.closest(SKIP))) react(b);
  });
})();
