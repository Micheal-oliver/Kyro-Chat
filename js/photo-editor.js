/* Kyro photo editor: pick a photo, then crop, rotate, draw or add text before it sends.
   Sits between the attach button and the normal send code, so nothing else changes:
   the edited picture goes through the same path a plain photo used to.
   GIFs and non-image files skip the editor. Remove the <script> and <link> in app.html to undo. No backend change. */
(() => {
  "use strict";

  const input = document.getElementById("imageInput");
  if (!input || typeof DataTransfer === "undefined") return;

  const MAX_SIDE = 2048;
  const COLORS = ["#ffffff", "#111111", "#ff3b5c", "#ffcc00", "#2ee59d", "#3c9bff", "#9b6dff"];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* hand a file back to the app's normal photo handler */
  function pass(file) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      const ev = new Event("change", { bubbles: true });
      ev.kzPass = true;
      input.dispatchEvent(ev);
    } catch (_) {
      input.value = "";
      try { toast("Couldn't send that photo. Try again."); } catch (__) {}
    }
  }

  /* ---------- intercept the file picker ---------- */
  document.addEventListener("change", (e) => {
    if (e.target !== input || e.kzPass) return;
    const file = input.files && input.files[0];
    if (!file || typeof currentPeer === "undefined" || !currentPeer) return;
    const type = (file.type || "").toLowerCase();
    if (!type.startsWith("image/") || type === "image/gif" || type === "image/svg+xml") return;
    e.stopImmediatePropagation();
    openEditor(file);
  }, true);

  /* ---------- the editor ---------- */
  function openEditor(file) {
    const url = URL.createObjectURL(file);
    const src = new Image();
    src.onload = () => { URL.revokeObjectURL(url); start(src, file); };
    src.onerror = () => { URL.revokeObjectURL(url); pass(file); }; // e.g. a format this browser can't draw
    src.src = url;
  }

  function start(srcImg, file) {
    /* working copy, capped so huge camera photos stay quick */
    let w = srcImg.naturalWidth, h = srcImg.naturalHeight;
    const k0 = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.max(1, Math.round(w * k0)); h = Math.max(1, Math.round(h * k0));
    const mk = (cw, ch) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };

    let base = mk(w, h);
    base.getContext("2d").drawImage(srcImg, 0, 0, w, h);
    const original = mk(w, h);
    original.getContext("2d").drawImage(base, 0, 0);

    let ops = [];
    let tool = "draw";
    let color = COLORS[2];
    let brush = 6;
    let fit = 1;
    let crop = null;      // {x,y,w,h} in css px, relative to the canvas
    let textIn = null;    // open text input

    /* ----- markup ----- */
    const root = el("div", "ke");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Edit photo");
    root.innerHTML =
      '<div class="ke-top">' +
      '<button type="button" class="ke-icon" data-a="cancel" aria-label="Cancel">\u00d7</button>' +
      '<span class="ke-spacer"></span>' +
      '<button type="button" class="ke-pill" data-a="undo">Undo</button>' +
      '<button type="button" class="ke-pill" data-a="reset">Reset</button>' +
      "</div>" +
      '<div class="ke-stage"><div class="ke-wrap"><canvas class="ke-cv"></canvas>' +
      '<div class="ke-crop" hidden><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div>' +
      "</div></div>" +
      '<div class="ke-bottom">' +
      '<div class="ke-opts" data-opts="draw">' +
      '<div class="ke-colors"></div>' +
      '<label class="ke-size"><span>Size</span><input type="range" min="2" max="24" value="6" aria-label="Brush and text size" /></label>' +
      "</div>" +
      '<div class="ke-opts" data-opts="crop" hidden>' +
      '<p>Drag the corners or the box, then tap Apply.</p>' +
      '<button type="button" class="ke-pill ke-apply" data-a="applyCrop">Apply crop</button>' +
      "</div>" +
      '<div class="ke-bar">' +
      '<button type="button" class="ke-tool on" data-tool="draw"><b>\u270e</b>Draw</button>' +
      '<button type="button" class="ke-tool" data-tool="text"><b>T</b>Text</button>' +
      '<button type="button" class="ke-tool" data-tool="crop"><b>\u25a3</b>Crop</button>' +
      '<button type="button" class="ke-tool" data-a="rotate"><b>\u27f3</b>Rotate</button>' +
      '<button type="button" class="ke-send" data-a="send" aria-label="Send photo">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2L2 14v7z"/></svg></button>' +
      "</div></div>";
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add("on"));

    const $ = (s) => root.querySelector(s);
    const stage = $(".ke-stage"), wrap = $(".ke-wrap"), cv = $(".ke-cv"), ctx = cv.getContext("2d");
    const cropEl = $(".ke-crop");
    const colorsBox = $(".ke-colors");
    const slider = $(".ke-size input");

    COLORS.forEach((c) => {
      const b = el("button", "ke-dot" + (c === color ? " on" : ""));
      b.type = "button";
      b.style.background = c;
      b.dataset.c = c;
      b.setAttribute("aria-label", "Colour " + c);
      colorsBox.appendChild(b);
    });

    /* ----- drawing ----- */
    const unit = () => Math.max(base.width, base.height) / 900;       // brush size per slider step
    const textUnit = () => Math.max(base.width, base.height) / 220;   // text size per slider step
    const mctx = mk(2, 2).getContext("2d");
    const fontOf = (o, k) => "700 " + o.size * k + "px 'DM Sans', system-ui, sans-serif";

    function drawOp(c, o, k) {
      if (o.t === "stroke") {
        c.strokeStyle = o.color; c.lineWidth = o.size * k; c.lineCap = "round"; c.lineJoin = "round";
        c.beginPath();
        o.pts.forEach((p, i) => (i ? c.lineTo(p.x * k, p.y * k) : c.moveTo(p.x * k, p.y * k)));
        if (o.pts.length === 1) c.lineTo(o.pts[0].x * k + 0.01, o.pts[0].y * k);
        c.stroke();
      } else {
        c.font = fontOf(o, k); c.textBaseline = "top"; c.fillStyle = o.color;
        c.shadowColor = o.color === "#111111" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)";
        c.shadowBlur = o.size * k * 0.14;
        c.fillText(o.text, o.x * k, o.y * k);
        c.shadowBlur = 0; c.shadowColor = "transparent";
      }
    }
    function render() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(base, 0, 0, cv.width, cv.height);
      const k = cv.width / base.width;
      ops.forEach((o) => drawOp(ctx, o, k));
    }
    function layout() {
      const aw = stage.clientWidth - 16, ah = stage.clientHeight - 16;
      if (aw <= 0 || ah <= 0) return;
      fit = Math.min(aw / base.width, ah / base.height);
      const cssW = Math.max(1, Math.round(base.width * fit)), cssH = Math.max(1, Math.round(base.height * fit));
      wrap.style.width = cssW + "px"; wrap.style.height = cssH + "px";
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.min(base.width, Math.round(cssW * dpr));
      cv.height = Math.max(1, Math.round(cv.width * base.height / base.width));
      render();
      if (tool === "crop") resetCrop();
    }
    const pt = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * base.width, y: (e.clientY - r.top) / r.height * base.height };
    };
    const hitText = (p) => {
      for (let i = ops.length - 1; i >= 0; i--) {
        const o = ops[i];
        if (o.t !== "text") continue;
        mctx.font = fontOf(o, 1);
        const tw = mctx.measureText(o.text).width, th = o.size * 1.25;
        if (p.x >= o.x - 12 && p.x <= o.x + tw + 12 && p.y >= o.y - 12 && p.y <= o.y + th + 12) return o;
      }
      return null;
    };

    /* ----- text input ----- */
    function commitText() {
      if (!textIn) return;
      const t = textIn; textIn = null;
      const v = t.input.value.trim();
      t.input.remove();
      if (t.op) {
        if (!v) ops = ops.filter((o) => o !== t.op); else t.op.text = v;
      } else if (v) {
        ops.push({ t: "text", x: t.p.x, y: t.p.y, text: v, color: t.color, size: t.size });
      }
      render();
    }
    function openText(p, op) {
      commitText();
      const size = op ? op.size : brush * textUnit();
      const col = op ? op.color : color;
      const inp = el("input", "ke-text-in");
      inp.type = "text"; inp.maxLength = 80; inp.value = op ? op.text : "";
      inp.setAttribute("aria-label", "Text on photo");
      const left = (op ? op.x : p.x) * fit, top = (op ? op.y : p.y - size / 2) * fit;
      inp.style.left = clamp(left, 0, Math.max(0, wrap.clientWidth - 80)) + "px";
      inp.style.top = clamp(top, 0, Math.max(0, wrap.clientHeight - 30)) + "px";
      inp.style.fontSize = Math.max(16, size * fit) + "px";
      inp.style.color = col;
      inp.style.maxWidth = (wrap.clientWidth - 8) + "px";
      wrap.appendChild(inp);
      textIn = { input: inp, op: op || null, p: { x: p.x, y: Math.max(0, p.y - size / 2) }, color: col, size };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitText(); } });
      inp.addEventListener("blur", () => setTimeout(commitText, 0));
      inp.focus();
    }

    /* ----- pointer on the canvas (draw / text) ----- */
    let stroke = null, drag = null;
    cv.addEventListener("pointerdown", (e) => {
      if (tool === "crop" || (e.pointerType === "mouse" && e.button !== 0)) return;
      const p = pt(e);
      cv.setPointerCapture(e.pointerId);
      if (tool === "draw") {
        stroke = { t: "stroke", color, size: brush * unit(), pts: [p] };
        ops.push(stroke);
        render();
      } else if (tool === "text") {
        const hit = hitText(p);
        drag = { op: hit, sx: e.clientX, sy: e.clientY, dx: hit ? p.x - hit.x : 0, dy: hit ? p.y - hit.y : 0, moved: false, p };
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (stroke) { stroke.pts.push(pt(e)); render(); }
      else if (drag && drag.op) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
        if (drag.moved) { const p = pt(e); drag.op.x = p.x - drag.dx; drag.op.y = p.y - drag.dy; render(); }
      }
    });
    const endPtr = () => {
      if (stroke) { stroke = null; return; }
      if (drag) {
        const d = drag; drag = null;
        if (d.moved) return;
        openText(d.p, d.op);
      }
    };
    cv.addEventListener("pointerup", endPtr);
    cv.addEventListener("pointercancel", () => { stroke = null; drag = null; });

    /* ----- crop ----- */
    function paintCrop() {
      cropEl.style.left = crop.x + "px"; cropEl.style.top = crop.y + "px";
      cropEl.style.width = crop.w + "px"; cropEl.style.height = crop.h + "px";
    }
    function resetCrop() {
      crop = { x: 0, y: 0, w: wrap.clientWidth, h: wrap.clientHeight };
      paintCrop();
    }
    let cdrag = null;
    cropEl.addEventListener("pointerdown", (e) => {
      cropEl.setPointerCapture(e.pointerId);
      cdrag = { h: e.target.dataset && e.target.dataset.h || "move", sx: e.clientX, sy: e.clientY, o: { ...crop } };
      e.preventDefault();
    });
    cropEl.addEventListener("pointermove", (e) => {
      if (!cdrag) return;
      const W = wrap.clientWidth, H = wrap.clientHeight, MIN = 48;
      const dx = e.clientX - cdrag.sx, dy = e.clientY - cdrag.sy, o = cdrag.o;
      let { x, y, w: cw, h: ch } = o;
      if (cdrag.h === "move") {
        x = clamp(o.x + dx, 0, W - o.w); y = clamp(o.y + dy, 0, H - o.h);
      } else {
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (cdrag.h.includes("w")) x1 = clamp(o.x + dx, 0, x2 - MIN);
        if (cdrag.h.includes("e")) x2 = clamp(o.x + o.w + dx, x1 + MIN, W);
        if (cdrag.h.includes("n")) y1 = clamp(o.y + dy, 0, y2 - MIN);
        if (cdrag.h.includes("s")) y2 = clamp(o.y + o.h + dy, y1 + MIN, H);
        x = x1; y = y1; cw = x2 - x1; ch = y2 - y1;
      }
      crop = { x, y, w: cw, h: ch };
      paintCrop();
    });
    const endCrop = () => { cdrag = null; };
    cropEl.addEventListener("pointerup", endCrop);
    cropEl.addEventListener("pointercancel", endCrop);

    function applyCrop() {
      if (!crop) return;
      const sx = wrap.clientWidth ? base.width / wrap.clientWidth : 1;
      const cx = Math.round(crop.x * sx), cy = Math.round(crop.y * sx);
      const cw = Math.max(1, Math.min(base.width - cx, Math.round(crop.w * sx)));
      const ch = Math.max(1, Math.min(base.height - cy, Math.round(crop.h * sx)));
      if (cw >= base.width - 1 && ch >= base.height - 1) return; // nothing to crop
      const nb = mk(cw, ch);
      nb.getContext("2d").drawImage(base, cx, cy, cw, ch, 0, 0, cw, ch);
      ops.forEach((o) => {
        if (o.t === "stroke") o.pts = o.pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
        else { o.x -= cx; o.y -= cy; }
      });
      base = nb;
      layout();
    }

    /* flatten the marks into the picture (used by Rotate and Send) */
    function flatten() {
      commitText();
      const c = mk(base.width, base.height), g = c.getContext("2d");
      g.drawImage(base, 0, 0);
      ops.forEach((o) => drawOp(g, o, 1));
      return c;
    }
    function rotate() {
      commitText();
      const flat = flatten();
      const r = mk(flat.height, flat.width), g = r.getContext("2d");
      g.translate(r.width, 0); g.rotate(Math.PI / 2);
      g.drawImage(flat, 0, 0);
      base = r; ops = [];
      layout();
    }

    /* ----- tools ----- */
    function setTool(t) {
      commitText();
      if (tool === "crop" && t !== "crop") { cropEl.hidden = true; crop = null; }
      tool = t;
      root.querySelectorAll(".ke-tool[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
      root.querySelector('[data-opts="draw"]').hidden = t === "crop";
      root.querySelector('[data-opts="crop"]').hidden = t !== "crop";
      root.classList.toggle("is-text", t === "text");
      if (t === "crop") { cropEl.hidden = false; resetCrop(); }
    }

    function close() {
      commitText();
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", layout);
      root.classList.remove("on");
      setTimeout(() => root.remove(), 200);
    }
    function cancel() { close(); input.value = ""; }

    function send() {
      if (tool === "crop" && crop) applyCrop();
      const flat = flatten();
      flat.toBlob((blob) => {
        if (!blob) { try { toast("Couldn't prepare that photo."); } catch (_) {} return; }
        const out = new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        close();
        pass(out);
      }, "image/jpeg", 0.9);
    }

    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tool],[data-a],[data-c]");
      if (!t || !root.contains(t)) return;
      if (t.dataset.c) {
        color = t.dataset.c;
        colorsBox.querySelectorAll(".ke-dot").forEach((d) => d.classList.toggle("on", d === t));
        if (textIn) textIn.input.style.color = color;
        return;
      }
      if (t.dataset.tool) { setTool(t.dataset.tool); return; }
      switch (t.dataset.a) {
        case "cancel": cancel(); break;
        case "send": send(); break;
        case "rotate": rotate(); break;
        case "applyCrop": applyCrop(); break;
        case "undo": commitText(); ops.pop(); render(); break;
        case "reset":
          commitText();
          base = mk(original.width, original.height);
          base.getContext("2d").drawImage(original, 0, 0);
          ops = [];
          if (tool === "crop") cropEl.hidden = false;
          layout();
          break;
      }
    });
    slider.addEventListener("input", () => { brush = Number(slider.value); });

    const onKey = (e) => { if (e.key === "Escape" && !textIn) { e.preventDefault(); cancel(); } };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", layout);
    ["gesturestart", "gesturechange", "gestureend"].forEach((n) => root.addEventListener(n, (e) => e.preventDefault()));

    setTool("draw");
    requestAnimationFrame(layout);
  }
})();
