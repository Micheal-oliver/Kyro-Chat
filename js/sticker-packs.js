/* Kyro sticker packs: a Packs tab in the sticker picker, a Pack store, six more packs (Animals, Food, Love, Work,
   Gaming, Greetings) and your own packs (emoji + text stickers, or photo stickers). Packs made from emoji can be
   shared as a short code and imported by a friend. Stickers go out as normal image messages (same as the built-in
   ones), so there is no backend change. Everything is stored on this device, per account.
   Remove the <link> and <script> lines in app.html to undo. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const ME = () => String(typeof meId !== "undefined" ? meId : "");
  const tell = (t) => { try { toast(t, "tip", 3200); } catch (_) {} };
  const SIZE = 240;
  const MAX_PACKS = 12, MAX_STICKERS = 30, MAX_PHOTOS = 20;
  const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  const TILES = ["", "#6b3fe0", "#0e7c86", "#c2366f", "#b86a0b", "#1f2f6a"];
  const EMOJI = ["😎", "😂", "🥹", "🔥", "💯", "🙏", "🎉", "❤️", "🚀", "👀", "💀", "🤝", "😴", "🤔", "🥳", "😭", "🙌", "💪", "🍕", "🐶"];

  const BUILTIN = {
    animals: ["Animals", [["🐶", "woof"], ["🐱", "meow"], ["🦊", "sly"], ["🐼", "chill"], ["🐸", "ribbit"], ["🦁", "roar"], ["🐧", "brr"], ["🐙", "hug"], ["🦄", "magic"], ["🐢", "slow"], ["🐝", "buzzy"], ["🦋", "free"]]],
    food: ["Food", [["🍕", "pizza"], ["🍔", "burger"], ["🍟", "fries"], ["🍜", "noodles"], ["🍣", "sushi"], ["🍩", "donut"], ["🍦", "yum"], ["☕", "coffee"], ["🧋", "boba"], ["🍉", "summer"], ["🌮", "taco"], ["🍫", "treat"]]],
    love: ["Love", [["💖", "love u"], ["😍", "wow"], ["🥰", "aww"], ["💌", "note"], ["🌹", "rose"], ["💏", "us"], ["🫶", "hearts"], ["😘", "mwah"], ["💘", "crush"], ["🤍", "always"], ["💞", "you+me"], ["🌙", "gn"]]],
    work: ["Work", [["💻", "coding"], ["📅", "meeting"], ["📧", "email"], ["📈", "growth"], ["⏰", "late"], ["🧠", "thinking"], ["☕", "break"], ["🐛", "bug"], ["🚀", "shipped"], ["📝", "notes"], ["🔧", "fixing"], ["🎯", "on it"]]],
    gaming: ["Gaming", [["🎮", "gg"], ["🕹️", "ready"], ["👾", "noob"], ["🏆", "win"], ["💀", "rip"], ["⚔️", "fight"], ["🛡️", "tank"], ["🎲", "luck"], ["🧩", "puzzle"], ["🔥", "clutch"], ["🥇", "mvp"], ["🤖", "bot"]]],
    hello: ["Greetings", [["☀️", "morning"], ["🌙", "night"], ["👋", "hello"], ["🙌", "yay"], ["🎉", "party"], ["🙏", "thanks"], ["🤝", "deal"], ["😴", "sleepy"], ["🍀", "luck"], ["💯", "100"], ["🥳", "bday"], ["🫡", "yes sir"]]]
  };
  const DEFAULT_INSTALLED = ["animals", "food"];

  /* ---------- pure helpers (also used by tests) ---------- */
  const cleanStr = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n);
  const okTile = (t) => t === "" || /^#[0-9a-f]{6}$/i.test(t);
  const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function encodePack(pack) {
    const s = pack.items.filter((i) => i.e).map((i) => [i.e, i.l || "", i.t || ""]);
    const json = JSON.stringify({ n: pack.name, s });
    return "KSP1:" + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePack(code) {
    code = String(code || "").trim();
    if (!code.startsWith("KSP1:") || code.length > 12000) return null;
    try {
      let b = code.slice(5).replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) b += "=";
      const j = JSON.parse(decodeURIComponent(escape(atob(b))));
      const name = cleanStr(j.n, 24);
      if (!name || !Array.isArray(j.s)) return null;
      const items = j.s.slice(0, MAX_STICKERS).map((r) => ({ e: cleanStr(r[0], 8), l: cleanStr(r[1], 16), t: okTile(String(r[2] || "")) ? String(r[2] || "") : "" })).filter((i) => i.e);
      return items.length ? { name, items } : null;
    } catch (_) { return null; }
  }

  /* ---------- storage ---------- */
  const SK = () => "kyro.sp.v1." + ME();
  function readState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SK()) || "null"); } catch (_) {}
    if (!s || typeof s !== "object") s = { installed: DEFAULT_INSTALLED.slice(), custom: [], active: "" };
    s.installed = (s.installed || []).filter((id) => BUILTIN[id]);
    s.custom = Array.isArray(s.custom) ? s.custom : [];
    return s;
  }
  const state = () => (state.v = state.v || readState());
  function save() {
    try { localStorage.setItem(SK(), JSON.stringify(state.v)); return true; }
    catch (_) { tell("Storage is full. Remove a photo sticker and try again."); return false; }
  }

  /* ---------- drawing ---------- */
  const cache = new Map();
  function roundRect(x, px, py, w, h, r) {
    x.beginPath(); x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
  }
  async function draw(emoji, label, tile) {
    const key = emoji + "|" + label + "|" + (tile || "");
    if (cache.has(key)) return cache.get(key);
    try { await document.fonts.load("800 34px Outfit"); } catch (_) {}
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const x = c.getContext("2d");
    x.textAlign = "center"; x.textBaseline = "middle";
    if (tile) {
      x.fillStyle = tile; roundRect(x, 8, 8, SIZE - 16, SIZE - 16, 44); x.fill();
      x.font = "104px " + EMOJI_FONT; x.fillText(emoji, SIZE / 2, label ? 94 : SIZE / 2 + 4);
      if (label) { x.font = "800 30px Outfit, system-ui, sans-serif"; x.fillStyle = "#ffffff"; x.fillText(label, SIZE / 2, 192, SIZE - 40); }
    } else {
      x.font = "112px " + EMOJI_FONT; x.shadowColor = "#fff"; x.shadowBlur = 0;
      for (let a = 0; a < 16; a++) {
        x.shadowOffsetX = Math.cos((a / 16) * Math.PI * 2) * 7; x.shadowOffsetY = Math.sin((a / 16) * Math.PI * 2) * 7;
        x.fillText(emoji, SIZE / 2, label ? 98 : SIZE / 2);
      }
      x.shadowColor = "transparent";
      if (label) {
        x.font = "800 34px Outfit, system-ui, sans-serif"; x.lineJoin = "round"; x.lineWidth = 10; x.strokeStyle = "#fff";
        x.strokeText(label, SIZE / 2, 200, SIZE - 20); x.fillStyle = "#1b1840"; x.fillText(label, SIZE / 2, 200, SIZE - 20);
      }
    }
    const url = c.toDataURL("image/png");
    cache.set(key, url);
    return url;
  }
  function photoSticker(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = c.height = SIZE;
        const x = c.getContext("2d");
        const m = 10, inner = SIZE - m * 2, side = Math.min(im.width, im.height);
        x.fillStyle = "#fff"; roundRect(x, 2, 2, SIZE - 4, SIZE - 4, 40); x.fill();
        x.save(); roundRect(x, m, m, inner, inner, 32); x.clip();
        x.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, m, m, inner, inner);
        x.restore(); URL.revokeObjectURL(url);
        let out = c.toDataURL("image/webp", 0.82);
        if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
        resolve(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      im.src = url;
    });
  }
  const itemUrl = (i) => (i.d ? Promise.resolve(i.d) : draw(i.e, i.l || "", i.t || ""));

  /* ---------- sending ---------- */
  async function send(media, close) {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    const blocked = $("#blockedBar");
    if (blocked && !blocked.hidden) { tell("Unblock this contact to send stickers."); return; }
    const box = $("#messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "image", media, text: "sticker" });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    if (close) close();
    try { await sendChat({ kind: "image", media, text: "sticker" }, bubble); } catch (_) { bubble.style.opacity = "0.6"; }
  }

  /* ---------- the Packs tab ---------- */
  let rerender = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function allPacks() {
    const s = state();
    return s.installed.map((id) => ({ id, name: BUILTIN[id][0], items: BUILTIN[id][1].map(([e, l]) => ({ e, l, t: "" })), builtin: true }))
      .concat(s.custom.map((p) => ({ id: p.id, name: p.name, items: p.items, builtin: false })));
  }
  function thumb(item, parent) {
    const img = el("img"); img.alt = item.l || "sticker"; img.loading = "lazy";
    parent.appendChild(img);
    itemUrl(item).then((u) => { img.src = u; });
    return img;
  }
  function renderTab(grid, close) {
    grid.classList.remove("kx-pick-list");
    const wrap = el("div", "sp-wrap");
    grid.appendChild(wrap);
    const draw_ = () => {
      wrap.textContent = "";
      const packs = allPacks();
      const bar = el("div", "sp-bar");
      packs.forEach((p) => {
        const b = el("button", "sp-chip" + (state().active === p.id ? " on" : ""));
        b.type = "button"; b.dataset.id = p.id; b.setAttribute("aria-label", p.name);
        b.textContent = (p.items[0] && p.items[0].e) || "\u2b50";
        if (!p.items[0] || !p.items[0].e) b.textContent = "\ud83d\uddbc\ufe0f";
        b.title = p.name;
        b.addEventListener("click", () => { state().active = p.id; save(); draw_(); });
        bar.appendChild(b);
      });
      const add = el("button", "sp-chip sp-add", "+"); add.type = "button"; add.setAttribute("aria-label", "Sticker packs");
      add.addEventListener("click", () => openStore());
      bar.appendChild(add);
      wrap.appendChild(bar);
      if (!packs.length) {
        const e = el("div", "sp-empty"); e.append(el("p", "", "No packs yet."));
        const g = el("button", "sp-go", "Get sticker packs"); g.type = "button"; g.addEventListener("click", () => openStore());
        e.appendChild(g); wrap.appendChild(e); return;
      }
      let cur = packs.find((p) => p.id === state().active) || packs[0];
      const name = el("p", "sp-name", cur.name); wrap.appendChild(name);
      const g = el("div", "sp-grid");
      if (!cur.items.length) g.appendChild(el("p", "sp-empty", "This pack is empty. Tap + > Edit to add stickers."));
      cur.items.forEach((it) => {
        const b = el("button"); b.type = "button"; b.setAttribute("aria-label", "Send sticker: " + (it.l || "sticker"));
        thumb(it, b);
        b.addEventListener("click", () => itemUrl(it).then((u) => send(u, close)));
        g.appendChild(b);
      });
      wrap.appendChild(g);
    };
    rerender = () => { if (wrap.isConnected) draw_(); };
    draw_();
  }
  window.kxPickHooks = window.kxPickHooks || {};
  window.kxPickHooks.sppacks = renderTab;
  function addTab(panel) {
    const tabs = panel && panel.querySelector(".kx-pick-tabs");
    if (!tabs || tabs.querySelector('[data-p="sppacks"]')) return;
    const b = el("button", "", "Packs"); b.type = "button"; b.dataset.p = "sppacks";
    const before = tabs.querySelector('[data-p="kxmood"]') || tabs.querySelector('[data-p="replies"]');
    if (before) tabs.insertBefore(b, before); else tabs.appendChild(b);
  }
  document.addEventListener("kx-picker-built", (e) => addTab(e.detail));
  addTab($(".kx-pick"));

  /* ---------- store + editor (one modal, two views) ---------- */
  let modal = null, view = "store", editing = null, draft = { e: "😎", l: "", t: "" };
  function ensureModal() {
    if (modal) return;
    modal = el("div", "modal is-off sp-modal"); modal.id = "spModal"; modal.hidden = true;
    modal.innerHTML = '<div class="sheet tall sp-sheet"><button class="sheet-x" type="button" aria-label="Close">\u00d7</button><div class="sp-body"></div></div>';
    document.body.appendChild(modal);
    $(".sheet-x", modal).addEventListener("click", closeStore);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeStore(); });
  }
  function openStore() { ensureModal(); view = "store"; editing = null; paint(); openModal("spModal"); }
  function closeStore() { if (modal) closeModal("spModal"); if (rerender) rerender(); }
  function paint() { const body = $(".sp-body", modal); body.textContent = ""; (view === "edit" ? paintEdit : paintStore)(body); }

  function paintStore(body) {
    const s = state();
    body.appendChild(el("h3", "", "Sticker packs"));
    body.appendChild(el("h4", "sp-h", "Get packs"));
    Object.keys(BUILTIN).forEach((id) => {
      const [name, items] = BUILTIN[id];
      const row = el("div", "sp-row");
      const prev = el("div", "sp-prev"); items.slice(0, 4).forEach(([e]) => prev.appendChild(el("span", "", e)));
      const meta = el("div", "sp-meta"); meta.append(el("b", "", name), el("small", "", items.length + " stickers"));
      const on = s.installed.includes(id);
      const btn = el("button", "sp-btn" + (on ? " on" : ""), on ? "Added" : "Add"); btn.type = "button";
      btn.addEventListener("click", () => {
        if (on) s.installed = s.installed.filter((x) => x !== id); else s.installed.push(id);
        if (save()) paint();
      });
      row.append(prev, meta, btn); body.appendChild(row);
    });
    body.appendChild(el("h4", "sp-h", "My packs"));
    if (!s.custom.length) body.appendChild(el("p", "hint", "Make a pack from emoji and text, or from your own photos."));
    s.custom.forEach((p) => {
      const row = el("div", "sp-row");
      const prev = el("div", "sp-prev");
      p.items.slice(0, 4).forEach((it) => { if (it.d) { const i = el("img"); i.src = it.d; i.alt = ""; prev.appendChild(i); } else prev.appendChild(el("span", "", it.e)); });
      const meta = el("div", "sp-meta"); meta.append(el("b", "", p.name), el("small", "", p.items.length + " stickers"));
      const acts = el("div", "sp-acts");
      const ed = el("button", "sp-btn", "Edit"); ed.type = "button"; ed.addEventListener("click", () => { editing = p; view = "edit"; paint(); });
      const sh = el("button", "sp-btn", "Share"); sh.type = "button"; sh.addEventListener("click", () => sharePack(p));
      const del = el("button", "sp-btn danger", "Delete"); del.type = "button";
      del.addEventListener("click", () => { if (!confirm("Delete \u201c" + p.name + "\u201d?")) return; s.custom = s.custom.filter((x) => x.id !== p.id); if (s.active === p.id) s.active = ""; if (save()) paint(); });
      acts.append(ed, sh, del);
      row.append(prev, meta, acts); body.appendChild(row);
    });
    const nw = el("button", "sp-wide", "+ New pack"); nw.type = "button";
    nw.addEventListener("click", () => {
      if (s.custom.length >= MAX_PACKS) { tell("You can have up to " + MAX_PACKS + " packs."); return; }
      const name = cleanStr(prompt("Name your pack", "My stickers"), 24);
      if (!name) return;
      const p = { id: uid(), name, items: [] }; s.custom.push(p); s.active = p.id;
      if (save()) { editing = p; view = "edit"; paint(); }
    });
    body.appendChild(nw);
    body.appendChild(el("h4", "sp-h", "Import a pack"));
    const imp = el("div", "sp-imp");
    const inp = el("input"); inp.placeholder = "Paste a pack code (KSP1:\u2026)"; inp.setAttribute("aria-label", "Pack code");
    const go = el("button", "sp-btn", "Import"); go.type = "button";
    go.addEventListener("click", () => {
      const p = decodePack(inp.value);
      if (!p) { tell("That doesn\u2019t look like a valid pack code."); return; }
      if (s.custom.length >= MAX_PACKS) { tell("You can have up to " + MAX_PACKS + " packs."); return; }
      const np = { id: uid(), name: p.name, items: p.items }; s.custom.push(np); s.active = np.id;
      if (save()) { tell("Added \u201c" + np.name + "\u201d."); paint(); }
    });
    imp.append(inp, go); body.appendChild(imp);
  }
  async function sharePack(p) {
    if (!p.items.some((i) => i.e)) { tell("Photo stickers can\u2019t be shared as a code. Add an emoji sticker first."); return; }
    const code = encodePack(p);
    try { if (navigator.share) { await navigator.share({ title: "Kyro sticker pack: " + p.name, text: code }); return; } } catch (_) { return; }
    try { await navigator.clipboard.writeText(code); tell("Pack code copied. Send it to a friend to import."); }
    catch (_) { prompt("Copy this pack code:", code); }
    if (p.items.some((i) => i.d)) tell("Photo stickers aren\u2019t included in the code.");
  }

  function paintEdit(body) {
    const p = editing, s = state();
    const back = el("button", "sp-back", "\u2190 Packs"); back.type = "button"; back.addEventListener("click", () => { view = "store"; editing = null; paint(); });
    body.append(back);
    const nm = el("input", "sp-name-in"); nm.value = p.name; nm.maxLength = 24; nm.setAttribute("aria-label", "Pack name");
    nm.addEventListener("change", () => { const v = cleanStr(nm.value, 24); if (v) { p.name = v; save(); } else nm.value = p.name; });
    body.appendChild(nm);
    const grid = el("div", "sp-edgrid");
    p.items.forEach((it, idx) => {
      const c = el("div", "sp-cell"); thumb(it, c);
      const x = el("button", "sp-x", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", "Remove sticker");
      x.addEventListener("click", () => { p.items.splice(idx, 1); if (save()) paint(); });
      c.appendChild(x); grid.appendChild(c);
    });
    if (!p.items.length) grid.appendChild(el("p", "hint", "No stickers yet. Add one below."));
    body.appendChild(grid);

    body.appendChild(el("h4", "sp-h", "Add an emoji sticker"));
    const top = el("div", "sp-mk");
    const prev = el("img", "sp-mkprev"); prev.alt = "Preview";
    const ctl = el("div", "sp-mkctl");
    const txt = el("input"); txt.maxLength = 16; txt.placeholder = "Sticker text (optional)"; txt.setAttribute("aria-label", "Sticker text"); txt.value = draft.l;
    const sw = el("div", "sp-sw");
    const refresh = () => draw(draft.e, draft.l, draft.t).then((u) => { prev.src = u; });
    TILES.forEach((col) => {
      const b = el("button", "sp-sww" + (draft.t === col ? " on" : "") + (col ? "" : " plain")); b.type = "button"; b.setAttribute("aria-label", col || "Classic");
      if (col) b.style.background = col;
      b.addEventListener("click", () => { draft.t = col; sw.querySelectorAll("button").forEach((y) => y.classList.toggle("on", y === b)); refresh(); });
      sw.appendChild(b);
    });
    txt.addEventListener("input", () => { draft.l = cleanStr(txt.value, 16); refresh(); });
    ctl.append(txt, sw); top.append(prev, ctl); body.appendChild(top);
    const emo = el("div", "sp-emo");
    EMOJI.forEach((e) => {
      const b = el("button", draft.e === e ? "on" : "", e); b.type = "button";
      b.addEventListener("click", () => { draft.e = e; emo.querySelectorAll("button").forEach((y) => y.classList.toggle("on", y === b)); refresh(); });
      emo.appendChild(b);
    });
    body.appendChild(emo);
    const own = el("input", "sp-own"); own.maxLength = 8; own.placeholder = "Or type any emoji"; own.setAttribute("aria-label", "Any emoji");
    own.addEventListener("input", () => { const v = cleanStr(own.value, 8); if (v) { draft.e = v; emo.querySelectorAll("button").forEach((y) => y.classList.remove("on")); refresh(); } });
    body.appendChild(own);
    const addE = el("button", "sp-wide", "Add to pack"); addE.type = "button";
    addE.addEventListener("click", () => {
      if (p.items.length >= MAX_STICKERS) { tell("A pack holds up to " + MAX_STICKERS + " stickers."); return; }
      p.items.push({ e: draft.e, l: draft.l, t: draft.t });
      if (save()) paint();
    });
    body.appendChild(addE);

    body.appendChild(el("h4", "sp-h", "Add a photo sticker"));
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
    const ph = el("button", "sp-wide", "Choose a photo"); ph.type = "button";
    ph.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0]; file.value = "";
      if (!f) return;
      if (p.items.length >= MAX_STICKERS) { tell("A pack holds up to " + MAX_STICKERS + " stickers."); return; }
      const photos = s.custom.reduce((n, x) => n + x.items.filter((i) => i.d).length, 0);
      if (photos >= MAX_PHOTOS) { tell("You can keep up to " + MAX_PHOTOS + " photo stickers."); return; }
      try { const d = await photoSticker(f); p.items.push({ d }); if (save()) paint(); else p.items.pop(); }
      catch (_) { tell("Couldn\u2019t read that photo."); }
    });
    body.append(ph, file, el("p", "hint", "Photos are cropped to a square with a white border. They stay on this device and can\u2019t be shared as a code."));
  }

  window.KyroStickerPacks = { openStore, _t: { encodePack, decodePack, cleanStr, okTile, BUILTIN } };
})();
