/* Kyro more extras: link previews, chat folders, quick replies. Link previews need the updated backend. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const notify = (t) => (typeof toast === "function" ? toast(t) : null);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  const input = $("#messageInput");
  const curId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");

  /* ================= Link previews ================= */
  const LP_KEY = "kyro.linkpreviews";
  const lpOn = () => localStorage.getItem(LP_KEY) !== "off";
  const URL_RX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i;
  const lpCache = new Map();

  function getPreview(url) {
    if (!lpCache.has(url)) {
      lpCache.set(url, Kyro.request("/api/links/preview?url=" + encodeURIComponent(url)).then((r) => (r && r._ok ? r.preview : null)).catch(() => null));
    }
    return lpCache.get(url);
  }

  function scanBubble(b) {
    if (!lpOn() || b.dataset.kxLp || b.classList.contains("kx-poll-bubble") || b.classList.contains("kx-sticker")) return;
    const k = b._kxM && b._kxM.kind;
    if (k && k !== "text") return;
    const span = b.querySelector(":scope > span");
    const txt = b._plain || (span && span.textContent) || "";
    const hit = URL_RX.exec(txt);
    if (!hit || !span) return;
    b.dataset.kxLp = "1";
    let url = hit[0].replace(/[).,;!?]+$/, "");
    if (/^www\./i.test(url)) url = "https://" + url;
    getPreview(url).then((p) => {
      if (!p || !b.isConnected) return;
      const box = $("#messages");
      const atBottom = box && box.scrollHeight - box.scrollTop - box.clientHeight < 160;
      const a = document.createElement("a");
      a.className = "kx-lp"; a.href = p.url || url; a.target = "_blank"; a.rel = "noopener noreferrer";
      if (p.image) {
        const im = document.createElement("img");
        im.loading = "lazy"; im.referrerPolicy = "no-referrer"; im.alt = "";
        im.addEventListener("error", () => im.remove());
        im.addEventListener("load", () => { if (atBottom && box) box.scrollTop = box.scrollHeight; });
        im.src = p.image;
        a.appendChild(im);
      }
      const d = document.createElement("div");
      const site = document.createElement("small"); site.textContent = p.site || "";
      const t = document.createElement("b"); t.textContent = p.title || "";
      const ds = document.createElement("span"); ds.textContent = p.description || "";
      d.append(site); if (p.title) d.append(t); if (p.description) d.append(ds);
      a.appendChild(d);
      span.after(a);
      if (atBottom && box) box.scrollTop = box.scrollHeight;
    });
  }
  const msgs = $("#messages");
  if (msgs) new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (!(n instanceof HTMLElement) || !n.classList.contains("bubble")) return;
    setTimeout(() => scanBubble(n), 500);
    setTimeout(() => scanBubble(n), 2200); // encrypted messages decrypt a little later
  }))).observe(msgs, { childList: true });

  // Account switch
  const acct = $('[data-tab="account"]');
  if (acct) {
    const card = document.createElement("div");
    card.className = "kx-card";
    card.innerHTML = '<h3>Link previews</h3><p>Shows a title and picture under links. Your server opens the link to build it, so turn this off for private links.</p><label class="kx-check"><input type="checkbox" id="kxLpToggle" /> Show link previews</label>';
    const t = $("#kxLpToggle", card);
    t.checked = lpOn();
    t.addEventListener("change", () => localStorage.setItem(LP_KEY, t.checked ? "on" : "off"));
    const after = $("#kxInstall") || $("#kxLook");
    after ? after.after(card) : acct.appendChild(card);
  }

  /* ================= Chat folders ================= */
  const FK = "kyro.folders", MK = "kyro.folderOf";
  const folders = () => store.get(FK, []);
  const folderOf = () => store.get(MK, {});
  let activeFolder = null, internal = false, folderTarget = null;
  const chipsWrap = $("#chatChips");

  function renderChips() {
    if (!chipsWrap) return;
    chipsWrap.querySelectorAll(".kx-fchip").forEach((n) => n.remove());
    if (activeFolder) chipsWrap.querySelectorAll("[data-f]").forEach((b) => b.classList.remove("on"));
    const map = folderOf();
    folders().forEach((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "kx-fchip" + (activeFolder === f.id ? " on" : ""); b.dataset.id = f.id;
      b.textContent = f.name;
      let unread = 0;
      Object.keys(map).forEach((pid) => { if (map[pid] === f.id) { try { unread += unreadCount(pid) || 0; } catch (_) {} } });
      if (unread) { const em = document.createElement("em"); em.textContent = unread > 99 ? "99+" : String(unread); b.appendChild(em); }
      chipsWrap.appendChild(b);
    });
    const add = document.createElement("button");
    add.type = "button"; add.className = "kx-fchip"; add.dataset.new = "1"; add.textContent = "\uff0b Folder";
    chipsWrap.appendChild(add);
  }

  function postRender() {
    const box = $("#chatList");
    if (!box) return;
    const groups = load(LS.groups, []);
    const gRows = [...box.children].filter((el) => el.classList.contains("row") && !el.dataset.peer);
    gRows.forEach((row, i) => {
      const g = groups[i];
      if (!g) return;
      row.dataset.kxId = "group:" + g.id;
      attachGroupLongPress(row, { id: "group:" + g.id, name: g.name });
    });
    box.querySelectorAll(".kx-fnote").forEach((n) => n.remove());
    if (activeFolder) {
      const map = folderOf();
      let shown = 0;
      [...box.children].forEach((el) => {
        if (!el.classList.contains("row")) { if (el.classList.contains("filter-empty")) el.hidden = true; return; }
        const id = el.dataset.peer || el.dataset.kxId;
        const ok = !!id && map[id] === activeFolder;
        el.hidden = !ok;
        if (ok) shown++;
      });
      if (!shown) {
        const n = document.createElement("p");
        n.className = "kx-fnote";
        n.textContent = "Nothing in this folder yet. Long-press a chat and choose Folder.";
        box.appendChild(n);
      }
    }
    renderChips();
  }

  function attachGroupLongPress(row, peer) {
    if (row._kxLp) return;
    row._kxLp = true;
    let timer = null, done = 0;
    const start = () => { timer = setTimeout(() => { done = Date.now(); openFolderPicker(peer); }, 550); };
    const stop = () => clearTimeout(timer);
    row.addEventListener("touchstart", start, { passive: true });
    row.addEventListener("touchmove", stop, { passive: true });
    row.addEventListener("touchend", stop);
    row.addEventListener("touchcancel", stop);
    row.addEventListener("click", (e) => { if (Date.now() - done < 600) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }

  const origRender = window.renderChats;
  if (typeof origRender === "function") {
    window.renderChats = function (items) {
      const r = origRender.apply(this, arguments);
      try { postRender(); } catch (_) {}
      return r;
    };
  }

  if (chipsWrap) chipsWrap.addEventListener("click", (e) => {
    if (internal) return;
    const c = e.target.closest(".kx-fchip");
    if (!c) { activeFolder = null; return; }
    e.stopPropagation();
    if (c.dataset.new) { openFolderPicker(null); return; }
    activeFolder = activeFolder === c.dataset.id ? null : c.dataset.id;
    internal = true;
    const all = chipsWrap.querySelector('[data-f="all"]');
    if (all) all.click();
    internal = false;
    postRender();
  }, true);

  // Folder picker sheet
  let fModal, fList, fName;
  function buildFolderModal() {
    if (fModal) return;
    fModal = document.createElement("div");
    fModal.className = "modal is-off"; fModal.id = "kxFolderModal"; fModal.hidden = true;
    fModal.innerHTML = '<div class="sheet"><h3 id="kxFolderTitle">Folder</h3><div class="kx-folder-list"></div>' +
      '<div class="kx-folder-new"><input maxlength="16" placeholder="New folder name" autocomplete="off" /><button type="button">Create</button></div>' +
      '<button class="sheet-btn ghost" type="button" id="kxFolderClose">Close</button></div>';
    document.body.appendChild(fModal);
    fList = $(".kx-folder-list", fModal); fName = $("input", fModal);
    $("#kxFolderClose", fModal).addEventListener("click", () => closeModal("kxFolderModal"));
    $(".kx-folder-new button", fModal).addEventListener("click", createFolder);
    fName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createFolder(); } });
  }
  function openFolderPicker(peer) {
    buildFolderModal();
    folderTarget = peer;
    $("#kxFolderTitle", fModal).textContent = peer ? "Move \u201c" + (peer.name || "chat") + "\u201d to a folder" : "New folder";
    fName.value = "";
    paintFolderList();
    openModal("kxFolderModal");
  }
  function paintFolderList() {
    fList.textContent = "";
    if (!folderTarget) return;
    const cur = folderOf()[String(folderTarget.id)] || "";
    const mk = (label, id, deletable) => {
      const row = document.createElement("div"); row.className = "kx-folder-row";
      const b = document.createElement("button");
      b.type = "button"; b.className = "sheet-btn" + (cur === id ? " on" : ""); b.textContent = label;
      b.addEventListener("click", () => { setFolder(folderTarget.id, id); closeModal("kxFolderModal"); });
      row.appendChild(b);
      if (deletable) {
        const d = document.createElement("button");
        d.type = "button"; d.className = "kx-folder-del"; d.textContent = "Delete";
        d.addEventListener("click", () => deleteFolder(id, label));
        row.appendChild(d);
      }
      fList.appendChild(row);
    };
    mk("No folder", "", false);
    folders().forEach((f) => mk(f.name, f.id, true));
  }
  function setFolder(peerId, fid) {
    const map = folderOf();
    if (fid) map[String(peerId)] = fid; else delete map[String(peerId)];
    store.set(MK, map);
    refreshList();
  }
  function createFolder() {
    const name = fName.value.trim().slice(0, 16);
    if (!name) { notify("Type a folder name."); return; }
    const list = folders();
    if (list.length >= 8) { notify("You can have up to 8 folders."); return; }
    if (list.some((f) => f.name.toLowerCase() === name.toLowerCase())) { notify("You already have that folder."); return; }
    const f = { id: "f" + Date.now().toString(36), name };
    list.push(f); store.set(FK, list);
    if (folderTarget) { setFolder(folderTarget.id, f.id); closeModal("kxFolderModal"); }
    else { closeModal("kxFolderModal"); refreshList(); }
  }
  function deleteFolder(id, name) {
    if (!confirm("Delete the folder \u201c" + name + "\u201d? Your chats stay where they are.")) return;
    store.set(FK, folders().filter((f) => f.id !== id));
    const map = folderOf();
    Object.keys(map).forEach((k) => { if (map[k] === id) delete map[k]; });
    store.set(MK, map);
    if (activeFolder === id) activeFolder = null;
    paintFolderList();
    refreshList();
  }
  function refreshList() { try { renderChats(chats); } catch (_) { postRender(); } }

  const archiveBtn = $("#optArchive");
  if (archiveBtn) {
    const fb = document.createElement("button");
    fb.type = "button"; fb.className = "sheet-btn"; fb.id = "optFolder"; fb.textContent = "Folder";
    archiveBtn.after(fb);
    fb.addEventListener("click", () => { const p = typeof optsPeer !== "undefined" ? optsPeer : null; closeModal("chatOptsModal"); if (p) openFolderPicker(p); });
    const om = $("#chatOptsModal");
    if (om) new MutationObserver(() => {
      if (om.hidden || typeof optsPeer === "undefined" || !optsPeer) return;
      const f = folders().find((x) => x.id === folderOf()[String(optsPeer.id)]);
      fb.textContent = f ? "Folder: " + f.name : "Folder";
    }).observe(om, { attributes: true, attributeFilter: ["hidden", "class"] });
  }
  renderChips();
  setTimeout(() => { try { postRender(); } catch (_) {} }, 600);

  /* ================= Quick replies ================= */
  const QK = "kyro.quick";
  const DEFAULTS = ["On my way \ud83d\ude97", "Thanks!", "I'll call you later", "Can't talk right now, I'll message you soon", "Sounds good \ud83d\udc4d"];
  const replies = () => { const r = store.get(QK, null); if (r) return r; store.set(QK, DEFAULTS); return DEFAULTS.slice(); };

  function fill(text, close) {
    if (!input) return;
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (close) close();
    hidePop();
  }

  window.kxPickHooks = window.kxPickHooks || {};
  window.kxPickHooks.replies = (grid, close) => {
    const addRow = document.createElement("div");
    addRow.className = "kx-qr-add";
    addRow.innerHTML = '<input maxlength="300" placeholder="Save a quick reply" autocomplete="off" /><button type="button">Add</button>';
    const add = () => {
      const v = $("input", addRow).value.trim();
      if (!v) return;
      const list = replies();
      if (list.length >= 20) { notify("You can save up to 20 quick replies."); return; }
      if (!list.includes(v)) { list.push(v); store.set(QK, list); }
      grid.innerHTML = "";
      window.kxPickHooks.replies(grid, close);
    };
    $("button", addRow).addEventListener("click", add);
    $("input", addRow).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    grid.appendChild(addRow);
    replies().forEach((text, i) => {
      const row = document.createElement("div");
      row.className = "kx-qr-item";
      const use = document.createElement("button");
      use.type = "button"; use.textContent = text;
      use.addEventListener("click", () => fill(text, close));
      const del = document.createElement("button");
      del.type = "button"; del.className = "kx-qr-del"; del.setAttribute("aria-label", "Delete reply"); del.textContent = "\u00d7";
      del.addEventListener("click", () => {
        const list = replies(); list.splice(i, 1); store.set(QK, list);
        grid.innerHTML = ""; window.kxPickHooks.replies(grid, close);
      });
      row.append(use, del);
      grid.appendChild(row);
    });
  };

  function addRepliesTab(panel) {
    const tabs = panel && panel.querySelector(".kx-pick-tabs");
    if (!tabs || tabs.querySelector('[data-p="replies"]')) return;
    const b = document.createElement("button");
    b.type = "button"; b.dataset.p = "replies"; b.textContent = "Replies";
    tabs.appendChild(b);
  }
  document.addEventListener("kx-picker-built", (e) => addRepliesTab(e.detail));
  addRepliesTab($(".kx-pick"));

  // Typing "/" shows matching quick replies above the composer
  let pop;
  function hidePop() { if (pop) pop.hidden = true; }
  function showPop(q) {
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "kx-qr-pop"; pop.hidden = true;
      const comp = $("#composer");
      comp && comp.before(pop);
    }
    const hits = replies().filter((r) => r.toLowerCase().includes(q)).slice(0, 8);
    pop.textContent = "";
    if (!hits.length) { pop.hidden = true; return; }
    hits.forEach((r) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = r;
      b.addEventListener("click", () => fill(r));
      pop.appendChild(b);
    });
    pop.hidden = false;
  }
  if (input) input.addEventListener("input", () => {
    const v = input.value;
    if (v.startsWith("/") && !v.includes("\n")) showPop(v.slice(1).trim().toLowerCase()); else hidePop();
  });
  const th = $("#threadScreen");
  if (th) new MutationObserver(() => { if (th.hidden) hidePop(); }).observe(th, { attributes: true, attributeFilter: ["hidden"] });
})();
