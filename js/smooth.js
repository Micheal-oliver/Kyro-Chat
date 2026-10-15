/* Kyro smooth layer: small behaviours that keep motion calm and cheap. No data or backend changes.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const body = document.body;

  /* ---------- 1. Only genuinely new bubbles animate ---------- */
  const msgs = $("#messages");
  const tuneImg = (img) => {
    if (!img || img.tagName !== "IMG" || img.dataset.ksDone) return;
    img.dataset.ksDone = "1";
    img.decoding = "async";
    if (!img.complete) {
      img.classList.add("ks-loading");
      const done = () => img.classList.remove("ks-loading");
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  };
  const tuneImgs = (node) => {
    if (node.nodeType !== 1) return;
    if (node.tagName === "IMG") tuneImg(node);
    else node.querySelectorAll && node.querySelectorAll("img").forEach(tuneImg);
  };

  if (msgs) {
    new MutationObserver((muts) => {
      const fresh = [];
      muts.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        tuneImgs(n);
        if (n.classList.contains("bubble")) fresh.push(n);
      }));
      // A whole history loading at once (more than 3) stays still; a live message pops in
      if (fresh.length && fresh.length <= 3) {
        fresh.forEach((n) => {
          n.classList.add("ks-new");
          n.addEventListener("animationend", () => n.classList.remove("ks-new"), { once: true });
        });
      }
    }).observe(msgs, { childList: true });
  }

  /* ---------- 2. Chat list: stagger once, then never replay on refresh ---------- */
  const list = $("#chatList");
  if (list) {
    let played = false;
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach(tuneImgs));
      if (played || !list.querySelector(".row")) return;
      played = true;
      list.classList.add("ks-stagger");
      setTimeout(() => list.classList.remove("ks-stagger"), 900);
    }).observe(list, { childList: true, subtree: true });
  }

  /* ---------- 3. Pause decorative loops when they can't be seen ---------- */
  const thread = $("#threadScreen");
  const sync = () => {
    const open = !!thread && !thread.hidden;
    body.classList.toggle("ks-thread-open", open);
    // Only pause under the full-screen chat on narrow screens (desktop shows both panes)
    const covered = open && window.matchMedia("(max-width: 959px)").matches;
    body.classList.toggle("ks-still", covered || document.hidden);
  };
  if (thread) new MutationObserver(sync).observe(thread, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", sync, { passive: true });
  sync();

  /* ---------- 4. Swipe from the left edge to go back (phones and tablets) ---------- */
  const back = $("#backChat");
  if (thread && back) {
    const EDGE = 26;          // px from the left edge where the gesture may start
    const narrow = () => window.matchMedia("(max-width: 959px)").matches;
    let sx = 0, sy = 0, t0 = 0, dx = 0, mode = "idle"; // idle | maybe | drag

    thread.addEventListener("touchstart", (e) => {
      mode = "idle";
      if (thread.hidden || !narrow() || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      sx = t.clientX; sy = t.clientY; t0 = Date.now(); dx = 0; mode = "maybe";
    }, { passive: true });

    thread.addEventListener("touchmove", (e) => {
      if (mode === "idle") return;
      const t = e.touches[0];
      const mx = t.clientX - sx, my = t.clientY - sy;
      if (mode === "maybe") {
        if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 8) { mode = "idle"; return; } // it's a vertical scroll
        if (mx > 8) { mode = "drag"; thread.classList.add("ks-dragging"); }
        else return;
      }
      if (e.cancelable) e.preventDefault();
      dx = Math.max(0, mx);
      thread.style.transform = "translate3d(" + dx + "px,0,0)";
    }, { passive: false });

    const finish = (cancelled) => {
      if (mode !== "drag") { mode = "idle"; return; }
      mode = "idle";
      const fast = dx / Math.max(1, Date.now() - t0) > 0.5;           // px per ms
      const go = !cancelled && (dx > window.innerWidth * 0.33 || (fast && dx > 40));
      thread.classList.remove("ks-dragging");
      void thread.offsetWidth;                                        // commit the dragged position first
      thread.style.transform = "";
      if (go) back.click();                                           // app's own back handler; CSS animates the exit
    };
    thread.addEventListener("touchend", () => finish(false), { passive: true });
    thread.addEventListener("touchcancel", () => finish(true), { passive: true });
  }
})();
