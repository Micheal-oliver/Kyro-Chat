/* Kyro groups fix: pick members from everyone you know (not only saved contacts), manage members
   from inside the group, and see who is in it. Groups are still stored on this device. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const notify = (t) => (typeof toast === "function" ? toast(t) : null);
  const isGroupId = (id) => String(id).startsWith("group:");
  const curId = () => (typeof currentPeer !== "undefined" && currentPeer && currentPeer.id ? String(currentPeer.id) : "");

  // Everyone you could add: saved contacts plus people you already chat with
  function everyone() {
    const out = [], seen = new Set([String(meId)]);
    const add = (p) => {
      if (!p || !p.id) return;
      const id = String(p.id);
      if (seen.has(id) || isGroupId(id)) return;
      seen.add(id);
      out.push({ id, name: p.name || "Contact", avatar: p.avatar });
    };
    try { load(LS.contacts, []).forEach(add); } catch (_) {}
    try { chats.map(peerFrom).forEach((p) => { if (p && p.name) add(p); }); } catch (_) {}
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const nameMap = () => { const m = new Map(); everyone().forEach((p) => m.set(p.id, p)); return m; };

  function personRow(p, checked, extra) {
    const row = document.createElement("label");
    row.className = "row kx-fwd-row" + (checked ? " on" : "");
    row.innerHTML = '<input type="checkbox" hidden /><div class="row-avatar"></div><b></b><span class="kx-tick">\u2713</span>';
    const box = $("input", row);
    box.value = p.id; box.checked = !!checked;
    if (extra) box.className = extra;
    $("b", row).textContent = p.name;
    try { setAvatar($(".row-avatar", row), p.avatar, p.name); } catch (_) { $(".row-avatar", row).textContent = String(p.name).slice(0, 1).toUpperCase(); }
    row._name = String(p.name).toLowerCase();
    box.addEventListener("change", () => row.classList.toggle("on", box.checked));
    return row;
  }

  function emptyNote(host, closeId) {
    const d = document.createElement("div");
    d.className = "kx-people-empty";
    d.innerHTML = "<p>You don't have anyone to add yet. Add a contact first, then come back and create the group.</p>";
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-primary"; b.textContent = "Add a contact";
    b.addEventListener("click", () => { closeModal(closeId); openModal("contactModal"); });
    d.appendChild(b);
    host.appendChild(d);
  }

  function addSearch(host, rows) {
    if (rows.length < 6) return null;
    const s = document.createElement("input");
    s.type = "search"; s.className = "kx-fwd-search"; s.placeholder = "Search people"; s.autocomplete = "off";
    s.addEventListener("input", () => {
      const q = s.value.trim().toLowerCase();
      rows.forEach((r) => { (r.closest(".kx-mem-row") || r).hidden = !!q && !r._name.includes(q); });
    });
    host.before(s);
    return s;
  }

  /* ---------- Create group ---------- */
  const form = $("#groupForm");
  const peopleBox = $("#groupPeople");
  let countEl = null;
  function updateCount() {
    if (!peopleBox || !form) return;
    const n = peopleBox.querySelectorAll("input:checked").length;
    if (countEl) countEl.textContent = n ? n + (n === 1 ? " person selected" : " people selected") : "Pick at least one person";
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = n === 0;
  }
  const chooseGroup = $("#chooseGroup");
  if (chooseGroup && peopleBox) chooseGroup.addEventListener("click", () => {
    // runs after the app's own handler and replaces its list
    peopleBox.textContent = "";
    form.querySelectorAll(".kx-fwd-search, .kx-people-count").forEach((n) => n.remove());
    const list = everyone();
    if (!list.length) { emptyNote(peopleBox, "groupModal"); }
    const rows = list.map((p) => { const r = personRow(p, false); peopleBox.appendChild(r); return r; });
    addSearch(peopleBox, rows);
    countEl = document.createElement("p");
    countEl.className = "kx-people-count";
    peopleBox.after(countEl);
    peopleBox.addEventListener("change", updateCount);
    updateCount();
    const nameIn = $("#groupName");
    if (nameIn) { nameIn.value = ""; setTimeout(() => nameIn.focus(), 120); }
  });
  if (form) form.addEventListener("submit", (e) => {
    if (!peopleBox.querySelector("input:checked")) {
      e.preventDefault(); e.stopImmediatePropagation();
      notify("Pick at least one person to add.");
    }
  }, true);

  /* ---------- Manage members (rebuilt list, keeps everyone who is already in) ---------- */
  const origManage = window.openGroupManage;
  if (typeof origManage === "function") {
    window.openGroupManage = function (g) {
      const r = origManage.apply(this, arguments);
      try {
        if (!isGroupAdmin(g)) return r;
        const box = $("#groupMemberBox");
        const all = everyone();
        const known = new Set(all.map((p) => p.id));
        (g.members || []).map(String).forEach((id) => { if (!known.has(id) && id !== String(meId)) all.push({ id, name: "Member", avatar: "" }); });
        const members = new Set((g.members || []).map(String));
        const admins = new Set((g.admins || []).map(String));
        box.textContent = "";
        if (!all.length) { emptyNote(box, "groupManage"); return r; }
        const rows = all.map((p) => {
          const wrap = document.createElement("div");
          wrap.className = "kx-mem-row";
          const row = personRow(p, members.has(p.id), "mem");
          row.classList.add("kx-mem");
          const adm = document.createElement("label");
          adm.className = "kx-adm";
          adm.innerHTML = '<input type="checkbox" class="adm-box" /> Admin';
          const ab = $("input", adm); ab.value = p.id; ab.checked = admins.has(p.id);
          wrap.append(row, adm);
          box.appendChild(wrap);
          return row;
        });
        addSearch(box, rows);
      } catch (_) {}
      return r;
    };
  }

  /* ---------- Group info: tap the header inside a group ---------- */
  let modal, list, title, addBtn;
  function buildInfo() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal is-off"; modal.id = "kxGroupInfo"; modal.hidden = true;
    modal.innerHTML = '<div class="sheet"><h3></h3><p class="hint"></p><div class="kx-ginfo-list"></div>' +
      '<button class="btn btn-primary" type="button" style="width:100%">Add or remove members</button>' +
      '<button class="sheet-btn ghost" type="button">Close</button></div>';
    document.body.appendChild(modal);
    title = $("h3", modal); list = $(".kx-ginfo-list", modal); addBtn = $(".btn", modal);
    $(".sheet-btn.ghost", modal).addEventListener("click", () => closeModal("kxGroupInfo"));
  }
  function currentGroup() {
    const id = curId();
    return isGroupId(id) ? load(LS.groups, []).find((g) => "group:" + g.id === id) : null;
  }
  function openInfo() {
    const g = currentGroup();
    if (!g) return;
    buildInfo();
    const names = nameMap();
    const admins = new Set((g.admins || [g.creatorId]).concat(g.creatorId).map(String));
    title.textContent = g.name;
    const ids = [String(meId)].concat((g.members || []).map(String).filter((x) => x !== String(meId)));
    $(".hint", modal).textContent = ids.length + (ids.length === 1 ? " member" : " members");
    list.textContent = "";
    ids.forEach((id) => {
      const p = id === String(meId) ? { id, name: "You", avatar: me && me.avatar } : names.get(id) || { id, name: "Member" };
      const row = document.createElement("div");
      row.className = "kx-ginfo-row";
      row.innerHTML = '<div class="row-avatar"></div><b></b>';
      $("b", row).textContent = p.name;
      try { setAvatar($(".row-avatar", row), p.avatar, p.name); } catch (_) { $(".row-avatar", row).textContent = String(p.name).slice(0, 1).toUpperCase(); }
      if (admins.has(id)) { const s = document.createElement("small"); s.textContent = "Admin"; row.appendChild(s); }
      list.appendChild(row);
    });
    const canEdit = isGroupAdmin(g);
    addBtn.hidden = !canEdit;
    addBtn.onclick = () => { closeModal("kxGroupInfo"); openGroupManage(g); };
    openModal("kxGroupInfo");
  }
  const headName = $(".thread-head .grow");
  if (headName) headName.addEventListener("click", () => { if (isGroupId(curId())) openInfo(); });

  // Show the member count under the group name
  function paintMeta() {
    const g = currentGroup(), meta = $("#peerMeta");
    if (g && meta) { const n = (g.members || []).length + 1; meta.textContent = n + (n === 1 ? " member" : " members") + " \u00b7 tap for info"; }
  }
  const pn = $("#peerName");
  if (pn) new MutationObserver(() => setTimeout(paintMeta, 60)).observe(pn, { childList: true, characterData: true, subtree: true });

  /* ---------- Clearer button on group rows ---------- */
  const PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9 1v-2H4v2H2v2h2v2h2v-2h2v-2zm9 1c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>';
  function paintMini() {
    document.querySelectorAll("#chatList .row > .mini").forEach((b) => {
      if (b.classList.contains("kx-addmem")) return;
      b.classList.add("kx-addmem");
      b.innerHTML = PLUS;
      b.setAttribute("aria-label", "Add or remove members"); b.title = "Add or remove members";
    });
  }
  const cl = $("#chatList");
  if (cl) new MutationObserver(paintMini).observe(cl, { childList: true });
  paintMini();
})();
