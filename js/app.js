if (!Kyro.requireAuthPage()) throw new Error("redirect");

const LS = {
  contacts: "kyro.contacts",
  groups: "kyro.groups",
  stories: "kyro.stories",
  communities: "kyro.communities",
  calls: "kyro.calls",
  unread: "kyro.unread"
};

let me = Kyro.getUser() || {};
let meName = me.fullName || [me.firstName, me.lastName].filter(Boolean).join(" ") || "You";
let meId = String(me._id || me.id || me.userId || "");
let isAdmin = me.role === "admin";
let chats = [];
let currentPeer = null;
let editing = null;
const seenMessages = new Set();
const onlineIds = new Set();
const lastSeenMap = {};

function formatLastSeen(value) {
  if (!value) return "last seen recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "last seen recently";
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return "last seen just now";
  if (diff < 60 * 60 * 1000) return "last seen " + Math.floor(diff / 60000) + " min ago";
  const sameDay = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return "last seen today at " + time;
  return "last seen " + date.toLocaleDateString() + " at " + time;
}

function presenceText(id, fallbackSeen) {
  if (onlineIds.has(String(id))) return "online";
  return formatLastSeen(lastSeenMap[String(id)] || fallbackSeen);
}

function rememberSeen(id, value) {
  if (!id || !value) return;
  lastSeenMap[String(id)] = value;
}

function refreshPresenceUi() {
  if (currentPeer) {
    document.getElementById("peerMeta").textContent = presenceText(currentPeer.id, currentPeer.lastSeen);
  }
  document.querySelectorAll(".row[data-peer]").forEach((row) => {
    const id = row.dataset.peer;
    const line = row.querySelector(".presence");
    if (line) line.textContent = rowPresence(id);
    row.classList.toggle("is-online", onlineIds.has(id));
  });
}

function unreadMap() {
  const raw = load(LS.unread, {});
  return raw && typeof raw === "object" ? raw : {};
}
function unreadCount(id) {
  return Number(unreadMap()[String(id)] || 0);
}
function setUnread(id, count) {
  const map = unreadMap();
  if (count <= 0) delete map[String(id)];
  else map[String(id)] = count;
  save(LS.unread, map);
  paintChatBadge();
}
function clearUnread(id) {
  setUnread(id, 0);
}
function addUnread(id) {
  setUnread(id, unreadCount(id) + 1);
}
function totalUnread() {
  return Object.values(unreadMap()).reduce((sum, n) => sum + Number(n || 0), 0);
}
function paintChatBadge() {
  const tab = document.querySelector('.tab[data-go="chats"]');
  if (!tab) return;
  let badge = tab.querySelector(".nav-badge");
  const total = totalUnread();
  if (!badge) {
    badge = document.createElement("i");
    badge.className = "nav-badge";
    tab.appendChild(badge);
  }
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.hidden = total <= 0;
}

function groupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("kyro-group-folder", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("msgs");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadGroupMessages(id) {
  const db = await groupDb();
  return new Promise((resolve) => {
    const tx = db.transaction("msgs", "readonly");
    const q = tx.objectStore("msgs").get(String(id));
    q.onsuccess = () => resolve(Array.isArray(q.result) ? q.result : []);
    q.onerror = () => resolve([]);
  });
}
async function saveGroupMessage(id, msg) {
  const list = await loadGroupMessages(id);
  list.push(msg);
  const db = await groupDb();
  return new Promise((resolve) => {
    const tx = db.transaction("msgs", "readwrite");
    tx.objectStore("msgs").put(list, String(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.chats)) return data.chats;
  if (Array.isArray(data.users)) return data.users;
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.data)) return data.data;
  if (data.user) return [data.user];
  return [];
}

function setAvatar(el, src, name) {
  if (src) {
    el.style.backgroundImage = "url(" + src + ")";
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.textContent = Kyro.initials(name || "K");
  }
}

function paintMe() {
  document.getElementById("meName").textContent = meName;
  document.getElementById("meEmail").textContent = me.email || "Signed in";
  document.getElementById("rolePill").textContent = isAdmin ? "Admin" : "User";
  document.getElementById("rolePill").hidden = !isAdmin;
  document.getElementById("meRoleLine").textContent = isAdmin ? "You have admin tools below." : "Standard account";
  setAvatar(document.getElementById("meAvatar"), me.avatar || me.profilePicture, meName);
  document.getElementById("adminBox").hidden = !isAdmin;
  const local = load("kyro.profile", {});
  const uname = me.username || local.username || "";
  const bio = me.bio || local.bio || "";
  const uEl = document.getElementById("meUsername");
  uEl.textContent = uname ? "@" + uname : "No username yet";
  uEl.classList.toggle("is-empty", !uname);
  const bEl = document.getElementById("meBio");
  bEl.textContent = bio || "Add a short bio so people know who you are.";
  bEl.classList.toggle("is-empty", !bio);
}

function showTab(name) {
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.toggle("is-on", p.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.go === name));
  const titles = { chats: "Kyro", story: "Story", communities: "Communities", calls: "Calls", account: "Account" };
  document.getElementById("topTitle").textContent = titles[name] || "Kyro";
  document.getElementById("searchToggle").hidden = name !== "chats";
  if (name !== "chats") document.getElementById("searchBar").hidden = true;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.go));
});

document.getElementById("searchToggle").addEventListener("click", () => {
  const bar = document.getElementById("searchBar");
  bar.hidden = !bar.hidden;
  if (!bar.hidden) document.getElementById("searchInput").focus();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  Kyro.clearSession();
  location.replace("login.html");
});

const keyCache = {};
const plainCache = JSON.parse(localStorage.getItem("kyro.plain") || "{}");
function rememberPlain(id, text) {
  if (!id || !text || String(text).startsWith("ENC1:")) return;
  plainCache[String(id)] = text;
  try { localStorage.setItem("kyro.plain", JSON.stringify(plainCache)); } catch (_) {}
}
async function pubFor(peer) {
  const id = peer && (peer.id || peer);
  if (peer && peer.publicKey) {
    keyCache[String(id)] = peer.publicKey;
    return peer.publicKey;
  }
  if (id && keyCache[String(id)]) return keyCache[String(id)];
  if (!id) return "";
  try {
    const data = await Kyro.request("/api/users/id/" + encodeURIComponent(id));
    const key = data && data.user && data.user.publicKey;
    if (key) keyCache[String(id)] = key;
    return key || "";
  } catch (_) {
    return "";
  }
}
async function readText(raw, peer) {
  const value = raw || "";
  if (!String(value).startsWith("ENC1:")) return value;
  if (peer && plainCache[String(peer.id || peer)]) {
    /* keep trying decrypt for accuracy */
  }
  if (!window.KyroE2E) return plainCache[String(peer && (peer.id || peer))] || "Message";
  const key = await pubFor(peer || {});
  const out = await KyroE2E.decryptText(value, key);
  if (out && out !== "[Encrypted message]" && out !== "Message") {
    rememberPlain(peer && (peer.id || peer), out);
    return out;
  }
  return plainCache[String(peer && (peer.id || peer))] || "Message";
}

function peerFrom(item) {
  const other = item.user || item.otherUser || item.participant || item;
  return {
    id: String(other._id || other.id || item.otherUserId || item.id || ""),
    name: other.fullName || other.name || [other.firstName, other.lastName].filter(Boolean).join(" ") || other.email || "Chat",
    email: other.email || "",
    phone: other.phone || other.phoneNumber || "",
    avatar: other.avatar || other.profilePicture || "",
    preview: (item.lastMessage && (item.lastMessage.text || item.lastMessage.content)) || item.preview || "Tap to chat",
    lastAt: (item.lastMessage && item.lastMessage.createdAt) || "",
    lastSeen: other.lastSeen || item.lastSeen || "",
    publicKey: other.publicKey || "",
    username: other.username || "",
    bio: other.bio || "",
    about: other.about || "",
    statusEmoji: other.statusEmoji || "",
    statusText: other.statusText || "",
    location: other.location || "",
    website: other.website || "",
    dateOfBirth: other.dateOfBirth || "",
    isVerified: !!other.isVerified,
    unread: unreadCount(other._id || other.id || item.otherUserId || item.id)
  };
}

const isPinned = (id) => load("kyro.pins", []).includes(String(id));
const isArchived = (id) => load("kyro.arch", []).includes(String(id));
function unarchive(id) {
  const list = load("kyro.arch", []);
  const i = list.indexOf(String(id));
  if (i >= 0) { list.splice(i, 1); save("kyro.arch", list); }
}
let chatFilter = "all";
const isMuted = (id) => load("kyro.mutes", []).includes(String(id));
function toggleIn(key, id) {
  const list = load(key, []);
  const i = list.indexOf(String(id));
  if (i >= 0) list.splice(i, 1); else list.push(String(id));
  save(key, list);
}
let optsPeer = null;
function openChatOpts(peer) {
  optsPeer = peer;
  document.getElementById("chatOptsName").textContent = peer.name || "Chat";
  document.getElementById("optPin").textContent = isPinned(peer.id) ? "Unpin chat" : "Pin chat";
  document.getElementById("optArchive").textContent = isArchived(peer.id) ? "Unarchive chat" : "Archive chat";
  document.getElementById("optMute").textContent = isMuted(peer.id) ? "Unmute notifications" : "Mute notifications";
  openModal("chatOptsModal");
}

function shortTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  if (now - d < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const rowPresence = (id) => (onlineIds.has(String(id)) ? "online" : "");

function contactRow(peer, extra) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.peer = String(peer.id);
  if (onlineIds.has(String(peer.id))) row.classList.add("is-online");
  if (peer.lastSeen) rememberSeen(peer.id, peer.lastSeen);
  row.innerHTML =
    '<div class="row-avatar"><i class="online-dot"></i></div><div class="grow"><b></b><span></span><small class="presence"></small></div><div class="row-actions"></div>';
  setAvatar(row.querySelector(".row-avatar"), peer.avatar, peer.name);
  row.querySelector("b").textContent = (isPinned(peer.id) ? "\ud83d\udccc " : "") + peer.name + (isMuted(peer.id) ? " \ud83d\udd07" : "");
  const previewRaw = extra || peer.preview || peer.email || peer.phone || "";
  row.querySelector("span").textContent = cleanPreview(String(previewRaw).startsWith("ENC1:") ? (plainCache[String(peer.id)] || "Message") : previewRaw);
  if (String(previewRaw).startsWith("ENC1:")) {
    readText(previewRaw, peer).then((plain) => {
      if (row.querySelector("span")) row.querySelector("span").textContent = cleanPreview(plain);
    });
  }
  row.querySelector(".presence").textContent = rowPresence(peer.id);
  const count = unreadCount(peer.id);
  if (count > 0) {
    row.classList.add("has-unread");
    const badge = document.createElement("em");
    badge.className = "unread-badge";
    badge.textContent = count > 99 ? "99+" : String(count);
    row._badge = badge;
  }
  const actions = row.querySelector(".row-actions");
  const meta = document.createElement("div");
  meta.className = "row-meta";
  const tm = document.createElement("small");
  tm.className = "row-time";
  tm.textContent = peer.lastAt ? shortTime(peer.lastAt) : "";
  meta.appendChild(tm);
  if (row._badge) meta.appendChild(row._badge);
  const call = document.createElement("button");
  call.className = "mini";
  call.type = "button";
  call.textContent = "☎";
  call.addEventListener("click", (e) => { e.stopPropagation(); startCall(peer); });
  actions.append(meta, call);
  let lpTimer = null, longDone = false;
  const lpStart = () => { longDone = false; lpTimer = setTimeout(() => { longDone = true; openChatOpts(peer); }, 550); };
  const lpCancel = () => clearTimeout(lpTimer);
  row.addEventListener("touchstart", lpStart, { passive: true });
  row.addEventListener("touchmove", lpCancel, { passive: true });
  row.addEventListener("touchend", lpCancel);
  row.addEventListener("touchcancel", lpCancel);
  row.addEventListener("mousedown", lpStart);
  row.addEventListener("mouseup", lpCancel);
  row.addEventListener("mouseleave", lpCancel);
  row.addEventListener("contextmenu", (e) => { e.preventDefault(); lpCancel(); longDone = true; openChatOpts(peer); });
  row.addEventListener("click", () => {
    if (longDone) { longDone = false; return; }
    openThread(peer);
  });
  return row;
}

function renderChats(items) {
  const box = document.getElementById("chatList");
  const empty = document.getElementById("chatsEmpty");
  box.innerHTML = "";
  const groups = load(LS.groups, []);
  if (!items.length && !groups.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  (chatFilter === "all" ? groups : []).forEach((g) => {
    const row = document.createElement("button");
    row.className = "row";
    row.type = "button";
    row.innerHTML = '<div class="row-avatar">G</div><div class="grow"><b></b><span>Group</span></div><button class="mini" type="button">+</button>';
    row.querySelector("b").textContent = g.name;
    row.querySelector("span").textContent = (g.members || []).length + " members";
    row.querySelector(".mini").addEventListener("click", (e) => { e.stopPropagation(); openGroupManage(g); });
    row.addEventListener("click", () => openThread({ id: "group:" + g.id, name: g.name, preview: "Group chat", members: g.members || [] }));
    box.appendChild(row);
  });
  const seen = new Set(items.map((item) => String(peerFrom(item).id)));
  const passes = (peer) => {
    const arch = isArchived(peer.id);
    if (chatFilter === "archived") return arch;
    if (arch) return false;
    if (chatFilter === "unread") return unreadCount(peer.id) > 0;
    if (chatFilter === "pinned") return isPinned(peer.id);
    if (chatFilter === "fav") return load("kyro.favs", []).includes(String(peer.id));
    return true;
  };
  const pinned = items.filter((item) => isPinned(peerFrom(item).id));
  const rest = items.filter((item) => !isPinned(peerFrom(item).id));
  let shown = 0;
  pinned.concat(rest).forEach((item) => {
    const peer = peerFrom(item);
    if (!passes(peer)) return;
    box.appendChild(contactRow(peer));
    shown++;
  });
  load(LS.contacts, []).forEach((c) => {
    if (c.id && !seen.has(String(c.id)) && passes(c)) { box.appendChild(contactRow(c)); shown++; }
  });
  if (!shown && (items.length || groups.length)) {
    const note = document.createElement("p");
    note.className = "hint filter-empty";
    note.textContent = { unread: "You're all caught up. No unread chats.", pinned: "No pinned chats yet. Long-press a chat to pin it.", fav: "No favorites yet. Long-press a chat and tap Add to favorites.", archived: "No archived chats.", all: "No chats to show." }[chatFilter];
    box.appendChild(note);
  }
}

function toast(msg, kind, ms) {
  let box = document.getElementById("toastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "toastBox";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast" + (kind ? " " + kind : "");
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms || 3200);
}
function maybeHint(key, text, delay) {
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch (_) { return; }
  setTimeout(() => toast(text, "tip", 6500), delay || 800);
}
function skeletonRows(n) {
  let html = "";
  for (let i = 0; i < n; i++) {
    html += '<div class="skel-row"><div class="skel av"></div><div style="flex:1"><div class="skel ln" style="width:' + (48 + (i * 13) % 30) + '%"></div><div class="skel ln" style="width:' + (70 - (i * 9) % 25) + '%;height:10px"></div></div></div>';
  }
  return html;
}

async function loadChats() {
  const box = document.getElementById("chatList");
  if (box && !box.children.length) {
    document.getElementById("chatsEmpty").hidden = true;
    box.innerHTML = skeletonRows(5);
  }
  const data = await Kyro.api.chats();
  chats = data._ok ? asArray(data) : [];
  renderChats(chats);
  if (chats.length) maybeHint("kyro.hint.chat", "Tip: press and hold a chat to pin, mute or archive it.", 1200);
}

function openThread(peer) {
  currentPeer = peer;
  applyBlockState();
  applyWallpaper();
  clearUnread(peer.id);
  document.getElementById("threadScreen").hidden = false;
  document.getElementById("peerName").textContent = peer.name;
  document.getElementById("peerMeta").textContent = presenceText(peer.id, peer.lastSeen);
  setAvatar(document.getElementById("peerAvatar"), peer.avatar, peer.name);
  const typeLine = document.getElementById("typingLine");
  if (typeLine) { typeLine.hidden = true; typeLine.textContent = ""; }
  loadMessages();
  if (window.kyroSocket && window.kyroSocket.connected) {
    window.kyroSocket.emit("message-seen", { otherUserId: peer.id, to: peer.id });
  }
  Kyro.request("/api/messages/seen/" + encodeURIComponent(peer.id), { method: "POST" }).catch(() => {});
}

document.getElementById("backChat").addEventListener("click", () => {
  document.getElementById("threadScreen").hidden = true;
  setReply(null);
  if (typeof tsClose === "function") tsClose();
  currentPeer = null;
  loadChats();
});

async function loadMessages() {
  const el = document.getElementById("messages");
  el.innerHTML = "";
  el.dataset.day = "";
  pendingReacts = {};
  if (currentPeer && String(currentPeer.id).startsWith("group:")) {
    const local = await loadGroupMessages(currentPeer.id);
    if (!local.length) el.innerHTML = '<p class="hint">No group messages yet. They are saved on this device.</p>';
    else local.forEach((m) => appendMsg(el, makeBubble(m)));
    el.scrollTop = el.scrollHeight;
    return;
  }
  el.innerHTML = '<div class="skel skel-bubble"></div><div class="skel skel-bubble me"></div><div class="skel skel-bubble"></div>';
  const data = await Kyro.api.messages(currentPeer.id);
  el.innerHTML = "";
  el.dataset.day = "";
  const list = asArray(data);
  if (!data._ok) {
    el.innerHTML = '<p class="hint">' + (data.message || "Could not load chats.") + "</p>";
    return;
  }
  if (!list.length) {
    el.innerHTML = '<p class="hint">No messages yet. Say hello.</p>';
    return;
  }
  list.forEach((m) => {
    const mid = String(m._id || "");
    if (mid) seenMessages.add(mid);
    appendMsg(el, makeBubble(m));
  });
  el.scrollTop = el.scrollHeight;
  maybeHint("kyro.hint.msg", "Tip: hold a message for reactions, edit and more. Swipe it to reply.", 900);
}

function tickHtml(m) {
  if (!(String(m.senderId || "") === meId || m.mine)) return "";
  if (m.seenAt) return '<i class="ticks seen">✓✓</i>';
  if (m.deliveredAt) return '<i class="ticks">✓✓</i>';
  return '<i class="ticks">✓</i>';
}

function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
function dayLabel(ts) {
  const d = new Date(ts), now = new Date(), y = new Date();
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return "Today";
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
function appendMsg(box, bubble) {
  const key = dayKey(bubble._ts || Date.now());
  let divided = false;
  if (box.dataset.day !== key) {
    divided = true;
    const div = document.createElement("div");
    div.className = "day-div";
    div.textContent = dayLabel(bubble._ts || Date.now());
    box.appendChild(div);
    box.dataset.day = key;
  }
  const prev = box.lastElementChild;
  if (!divided && prev && prev.classList && prev.classList.contains("bubble") && !prev.dataset.react &&
      prev.classList.contains("me") === bubble.classList.contains("me")) {
    bubble.classList.add("cont");
  }
  box.appendChild(bubble);
}
const isStarred = (id) => !!id && load("kyro.stars", []).some((x) => x.id === String(id));

function timeText(b) {
  return (b._edited ? "edited \u00b7 " : "") + new Date(b._ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
const blockedSet = () => new Set(load("kyro.blocked", []).map(String));

function fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return Math.round(n / 1024) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function fileIcon(name) {
  const e = String(name || "").split(".").pop().toLowerCase();
  if (e === "pdf") return "PDF";
  if (["doc", "docx", "txt"].includes(e)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(e)) return "XLS";
  if (["ppt", "pptx"].includes(e)) return "PPT";
  if (["zip", "rar"].includes(e)) return "ZIP";
  return "FILE";
}
function kindLabel(m, bubble) {
  if (m.kind === "image") return "Photo";
  if (m.kind === "voice") return "Voice message";
  if (m.kind === "video") return "Video";
  if (m.kind === "file") return m.fileName || "File";
  return (bubble && bubble._plain) || "Message";
}
async function getBubbleMedia(bubble, m) {
  if (bubble._media) return bubble._media;
  const id = m._id || bubble.dataset.id;
  if (!id) return "";
  const r = await Kyro.api.messageMedia(id).catch(() => null);
  if (!r || r._ok === false || !r.media) return "";
  bubble._media = r.media;
  return r.media;
}
function saveDataUrl(data, name) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function openLightbox(node) {
  const box = document.createElement("div");
  box.className = "lightbox";
  const x = document.createElement("button");
  x.type = "button";
  x.className = "lightbox-x";
  x.textContent = "\u00d7";
  x.addEventListener("click", () => box.remove());
  box.addEventListener("click", (e) => { if (e.target === box) box.remove(); });
  box.append(node, x);
  document.body.appendChild(box);
}
async function downloadBubble(bubble, m) {
  const data = await getBubbleMedia(bubble, m);
  if (!data) { toast("Couldn't load that file. It may have expired."); return; }
  saveDataUrl(data, m.fileName || m.kind || "file");
}

function makeBubble(m) {
  const mine = String(m.senderId || m.from || "") === meId || m.mine === true;
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (mine ? "me" : "them");
  const rawTs = m.createdAt || m.ts || m.time || m.sentAt;
  const parsedTs = rawTs ? new Date(rawTs).getTime() : NaN;
  bubble._ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  if (m._id) bubble.dataset.id = String(m._id);
  if (m._id && isStarred(m._id)) bubble.classList.add("starred");
  bubble._edited = !!m.editedAt;
  if (m.expiresAt) {
    bubble._exp = new Date(m.expiresAt).getTime();
    bubble.classList.add("ephemeral");
  }
  const kind = m.kind || "text";
  if (kind === "image" && m.media) {
    const img = document.createElement("img");
    img.src = m.media;
    img.alt = "photo";
    bubble.appendChild(img);
  } else if (kind === "voice" && m.media) {
    if (window.Rich) {
      bubble.appendChild(Rich.voicePlayer(m.media));
    } else {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = m.media;
      bubble.appendChild(audio);
    }
  } else if (kind === "video" || kind === "file") {
    bubble._media = m.media || "";
    const name = m.fileName || (kind === "video" ? "Video" : "File");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "file-tile";
    const ico = document.createElement("span");
    ico.className = "file-ico";
    ico.textContent = kind === "video" ? "\u25b6" : fileIcon(name);
    const info = document.createElement("span");
    info.className = "file-info";
    const nm = document.createElement("b");
    nm.textContent = name;
    const sz = document.createElement("small");
    sz.textContent = (kind === "video" ? "Video" : "File") + (m.fileSize ? " \u00b7 " + fmtSize(m.fileSize) : "") + (kind === "video" ? " \u00b7 tap to play" : " \u00b7 tap to download");
    info.append(nm, sz);
    tile.append(ico, info);
    tile.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (kind === "file") { downloadBubble(bubble, m); return; }
      sz.textContent = "Loading...";
      const data = await getBubbleMedia(bubble, m);
      if (!data) { sz.textContent = "Couldn't load. Tap to retry."; return; }
      const v = document.createElement("video");
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.src = data;
      v.className = "chat-video";
      tile.replaceWith(v);
    });
    bubble.appendChild(tile);
  } else {
    const t = document.createElement("span");
    const raw = m.text || m.content || "";
    const show = (plain) => {
      const w = parseWire(plain);
      if (w.type === "react") {
        const who = mine ? meId : String(m.senderId || m.from || (currentPeer && currentPeer.id) || "");
        applyReaction(w.target, who, w.emoji);
        bubble.dataset.react = "1";
        bubble.style.display = "none";
        if (bubble.parentNode) bubble.remove();
        return;
      }
      if (w.type === "del") {
        if (window.KyroMsg) KyroMsg.applyDelete(w.target, mine ? meId : String(m.senderId || m.from || ""));
        bubble.dataset.react = "1";
        bubble.style.display = "none";
        if (bubble.parentNode) bubble.remove();
        return;
      }
      bubble._plain = w.text;
      bubble._replyPrefix = w.replyId !== undefined ? wireReply(w.replyId, w.quote, "") : "";
      const rich = window.Rich ? Rich.render(t, w.text) : (t.textContent = w.text, {});
      bubble.classList.toggle("mentions-me", !!(rich.mentionsMe && !mine));
      bubble.style.display = "";
      const old = bubble.querySelector(".quote");
      if (old) old.remove();
      if (w.replyId !== undefined) {
        const q = document.createElement("div");
        q.className = "quote";
        q.textContent = w.quote || "Message";
        q.addEventListener("click", (e) => {
          e.stopPropagation();
          const target = w.replyId && Array.from(document.getElementById("messages").children).find((x) => x.dataset && x.dataset.id === w.replyId);
          if (!target) return;
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          target.classList.add("flash");
          setTimeout(() => target.classList.remove("flash"), 1200);
        });
        bubble.insertBefore(q, bubble.firstChild);
      }
    };
    bubble.appendChild(t);
    const setRaw = (r) => {
      if (String(r).startsWith("ENC1:")) {
        readText(r, currentPeer || { publicKey: m.publicKey }).then(show).catch(() => show("Message"));
      } else {
        show(r);
      }
    };
    bubble._setRaw = setRaw;
    if (String(raw).startsWith("ENC1:")) {
      bubble.style.display = "none";
      readText(raw, currentPeer || { publicKey: m.publicKey }).then(show).catch(() => show("Message"));
    } else {
      show(raw);
    }
  }
  const tm = document.createElement("small");
  tm.className = "mtime";
  tm.textContent = timeText(bubble);
  bubble.appendChild(tm);
  bubble.insertAdjacentHTML("beforeend", tickHtml(m));
  bindMsgActions(bubble, m);
  flushPending(bubble);
  if (window.KyroMsg) KyroMsg.decorate(bubble, m);
  return bubble;
}

const RX_REPLY = /^\u27e6r:([^|\u27e7]*)\|([^\u27e7]*)\u27e7([\s\S]*)$/;
const RX_REACT = /^\u27e6x:([^|\u27e7]*)\|([^\u27e7]*)\u27e7$/;
const RX_DEL = /^\u27e6d:([^|\u27e7]*)\u27e7$/;
const REACT_EMOJIS = ["\ud83d\udc4d", "\u2764\ufe0f", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude22", "\ud83d\ude4f"];
let pendingReacts = {};
let replyTo = null;

function parseWire(t) {
  t = String(t == null ? "" : t);
  let m = t.match(RX_REACT);
  if (m) return { type: "react", target: m[1], emoji: m[2] };
  m = t.match(RX_DEL);
  if (m) return { type: "del", target: m[1] };
  m = t.match(RX_REPLY);
  if (m) return { type: "text", replyId: m[1], quote: m[2], text: m[3] };
  return { type: "text", text: t };
}
function cleanPreview(t) {
  const w = parseWire(t);
  if (w.type === "react") return w.emoji ? "Reacted " + w.emoji : "Removed a reaction";
  if (w.type === "del") return "\ud83d\udeab This message was deleted";
  return w.text || (w.replyId !== undefined ? "Reply" : "");
}
function wireReply(id, snip, text) {
  const safe = String(snip || "").replace(/[\u27e6\u27e7|]/g, " ").slice(0, 60);
  return "\u27e6r:" + String(id || "").replace(/[\u27e6\u27e7|]/g, "") + "|" + safe + "\u27e7" + text;
}
function paintReacts(b) {
  let row = b.querySelector(".reacts");
  const vals = Object.values(b._reacts || {});
  if (!vals.length) { if (row) row.remove(); return; }
  if (!row) { row = document.createElement("div"); row.className = "reacts"; b.appendChild(row); }
  const counts = {};
  vals.forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
  row.textContent = Object.keys(counts).map((e) => e + (counts[e] > 1 ? " " + counts[e] : "")).join("  ");
}
function applyReaction(targetId, userId, emoji) {
  targetId = String(targetId || "");
  const box = document.getElementById("messages");
  const b = Array.from(box.children).find((x) => x.dataset && x.dataset.id === targetId);
  if (!b) {
    (pendingReacts[targetId] = pendingReacts[targetId] || []).push({ userId, emoji });
    return;
  }
  b._reacts = b._reacts || {};
  if (emoji) b._reacts[userId] = emoji; else delete b._reacts[userId];
  paintReacts(b);
}
function flushPending(bubble) {
  const id = bubble.dataset && bubble.dataset.id;
  if (!id || !pendingReacts[id]) return;
  bubble._reacts = bubble._reacts || {};
  pendingReacts[id].forEach((r) => { if (r.emoji) bubble._reacts[r.userId] = r.emoji; else delete bubble._reacts[r.userId]; });
  delete pendingReacts[id];
  paintReacts(bubble);
}
function setReply(r) {
  replyTo = r;
  const lbl = document.getElementById("replyLabel");
  if (lbl && !editing) lbl.textContent = "Replying to";
  const bar = document.getElementById("replyBar");
  if (!bar) return;
  bar.hidden = !r;
  if (r) {
    document.getElementById("replySnip").textContent = r.snip;
    document.getElementById("messageInput").focus();
  }
}

let actionMsg = null;
function startReply(bubble, m) {
  const snip = kindLabel(m, bubble);
  setReply({ id: bubble.dataset.id || "", snip: String(snip).slice(0, 60) });
}
function bindMsgActions(bubble, m) {
  let timer, sx = 0, sy = 0, dx = 0, swiping = false, tracking = false;
  const dir = bubble.classList.contains("me") ? -1 : 1;
  const start = () => { timer = setTimeout(() => {
    actionMsg = { bubble, m };
    document.getElementById("actStar").textContent = isStarred(bubble.dataset.id) ? "Unstar" : "Star";
    const canEdit = bubble.classList.contains("me") && (!m.kind || m.kind === "text") && !!bubble.dataset.id &&
      Date.now() - bubble._ts < 14 * 60 * 1000 && currentPeer && !String(currentPeer.id).startsWith("group:");
    document.getElementById("actEdit").hidden = !canEdit;
    openModal("msgActions");
  }, 450); };
  const cancel = () => clearTimeout(timer);
  const reset = () => {
    if (swiping) {
      bubble.style.transition = "transform 0.2s ease";
      bubble.style.transform = "";
      const ico = bubble.querySelector(".swipe-ico");
      if (ico) ico.style.opacity = "0";
      setTimeout(() => { bubble.style.transition = ""; }, 220);
    }
    swiping = false; tracking = false; dx = 0;
  };
  bubble.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dx = 0; swiping = false; tracking = true;
    start();
  }, { passive: true });
  bubble.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    const mx = (t.clientX - sx) * dir;
    const my = t.clientY - sy;
    if (!swiping && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      cancel();
      if (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.5) {
        swiping = true;
        if (!bubble.querySelector(".swipe-ico")) {
          const ico = document.createElement("span");
          ico.className = "swipe-ico";
          ico.textContent = "\u21a9";
          bubble.appendChild(ico);
        }
      } else {
        tracking = false;
      }
    }
    if (swiping) {
      dx = Math.min(Math.max(mx, 0), 80);
      bubble.style.transition = "none";
      bubble.style.transform = "translateX(" + (dx * dir) + "px)";
      const ico = bubble.querySelector(".swipe-ico");
      if (ico) ico.style.opacity = String(Math.min(dx / 55, 1));
    }
  }, { passive: true });
  bubble.addEventListener("touchend", () => {
    cancel();
    if (swiping && dx >= 55 && !bubble.dataset.react) {
      if (navigator.vibrate) navigator.vibrate(15);
      startReply(bubble, m);
    }
    reset();
  });
  bubble.addEventListener("touchcancel", () => { cancel(); reset(); });
  bubble.addEventListener("mousedown", start);
  bubble.addEventListener("mouseup", cancel);
  bubble.addEventListener("mouseleave", cancel);
}

async function sendChat(payload, bubble) {
  const targets = String(currentPeer.id).startsWith("group:")
    ? (currentPeer.members || (load(LS.groups, []).find((g) => "group:" + g.id === currentPeer.id) || {}).members || [])
    : [currentPeer.id];
  let outText = payload.text || payload.kind || "";
  try {
    if ((payload.kind || "text") === "text" && window.KyroE2E && currentPeer.publicKey) {
      outText = await KyroE2E.encryptText(outText, currentPeer.publicKey);
    }
  } catch (_) {}
  const bodyBase = {
    text: outText,
    content: outText,
    kind: payload.kind || "text",
    media: payload.media || "",
    fileName: payload.fileName || "",
    fileSize: payload.fileSize || 0
  };
  if (String(currentPeer.id).startsWith("group:")) {
    saveGroupMessage(currentPeer.id, { ...bodyBase, senderId: meId, mine: true, at: Date.now() });
  }
  for (const id of targets) {
    if (!id || id === meId || String(id).startsWith("group:")) continue;
    const saved = await Kyro.api.sendMessage(id, bodyBase);
    if (saved && saved._ok === false && bubble) bubble.style.opacity = "0.55";
    const packed = saved && (saved.message || saved);
    if (bubble && packed && packed._id && !bubble.dataset.id) {
      bubble.dataset.id = String(packed._id);
      seenMessages.add(String(packed._id));
      flushPending(bubble);
    }
    if (bubble && packed && packed.expiresAt) {
      bubble._exp = new Date(packed.expiresAt).getTime();
      bubble.classList.add("ephemeral");
    }
    const heavy = bodyBase.kind === "video" || bodyBase.kind === "file";
    if (window.kyroSocket && window.kyroSocket.connected && !(heavy && !(packed && packed._id))) {
      window.kyroSocket.emit("relay-message", packed && packed._id ? packed : { ...bodyBase, receiverId: id, to: id, senderId: meId });
    }
  }
}

document.getElementById("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const input = document.getElementById("messageInput");
  const text = (input && input.value ? input.value : "").trim();
  if (!text) return;
  if (editing) {
    const ed = editing;
    editing = null;
    input.value = "";
    setReply(null);
    await submitEdit(ed, text);
    return;
  }
  if (!currentPeer || !currentPeer.id) return;
  rememberPlain(currentPeer.id, text);
  const wire = replyTo ? wireReply(replyTo.id, replyTo.snip, text) : text;
  setReply(null);
  input.value = "";
  const box = document.getElementById("messages");
  box.querySelectorAll(".hint").forEach((n) => n.remove());
  const bubble = makeBubble({ mine: true, senderId: meId, text: wire, kind: "text" });
  appendMsg(box, bubble);
  box.scrollTop = box.scrollHeight;
  try { await sendChat({ text: wire, kind: "text" }, bubble); }
  catch (_) { bubble.style.opacity = "0.6"; }
});

function openModal(id) {
  const el = document.getElementById(id);
  el.hidden = false;
  el.classList.remove("is-off");
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.hidden = true;
  el.classList.add("is-off");
}

const messageInput = document.getElementById("messageInput");
let typingTimer = null;
if (messageInput) {
  messageInput.addEventListener("input", () => {
    if (!(window.kyroSocket && currentPeer)) return;
    window.kyroSocket.emit("typing", { to: currentPeer.id, receiverId: currentPeer.id, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      window.kyroSocket.emit("typing", { to: currentPeer.id, receiverId: currentPeer.id, typing: false });
    }, 1200);
  });
}

document.getElementById("attachBtn").addEventListener("click", () => document.getElementById("imageInput").click());
const MAX_FILE_BYTES = 10 * 1024 * 1024;
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
document.getElementById("imageInput").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file || !currentPeer) return;
  const box = document.getElementById("messages");
  if (box.querySelector(".hint")) box.innerHTML = "";
  if ((file.type || "").startsWith("image/")) {
    const media = await Kyro.fileToDataUrl(file);
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "image", media, text: "photo" });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    await sendChat({ kind: "image", media, text: "photo" }, bubble);
    return;
  }
  if (String(currentPeer.id).startsWith("group:")) {
    toast("Sending files and videos in groups isn't available yet. Use a one-to-one chat.");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    toast("That file is " + fmtSize(file.size) + ". The limit is 10 MB.");
    return;
  }
  let media;
  try { media = await readAsDataUrl(file); } catch (_) { toast("Couldn't read that file."); return; }
  const kind = (file.type || "").startsWith("video/") ? "video" : "file";
  const fileName = file.name || (kind === "video" ? "video" : "file");
  const label = (kind === "video" ? "\ud83c\udfa5 " : "\ud83d\udcc4 ") + fileName;
  const meta = { kind, media, fileName, fileSize: file.size, text: label };
  const bubble = makeBubble({ mine: true, senderId: meId, ...meta });
  appendMsg(box, bubble);
  box.scrollTop = box.scrollHeight;
  await sendChat(meta, bubble);
});

let recMedia = null;
let recChunks = [];
document.getElementById("recBtn").addEventListener("click", async () => {
  if (!currentPeer) return;
  if (recMedia && recMedia._rec) {
    recMedia._rec.stop();
    return;
  }
  recMedia = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(recMedia);
  recChunks = [];
  rec.ondataavailable = (ev) => { if (ev.data.size) recChunks.push(ev.data); };
  rec.onstop = async () => {
    recMedia.getTracks().forEach((t) => t.stop());
    recMedia = null;
    if (window.kyroSocket && currentPeer) {
      window.kyroSocket.emit("recording", { to: currentPeer.id, recording: false });
    }
    const blob = new Blob(recChunks, { type: "audio/webm" });
    const media = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
    const box = document.getElementById("messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "voice", media, text: "voice" });
    appendMsg(box, bubble);
    await sendChat({ kind: "voice", media, text: "voice" }, bubble);
    document.getElementById("recBtn").classList.remove("hot");
  };
  rec.start();
  recMedia._rec = rec;
  document.getElementById("recBtn").classList.add("hot");
  if (window.kyroSocket) window.kyroSocket.emit("recording", { to: currentPeer.id, recording: true });
  setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 30000);
});

document.getElementById("plusBtn").addEventListener("click", () => openModal("plusModal"));
document.getElementById("emptyPlus").addEventListener("click", () => openModal("plusModal"));
document.getElementById("closePlus").addEventListener("click", () => closeModal("plusModal"));
document.getElementById("chooseContact").addEventListener("click", () => {
  closeModal("plusModal");
  openModal("contactModal");
});
document.getElementById("chooseGroup").addEventListener("click", () => {
  closeModal("plusModal");
  const box = document.getElementById("groupPeople");
  box.innerHTML = "";
  const people = load(LS.contacts, []);
  if (!people.length) box.innerHTML = "<p class='hint'>Add contacts first.</p>";
  people.forEach((p) => {
    const row = document.createElement("label");
    row.innerHTML = "<input type='checkbox' /><span></span>";
    row.querySelector("input").value = p.id;
    row.querySelector("span").textContent = p.name;
    box.appendChild(row);
  });
  openModal("groupModal");
});
document.getElementById("closeContact").addEventListener("click", () => closeModal("contactModal"));
document.getElementById("closeGroup").addEventListener("click", () => closeModal("groupModal"));

document.getElementById("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("contactName").value.trim();
  const q = document.getElementById("contactFind").value.trim();
  const msg = document.getElementById("contactMsg");
  msg.className = "form-msg";
  msg.textContent = "Checking Kyro Chat…";
  const data = await Kyro.api.lookup(q, () => {
    msg.textContent = "Waking up the server. The first check can take up to a minute…";
  });
  const found = asArray(data);
  if (!data._ok) {
    msg.className = "form-msg bad";
    msg.textContent = data.message || "Could not check right now.";
    return;
  }
  if (!found.length) {
    msg.className = "form-msg bad";
    msg.textContent = "This number / email is unavailable on Kyro Chat.";
    return;
  }
  const user = found[0];
  const peer = peerFrom({ user, preview: "New contact" });
  peer.name = name || peer.name;
  const contacts = load(LS.contacts, []);
  contacts.unshift(peer);
  save(LS.contacts, contacts);
  msg.className = "form-msg";
  msg.textContent = "Successful. This contact is on Kyro Chat.";
  renderSearchResults([peer]);
  setTimeout(() => {
    closeModal("contactModal");
    openThread(peer);
  }, 700);
});

document.getElementById("groupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("groupName").value.trim();
  if (!name) return;
  const memberIds = [...document.querySelectorAll("#groupPeople input:checked")].map((i) => i.value).filter(Boolean);
  const groups = load(LS.groups, []);
  groups.unshift({ id: Date.now(), name, creatorId: meId, members: memberIds, admins: [meId] });
  save(LS.groups, groups);
  closeModal("groupModal");
  renderChats(chats);
});

function renderSearchResults(peers) {
  showTab("chats");
  const box = document.getElementById("chatList");
  const empty = document.getElementById("chatsEmpty");
  empty.hidden = true;
  box.innerHTML = "";
  peers.forEach((p) => box.appendChild(contactRow(p, "On Kyro Chat")));
}

document.getElementById("searchInput").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const q = e.target.value.trim();
  if (!q) { loadChats(); return; }
  const data = await Kyro.api.lookup(q);
  const found = asArray(data).map((u) => peerFrom({ user: u }));
  if (!found.length) {
    document.getElementById("chatsEmpty").hidden = false;
    document.getElementById("chatsEmpty").querySelector("p").textContent = "This contact is unavailable on Kyro Chat.";
    document.getElementById("chatList").innerHTML = "";
    return;
  }
  renderSearchResults(found);
});

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};
let callPeer = null;
let callRole = "";
let peerConnection = null;
let localStream = null;
let incomingOffer = null;
let pendingIce = [];
let agoraClient = null;
let agoraTrack = null;
let agoraCam = null;
let callChannel = "";
let wantVideo = false;


function logCall(name, note) {
  const calls = load(LS.calls, []);
  calls.unshift({ name, at: new Date().toISOString(), note });
  save(LS.calls, calls);
  renderCalls();
}

function setCallUi({ name, avatar, status, incoming }) {
  document.getElementById("callName").textContent = name || "Voice call";
  document.getElementById("callStatus").textContent = status || "";
  setAvatar(document.getElementById("callAvatar"), avatar || "", name || "C");
  document.getElementById("acceptCall").hidden = !incoming;
  document.getElementById("rejectCall").hidden = !incoming;
  document.getElementById("endCall").hidden = Boolean(incoming);
  openModal("callModal");
}

async function getMic() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

function markLive() {
  stopRingtone();
  const el = document.getElementById("callStatus");
  if (el) el.textContent = "You're on the call";
}

function attachRemoteAudio(stream) {
  const audio = document.getElementById("remoteAudio");
  audio.srcObject = stream;
  audio.muted = false;
  audio.volume = 1;
  audio.play().catch(() => {});
  markLive();
}

async function flushIce() {
  if (!peerConnection || !peerConnection.remoteDescription) return;
  const queued = pendingIce.splice(0);
  for (const candidate of queued) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
  }
}

async function makePeerConnection(peerId) {
  pendingIce = [];
  if (peerConnection) { try { peerConnection.close(); } catch (_) {} }
  peerConnection = new RTCPeerConnection(ICE_SERVERS);
  peerConnection.addTransceiver("audio", { direction: "sendrecv" });
  if (localStream) {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  }
  peerConnection.ontrack = (event) => {
    attachRemoteAudio(event.streams[0] || new MediaStream([event.track]));
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && window.kyroSocket) {
      window.kyroSocket.emit("webrtc-ice", { to: peerId, candidate: event.candidate });
    }
  };
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection && peerConnection.connectionState;
    if (!state) return;
    if (state === "connected") markLive();
    else if (state === "failed") document.getElementById("callStatus").textContent = "Call failed. Try Wi‑Fi.";
  };
  return peerConnection;
}

let ringCtx = null;
let ringTimer = null;
let ringOn = false;

function stopRingtone() {
  ringOn = false;
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  if (ringCtx) {
    try { ringCtx.close(); } catch (_) {}
    ringCtx = null;
  }
}

function playRingtone() {
  stopRingtone();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  ringCtx = ctx;
  ringOn = true;
  const ding = (freq, start, dur) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + dur + 0.02);
  };
  const loop = () => {
    if (!ringOn || !ringCtx) return;
    const t = ctx.currentTime;
    ding(440, t, 0.18);
    ding(554, t, 0.18);
    ding(659, t + 0.2, 0.18);
    ding(440, t + 0.42, 0.28);
    ringTimer = setTimeout(loop, 1600);
  };
  ctx.resume().catch(() => {});
  loop();
}

async function leaveAgora() {
  try { if (agoraTrack) agoraTrack.stop(); } catch (_) {}
  try { if (agoraTrack) agoraTrack.close(); } catch (_) {}
  try { if (agoraCam) agoraCam.stop(); } catch (_) {}
  try { if (agoraCam) agoraCam.close(); } catch (_) {}
  try { if (agoraClient) await agoraClient.leave(); } catch (_) {}
  agoraTrack = null;
  agoraCam = null;
  agoraClient = null;
  callChannel = "";
  wantVideo = false;
}

async function ensureAgoraSdk() {
  if (window.AgoraRTC && AgoraRTC.createClient) return;
  await new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.20.2/AgoraRTC_N-4.20.2.js";
    el.onload = resolve;
    el.onerror = () => reject(new Error("Agora SDK did not load"));
    document.head.appendChild(el);
  });
  if (!(window.AgoraRTC && AgoraRTC.createClient)) throw new Error("Agora SDK did not load");
}

async function joinAgoraCall(channel) {
  await ensureAgoraSdk();
  const data = await Kyro.api.agoraToken(channel);
  if (!data._ok || !data.appId) {
    throw new Error(data.message || "Set AGORA_APP_ID on the backend.");
  }
  callChannel = channel;
  agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  agoraClient.on("user-published", async (user, mediaType) => {
    await agoraClient.subscribe(user, mediaType);
    if (mediaType === "audio" && user.audioTrack) {
      window.kyroRemoteAudio = user.audioTrack;
      user.audioTrack.play();
      try {
        const track = user.audioTrack.getMediaStreamTrack && user.audioTrack.getMediaStreamTrack();
        if (track) {
          const audio = document.getElementById("remoteAudio");
          audio.srcObject = new MediaStream([track]);
          audio.muted = false;
          audio.volume = 1;
          audio.play().catch(() => {});
        }
      } catch (_) {}
      markLive();
    }
    if (mediaType === "video" && user.videoTrack) {
      user.videoTrack.play("remoteVideo");
      markLive();
    }
  });
  await agoraClient.join(data.appId, data.channel, data.token || null, data.uid || null);
  agoraTrack = await AgoraRTC.createMicrophoneAudioTrack();
  const pub = [agoraTrack];
  if (wantVideo) {
    agoraCam = await AgoraRTC.createCameraVideoTrack();
    agoraCam.play("localVideo");
    pub.push(agoraCam);
  }
  await agoraClient.publish(pub);
  document.getElementById("callStatus").textContent = "Waiting for the other person…";
}

function callChannelName(a, b) {
  return "kyro" + [String(a), String(b)].sort().join("").replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
}

async function hangUp(notify) {
  stopRingtone();
  await leaveAgora();
  const peerId = callPeer && callPeer.id;
  if (notify && peerId && window.kyroSocket) window.kyroSocket.emit("call-end", { to: peerId });
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  incomingOffer = null;
  pendingIce = [];
  callPeer = null;
  callRole = "";
  const audio = document.getElementById("remoteAudio");
  audio.srcObject = null;
  closeModal("callModal");
}

async function startCall(peer, video) {
  wantVideo = Boolean(video);
  if (!window.kyroSocket || !window.kyroSocket.connected) {
    document.getElementById("callStatus").textContent = "Socket is not connected.";
    setCallUi({ name: peer.name, avatar: peer.avatar, status: "Cannot call until chat socket is online." });
    return;
  }
  callPeer = peer;
  callRole = "caller";
  logCall(peer.name, "Outgoing");
  setCallUi({ name: peer.name, avatar: peer.avatar, status: "Calling…", incoming: false });
  try {
    playRingtone();
    callChannel = callChannelName(meId, peer.id);
    window.kyroSocket.emit("call-user", { to: peer.id, name: meName, channel: callChannel, video: wantVideo });
    document.getElementById("callStatus").textContent = "Ringing…";
  } catch (err) {
    document.getElementById("callStatus").textContent = err.message || "Microphone permission is needed.";
  }
}

document.getElementById("threadCall").addEventListener("click", () => {
  if (currentPeer) startCall(currentPeer, false);
});
const vidBtn = document.getElementById("threadVideo");
if (vidBtn) vidBtn.addEventListener("click", () => { if (currentPeer) startCall(currentPeer, true); });
const camBtn = document.getElementById("camBtn");
if (camBtn) camBtn.addEventListener("click", async () => {
  if (!agoraClient) return;
  if (agoraCam) {
    await agoraClient.unpublish(agoraCam);
    agoraCam.stop(); agoraCam.close(); agoraCam = null;
    camBtn.classList.remove("on");
    return;
  }
  agoraCam = await AgoraRTC.createCameraVideoTrack();
  agoraCam.play("localVideo");
  await agoraClient.publish([agoraCam]);
  camBtn.classList.add("on");
});
document.getElementById("endCall").addEventListener("click", () => hangUp(true));
document.getElementById("muteBtn").addEventListener("click", () => {
  if (!agoraTrack) return;
  const muted = agoraTrack.muted === true ? false : !agoraTrack.muted;
  if (typeof agoraTrack.setMuted === "function") agoraTrack.setMuted(!agoraTrack.muted);
  else agoraTrack.setEnabled && agoraTrack.setEnabled(agoraTrack.enabled === false);
  document.getElementById("muteBtn").classList.toggle("on");
});
document.getElementById("speakerBtn").addEventListener("click", async () => {
  const btn = document.getElementById("speakerBtn");
  const on = btn.classList.toggle("on");
  const audio = document.getElementById("remoteAudio");
  if (audio) {
    audio.muted = false;
    audio.volume = on ? 1 : 0.7;
    audio.play().catch(() => {});
  }
  if (window.kyroRemoteAudio) {
    window.kyroRemoteAudio.setVolume(on ? 100 : 70);
    window.kyroRemoteAudio.play();
  }
});
document.getElementById("closeCallSheet").addEventListener("click", () => hangUp(true));
document.getElementById("rejectCall").addEventListener("click", () => {
  if (callPeer && window.kyroSocket) window.kyroSocket.emit("call-reject", { to: callPeer.id });
  hangUp(false);
});
document.getElementById("acceptCall").addEventListener("click", async () => {
  if (!callPeer) return;
  try {
    stopRingtone();
    document.getElementById("acceptCall").hidden = true;
    document.getElementById("rejectCall").hidden = true;
    document.getElementById("endCall").hidden = false;
    document.getElementById("callStatus").textContent = "You're on the call";
    window.kyroSocket.emit("call-accept", { to: callPeer.id, channel: callChannel });
    await joinAgoraCall(callChannel || callChannelName(meId, callPeer.id));
  } catch (err) {
    document.getElementById("callStatus").textContent = err.message || "Could not accept call.";
  }
});

async function answerOffer(sdp) {
  if (!callPeer) return;
  if (!peerConnection) await makePeerConnection(callPeer.id);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  await flushIce();
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  window.kyroSocket.emit("webrtc-answer", { to: callPeer.id, sdp: answer });
}

function bindCallSocket(socket) {
  socket.on("incoming-call", (data) => {
    callPeer = {
      id: data.from,
      name: data.fromName || data.name || "Kyro user",
      avatar: data.fromAvatar || ""
    };
    callRole = "callee";
    callChannel = data.channel || callChannelName(meId, data.from);
    wantVideo = Boolean(data.video);
    logCall(callPeer.name, "Incoming");
    setCallUi({
      name: callPeer.name,
      avatar: callPeer.avatar,
      status: "Incoming voice call",
      incoming: true
    });
    playRingtone();
  });
  socket.on("webrtc-offer", async (data) => {
    incomingOffer = data.sdp;
    if (!callPeer) {
      callPeer = { id: data.from, name: data.fromName || "Kyro user", avatar: data.fromAvatar || "" };
    }
    if (callRole === "callee" && localStream) await answerOffer(data.sdp);
  });
  socket.on("call-accepted", async () => {
    stopRingtone();
    document.getElementById("callStatus").textContent = "Connecting audio…";
    if (!callPeer) return;
    try {
      await joinAgoraCall(callChannel || callChannelName(meId, callPeer.id));
    } catch (err) {
      document.getElementById("callStatus").textContent = err.message || "Call failed";
    }
  });
  socket.on("webrtc-answer", async (data) => {
    if (!peerConnection || !data.sdp) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await flushIce();
    markLive();
  });
  socket.on("webrtc-ice", async (data) => {
    if (!data.candidate) return;
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIce.push(data.candidate);
      return;
    }
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (_) {}
  });
  socket.on("call-rejected", () => {
    document.getElementById("callStatus").textContent = "Call declined";
    setTimeout(() => hangUp(false), 800);
  });
  socket.on("call-ended", () => hangUp(false));
  socket.on("call-unavailable", () => {
    document.getElementById("callStatus").textContent = "This person is not online.";
  });
}

function renderCalls() {
  const box = document.getElementById("callList");
  box.innerHTML = "";
  load(LS.calls, []).forEach((c) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<div class='row-avatar'>☎</div><div><b></b><span></span></div>";
    row.querySelector("b").textContent = c.name;
    row.querySelector("span").textContent = new Date(c.at).toLocaleString();
    box.appendChild(row);
  });
}

function openStoryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("kyro-stories", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("media");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveStoryMedia(id, blob) {
  const db = await openStoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function storyMediaUrl(id) {
  const db = await openStoryDb();
  return new Promise((resolve) => {
    const tx = db.transaction("media", "readonly");
    const req = tx.objectStore("media").get(id);
    req.onsuccess = () => resolve(req.result ? URL.createObjectURL(req.result) : "");
    req.onerror = () => resolve("");
  });
}

let storyType = "text";
function openStoryComposer() {
  const msg = document.getElementById("storyMsg");
  if (msg) msg.textContent = "";
  openModal("storyModal");
}
document.getElementById("closeStory").addEventListener("click", () => closeModal("storyModal"));
document.querySelectorAll(".story-type").forEach((btn) => {
  btn.addEventListener("click", () => {
    storyType = btn.dataset.type;
    document.querySelectorAll(".story-type").forEach((b) => b.classList.toggle("is-on", b === btn));
    document.getElementById("storyTextBox").hidden = storyType !== "text";
    document.getElementById("storyImageBox").hidden = storyType !== "image";
    document.getElementById("storyMusicBox").hidden = storyType !== "music";
  });
});

document.getElementById("storyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("storyMsg");
  msg.className = "form-msg";
  msg.textContent = "Saving story…";
  try {
    const story = {
      name: meName,
      type: storyType,
      at: Date.now(),
      expires: Date.now() + 24 * 60 * 60 * 1000,
      text: ""
    };
    if (storyType === "text") {
      story.text = document.getElementById("storyText").value.trim();
      if (!story.text) {
        msg.className = "form-msg bad";
        msg.textContent = "Write some text first.";
        return;
      }
    }
    if (storyType === "image") {
      const file = document.getElementById("storyImage").files[0];
      if (!file) {
        msg.className = "form-msg bad";
        msg.textContent = "Choose a photo.";
        return;
      }
      story.image = await Kyro.fileToDataUrl(file);
      story.text = "Photo story";
    }
    if (storyType === "music") {
      const file = document.getElementById("storyMusic").files[0];
      if (!file) {
        msg.className = "form-msg bad";
        msg.textContent = "Choose an audio file.";
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        msg.className = "form-msg bad";
        msg.textContent = "Use an audio file smaller than 12MB.";
        return;
      }
      story.text = document.getElementById("storyMusicTitle").value.trim() || file.name;
      story.musicName = file.name;
      story.mediaId = "music-" + Date.now();
      await saveStoryMedia(story.mediaId, file);
    }
    const stories = load(LS.stories, []).filter((s) => !s.expires || s.expires > Date.now());
    stories.unshift(story);
    save(LS.stories, stories);
    closeModal("storyModal");
    await renderStories();
  } catch (err) {
    msg.className = "form-msg bad";
    msg.textContent = err.message || "Could not save that story.";
  }
});

async function renderStories() {
  const box = document.getElementById("storyList");
  if (!box) return;
  box.innerHTML = "";
  const add = document.createElement("button");
  add.className = "status-item";
  add.type = "button";
  add.innerHTML = "<div class='status-ring'><i>+</i></div><small>My status</small>";
  add.onclick = openStoryComposer;
  box.appendChild(add);
  const list = load(LS.stories, []).filter((s) => !s.expires || s.expires > Date.now());
  for (const s of list) {
    const hrs = Math.max(1, Math.round((s.expires - Date.now()) / 36e5));
    const btn = document.createElement("button");
    btn.className = "status-item";
    btn.type = "button";
    btn.innerHTML = "<div class='status-ring'><i></i></div><small></small>";
    const views = (s.views || []).length;
    const likes = (s.likes || []).length;
    btn.classList.toggle("seen-story", (s.views || []).includes(meId));
    btn.querySelector("small").textContent = (s.name || "Story").split(" ")[0] + " · " + hrs + "h";
    const face = btn.querySelector("i");
    if (s.image) { face.style.background = "url(" + s.image + ") center/cover"; face.textContent = ""; }
    else face.textContent = (s.name || "K")[0];
    btn.onclick = () => openStatus(s, hrs);
    box.appendChild(btn);
  }
}

function patchStory(story, fn) {
  const list = load(LS.stories, []).map((x) => (x.at === story.at && x.name === story.name ? fn({ ...x }) : x));
  save(LS.stories, list);
  return list.find((x) => x.at === story.at && x.name === story.name) || story;
}

async function openStatus(s, hrs) {
  s = patchStory(s, (st) => {
    const views = st.views || [];
    if (!views.includes(meId)) views.push(meId);
    st.views = views;
    return st;
  });
  const view = document.getElementById("statusView");
  view.hidden = false;
  view.classList.remove("is-off");
  document.getElementById("statusName").textContent = s.name || "Story";
  const leftHrs = Math.max(0, Math.round(((s.expires || Date.now()) - Date.now()) / 36e5));
  document.getElementById("statusLeft").textContent =
    leftHrs + " hours left · " + (s.views || []).length + " views · " + (s.likes || []).length + " likes";
  const body = document.getElementById("statusBody");
  body.innerHTML = "";
  if (s.image) {
    const img = document.createElement("img");
    img.src = s.image;
    body.appendChild(img);
  } else body.textContent = s.text || "";
  if (s.mediaId || s.music) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.autoplay = true;
    audio.src = s.music || await storyMediaUrl(s.mediaId);
    body.appendChild(audio);
  }
  const like = document.createElement("button");
  like.className = "call-ctl";
  like.type = "button";
  like.textContent = (s.likes || []).includes(meId) ? "Liked" : "Like";
  like.onclick = () => {
    s = patchStory(s, (st) => {
      const likes = st.likes || [];
      if (likes.includes(meId)) st.likes = likes.filter((id) => id !== meId);
      else likes.push(meId);
      st.likes = st.likes || likes;
      return st;
    });
    like.textContent = (s.likes || []).includes(meId) ? "Liked" : "Like";
    document.getElementById("statusLeft").textContent =
      leftHrs + " hours left · " + (s.views || []).length + " views · " + (s.likes || []).length + " likes";
  };
  body.appendChild(like);
  renderStories();
}

document.getElementById("addCommunityBtn").addEventListener("click", () => {
  const name = prompt("Community name");
  if (!name) return;
  const list = load(LS.communities, []);
  list.unshift({ name });
  save(LS.communities, list);
  renderCommunities();
});

function renderCommunities() {
  const box = document.getElementById("communityList");
  box.innerHTML = "";
  load(LS.communities, []).forEach((c) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<div class='row-avatar'>⌂</div><div><b></b><span>Community</span></div>";
    row.querySelector("b").textContent = c.name;
    box.appendChild(row);
  });
}

document.getElementById("loadUsersBtn").addEventListener("click", async () => {
  const box = document.getElementById("adminUsers");
  box.textContent = "Loading…";
  const data = await Kyro.request("/api/admin/users");
  const users = asArray(data);
  box.innerHTML = "";
  if (!data._ok) {
    box.textContent = data.message || "Admin only.";
    return;
  }
  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<div class='row-avatar'></div><div><b></b><span></span></div>";
    setAvatar(row.querySelector(".row-avatar"), u.avatar, u.fullName || u.email);
    row.querySelector("b").textContent = u.fullName || u.email;
    row.querySelector("span").textContent = (u.email || "") + " · " + (u.role || "user");
    box.appendChild(row);
  });
});

function upsertChatPreview(peerId, text) {
  const idx = chats.findIndex((c) => String(peerFrom(c).id) === String(peerId));
  if (idx >= 0) {
    const item = chats.splice(idx, 1)[0];
    item.lastMessage = { text, createdAt: new Date().toISOString() };
    item.preview = text;
    chats.unshift(item);
    return;
  }
  const contact = load(LS.contacts, []).find((c) => String(c.id) === String(peerId));
  chats.unshift(contact ? { user: contact, lastMessage: { text, createdAt: new Date().toISOString() } } : {
    id: peerId,
    name: "Kyro user",
    lastMessage: { text, createdAt: new Date().toISOString() }
  });
}

async function applyIncoming(msg) {
  const mid = String(msg._id || "");
  if (mid && seenMessages.has(mid)) return;
  if (mid) seenMessages.add(mid);

  const from = String(msg.senderId || msg.from || "");
  const to = String(msg.receiverId || msg.to || "");
  const mine = from === meId;
  const peerId = mine ? to : from;
  let text = msg.text || msg.content || msg.message || "";
  if (String(text).startsWith("ENC1:")) {
    try { text = await readText(text, { id: peerId, publicKey: msg.publicKey || "" }); } catch (_) {}
  }
  if (!peerId || (!text && !msg.media)) return;
  const wired = parseWire(text);
  if (wired.type === "del") {
    if (window.KyroMsg) KyroMsg.applyDelete(wired.target, from);
    if (!mine) upsertChatPreview(peerId, cleanPreview(text));
    renderChats(chats);
    return;
  }
  if (wired.type === "react") {
    if (currentPeer && String(currentPeer.id) === String(peerId) && !mine) applyReaction(wired.target, from, wired.emoji);
    return;
  }
  text = cleanPreview(text);

  const open = currentPeer && String(currentPeer.id) === String(peerId);
  if (open) {
    const box = document.getElementById("messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    if (!mine) {
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
      appendMsg(box, makeBubble(msg));
      if (near) box.scrollTop = box.scrollHeight;
      else bumpNewBelow();
      if (window.kyroSocket) window.kyroSocket.emit("message-seen", { otherUserId: peerId, to: peerId });
    }
    clearUnread(peerId);
  } else if (!mine) {
    unarchive(peerId);
    addUnread(peerId);
    showMessagePopup(peerId, text);
  }

  upsertChatPreview(peerId, text);
  renderChats(chats);
}

function showMessagePopup(peerId, text) {
  if (isMuted(peerId)) return;
  if (localStorage.getItem("kyro.popups") === "off") return;
  let toast = document.getElementById("msgToast");
  if (!toast) {
    toast = document.createElement("button");
    toast.id = "msgToast";
    toast.className = "msg-toast";
    toast.type = "button";
    document.body.appendChild(toast);
  }
  const chat = chats.map(peerFrom).find((p) => String(p.id) === String(peerId));
  const contact = load(LS.contacts, []).find((c) => String(c.id) === String(peerId));
  const name = (chat && chat.name) || (contact && contact.name) || "New message";
  toast.hidden = false;
  toast.textContent = name + ": " + text;
  toast.onclick = () => {
    toast.hidden = true;
    openThread(chat || contact || { id: peerId, name });
  };
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => { toast.hidden = true; }, 4000);
}

function connectSocket() {
  if (typeof io !== "function") return;
  const token = Kyro.getToken();
  if (!token || token === "session") return;
  const socket = io(Kyro.API_BASE, { auth: { token }, transports: ["websocket", "polling"] });
  window.kyroSocket = socket;
  socket.on("connect", () => {});
  socket.on("new-message", applyIncoming);
  socket.on("message", applyIncoming);
  socket.on("chat-updated", applyIncoming);
  socket.on("notify", handleNotify);
  socket.on("typing", (data) => {
    if (!currentPeer || String(data.userId) !== String(currentPeer.id)) return;
    const line = document.getElementById("typingLine");
    if (!line) return;
    if (data.recording) {
      line.hidden = false;
      line.textContent = "recording…";
    } else if (data.typing) {
      line.hidden = false;
      line.textContent = "typing…";
    } else {
      line.hidden = true;
    }
  });
  socket.on("messages-seen", (data) => {
    if (currentPeer && String(data.otherUserId) === String(currentPeer.id)) {
      document.querySelectorAll(".bubble.me .ticks").forEach((t) => {
        t.textContent = "✓✓";
        t.classList.add("seen");
      });
    }
  });
  socket.on("presence", (data) => {
    onlineIds.clear();
    (data.online || []).forEach((id) => onlineIds.add(String(id)));
    refreshPresenceUi();
  });
  socket.on("user-online", (data) => {
    onlineIds.add(String(data.userId));
    if (data.lastSeen) rememberSeen(data.userId, data.lastSeen);
    refreshPresenceUi();
  });
  socket.on("user-offline", (data) => {
    onlineIds.delete(String(data.userId));
    rememberSeen(data.userId, data.lastSeen || new Date().toISOString());
    refreshPresenceUi();
  });
  bindCallSocket(socket);
}

document.getElementById("closeStatus").addEventListener("click", () => {
  const view = document.getElementById("statusView");
  view.hidden = true;
  view.classList.add("is-off");
});
document.getElementById("actReply").addEventListener("click", () => {
  if (!actionMsg) return;
  startReply(actionMsg.bubble, actionMsg.m);
  closeModal("msgActions");
});
document.getElementById("replyCancel").addEventListener("click", () => {
  if (editing) { editing = null; document.getElementById("messageInput").value = ""; }
  setReply(null);
});
document.querySelectorAll("#reactRow button").forEach((btn) => {
  btn.addEventListener("click", () => {
    closeModal("msgActions");
    if (!actionMsg || !currentPeer || String(currentPeer.id).startsWith("group:")) return;
    const id = actionMsg.bubble.dataset.id;
    if (!id) return;
    const emoji = btn.dataset.e;
    const had = actionMsg.bubble._reacts && actionMsg.bubble._reacts[meId];
    const next = had === emoji ? "" : emoji;
    applyReaction(id, meId, next);
    sendChat({ text: "\u27e6x:" + id + "|" + next + "\u27e7", kind: "text" }).catch(() => {});
  });
});
document.getElementById("closeActions").addEventListener("click", () => closeModal("msgActions"));
document.getElementById("actDelete").addEventListener("click", () => {
  if (actionMsg && actionMsg.bubble) actionMsg.bubble.remove();
  closeModal("msgActions");
});
document.getElementById("actSave").addEventListener("click", () => {
  if (!actionMsg) return;
  const m = actionMsg.m;
  if (m.kind === "video" || m.kind === "file") {
    downloadBubble(actionMsg.bubble, m);
    closeModal("msgActions");
    return;
  }
  const a = document.createElement("a");
  if (m.media) {
    a.href = m.media;
    a.download = (m.kind || "file") + (m.kind === "image" ? ".jpg" : m.kind === "voice" ? ".webm" : ".txt");
  } else {
    a.href = "data:text/plain," + encodeURIComponent(m.text || "");
    a.download = "message.txt";
  }
  a.click();
  closeModal("msgActions");
});
document.getElementById("actForward").addEventListener("click", () => {
  closeModal("msgActions");
  const box = document.getElementById("forwardList");
  box.innerHTML = "";
  const people = chats.map(peerFrom).concat(load(LS.contacts, []));
  const seen = new Set();
  people.forEach((p) => {
    if (!p.id || seen.has(p.id)) return;
    seen.add(p.id);
    const row = document.createElement("button");
    row.className = "row";
    row.type = "button";
    row.innerHTML = "<div class='grow'><b></b></div>";
    row.querySelector("b").textContent = p.name;
    row.onclick = async () => {
      const fm = actionMsg.m;
      const heavy = fm.kind === "video" || fm.kind === "file";
      let fmedia = fm.media || "";
      if (heavy) {
        fmedia = await getBubbleMedia(actionMsg.bubble, fm);
        if (!fmedia) { toast("Couldn't load that file to forward it."); return; }
      }
      currentPeer = p;
      await sendChat({
        text: heavy ? fm.text || kindLabel(fm, actionMsg.bubble) : (actionMsg.bubble._plain || fm.text),
        kind: fm.kind || "text",
        media: fmedia,
        fileName: fm.fileName || "",
        fileSize: fm.fileSize || 0
      });
      closeModal("forwardModal");
      openThread(p);
    };
    box.appendChild(row);
  });
  openModal("forwardModal");
});
document.getElementById("closeForward").addEventListener("click", () => closeModal("forwardModal"));
document.getElementById("closeGroupManage").addEventListener("click", () => closeModal("groupManage"));

function isGroupAdmin(g) {
  return (g.admins || [g.creatorId]).map(String).includes(String(meId)) || String(g.creatorId) === String(meId);
}

function openGroupManage(g) {
  document.getElementById("groupManageTitle").textContent = g.name;
  const box = document.getElementById("groupMemberBox");
  box.innerHTML = "";
  if (!isGroupAdmin(g)) {
    box.innerHTML = "<p class='hint'>Only group admins can edit members.</p>";
    openModal("groupManage");
    return;
  }
  load(LS.contacts, []).forEach((p) => {
    const row = document.createElement("label");
    const admin = (g.admins || []).map(String).includes(String(p.id));
    row.innerHTML = "<input type='checkbox' class='mem' /><span></span><label class='adm'><input type='checkbox' class='adm-box' /> admin</label>";
    row.querySelector(".mem").value = p.id;
    row.querySelector(".mem").checked = (g.members || []).map(String).includes(String(p.id));
    row.querySelector(".adm-box").value = p.id;
    row.querySelector(".adm-box").checked = admin;
    row.querySelector("span").textContent = p.name;
    box.appendChild(row);
  });
  document.getElementById("saveGroupMembers").onclick = () => {
    const members = [...box.querySelectorAll(".mem:checked")].map((i) => i.value);
    const admins = [g.creatorId || meId, ...[...box.querySelectorAll(".adm-box:checked")].map((i) => i.value)];
    const groups = load(LS.groups, []).map((x) => String(x.id) === String(g.id) ? { ...x, members, admins: [...new Set(admins)] } : x);
    save(LS.groups, groups);
    closeModal("groupManage");
    renderChats(chats);
  };
  openModal("groupManage");
}

function hideKyroLoader() {
  ["plusModal", "contactModal", "groupModal", "callModal"].forEach(closeModal);
  document.getElementById("threadScreen").hidden = true;
  showTab("chats");
  document.body.classList.remove("is-loading");
  document.body.classList.add("loader-out");
  const loader = document.getElementById("kyroLoader");
  if (loader) setTimeout(() => loader.remove(), 500);
}

(async () => {
  try {
    const meRes = await Kyro.api.me();
    if (meRes && meRes._ok) {
      const profile = Kyro.extractUser(meRes);
      if (profile && (profile.email || profile._id)) {
        Kyro.setSession(Kyro.getToken(), profile);
        me = Kyro.getUser() || profile;
        meName = me.fullName || [me.firstName, me.lastName].filter(Boolean).join(" ") || meName;
        meId = String(me._id || me.id || meId);
        isAdmin = me.role === "admin";
      }
    } else if (meRes && meRes._status === 401 && Kyro.getToken() !== "session") {
      Kyro.clearSession();
      location.replace("login.html");
      return;
    }
  } catch (_) {}
  paintMe();
  if (window.KyroE2E) KyroE2E.publishKey();
  renderStories();
  renderCommunities();
  renderCalls();
  await loadChats();
  paintChatBadge();
  connectSocket();
  const wait = new Promise((r) => setTimeout(r, 1100));
  await wait;
  hideKyroLoader();
})();


// ---------- Chat options: pin and mute ----------
document.getElementById("optPin").addEventListener("click", () => {
  if (optsPeer) toggleIn("kyro.pins", optsPeer.id);
  closeModal("chatOptsModal");
  renderChats(chats);
});
document.getElementById("optMute").addEventListener("click", () => {
  if (optsPeer) toggleIn("kyro.mutes", optsPeer.id);
  closeModal("chatOptsModal");
  renderChats(chats);
});
document.getElementById("optClose").addEventListener("click", () => closeModal("chatOptsModal"));

// ---------- Search inside a chat ----------
let tsMatches = [], tsIdx = -1;
function tsBubbles() { return Array.from(document.getElementById("messages").children).filter((b) => b.classList && b.classList.contains("bubble")); }
function tsClear() {
  tsBubbles().forEach((b) => b.classList.remove("dim", "hit", "hit-now"));
  tsMatches = []; tsIdx = -1;
  document.getElementById("threadSearchCount").textContent = "";
}
function tsJump() {
  tsMatches.forEach((b) => b.classList.remove("hit-now"));
  const n = tsMatches.length;
  const count = document.getElementById("threadSearchCount");
  if (!n) { count.textContent = "No results"; return; }
  const b = tsMatches[tsIdx];
  b.classList.add("hit-now");
  b.scrollIntoView({ block: "center", behavior: "smooth" });
  count.textContent = (tsIdx + 1) + "/" + n;
}
function tsRun() {
  const q = document.getElementById("threadSearchInput").value.trim().toLowerCase();
  tsClear();
  if (!q) return;
  tsBubbles().forEach((b) => {
    if ((b._plain || "").toLowerCase().includes(q)) { tsMatches.push(b); b.classList.add("hit"); }
    else b.classList.add("dim");
  });
  tsIdx = tsMatches.length - 1;
  tsJump();
}
function tsClose() {
  const bar = document.getElementById("threadSearch");
  if (!bar) return;
  tsClear();
  document.getElementById("threadSearchInput").value = "";
  bar.hidden = true;
}
document.getElementById("threadSearchBtn").addEventListener("click", () => {
  const bar = document.getElementById("threadSearch");
  if (!bar.hidden) { tsClose(); return; }
  bar.hidden = false;
  document.getElementById("threadSearchInput").focus();
});
document.getElementById("threadSearchInput").addEventListener("input", tsRun);
document.getElementById("threadSearchInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !tsMatches.length) return;
  e.preventDefault();
  tsIdx = (tsIdx - 1 + tsMatches.length) % tsMatches.length;
  tsJump();
});
document.getElementById("threadSearchClose").addEventListener("click", tsClose);


// ---------- Archive ----------
document.getElementById("optArchive").addEventListener("click", () => {
  if (optsPeer) toggleIn("kyro.arch", optsPeer.id);
  closeModal("chatOptsModal");
  renderChats(chats);
});

// ---------- Chat filter chips ----------
document.querySelectorAll("#chatChips button").forEach((btn) => {
  btn.addEventListener("click", () => {
    chatFilter = btn.dataset.f;
    document.querySelectorAll("#chatChips button").forEach((b) => b.classList.toggle("on", b === btn));
    renderChats(chats);
  });
});

// ---------- Scroll to latest ----------
let newBelow = 0;
function bumpNewBelow() {
  newBelow++;
  const c = document.getElementById("toBottomCount");
  c.textContent = String(newBelow);
  c.hidden = false;
  document.getElementById("toBottom").hidden = false;
}
document.getElementById("messages").addEventListener("scroll", (e) => {
  const el = e.target;
  const far = el.scrollHeight - el.scrollTop - el.clientHeight > 240;
  const btn = document.getElementById("toBottom");
  if (far) { btn.hidden = false; return; }
  btn.hidden = true;
  newBelow = 0;
  document.getElementById("toBottomCount").hidden = true;
}, { passive: true });
document.getElementById("toBottom").addEventListener("click", () => {
  const el = document.getElementById("messages");
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
});

// ---------- Starred messages ----------
document.getElementById("actStar").addEventListener("click", () => {
  closeModal("msgActions");
  if (!actionMsg) return;
  const { bubble, m } = actionMsg;
  const id = bubble.dataset.id;
  if (!id) return;
  let stars = load("kyro.stars", []);
  if (stars.some((x) => x.id === id)) {
    stars = stars.filter((x) => x.id !== id);
    bubble.classList.remove("starred");
  } else {
    const label = kindLabel(m, bubble);
    stars.push({ id, peerId: currentPeer ? String(currentPeer.id) : "", text: String(label).slice(0, 200), ts: bubble._ts, mine: bubble.classList.contains("me") });
    bubble.classList.add("starred");
  }
  save("kyro.stars", stars);
});
document.getElementById("starredBtn").addEventListener("click", () => {
  const box = document.getElementById("starredList");
  box.innerHTML = "";
  const stars = load("kyro.stars", []).sort((a, b) => b.ts - a.ts);
  if (!stars.length) {
    box.innerHTML = '<p class="hint">No starred messages yet. Long-press a message and tap Star.</p>';
  }
  stars.forEach((x) => {
    const peer = chats.map(peerFrom).find((p) => String(p.id) === x.peerId) || load(LS.contacts, []).find((c) => String(c.id) === x.peerId);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "star-item";
    const who = document.createElement("b");
    who.textContent = (x.mine ? "You" : (peer && peer.name) || "Kyro user") + " \u00b7 " + dayLabel(x.ts);
    const txt = document.createElement("span");
    txt.textContent = x.text;
    row.append(who, txt);
    row.addEventListener("click", () => { closeModal("starredModal"); if (peer) openThread(peer); });
    box.appendChild(row);
  });
  openModal("starredModal");
});
document.getElementById("starredClose").addEventListener("click", () => closeModal("starredModal"));


// ---------- Profile: username and bio ----------
const USERNAME_RX = /^[a-z0-9._]{3,20}$/;
function epCount() {
  document.getElementById("epBioCount").textContent = document.getElementById("epBio").value.length + "/120";
}
document.getElementById("editProfileBtn").addEventListener("click", () => {
  const local = load("kyro.profile", {});
  document.getElementById("epUsername").value = me.username || local.username || "";
  document.getElementById("epBio").value = me.bio || local.bio || "";
  const msg = document.getElementById("epMsg");
  msg.textContent = ""; msg.classList.remove("bad");
  epCount();
  openModal("editProfileModal");
});
document.getElementById("epBio").addEventListener("input", epCount);
document.getElementById("epCancel").addEventListener("click", () => closeModal("editProfileModal"));
document.getElementById("epSave").addEventListener("click", async () => {
  const msg = document.getElementById("epMsg");
  const btn = document.getElementById("epSave");
  const username = document.getElementById("epUsername").value.trim().replace(/^@/, "").toLowerCase();
  const bio = document.getElementById("epBio").value.trim().slice(0, 120);
  msg.classList.add("bad");
  if (username && !USERNAME_RX.test(username)) {
    msg.textContent = "Username must be 3 to 20 characters: letters, numbers, dots or underscores.";
    return;
  }
  btn.disabled = true;
  msg.classList.remove("bad");
  msg.textContent = "Saving...";
  let res = null;
  try { res = await Kyro.api.updateProfile({ username, bio }); } catch (_) {}
  if (res && (res._status === 409 || /taken|exists|already/i.test(String(res.message || "")))) {
    msg.classList.add("bad");
    msg.textContent = "That username is taken. Try another one.";
    btn.disabled = false;
    return;
  }
  save("kyro.profile", { username, bio });
  me = Object.assign({}, me, { username, bio });
  Kyro.setSession(Kyro.getToken(), me);
  paintMe();
  msg.textContent = res && res._ok ? "Profile saved." : "Saved on this device. We couldn't reach the server.";
  btn.disabled = false;
  setTimeout(() => closeModal("editProfileModal"), 700);
});

// ---------- Contact info (tap the name in a chat) ----------
document.querySelector(".thread-head .grow").addEventListener("click", () => {
  if (!currentPeer || String(currentPeer.id).startsWith("group:")) return;
  const p = currentPeer;
  setAvatar(document.getElementById("piAvatar"), p.avatar, p.name);
  document.getElementById("piName").textContent = p.name || "Kyro user";
  const u = document.getElementById("piUsername");
  u.textContent = p.username ? "@" + p.username : "";
  u.hidden = !p.username;
  const b = document.getElementById("piBio");
  b.textContent = p.bio || "No bio yet.";
  b.classList.toggle("is-empty", !p.bio);
  document.getElementById("piContact").textContent = p.email || p.phone || "";
  openModal("peerInfoModal");
});
document.getElementById("piClose").addEventListener("click", () => closeModal("peerInfoModal"));


// ---------- Block, report, disappearing messages ----------
function applyBlockState() {
  const blocked = !!currentPeer && blockedSet().has(String(currentPeer.id));
  const composer = document.getElementById("composer");
  const bar = document.getElementById("blockedBar");
  if (composer) composer.hidden = blocked;
  if (bar) bar.hidden = !blocked;
}
function sysNote(text) {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "day-div sys-note";
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
const DISAPPEAR_LABEL = { 0: "off", 86400: "24 hours", 604800: "7 days", 7776000: "90 days" };
function notifyPeer(to, type, id) {
  if (window.kyroSocket && window.kyroSocket.connected) window.kyroSocket.emit("notify", { to, type, id: id || "" });
}
async function setBlocked(peer, on) {
  const res = await (on ? Kyro.api.blockUser(peer.id) : Kyro.api.unblockUser(peer.id)).catch(() => null);
  if (!res || res._ok === false) { toast("Couldn't update the block. Check your connection and try again."); return false; }
  const set = blockedSet();
  if (on) set.add(String(peer.id)); else set.delete(String(peer.id));
  save("kyro.blocked", Array.from(set));
  applyBlockState();
  return true;
}
document.getElementById("piBlock").addEventListener("click", async () => {
  if (!currentPeer) return;
  const on = !blockedSet().has(String(currentPeer.id));
  if (on && !confirm("Block " + (currentPeer.name || "this contact") + "? They won't be able to message or call you.")) return;
  if (await setBlocked(currentPeer, on)) closeModal("peerInfoModal");
});
document.getElementById("unblockBtn").addEventListener("click", () => { if (currentPeer) setBlocked(currentPeer, false); });
document.getElementById("piReport").addEventListener("click", async () => {
  if (!currentPeer) return;
  const reason = prompt("Why are you reporting " + (currentPeer.name || "this user") + "? (optional)");
  if (reason === null) return;
  const res = await Kyro.api.reportUser(currentPeer.id, reason).catch(() => null);
  toast(res && res._ok !== false ? "Thanks, we received your report." : "Couldn't send the report. Try again later.");
});
document.getElementById("piDisappear").addEventListener("change", async (e) => {
  if (!currentPeer) return;
  const seconds = Number(e.target.value);
  const res = await Kyro.api.setChatSettings(currentPeer.id, seconds).catch(() => null);
  if (!res || res._ok === false) { toast("Couldn't change this setting."); return; }
  sysNote("You turned disappearing messages " + (seconds ? "on: " + DISAPPEAR_LABEL[seconds] : "off"));
  notifyPeer(currentPeer.id, "setting");
});
// refresh the contact-info sheet state each time it opens
document.querySelector(".thread-head .grow").addEventListener("click", () => {
  if (!currentPeer || String(currentPeer.id).startsWith("group:")) return;
  document.getElementById("piBlock").textContent = blockedSet().has(String(currentPeer.id)) ? "Unblock" : "Block";
  const sel = document.getElementById("piDisappear");
  sel.value = "0";
  Kyro.api.chatSettings(currentPeer.id).then((r) => { if (r && r._ok !== false) sel.value = String(r.disappearAfter || 0); }).catch(() => {});
});
Kyro.api.blocked().then((r) => { if (r && Array.isArray(r.ids)) { save("kyro.blocked", r.ids); applyBlockState(); } }).catch(() => {});

// remove expired (disappearing) messages from the screen
setInterval(() => {
  const now = Date.now();
  Array.from(document.getElementById("messages").children).forEach((b) => { if (b._exp && b._exp <= now) b.remove(); });
}, 15000);

// ---------- Edit message ----------
document.getElementById("actEdit").addEventListener("click", () => {
  closeModal("msgActions");
  if (!actionMsg) return;
  const { bubble } = actionMsg;
  editing = { bubble };
  setReply({ id: "", snip: bubble._plain || "" });
  document.getElementById("replyLabel").textContent = "Editing message";
  const input = document.getElementById("messageInput");
  input.value = bubble._plain || "";
  input.focus();
});
async function submitEdit(ed, text) {
  const bubble = ed.bubble;
  const id = bubble.dataset.id;
  if (!id || !currentPeer) return;
  const wire = (bubble._replyPrefix || "") + text;
  let out = wire;
  try {
    if (window.KyroE2E && currentPeer.publicKey) out = await KyroE2E.encryptText(wire, currentPeer.publicKey);
  } catch (_) {}
  const res = await Kyro.api.editMessage(id, out).catch(() => null);
  if (!res || res._ok === false) {
    sysNote((res && res.message) || "Couldn't edit that message.");
    return;
  }
  bubble._edited = true;
  bubble._setRaw(wire);
  const tm = bubble.querySelector(".mtime");
  if (tm) tm.textContent = timeText(bubble);
  notifyPeer(currentPeer.id, "edited", id);
}
async function handleNotify(d) {
  if (!d || !currentPeer || String(currentPeer.id) !== String(d.from)) return;
  if (d.type === "edited" && d.id) {
    const r = await Kyro.api.messageItem(d.id).catch(() => null);
    const msg = r && r.message;
    if (!msg) return;
    const bubble = Array.from(document.getElementById("messages").children).find((x) => x.dataset && x.dataset.id === String(d.id));
    if (!bubble || !bubble._setRaw) return;
    bubble._edited = true;
    bubble._setRaw(msg.text || "");
    const tm = bubble.querySelector(".mtime");
    if (tm) tm.textContent = timeText(bubble);
  } else if (d.type === "setting") {
    const r = await Kyro.api.chatSettings(d.from).catch(() => null);
    if (r && r._ok !== false) {
      const sec = r.disappearAfter || 0;
      sysNote("Disappearing messages are now " + (sec ? "on: " + DISAPPEAR_LABEL[sec] : "off"));
    }
  }
}



// ---------- @mentions + link names ----------
function groupMemberPeople() {
  if (!currentPeer || !String(currentPeer.id).startsWith("group:")) return [];
  const ids = (currentPeer.members || (load(LS.groups, []).find((g) => "group:" + g.id === currentPeer.id) || {}).members || []).map(String);
  const people = chats.map(peerFrom).concat(load(LS.contacts, []));
  const out = [];
  const seen = new Set();
  ids.forEach((id) => {
    if (id === meId || seen.has(id)) return;
    const p = people.find((x) => String(x.id) === id && x.name);
    if (p) { seen.add(id); out.push({ id, name: String(p.name) }); }
  });
  return out;
}
if (window.Rich) {
  Rich.setNames(() => groupMemberPeople().map((p) => p.name).concat([meName]));
  Rich.setMeNames(() => [meName, me.firstName, me.username && String(me.username).replace(/^@/, ""), [me.firstName, me.lastName].filter(Boolean).join(" ")]);
}

(function mentionPicker() {
  const input = document.getElementById("messageInput");
  const pop = document.getElementById("mentionPop");
  if (!input || !pop) return;
  let range = null;
  const hide = () => { pop.hidden = true; pop.textContent = ""; range = null; };
  function update() {
    const people = groupMemberPeople();
    if (!people.length) { hide(); return; }
    const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
    const before = input.value.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]*)$/);
    if (!m) { hide(); return; }
    const q = m[2].toLowerCase();
    const hits = people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
    if (!hits.length) { hide(); return; }
    range = { from: caret - m[2].length - 1, to: caret };
    pop.textContent = "";
    hits.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mention-item";
      b.textContent = p.name;
      const pick = (e) => {
        e.preventDefault();
        const v = input.value;
        const ins = "@" + p.name + " ";
        input.value = v.slice(0, range.from) + ins + v.slice(range.to);
        const pos = range.from + ins.length;
        hide();
        input.focus();
        try { input.setSelectionRange(pos, pos); } catch (_) {}
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      b.addEventListener("mousedown", pick);
      b.addEventListener("touchstart", pick, { passive: false });
      pop.appendChild(b);
    });
    const r = document.getElementById("composer").getBoundingClientRect();
    pop.style.bottom = Math.max(8, window.innerHeight - r.top + 6) + "px";
    pop.hidden = false;
  }
  input.addEventListener("input", update);
  input.addEventListener("click", update);
  input.addEventListener("keyup", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") update(); });
  input.addEventListener("blur", () => setTimeout(hide, 120));
  document.getElementById("composer").addEventListener("submit", hide);
})();

// ---------- Theme (system / dark / light) ----------
function applyTheme(choice) {
  const light = choice === "light" || (choice === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  const meta = document.getElementById("themeColor");
  if (meta) meta.setAttribute("content", light ? "#f5f3ff" : "#070712");
  document.querySelectorAll("#themeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.t === choice));
}
(function initTheme() {
  let choice = "dark";
  try { choice = localStorage.getItem("kyro.theme") || "dark"; } catch (_) {}
  applyTheme(choice);
  document.querySelectorAll("#themeSeg button").forEach((b) => {
    b.addEventListener("click", () => {
      try { localStorage.setItem("kyro.theme", b.dataset.t); } catch (_) {}
      applyTheme(b.dataset.t);
    });
  });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => { if ((localStorage.getItem("kyro.theme") || "dark") === "system") applyTheme("system"); };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
})();

// ---------- Blocked contacts list ----------
async function openBlockedList() {
  const box = document.getElementById("blockedList");
  box.innerHTML = '<p class="hint">Loading...</p>';
  openModal("blockedModal");
  const res = await Kyro.api.blocked().catch(() => null);
  box.innerHTML = "";
  if (!res || res._ok === false) {
    box.innerHTML = '<p class="hint">Couldn\'t load your blocked contacts. Try again.</p>';
    return;
  }
  save("kyro.blocked", res.ids || []);
  const users = res.users || [];
  if (!users.length) {
    box.innerHTML = '<p class="hint">You haven\'t blocked anyone.</p>';
    return;
  }
  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "blk-item";
    const info = document.createElement("div");
    const nm = document.createElement("b");
    nm.textContent = u.fullName || ((u.firstName || "") + " " + (u.lastName || "")).trim() || "Kyro user";
    const un = document.createElement("span");
    un.textContent = u.username ? "@" + u.username : "";
    info.append(nm, un);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Unblock";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const r = await Kyro.api.unblockUser(u._id || u.id).catch(() => null);
      if (!r || r._ok === false) { btn.disabled = false; toast("Couldn't unblock. Try again."); return; }
      const set = blockedSet();
      set.delete(String(u._id || u.id));
      save("kyro.blocked", Array.from(set));
      row.remove();
      applyBlockState();
      if (!box.children.length) box.innerHTML = '<p class="hint">You haven\'t blocked anyone.</p>';
    });
    row.append(info, btn);
    box.appendChild(row);
  });
}
document.getElementById("blockedBtn").addEventListener("click", openBlockedList);
document.getElementById("blockedClose").addEventListener("click", () => closeModal("blockedModal"));


// ---------- Settings screen ----------
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("setPopups").checked = localStorage.getItem("kyro.popups") !== "off";
  openModal("settingsModal");
});
document.getElementById("settingsClose").addEventListener("click", () => closeModal("settingsModal"));
document.getElementById("setPopups").addEventListener("change", (e) => {
  localStorage.setItem("kyro.popups", e.target.checked ? "on" : "off");
});


// ---------- Chat wallpaper ----------
const WALLS = [
  { id: "default", name: "Original", css: "" },
  { id: "midnight", name: "Midnight", css: "linear-gradient(180deg,#0b0b24,#1a1040)" },
  { id: "aurora", name: "Aurora", css: "linear-gradient(160deg,#0a1f2e,#1d4d5c 50%,#3a1f5c)" },
  { id: "ocean", name: "Ocean", css: "linear-gradient(180deg,#06202e,#0b4a6b)" },
  { id: "sunset", name: "Sunset", css: "linear-gradient(170deg,#2a1033,#6b2a55 55%,#b24a4a)" },
  { id: "forest", name: "Forest", css: "linear-gradient(180deg,#0a1f17,#17402f)" },
  { id: "rose", name: "Rose", css: "linear-gradient(170deg,#2a0f24,#5a1f48)" },
  { id: "graphite", name: "Graphite", css: "linear-gradient(180deg,#121316,#23252b)" },
  { id: "dots", name: "Dots", css: "radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px) 0 0/22px 22px, #0b0b1c" }
];
let wallTarget = "all";
const wallStore = () => { const w = load("kyro.wall", {}); return { all: w.all || "default", per: w.per || {} }; };
function wallCss(id, key) {
  if (id === "photo") {
    const img = localStorage.getItem("kyro.wallimg." + key);
    return img ? 'linear-gradient(rgba(7,7,18,0.4),rgba(7,7,18,0.4)), url("' + img + '") center/cover no-repeat' : "";
  }
  const w = WALLS.find((x) => x.id === id);
  return w ? w.css : "";
}
function wallFor(pid) {
  const st = wallStore();
  if (pid && st.per[pid]) return { id: st.per[pid], key: pid };
  return { id: st.all, key: "all" };
}
function applyWallpaper() {
  const el = document.getElementById("threadScreen");
  if (!el || !currentPeer) return;
  const w = wallFor(String(currentPeer.id));
  el.style.background = wallCss(w.id, w.key);
}
function renderWallPicker() {
  const st = wallStore();
  const isAll = wallTarget === "all";
  const cur = isAll ? st.all : (st.per[wallTarget] || "inherit");
  const grid = document.getElementById("wallGrid");
  grid.innerHTML = "";
  const tiles = (isAll ? [] : [{ id: "inherit", name: "Same as all", css: "" }]).concat(WALLS);
  tiles.forEach((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wall-tile" + (cur === w.id ? " on" : "");
    b.style.background = w.css || "";
    b.innerHTML = "<span></span>";
    b.firstChild.textContent = w.name;
    b.addEventListener("click", () => {
      const s2 = wallStore();
      if (isAll) s2.all = w.id;
      else if (w.id === "inherit") delete s2.per[wallTarget];
      else s2.per[wallTarget] = w.id;
      save("kyro.wall", s2);
      renderWallPicker();
      applyWallpaper();
    });
    grid.appendChild(b);
  });
  if (cur === "photo") {
    const t = document.createElement("div");
    t.className = "wall-tile on";
    t.style.background = wallCss("photo", wallTarget);
    t.innerHTML = "<span>Your photo</span>";
    grid.appendChild(t);
  }
  const shown = isAll ? wallFor("").id : (st.per[wallTarget] || st.all);
  const key = isAll || !st.per[wallTarget] ? "all" : wallTarget;
  const pv = document.getElementById("wallPreview");
  pv.style.background = wallCss(shown, key) || "";
}
function openWallPicker(target, label) {
  wallTarget = target;
  document.getElementById("wallTitle").textContent = label;
  renderWallPicker();
  openModal("wallpaperModal");
}
document.getElementById("wallBtn").addEventListener("click", () => openWallPicker("all", "Wallpaper for all chats"));
document.getElementById("piWall").addEventListener("click", () => {
  if (!currentPeer) return;
  openWallPicker(String(currentPeer.id), "Wallpaper for " + (currentPeer.name || "this chat"));
});
document.getElementById("wallClose").addEventListener("click", () => closeModal("wallpaperModal"));
document.getElementById("wallReset").addEventListener("click", () => {
  const st = wallStore();
  if (wallTarget === "all") st.all = "default"; else delete st.per[wallTarget];
  localStorage.removeItem("kyro.wallimg." + wallTarget);
  save("kyro.wall", st);
  renderWallPicker();
  applyWallpaper();
});
document.getElementById("wallPhoto").addEventListener("click", () => document.getElementById("wallFile").click());
document.getElementById("wallFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.72);
    localStorage.setItem("kyro.wallimg." + wallTarget, data);
    const st = wallStore();
    if (wallTarget === "all") st.all = "photo"; else st.per[wallTarget] = "photo";
    save("kyro.wall", st);
    renderWallPicker();
    applyWallpaper();
  } catch (_) {
    toast("Couldn't use that photo. Try a smaller one.");
  }
});


// ---------- Media, files and links gallery ----------
let galTab = "media";
let galData = { images: [], others: [] };
function galRender() {
  const body = document.getElementById("galBody");
  body.innerHTML = "";
  document.querySelectorAll("#galTabs button").forEach((b) => b.classList.toggle("on", b.dataset.g === galTab));
  if (galTab === "media") {
    const items = galData.images.map((m) => ({ m, t: "image" })).concat(galData.others.filter((m) => m.kind === "video").map((m) => ({ m, t: "video" })));
    items.sort((a, b) => new Date(b.m.createdAt) - new Date(a.m.createdAt));
    if (!items.length) { body.innerHTML = '<p class="hint">No photos or videos yet.</p>'; return; }
    const grid = document.createElement("div");
    grid.className = "gal-grid";
    items.forEach(({ m, t }) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "gal-cell";
      if (t === "image") {
        const img = document.createElement("img");
        img.src = m.media;
        img.alt = "photo";
        cell.appendChild(img);
        cell.addEventListener("click", () => { const big = document.createElement("img"); big.src = m.media; big.className = "lightbox-img"; openLightbox(big); });
      } else {
        cell.innerHTML = "<span class='gal-play'>\u25b6</span>";
        cell.addEventListener("click", async () => {
          const r = await Kyro.api.messageMedia(m._id).catch(() => null);
          if (!r || !r.media) { toast("Couldn't load that video."); return; }
          const v = document.createElement("video");
          v.src = r.media; v.controls = true; v.autoplay = true; v.playsInline = true; v.className = "lightbox-img";
          openLightbox(v);
        });
      }
      grid.appendChild(cell);
    });
    body.appendChild(grid);
  } else if (galTab === "files") {
    const files = galData.others.filter((m) => m.kind === "file");
    if (!files.length) { body.innerHTML = '<p class="hint">No files yet.</p>'; return; }
    files.forEach((m) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-tile gal-file";
      const ico = document.createElement("span");
      ico.className = "file-ico";
      ico.textContent = fileIcon(m.fileName);
      const info = document.createElement("span");
      info.className = "file-info";
      const nm = document.createElement("b");
      nm.textContent = m.fileName || "File";
      const sz = document.createElement("small");
      sz.textContent = fmtSize(m.fileSize) + " \u00b7 " + dayLabel(new Date(m.createdAt).getTime());
      info.append(nm, sz);
      row.append(ico, info);
      row.addEventListener("click", async () => {
        const r = await Kyro.api.messageMedia(m._id).catch(() => null);
        if (!r || !r.media) { toast("Couldn't load that file. It may have expired."); return; }
        saveDataUrl(r.media, m.fileName || "file");
      });
      body.appendChild(row);
    });
  } else {
    const rx = /https?:\/\/[^\s<>"']+/gi;
    const links = [];
    Array.from(document.getElementById("messages").children).forEach((b) => {
      const found = (b._plain || "").match(rx);
      if (found) found.forEach((u) => links.push({ u, ts: b._ts }));
    });
    if (!links.length) { body.innerHTML = '<p class="hint">No links in the messages loaded in this chat.</p>'; return; }
    links.reverse().forEach(({ u, ts }) => {
      const a = document.createElement("a");
      a.className = "gal-link";
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const t1 = document.createElement("b");
      t1.textContent = u.replace(/^https?:\/\//, "").slice(0, 60);
      const t2 = document.createElement("small");
      t2.textContent = dayLabel(ts);
      a.append(t1, t2);
      body.appendChild(a);
    });
  }
}
document.getElementById("piMedia").addEventListener("click", async () => {
  if (!currentPeer) return;
  galTab = "media";
  galData = { images: [], others: [] };
  document.getElementById("galBody").innerHTML = '<p class="hint">Loading...</p>';
  openModal("galleryModal");
  if (String(currentPeer.id).startsWith("group:")) { galRender(); return; }
  const r = await Kyro.api.gallery(currentPeer.id).catch(() => null);
  if (r && r._ok !== false) galData = { images: r.images || [], others: r.others || [] };
  galRender();
});
document.querySelectorAll("#galTabs button").forEach((b) => b.addEventListener("click", () => { galTab = b.dataset.g; galRender(); }));
document.getElementById("galClose").addEventListener("click", () => closeModal("galleryModal"));
