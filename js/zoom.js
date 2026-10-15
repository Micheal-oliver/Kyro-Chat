/* Kyro photo zoom: tap a photo in a chat to open it full screen, then zoom in on it.
   - Pinch with two fingers, double-tap (or double-click) to zoom in and out
   - Drag to move around while zoomed
   - Mouse wheel / trackpad pinch on desktop, + / - buttons, keys + - 0 and Esc
   - Swipe down (when not zoomed) or tap the dark area to close
   Also upgrades the Media gallery viewer. Stickers and view-once photos are left alone.
   Remove the <script> and <link> lines in app.html to undo. No backend change. */
(() => {
  "use strict";

  const MAX = 6;
  const DOUBLE_TAP_ZOOM = 2.5;
  let viewer = null;

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt) n.textContent = txt;
    return n;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function open(src, alt) {
    if (!src) return;
    if (viewer) viewer.close(true);

    const root = el("div", "kz");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Photo viewer");

    const stage = el("div", "kz-stage");
    const img = el("img", "kz-img");
    img.alt = alt || "photo";
    img.draggable = false;
    img.src = src;
    stage.appendChild(img);

    const closeBtn = el("button", "kz-x", "\u00d7");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close photo");

    const bar = el("div", "kz-bar");
    const minus = el("button", "kz-btn", "\u2212");
    const pct = el("span", "kz-pct", "100%");
    const plus = el("button", "kz-btn", "+");
    const reset = el("button", "kz-reset", "Reset");
    minus.type = plus.type = reset.type = "button";
    minus.setAttribute("aria-label", "Zoom out");
    plus.setAttribute("aria-label", "Zoom in");
    bar.append(minus, pct, plus, reset);
    if (navigator.share) {
      const share = el("button", "kz-btn kz-share", "\u2197");
      share.type = "button";
      share.setAttribute("aria-label", "Share photo");
      share.addEventListener("click", () => { if (window.KyroMsg) window.KyroMsg.shareImage(src); });
      bar.append(share);
    }

    const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    const hint = el("p", "kz-hint", coarse ? "Pinch or double-tap to zoom" : "Scroll or double-click to zoom");

    root.append(stage, closeBtn, bar, hint);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add("on"));
    setTimeout(() => hint.classList.add("off"), 2600);

    /* ---------- state ---------- */
    let s = 1, tx = 0, ty = 0;
    const ptrs = new Map();
    let pinch = null, pan = null, dismiss = null, down = null;
    let lastTap = { t: 0, x: 0, y: 0 };

    const rect = () => stage.getBoundingClientRect();
    const rel = (x, y) => {
      const r = rect();
      return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) };
    };

    function limits() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const w = img.offsetWidth * s, h = img.offsetHeight * s;
      return { mx: Math.max(0, (w - W) / 2), my: Math.max(0, (h - H) / 2) };
    }
    function fit() {
      const l = limits();
      tx = clamp(tx, -l.mx, l.mx);
      ty = clamp(ty, -l.my, l.my);
    }
    function apply() {
      img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
      pct.textContent = Math.round(s * 100) + "%";
      const zoomed = s > 1.02;
      stage.classList.toggle("zoomed", zoomed);
      root.classList.toggle("is-zoomed", zoomed);
    }
    function anim(on) { img.classList.toggle("anim", !!on); }

    /* zoom to scale ns, keeping the point (cx, cy) relative to the stage centre fixed */
    function zoomTo(ns, cx, cy, animate) {
      ns = clamp(ns, 1, MAX);
      const r = ns / s;
      tx = cx - (cx - tx) * r;
      ty = cy - (cy - ty) * r;
      s = ns;
      if (s <= 1.001) { s = 1; tx = 0; ty = 0; }
      anim(animate);
      fit();
      apply();
    }
    const zoomBy = (f) => zoomTo(s * f, 0, 0, true);
    const resetZoom = () => zoomTo(1, 0, 0, true);

    /* ---------- pointer gestures ---------- */
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function startPinch() {
      const [a, b] = [...ptrs.values()];
      const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { d0: dist(a, b) || 1, s0: s, mx0: m.x, my0: m.y, tx0: tx, ty0: ty };
      pan = null;
      dismiss = null;
    }
    function startPan(p) {
      pan = { x: p.x, y: p.y, tx0: tx, ty0: ty };
      pinch = null;
    }

    stage.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      anim(false);
      if (ptrs.size === 2) {
        startPinch();
        down = null;
      } else if (ptrs.size === 1) {
        down = { t: Date.now(), x: e.clientX, y: e.clientY, onImg: e.target === img, moved: false };
        startPan({ x: e.clientX, y: e.clientY });
      }
    });

    stage.addEventListener("pointermove", (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;

      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const m = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
        const ns = clamp(pinch.s0 * (dist(a, b) / pinch.d0), 1, MAX);
        const r = ns / pinch.s0;
        s = ns;
        tx = m.x - (pinch.mx0 - pinch.tx0) * r;
        ty = m.y - (pinch.my0 - pinch.ty0) * r;
        fit();
        apply();
        return;
      }

      if (!pan) return;
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;

      if (s > 1.02) {
        tx = pan.tx0 + dx;
        ty = pan.ty0 + dy;
        fit();
        apply();
      } else if (dismiss || (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx))) {
        /* not zoomed: dragging down/up slides the photo away to close */
        dismiss = { dy };
        img.style.transform = "translate(0px," + dy + "px) scale(" + (1 - Math.min(Math.abs(dy) / 1200, 0.15)) + ")";
        root.style.background = "rgba(0,0,0," + (0.94 * (1 - Math.min(Math.abs(dy) / 360, 0.7))) + ")";
      }
    });

    function endPointer(e, cancelled) {
      if (!ptrs.has(e.pointerId)) return;
      const hadTwo = ptrs.size >= 2;
      ptrs.delete(e.pointerId);
      try { stage.releasePointerCapture(e.pointerId); } catch (_) {}

      if (hadTwo) {
        /* a finger lifted off a pinch: carry on panning with the remaining one */
        pinch = null;
        down = null;
        anim(true);
        if (s < 1.05) { s = 1; tx = 0; ty = 0; }
        fit();
        apply();
        if (ptrs.size === 1) startPan([...ptrs.values()][0]);
        return;
      }

      if (ptrs.size > 0) return;
      pan = null;

      if (dismiss) {
        const far = Math.abs(dismiss.dy) > 110;
        dismiss = null;
        if (far && !cancelled) { close(); return; }
        anim(true);
        root.style.background = "";
        apply();
        return;
      }

      const d = down;
      down = null;
      if (cancelled || !d || d.moved || Date.now() - d.t > 350) return;

      const now = Date.now();
      const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32;
      if (now - lastTap.t < 300 && near) {
        lastTap.t = 0;
        if (s > 1.05) resetZoom();
        else { const c = rel(e.clientX, e.clientY); zoomTo(DOUBLE_TAP_ZOOM, c.x, c.y, true); }
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      /* single tap on the dark area closes (only when not zoomed) */
      if (!d.onImg && s <= 1.02) setTimeout(() => { if (lastTap.t === now && viewer && viewer.root === root) close(); }, 310);
    }
    stage.addEventListener("pointerup", (e) => endPointer(e, false));
    stage.addEventListener("pointercancel", (e) => endPointer(e, true));

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      const c = rel(e.clientX, e.clientY);
      zoomTo(s * f, c.x, c.y, false);
    }, { passive: false });

    /* stop iOS Safari from zooming the whole page instead */
    ["gesturestart", "gesturechange", "gestureend"].forEach((t) => root.addEventListener(t, (e) => e.preventDefault()));

    /* ---------- controls ---------- */
    plus.addEventListener("click", () => zoomBy(1.6));
    minus.addEventListener("click", () => zoomBy(1 / 1.6));
    reset.addEventListener("click", resetZoom);
    closeBtn.addEventListener("click", () => close());

    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "+" || e.key === "=") zoomBy(1.4);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.4);
      else if (e.key === "0") resetZoom();
    };
    document.addEventListener("keydown", onKey);

    const onResize = () => { fit(); apply(); };
    window.addEventListener("resize", onResize);
    img.addEventListener("load", onResize);

    function close(immediate) {
      if (!viewer || viewer.root !== root) return;
      viewer = null;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      if (immediate) { root.remove(); return; }
      root.classList.remove("on");
      setTimeout(() => root.remove(), 200);
    }

    viewer = { root, close };
    apply();
    closeBtn.focus({ preventScroll: true });
  }

  /* ---------- hook: tap a photo in the chat ---------- */
  const box = document.getElementById("messages");
  if (box) {
    let dn = null;
    box.addEventListener("pointerdown", (e) => { dn = { t: Date.now(), x: e.clientX, y: e.clientY }; }, true);
    box.addEventListener("click", (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const b = img.parentElement;
      if (!b || !b.classList.contains("bubble")) return;
      if (b.classList.contains("kx-sticker") || img.classList.contains("kx-vo-hide") || b.querySelector(":scope > .kx-vo-card")) return;
      /* ignore long-presses (message menu) and swipes (reply) */
      if (dn && (Date.now() - dn.t > 450 || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 12)) return;
      e.preventDefault();
      open(img.currentSrc || img.src, img.alt);
    });
  }

  /* ---------- hook: the Media gallery uses the same zoom viewer ---------- */
  const orig = window.openLightbox;
  if (typeof orig === "function") {
    window.openLightbox = function (node) {
      if (node && node.tagName === "IMG") { open(node.src, node.alt); return; }
      return orig.apply(this, arguments);
    };
  }

  window.KyroZoom = { open };
})();
