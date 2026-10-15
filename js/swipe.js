/* Kyro swipe actions on chats: swipe right = pin, swipe left = Mute / Archive (swipe far to archive at once).
   Uses the app's own pin, mute and archive lists, so nothing else changes. */
(() => {
  const list = document.getElementById("chatList");
  if (!list) return;
  const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };
  const T_PIN = 80, T_OPEN = 70, OPEN_W = 168, T_FULL = 210;
  const ICON = {
    pin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 9V4h1V2H7v2h1v5l-2 3v2h5.2v7h1.6v-7H18v-2z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-4.5-5.8V4a1.5 1.5 0 0 0-3 0v1.2A6 6 0 0 0 6 11v5l-2 2v1h16v-1zM3.3 3.3 2 4.6l17.4 17.4 1.3-1.3z"/></svg>',
    arch: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.5 5.2 18.8 3H5.2L3.5 5.2A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.5-1.3zM12 17.5 6.5 12H10v-2h4v2h3.5zM5.4 5l.8-1h11.6l.8 1z"/></svg>'
  };
  let g = null, openRow = null, lastSwipe = 0;

  const rowFrom = (t) => { const r = t.closest && t.closest(".row[data-peer]"); return r && list.contains(r) ? r : null; };
  const lbl = (a, row) => {
    const id = row.dataset.peer;
    if (a === "pin") return isPinned(id) ? "Unpin" : "Pin";
    if (a === "mute") return isMuted(id) ? "Unmute" : "Mute";
    return isArchived(id) ? "Unarchive" : "Archive";
  };

  function buildBg(row) {
    const bg = document.createElement("div");
    bg.className = "kx-swipe-bg";
    bg.style.top = row.offsetTop + "px";
    bg.style.height = row.offsetHeight + "px";
    bg.innerHTML =
      '<div class="kx-sw-left"><span class="kx-sw-lbl">' + ICON.pin + "<span>" + lbl("pin", row) + "</span></span></div>" +
      '<div class="kx-sw-right"><button type="button" class="kx-sw-mute" data-a="mute">' + ICON.mute + "<span>" + lbl("mute", row) + "</span></button>" +
      '<button type="button" class="kx-sw-arch" data-a="arch">' + ICON.arch + "<span>" + lbl("arch", row) + "</span></button></div>";
    list.insertBefore(bg, row);
    return bg;
  }

  function setOffset(st, off) {
    st.off = off;
    st.row.style.transform = "translateX(" + off + "px)";
    st.bg.style.setProperty("--w", Math.abs(off) + "px");
    const left = st.bg.querySelector(".kx-sw-left"), right = st.bg.querySelector(".kx-sw-right");
    left.style.display = off > 0 ? "flex" : "none";
    right.style.display = off < 0 ? "flex" : "none";
    const pin = off >= T_PIN, arch = off <= -T_FULL;
    if (pin !== st.pin || arch !== st.arch) { if (pin || arch) buzz(8); st.pin = pin; st.arch = arch; }
    st.bg.classList.toggle("go-pin", pin);
    st.bg.classList.toggle("go-arch", arch);
  }

  function settle(st, to, done) {
    st.row.style.transition = "transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1)";
    st.row.style.transform = to ? "translateX(" + to + "px)" : "";
    st.bg.style.setProperty("--w", Math.abs(to) + "px");
    if (done) setTimeout(done, 330);
  }
  function cleanup(st) {
    st.row.style.transition = ""; st.row.style.transform = "";
    st.row.classList.remove("kx-swiping");
    if (st.bg && st.bg.parentNode) st.bg.remove();
  }
  function closeOpen() {
    if (!openRow) return;
    const st = openRow; openRow = null;
    settle(st, 0, () => cleanup(st));
  }

  function act(row, a) {
    const id = row.dataset.peer;
    const key = { pin: "kyro.pins", mute: "kyro.mutes", arch: "kyro.arch" }[a];
    if (!key || !id) return;
    const name = lbl(a, row);
    toggleIn(key, id);
    buzz(14);
    openRow = null; g = null;
    renderChats(chats);
    if (typeof toast === "function") toast(name === "Pin" ? "Pinned" : name === "Unpin" ? "Unpinned" : name === "Mute" ? "Muted" : name === "Unmute" ? "Unmuted" : name === "Archive" ? "Archived" : "Moved back to chats");
  }

  list.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const row = rowFrom(e.target);
    if (openRow && row !== openRow.row && !(e.target.closest && e.target.closest(".kx-swipe-bg"))) closeOpen();
    if (!row || (e.target.closest && e.target.closest(".mini"))) return;
    if (openRow && row === openRow.row) { g = openRow; g.base = -OPEN_W; }
    else g = { row, bg: null, base: 0, off: 0, pin: false, arch: false };
    g.x = e.touches[0].clientX; g.y = e.touches[0].clientY; g.lock = null;
  }, { passive: true });

  list.addEventListener("touchmove", (e) => {
    if (!g) return;
    if (!g.row.isConnected) { g = null; return; }
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
    if (g.lock === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.lock = Math.abs(dx) > Math.abs(dy) * 1.4 ? "h" : "v";
      if (g.lock === "h" && !g.bg) { g.bg = buildBg(g.row); g.row.classList.add("kx-swiping"); }
      if (g.lock === "h") g.row.style.transition = "none";
    }
    if (g.lock !== "h") return;
    setOffset(g, Math.max(-260, Math.min(150, g.base + dx)));
  }, { passive: true });

  function finish() {
    if (!g) return;
    const st = g; g = null;
    if (st.lock !== "h" || !st.bg) return;
    lastSwipe = Date.now();
    const off = st.off;
    if (off >= T_PIN) { act(st.row, "pin"); return; }
    if (off <= -T_FULL) { act(st.row, "arch"); return; }
    if (off <= -T_OPEN) { openRow = st; settle(st, -OPEN_W); return; }
    settle(st, 0, () => cleanup(st));
  }
  list.addEventListener("touchend", finish, { passive: true });
  list.addEventListener("touchcancel", () => { if (g && g.bg) { const st = g; g = null; settle(st, 0, () => cleanup(st)); } }, { passive: true });

  // Buttons revealed by an open swipe
  list.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".kx-swipe-bg button");
    if (b && openRow) { e.stopPropagation(); act(openRow.row, b.dataset.a); }
  });
  // Never open a chat because of a swipe, and tapping an open row just closes it
  list.addEventListener("click", (e) => {
    if (Date.now() - lastSwipe < 400) { e.stopPropagation(); e.preventDefault(); return; }
    if (openRow && e.target.closest && e.target.closest(".row") === openRow.row) { e.stopPropagation(); e.preventDefault(); closeOpen(); }
  }, true);

  // One-time tip
  setTimeout(() => {
    if (localStorage.getItem("kyro.swipehint") || !list.querySelector(".row[data-peer]") || typeof toast !== "function") return;
    localStorage.setItem("kyro.swipehint", "1");
    toast("Tip: swipe a chat right to pin, left for mute and archive.");
  }, 4000);
})();
