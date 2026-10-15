/* Kyro message sounds: a soft tick when you send and a two-note pop when a message arrives, plus a short
   vibration on arrival. Two switches in Settings > Notifications (both on by default). Muted chats stay silent.
   Sounds are synthesised, so there are no audio files. No data or backend changes.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const SK = "kyro.sounds", VK = "kyro.vibrate";
  const on = (k) => { try { return localStorage.getItem(k) !== "off"; } catch (_) { return true; } };
  const set = (k, v) => { try { if (v) localStorage.removeItem(k); else localStorage.setItem(k, "off"); } catch (_) {} };

  /* ---------- sound engine (browsers only allow audio after a first tap) ---------- */
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, last = 0;
  function unlock() {
    if (!AC) return;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
    } catch (_) {}
  }
  ["pointerdown", "touchstart", "keydown"].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));

  function tone(freq, start, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function play(kind) {
    if (!on(SK) || !ctx || ctx.state !== "running") return;
    const now = Date.now();
    if (now - last < 250) return;
    last = now;
    if (kind === "sent") { tone(880, 0, 0.07, 0.05); tone(1320, 0.05, 0.09, 0.04); }
    else { tone(660, 0, 0.1, 0.07); tone(990, 0.09, 0.14, 0.06); }
  }
  function buzz() {
    if (!on(VK)) return;
    try { navigator.vibrate && navigator.vibrate([12, 50, 12]); } catch (_) {}
  }

  /* ---------- 1. Open chat: a live bubble appears (history loading stays silent) ---------- */
  const box = document.getElementById("messages");
  const thread = document.getElementById("threadScreen");
  let openedAt = 0;
  if (thread) new MutationObserver(() => { if (!thread.hidden) openedAt = Date.now(); }).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  if (box) {
    new MutationObserver((muts) => {
      let removed = false;
      const fresh = [];
      muts.forEach((m) => {
        if (m.removedNodes.length) removed = true;
        m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains("bubble")) fresh.push(n); });
      });
      if (removed || !fresh.length || fresh.length > 2 || Date.now() - openedAt < 1500) return;
      const b = fresh[fresh.length - 1];
      if (b.dataset.react) return;
      if (b.classList.contains("me")) play("sent");
      else { play("recv"); buzz(); }
    }).observe(box, { childList: true });
  }

  /* ---------- 2. Message in another chat: the app shows its pop-up, we add the sound ---------- */
  if (typeof showMessagePopup === "function") {
    const orig = showMessagePopup;
    window.showMessagePopup = function (peerId) {
      let muted = false;
      try { muted = typeof isMuted === "function" && isMuted(peerId); } catch (_) {}
      const r = orig.apply(this, arguments);
      if (!muted) { play("recv"); buzz(); }
      return r;
    };
  }

  /* ---------- 3. Settings switches ---------- */
  const pop = document.getElementById("setPopups");
  const anchor = pop && pop.closest(".set-row");
  function row(id, title, small, key, onTurnedOn) {
    const l = document.createElement("label");
    l.className = "set-row";
    l.innerHTML = "<span>" + title + "<small>" + small + '</small></span><span class="switch"><input type="checkbox" id="' + id + '" /><i></i></span>';
    const inp = l.querySelector("input");
    inp.checked = on(key);
    inp.addEventListener("change", () => { set(key, inp.checked); if (inp.checked && onTurnedOn) onTurnedOn(); });
    return l;
  }
  if (anchor && !document.getElementById("setSounds")) {
    const a = row("setSounds", "Message sounds", "A soft tick when you send, a pop when one arrives", SK, () => { unlock(); setTimeout(() => play("recv"), 150); });
    const b = row("setVibrate", "Vibrate on new message", "A short buzz when a message arrives", VK, () => buzz());
    anchor.after(a);
    a.after(b);
  }
})();
