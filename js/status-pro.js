/* Kyro Status Pro
   Replaces the plain Status tab with: tall story cards, segmented rings (one segment per update),
   a full-screen viewer (auto-advance, tap left/right, hold to pause, swipe down to close, reactions),
   and a proper composer (coloured text, compressed photos with captions, music).
   Stories are still stored on this device, same keys as before, so old stories keep working. */
(() => {
  if (typeof LS === "undefined" || typeof load !== "function" || !document.getElementById("storyList")) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  const say = (t) => { try { toast(t); } catch (_) {} };

  const BGS = [
    "linear-gradient(160deg,#7c3aed,#06b6d4)",
    "linear-gradient(160deg,#f43f5e,#f59e0b)",
    "linear-gradient(160deg,#10b981,#0ea5e9)",
    "linear-gradient(160deg,#6366f1,#ec4899)",
    "linear-gradient(160deg,#0f172a,#475569)",
    "linear-gradient(160deg,#ea580c,#be123c)",
    "linear-gradient(160deg,#14b8a6,#84cc16)",
    "linear-gradient(160deg,#a855f7,#1d4ed8)"
  ];
  const FRESH = "#3ce7ff";
  const SEEN = "rgba(150,150,180,.6)";
  const DUR = 6000;
  const MUSIC_DUR = 12000;
  const REACTS = ["\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25", "\uD83D\uDC4F"];

  /* ---------- data helpers ---------- */
  const live = () => load(LS.stories, []).filter((s) => !s.expires || s.expires > Date.now());
  const bgOf = (s) => BGS[(typeof s.bg === "number" ? s.bg : (s.at || 0)) % BGS.length];
  const seenBy = (s) => (s.views || []).includes(meId);
  const myAvatar = () => (typeof me !== "undefined" && me ? me.avatar || me.profilePicture || "" : "");

  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() - (ts || Date.now())) / 60000));
    if (m < 1) return "Just now";
    if (m < 60) return m + "m ago";
    return Math.floor(m / 60) + "h ago";
  }
  function left(s) {
    const h = Math.max(1, Math.ceil(((s.expires || Date.now()) - Date.now()) / 36e5));
    return h + "h left";
  }

  function authors() {
    const by = new Map();
    live().sort((a, b) => (a.at || 0) - (b.at || 0)).forEach((s) => {
      const k = s.name || "Story";
      if (!by.has(k)) by.set(k, { name: k, mine: k === meName, items: [] });
      by.get(k).items.push(s);
    });
    const arr = [...by.values()];
    arr.forEach((a) => {
      a.latest = a.items[a.items.length - 1];
      a.unseen = a.mine ? 0 : a.items.filter((s) => !seenBy(s)).length;
    });
    arr.sort((a, b) => (b.mine - a.mine) || ((b.unseen > 0) - (a.unseen > 0)) || (b.latest.at - a.latest.at));
    return arr;
  }

  function removeStory(s) {
    save(LS.stories, load(LS.stories, []).filter((x) => !(x.at === s.at && x.name === s.name)));
  }

  function ringBg(items, mine) {
    const n = items.length;
    const colour = (s) => (!mine && seenBy(s) ? SEEN : FRESH);
    if (n === 1) return colour(items[0]);
    const step = 360 / n, gap = Math.min(10, step / 4), parts = [];
    let prev = 0;
    items.forEach((s, i) => {
      const a = i * step + gap / 2, b = (i + 1) * step - gap / 2;
      parts.push("transparent " + prev + "deg " + a + "deg", colour(s) + " " + a + "deg " + b + "deg");
      prev = b;
    });
    parts.push("transparent " + prev + "deg 360deg");
    return "conic-gradient(" + parts.join(",") + ")";
  }

  function paintFace(node, s) {
    node.textContent = "";
    node.style.backgroundImage = "";
    if (s.image) {
      node.style.backgroundImage = 'url("' + s.image + '")';
      node.style.backgroundSize = "cover";
      node.style.backgroundPosition = "center";
      return;
    }
    node.style.backgroundImage = bgOf(s);
    node.style.backgroundSize = "";
    node.style.backgroundPosition = "";
    const isMusic = s.mediaId || s.music;
    node.appendChild(el("span", "kx-face-txt", (isMusic ? "\u266A " : "") + (s.text || "")));
  }

  /* ---------- Updates tab ---------- */
  function card(a) {
    const b = el("button", "kx-card");
    b.type = "button";
    const face = el("div", "kx-card-face");
    paintFace(face, a.latest);
    b.appendChild(face);
    const ring = el("div", "kx-ring");
    ring.style.background = ringBg(a.items, a.mine);
    const av = el("div", "kx-ring-av");
    setAvatar(av, a.mine ? myAvatar() : (a.latest && a.latest.avatar) || "", a.name);
    ring.appendChild(av);
    b.appendChild(ring);
    b.appendChild(el("span", "kx-card-name", a.mine ? "My status" : a.name.split(" ")[0]));
    if (a.mine) {
      const plus = el("span", "kx-card-plus", "+");
      plus.setAttribute("role", "button");
      plus.setAttribute("aria-label", "Add status");
      plus.addEventListener("click", (e) => { e.stopPropagation(); openComposer("text"); });
      b.appendChild(plus);
    }
    const first = a.mine ? 0 : Math.max(0, a.items.findIndex((s) => !seenBy(s)));
    b.addEventListener("click", () => openViewer(a.name, first));
    return b;
  }

  function addCard() {
    const b = el("button", "kx-card kx-card-add");
    b.type = "button";
    const face = el("div", "kx-card-face");
    const av = el("div", "kx-add-av");
    setAvatar(av, myAvatar(), meName);
    av.appendChild(el("span", "kx-add-plus", "+"));
    face.appendChild(av);
    b.appendChild(face);
    b.appendChild(el("span", "kx-card-name", "Add status"));
    b.addEventListener("click", () => openComposer("text"));
    return b;
  }

  function sectionTitle(t) { return el("p", "kx-sec", t); }

  function updateRow(s, idx, a) {
    const r = el("div", "kx-urow");
    r.setAttribute("role", "button");
    r.tabIndex = 0;
    const thumb = el("div", "kx-thumb");
    paintFace(thumb, s);
    thumb.firstChild && thumb.firstChild.classList && thumb.firstChild.classList.add("tiny");
    const col = el("div", "kx-urow-col");
    const title = s.image ? (s.caption || "Photo") : (s.text || "Status");
    col.appendChild(el("b", null, title));
    const views = (s.views || []).filter((id) => id !== meId).length;
    const reacts = Object.keys(s.reacts || {}).length;
    col.appendChild(el("small", null, ago(s.at) + " \u00B7 " + left(s) + (views ? " \u00B7 " + views + " views" : "") + (reacts ? " \u00B7 " + reacts + " reactions" : "")));
    r.append(thumb, col);
    const open = () => openViewer(a.name, idx);
    r.addEventListener("click", open);
    r.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    if (a.mine) {
      const del = el("button", "kx-urow-del", "\uD83D\uDDD1");
      del.type = "button";
      del.setAttribute("aria-label", "Delete status");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm("Delete this status?")) return;
        removeStory(s);
        render();
      });
      r.appendChild(del);
    }
    return r;
  }

  function authorRow(a) {
    const r = el("div", "kx-urow");
    r.setAttribute("role", "button");
    r.tabIndex = 0;
    const ring = el("div", "kx-ring kx-ring-row");
    ring.style.background = ringBg(a.items, false);
    const av = el("div", "kx-ring-av");
    setAvatar(av, (a.latest && a.latest.avatar) || "", a.name);
    ring.appendChild(av);
    const col = el("div", "kx-urow-col");
    col.appendChild(el("b", null, a.name));
    col.appendChild(el("small", null, a.items.length + (a.items.length === 1 ? " update" : " updates") + " \u00B7 " + ago(a.latest.at)));
    r.append(ring, col);
    const first = Math.max(0, a.items.findIndex((s) => !seenBy(s)));
    const open = () => openViewer(a.name, first);
    r.addEventListener("click", open);
    r.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    return r;
  }

  function render() {
    const box = $("#storyList");
    if (!box) return;
    const note = box.parentElement && $(".status-note", box.parentElement);
    if (note) note.hidden = true;
    box.className = "kx-st";
    box.textContent = "";

    const list = authors();
    const mineA = list.find((a) => a.mine);
    const others = list.filter((a) => !a.mine);

    const head = el("div", "kx-st-head");
    head.append(el("h2", null, "Status"), el("span", null, "Gone after 24 hours"));
    box.appendChild(head);

    const row = el("div", "kx-cards");
    row.appendChild(mineA ? card(mineA) : addCard());
    others.forEach((a) => row.appendChild(card(a)));
    box.appendChild(row);

    const comp = el("div", "kx-compose");
    const txt = el("button", "txt", "Share what\u2019s on your mind\u2026");
    txt.type = "button";
    txt.addEventListener("click", () => openComposer("text"));
    const pbtn = el("button", "ic", "\uD83D\uDCF7");
    pbtn.type = "button"; pbtn.setAttribute("aria-label", "Photo status");
    pbtn.addEventListener("click", () => openComposer("image"));
    const mbtn = el("button", "ic", "\u266A");
    mbtn.type = "button"; mbtn.setAttribute("aria-label", "Music status");
    mbtn.addEventListener("click", () => openComposer("music"));
    comp.append(txt, pbtn, mbtn);
    box.appendChild(comp);

    if (mineA) {
      box.appendChild(sectionTitle("Your updates"));
      for (let i = mineA.items.length - 1; i >= 0; i--) box.appendChild(updateRow(mineA.items[i], i, mineA));
    }
    if (others.length) {
      box.appendChild(sectionTitle("Recent updates"));
      others.forEach((a) => box.appendChild(authorRow(a)));
    }
    if (!list.length) {
      const empty = el("div", "kx-st-empty");
      empty.append(el("div", "kx-st-empty-ico", "\u2728"), el("b", null, "Share your first status"), el("p", null, "Post text, a photo or a song. Your contacts see it for 24 hours, then it disappears."));
      box.appendChild(empty);
    }
  }

  /* ---------- Viewer ---------- */
  let V = null;
  const S = { list: [], gi: 0, si: 0, raf: 0, elapsed: 0, last: null, dur: DUR, paused: false, audio: null, open: false, fill: null };

  function buildViewer() {
    if (V) return V;
    const root = el("div", "kx-v");
    root.id = "kxViewer";
    root.hidden = true;
    root.innerHTML =
      '<div class="kx-v-stage"></div><div class="kx-v-shade"></div><div class="kx-v-bars"></div>' +
      '<div class="kx-v-top"><div class="kx-ring-av kx-v-av"></div><div class="kx-v-who"><b></b><small></small></div>' +
      '<button type="button" class="kx-v-btn kx-v-del" aria-label="Delete status">\uD83D\uDDD1</button>' +
      '<button type="button" class="kx-v-btn kx-v-x" aria-label="Close">\u2715</button></div>' +
      '<div class="kx-v-bottom"></div>';
    document.body.appendChild(root);
    V = {
      root, stage: $(".kx-v-stage", root), bars: $(".kx-v-bars", root), av: $(".kx-v-av", root),
      nm: $(".kx-v-who b", root), sub: $(".kx-v-who small", root), del: $(".kx-v-del", root),
      x: $(".kx-v-x", root), bottom: $(".kx-v-bottom", root)
    };
    V.x.addEventListener("click", closeViewer);
    V.del.addEventListener("click", () => {
      const a = S.list[S.gi]; const s = a && a.items[S.si];
      if (!s) return;
      setPaused(true);
      if (!confirm("Delete this status?")) { setPaused(false); return; }
      removeStory(s);
      a.items.splice(S.si, 1);
      if (!a.items.length) { closeViewer(); return; }
      if (S.si >= a.items.length) S.si = a.items.length - 1;
      show();
    });

    let active = false, held = false, holdT = null, sx = 0, sy = 0;
    root.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, input, audio, .kx-v-bottom")) return;
      active = true; held = false; sx = e.clientX; sy = e.clientY;
      clearTimeout(holdT);
      holdT = setTimeout(() => { held = true; setPaused(true); root.classList.add("is-held"); }, 220);
    });
    root.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false; clearTimeout(holdT);
      const dx = e.clientX - sx, dy = e.clientY - sy;
      root.classList.remove("is-held");
      if (held) { held = false; setPaused(false); if (dy > 110) closeViewer(); return; }
      if (dy > 90 && Math.abs(dx) < 70) { closeViewer(); return; }
      if (Math.abs(dx) > 14 || Math.abs(dy) > 14) return;
      if (e.clientX < root.clientWidth * 0.33) prev(); else next();
    });
    root.addEventListener("pointercancel", () => {
      active = false; clearTimeout(holdT); root.classList.remove("is-held");
      if (held) { held = false; setPaused(false); }
    });
    document.addEventListener("keydown", (e) => {
      if (!S.open) return;
      if (e.key === "Escape") closeViewer();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    });
    return V;
  }

  function stopAudio() {
    if (S.audio) { try { S.audio.pause(); } catch (_) {} S.audio = null; }
  }
  function setPaused(p) {
    S.paused = p;
    if (S.audio) { if (p) S.audio.pause(); else S.audio.play().catch(() => {}); }
  }

  function openViewer(name, idx) {
    const v = buildViewer();
    S.list = authors();
    S.gi = S.list.findIndex((a) => a.name === name);
    if (S.gi < 0) return;
    const a = S.list[S.gi];
    S.si = Math.min(Math.max(idx || 0, 0), a.items.length - 1);
    S.open = true;
    v.root.hidden = false;
    document.body.classList.add("kx-v-open");
    show();
  }

  function closeViewer() {
    if (!V) return;
    S.open = false;
    cancelAnimationFrame(S.raf);
    stopAudio();
    V.root.hidden = true;
    V.root.classList.remove("is-held");
    document.body.classList.remove("kx-v-open");
    render();
  }

  function next() {
    const a = S.list[S.gi];
    if (!a) { closeViewer(); return; }
    if (S.si < a.items.length - 1) S.si++;
    else if (S.gi < S.list.length - 1) { S.gi++; S.si = 0; }
    else { closeViewer(); return; }
    show();
  }
  function prev() {
    if (S.elapsed > 1500) { show(); return; }
    if (S.si > 0) S.si--;
    else if (S.gi > 0) { S.gi--; S.si = 0; }
    show();
  }

  function loop(ts) {
    if (!S.open) return;
    if (S.last == null) S.last = ts;
    if (!S.paused) S.elapsed += Math.min(ts - S.last, 100);
    S.last = ts;
    if (S.fill) S.fill.style.transform = "scaleX(" + Math.min(1, S.elapsed / S.dur) + ")";
    if (S.elapsed >= S.dur) { next(); return; }
    S.raf = requestAnimationFrame(loop);
  }

  function show() {
    cancelAnimationFrame(S.raf);
    stopAudio();
    const a = S.list[S.gi];
    let s = a && a.items[S.si];
    if (!s) { closeViewer(); return; }
    S.elapsed = 0; S.last = null; S.paused = false;

    if (!a.mine) {
      s = patchStory(s, (st) => {
        const v = st.views || [];
        if (!v.includes(meId)) v.push(meId);
        st.views = v;
        return st;
      });
      a.items[S.si] = s;
    }

    V.bars.textContent = "";
    a.items.forEach((_, i) => {
      const bar = el("i", "kx-bar");
      const f = el("b");
      f.style.transform = i < S.si ? "scaleX(1)" : "scaleX(0)";
      bar.appendChild(f);
      V.bars.appendChild(bar);
    });
    S.fill = V.bars.children[S.si].firstChild;

    setAvatar(V.av, a.mine ? myAvatar() : (a.latest && a.latest.avatar) || "", a.name);
    V.nm.textContent = a.mine ? "My status" : a.name;
    V.sub.textContent = ago(s.at);
    V.del.hidden = !a.mine;

    V.stage.textContent = "";
    const c = el("div", "kx-v-content");
    const isMusic = !!(s.mediaId || s.music);
    if (s.image) {
      c.classList.add("is-img");
      const img = el("img");
      img.src = s.image; img.alt = ""; img.draggable = false;
      c.appendChild(img);
      if (s.caption) c.appendChild(el("p", "kx-v-cap", s.caption));
    } else {
      c.style.backgroundImage = bgOf(s);
      const t = s.text || "";
      c.appendChild(el("p", "kx-v-text " + (t.length < 40 ? "s1" : t.length < 120 ? "s2" : "s3"), t));
      if (isMusic) c.appendChild(el("div", "kx-v-music", "\u266A"));
    }
    V.stage.appendChild(c);

    S.dur = isMusic ? MUSIC_DUR : DUR;
    if (isMusic) {
      (async () => {
        try {
          const src = s.music || (await storyMediaUrl(s.mediaId));
          if (!S.open || S.list[S.gi] !== a || a.items[S.si] !== s) return;
          const au = new Audio(src);
          S.audio = au;
          au.play().catch(() => {});
        } catch (_) {}
      })();
    }

    V.bottom.textContent = "";
    if (a.mine) {
      const views = (s.views || []).filter((id) => id !== meId).length;
      const reacts = Object.values(s.reacts || {});
      const info = el("div", "kx-v-info");
      info.textContent = (views ? "\uD83D\uDC41 " + views + " \u00B7 " : "") + (reacts.length ? reacts.join(" ") + " \u00B7 " : "") + left(s);
      V.bottom.appendChild(info);
    } else {
      REACTS.forEach((emo) => {
        const b = el("button", "kx-react" + ((s.reacts || {})[meId] === emo ? " on" : ""), emo);
        b.type = "button";
        b.addEventListener("click", () => {
          const had = (s.reacts || {})[meId] === emo;
          s = patchStory(s, (st) => {
            const r = { ...(st.reacts || {}) };
            if (had) delete r[meId]; else r[meId] = emo;
            st.reacts = r;
            const likes = (st.likes || []).filter((id) => id !== meId);
            if (!had && emo === REACTS[0]) likes.push(meId);
            st.likes = likes;
            return st;
          });
          a.items[S.si] = s;
          $$(".kx-react", V.bottom).forEach((n) => n.classList.toggle("on", !had && n === b));
          if (!had) {
            const pop = el("div", "kx-pop", emo);
            V.root.appendChild(pop);
            setTimeout(() => pop.remove(), 950);
          }
        });
        V.bottom.appendChild(b);
      });
    }
    S.raf = requestAnimationFrame(loop);
  }

  /* ---------- Composer ---------- */
  let C = null, cm = "text", cbg = 0, cimg = "", cmusic = null, busy = false;

  function compressImage(file, max, q) {
    max = max || 1080; q = q || 0.82;
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      const fallback = () => { URL.revokeObjectURL(url); Kyro.fileToDataUrl(file).then(resolve); };
      img.onload = () => {
        try {
          const r = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL("image/jpeg", q));
        } catch (_) { fallback(); }
      };
      img.onerror = fallback;
      img.src = url;
    });
  }

  function buildComposer() {
    if (C) return C;
    const root = el("div", "kx-c");
    root.id = "kxComposer";
    root.hidden = true;
    root.innerHTML =
      '<div class="kx-c-stage"><textarea class="kx-c-text" maxlength="300" placeholder="Type a status" rows="3"></textarea>' +
      '<div class="kx-c-pick" hidden><img class="kx-c-img" alt="" hidden />' +
      '<div class="kx-c-music" hidden><div class="kx-c-note">\u266A</div><p class="kx-c-fname"></p><audio class="kx-c-audio" controls></audio></div>' +
      '<button type="button" class="kx-c-choose">Choose a photo</button></div></div>' +
      '<div class="kx-c-top"><button type="button" class="kx-c-x" aria-label="Close">\u2715</button>' +
      '<div class="kx-c-modes"><button type="button" data-m="text">Text</button><button type="button" data-m="image">Photo</button><button type="button" data-m="music">Music</button></div></div>' +
      '<div class="kx-c-bottom"><div class="kx-c-sw"></div><div class="kx-c-row"><input class="kx-c-cap" maxlength="120" autocomplete="off" />' +
      '<button type="button" class="kx-c-send" aria-label="Share status">\u27A4</button></div></div>' +
      '<input type="file" accept="image/*" class="kx-c-fimg" hidden /><input type="file" accept="audio/*" class="kx-c-faud" hidden />';
    document.body.appendChild(root);
    C = {
      root, stage: $(".kx-c-stage", root), ta: $(".kx-c-text", root), pick: $(".kx-c-pick", root),
      img: $(".kx-c-img", root), music: $(".kx-c-music", root), fname: $(".kx-c-fname", root),
      audio: $(".kx-c-audio", root), choose: $(".kx-c-choose", root), sw: $(".kx-c-sw", root),
      cap: $(".kx-c-cap", root), send: $(".kx-c-send", root), fimg: $(".kx-c-fimg", root), faud: $(".kx-c-faud", root)
    };

    BGS.forEach((g, i) => {
      const b = el("button", "kx-c-dot");
      b.type = "button"; b.style.background = g; b.setAttribute("aria-label", "Background " + (i + 1));
      b.addEventListener("click", () => { cbg = i; applyMode(); });
      C.sw.appendChild(b);
    });

    $(".kx-c-x", root).addEventListener("click", closeComposer);
    $$(".kx-c-modes button", root).forEach((b) => b.addEventListener("click", () => {
      cm = b.dataset.m;
      applyMode();
      if (cm === "text") C.ta.focus();
      if (cm === "image" && !cimg) C.fimg.click();
      if (cm === "music" && !cmusic) C.faud.click();
    }));
    C.choose.addEventListener("click", () => (cm === "image" ? C.fimg : C.faud).click());
    C.img.addEventListener("click", () => C.fimg.click());
    C.ta.addEventListener("input", () => {
      const n = C.ta.value.length;
      C.ta.className = "kx-c-text " + (n < 40 ? "s1" : n < 120 ? "s2" : "s3");
    });
    C.fimg.addEventListener("change", async () => {
      const f = C.fimg.files[0];
      C.fimg.value = "";
      if (!f) return;
      cimg = await compressImage(f);
      C.img.src = cimg;
      applyMode();
    });
    C.faud.addEventListener("change", () => {
      const f = C.faud.files[0];
      C.faud.value = "";
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) { say("Use an audio file smaller than 12MB."); return; }
      cmusic = f;
      C.fname.textContent = f.name;
      C.audio.src = URL.createObjectURL(f);
      applyMode();
    });
    C.send.addEventListener("click", share);
    return C;
  }

  function applyMode() {
    C.root.dataset.mode = cm;
    $$(".kx-c-modes button", C.root).forEach((b) => b.classList.toggle("on", b.dataset.m === cm));
    $$(".kx-c-dot", C.root).forEach((d, i) => d.classList.toggle("on", i === cbg));
    C.ta.hidden = cm !== "text";
    C.pick.hidden = cm === "text";
    C.sw.hidden = cm === "image";
    C.cap.hidden = cm === "text";
    C.cap.placeholder = cm === "image" ? "Add a caption\u2026" : "Song title (optional)";
    C.stage.style.backgroundImage = cm === "image" ? "none" : BGS[cbg];
    C.stage.style.backgroundColor = cm === "image" ? "#000" : "";
    C.img.hidden = !(cm === "image" && cimg);
    C.music.hidden = !(cm === "music" && cmusic);
    C.choose.hidden = cm === "image" ? !!cimg : !!cmusic;
    C.choose.textContent = cm === "image" ? "Choose a photo" : "Choose a song";
  }

  function openComposer(mode) {
    const c = buildComposer();
    cm = mode || "text"; cbg = Math.floor(Math.random() * BGS.length);
    cimg = ""; cmusic = null; busy = false;
    c.ta.value = ""; c.ta.className = "kx-c-text s1"; c.cap.value = "";
    c.img.removeAttribute("src");
    try { c.audio.pause(); } catch (_) {}
    c.audio.removeAttribute("src");
    c.root.hidden = false;
    document.body.classList.add("kx-v-open");
    applyMode();
    if (cm === "text") setTimeout(() => c.ta.focus(), 150);
    if (cm === "image") c.fimg.click();
    if (cm === "music") c.faud.click();
  }

  function closeComposer() {
    if (!C) return;
    try { C.audio.pause(); } catch (_) {}
    C.root.hidden = true;
    document.body.classList.remove("kx-v-open");
  }

  async function share() {
    if (busy) return;
    const s = { name: meName, type: cm, at: Date.now(), expires: Date.now() + 24 * 60 * 60 * 1000, text: "", bg: cbg, views: [], likes: [] };
    if (cm === "text") {
      s.text = C.ta.value.trim();
      if (!s.text) { say("Write something first."); return; }
    } else if (cm === "image") {
      if (!cimg) { say("Choose a photo first."); return; }
      s.image = cimg;
      s.caption = C.cap.value.trim();
      s.text = s.caption || "Photo story";
    } else {
      if (!cmusic) { say("Choose a song first."); return; }
      s.text = C.cap.value.trim() || cmusic.name;
      s.musicName = cmusic.name;
      s.mediaId = "music-" + Date.now();
    }
    busy = true;
    C.send.classList.add("busy");
    try {
      if (s.mediaId) await saveStoryMedia(s.mediaId, cmusic);
      const all = live();
      all.unshift(s);
      save(LS.stories, all);
    } catch (err) {
      busy = false;
      C.send.classList.remove("busy");
      say("Not enough storage. Delete an older status and try again.");
      return;
    }
    C.send.classList.remove("busy");
    closeComposer();
    render();
    say("Status posted");
  }

  /* ---------- hook into the app ---------- */
  window.renderStories = render;
  window.openStoryComposer = () => openComposer("text");
  window.openStatus = (s) => {
    const a = authors().find((x) => x.name === (s && s.name));
    if (a) openViewer(a.name, Math.max(0, a.items.findIndex((i) => i.at === s.at)));
  };
  const origShowTab = window.showTab;
  if (typeof origShowTab === "function") {
    window.showTab = function (name) {
      const r = origShowTab.apply(this, arguments);
      if (name === "story") render();
      return r;
    };
  }
  render();
  // keep "left" labels and expired stories fresh while the app stays open
  setInterval(() => { if (!S.open && (!C || C.root.hidden)) render(); }, 60000);
})();
