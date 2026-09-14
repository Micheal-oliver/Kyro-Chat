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
const seenMessages = new Set();

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
  document.getElementById("meRoleLine").textContent = isAdmin ? "You have admin tools below." : "Standard account";
  setAvatar(document.getElementById("meAvatar"), me.avatar || me.profilePicture, meName);
  document.getElementById("adminBox").hidden = !isAdmin;
}

function showTab(name) {
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.toggle("is-on", p.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.go === name));
  const titles = { chats: "Kyro", story: "Story", communities: "Communities", calls: "Calls", account: "Account" };
  document.getElementById("topTitle").textContent = titles[name] || "Kyro";
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

function peerFrom(item) {
  const other = item.user || item.otherUser || item.participant || item;
  return {
    id: String(other._id || other.id || item.otherUserId || item.id || ""),
    name: other.fullName || other.name || [other.firstName, other.lastName].filter(Boolean).join(" ") || other.email || "Chat",
    email: other.email || "",
    phone: other.phone || other.phoneNumber || "",
    avatar: other.avatar || other.profilePicture || "",
    preview: (item.lastMessage && (item.lastMessage.text || item.lastMessage.content)) || item.preview || "Tap to chat",
    unread: unreadCount(other._id || other.id || item.otherUserId || item.id)
  };
}

function contactRow(peer, extra) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    '<div class="row-avatar"></div><div class="grow"><b></b><span></span></div><div class="row-actions"></div>';
  setAvatar(row.querySelector(".row-avatar"), peer.avatar, peer.name);
  row.querySelector("b").textContent = peer.name;
  row.querySelector("span").textContent = extra || peer.preview || peer.email || peer.phone || "";
  const count = unreadCount(peer.id);
  if (count > 0) {
    row.classList.add("has-unread");
    const badge = document.createElement("em");
    badge.className = "unread-badge";
    badge.textContent = count > 99 ? "99+" : String(count);
    row.querySelector(".grow").appendChild(badge);
  }
  const actions = row.querySelector(".row-actions");
  const msg = document.createElement("button");
  msg.className = "mini";
  msg.type = "button";
  msg.textContent = "✉";
  msg.addEventListener("click", (e) => { e.stopPropagation(); openThread(peer); });
  const call = document.createElement("button");
  call.className = "mini";
  call.type = "button";
  call.textContent = "☎";
  call.addEventListener("click", (e) => { e.stopPropagation(); startCall(peer); });
  actions.append(msg, call);
  row.addEventListener("click", () => openThread(peer));
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
  groups.forEach((g) => {
    const row = document.createElement("button");
    row.className = "row";
    row.type = "button";
    row.innerHTML = '<div class="row-avatar">G</div><div><b></b><span>Group</span></div>';
    row.querySelector("b").textContent = g.name;
    row.addEventListener("click", () => openThread({ id: "group:" + g.id, name: g.name, preview: "Group chat" }));
    box.appendChild(row);
  });
  const seen = new Set(items.map((item) => String(peerFrom(item).id)));
  items.forEach((item) => box.appendChild(contactRow(peerFrom(item))));
  load(LS.contacts, []).forEach((c) => {
    if (c.id && !seen.has(String(c.id))) box.appendChild(contactRow(c));
  });
}

async function loadChats() {
  const data = await Kyro.api.chats();
  chats = data._ok ? asArray(data) : [];
  renderChats(chats);
}

function openThread(peer) {
  currentPeer = peer;
  clearUnread(peer.id);
  document.getElementById("threadScreen").hidden = false;
  document.getElementById("peerName").textContent = peer.name;
  document.getElementById("peerMeta").textContent = peer.email || peer.phone || "Kyro chat";
  setAvatar(document.getElementById("peerAvatar"), peer.avatar, peer.name);
  loadMessages();
}

document.getElementById("backChat").addEventListener("click", () => {
  document.getElementById("threadScreen").hidden = true;
  currentPeer = null;
  loadChats();
});

async function loadMessages() {
  const el = document.getElementById("messages");
  el.innerHTML = "";
  if (!currentPeer || String(currentPeer.id).startsWith("group:")) {
    el.innerHTML = '<p class="hint">Group messages stay on this device for now.</p>';
    return;
  }
  const data = await Kyro.api.messages(currentPeer.id);
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
    const text = m.text || m.content || m.message || "";
    const from = String(m.senderId || m.from || "");
    const mine = from === meId || m.mine === true;
    const mid = String(m._id || "");
    if (mid) seenMessages.add(mid);
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (mine ? "me" : "them");
    bubble.textContent = text;
    el.appendChild(bubble);
  });
  el.scrollTop = el.scrollHeight;
}

document.getElementById("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentPeer) return;
  input.value = "";
  const box = document.getElementById("messages");
  if (box.querySelector(".hint")) box.innerHTML = "";
  const bubble = document.createElement("div");
  bubble.className = "bubble me";
  bubble.textContent = text;
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
  if (String(currentPeer.id).startsWith("group:")) return;
  if (window.kyroSocket && window.kyroSocket.connected) {
    window.kyroSocket.emit("send-message", { receiverId: currentPeer.id, text });
  } else {
    const data = await Kyro.api.sendMessage(currentPeer.id, text);
    if (!data._ok) bubble.style.opacity = "0.55";
  }
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

document.getElementById("plusBtn").addEventListener("click", () => openModal("plusModal"));
document.getElementById("emptyPlus").addEventListener("click", () => openModal("plusModal"));
document.getElementById("closePlus").addEventListener("click", () => closeModal("plusModal"));
document.getElementById("chooseContact").addEventListener("click", () => {
  closeModal("plusModal");
  openModal("contactModal");
});
document.getElementById("chooseGroup").addEventListener("click", () => {
  closeModal("plusModal");
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
  const data = await Kyro.api.lookup(q);
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
  const groups = load(LS.groups, []);
  groups.unshift({ id: Date.now(), name });
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

function startCall(peer) {
  const calls = load(LS.calls, []);
  calls.unshift({ name: peer.name, at: new Date().toISOString() });
  save(LS.calls, calls);
  document.getElementById("callName").textContent = "Calling " + peer.name;
  setAvatar(document.getElementById("callAvatar"), peer.avatar, peer.name);
  openModal("callModal");
  renderCalls();
}
document.getElementById("threadCall").addEventListener("click", () => {
  if (currentPeer) startCall(currentPeer);
});
document.getElementById("endCall").addEventListener("click", () => closeModal("callModal"));

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

document.getElementById("addStoryBtn").addEventListener("click", () => {
  const text = prompt("Write a short story");
  if (!text) return;
  const stories = load(LS.stories, []);
  stories.unshift({ name: meName, text, at: Date.now() });
  save(LS.stories, stories);
  renderStories();
});

function renderStories() {
  const box = document.getElementById("storyList");
  box.innerHTML = "";
  load(LS.stories, []).forEach((s) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<div class='row-avatar'></div><div><b></b><span></span></div>";
    setAvatar(row.querySelector(".row-avatar"), "", s.name);
    row.querySelector("b").textContent = s.name;
    row.querySelector("span").textContent = s.text;
    box.appendChild(row);
  });
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
    item.lastMessage = { text };
    item.preview = text;
    chats.unshift(item);
    return;
  }
  const contact = load(LS.contacts, []).find((c) => String(c.id) === String(peerId));
  chats.unshift(contact ? { user: contact, lastMessage: { text } } : {
    id: peerId,
    name: "Kyro user",
    lastMessage: { text }
  });
}

function applyIncoming(msg) {
  const mid = String(msg._id || "");
  if (mid && seenMessages.has(mid)) return;
  if (mid) seenMessages.add(mid);

  const from = String(msg.senderId || msg.from || "");
  const to = String(msg.receiverId || msg.to || "");
  const mine = from === meId;
  const peerId = mine ? to : from;
  const text = msg.text || msg.content || msg.message || "";
  if (!peerId || !text) return;

  const open = currentPeer && String(currentPeer.id) === String(peerId);
  if (open) {
    const box = document.getElementById("messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    if (!mine) {
      const bubble = document.createElement("div");
      bubble.className = "bubble them";
      bubble.textContent = text;
      box.appendChild(bubble);
      box.scrollTop = box.scrollHeight;
    }
    clearUnread(peerId);
  } else if (!mine) {
    addUnread(peerId);
  }

  upsertChatPreview(peerId, text);
  renderChats(chats);
}

function connectSocket() {
  if (typeof io !== "function") return;
  const token = Kyro.getToken();
  if (!token || token === "session") return;
  const socket = io(Kyro.API_BASE, { auth: { token }, transports: ["websocket", "polling"] });
  window.kyroSocket = socket;
  socket.on("new-message", applyIncoming);
  socket.on("chat-updated", applyIncoming);
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
