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
    if (line) line.textContent = presenceText(id);
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
    lastSeen: other.lastSeen || item.lastSeen || "",
    unread: unreadCount(other._id || other.id || item.otherUserId || item.id)
  };
}

function contactRow(peer, extra) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.peer = String(peer.id);
  if (onlineIds.has(String(peer.id))) row.classList.add("is-online");
  if (peer.lastSeen) rememberSeen(peer.id, peer.lastSeen);
  row.innerHTML =
    '<div class="row-avatar"><i class="online-dot"></i></div><div class="grow"><b></b><span></span><small class="presence"></small></div><div class="row-actions"></div>';
  setAvatar(row.querySelector(".row-avatar"), peer.avatar, peer.name);
  row.querySelector("b").textContent = peer.name;
  row.querySelector("span").textContent = extra || peer.preview || peer.email || peer.phone || "";
  row.querySelector(".presence").textContent = presenceText(peer.id, peer.lastSeen);
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
  document.getElementById("peerMeta").textContent = presenceText(peer.id, peer.lastSeen);
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

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};
let callPeer = null;
let callRole = "";
let peerConnection = null;
let localStream = null;
let incomingOffer = null;
let pendingIce = [];

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

function attachRemoteAudio(stream) {
  const audio = document.getElementById("remoteAudio");
  audio.srcObject = stream;
  audio.play().catch(() => {});
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
  peerConnection = new RTCPeerConnection(ICE_SERVERS);
  if (localStream) {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  }
  peerConnection.ontrack = (event) => {
    attachRemoteAudio(event.streams[0] || new MediaStream(event.track ? [event.track] : []));
    document.getElementById("callStatus").textContent = "Connected";
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && window.kyroSocket) {
      window.kyroSocket.emit("webrtc-ice", { to: peerId, candidate: event.candidate });
    }
  };
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection && peerConnection.connectionState;
    if (!state) return;
    document.getElementById("callStatus").textContent =
      state === "connected" ? "Connected" :
      state === "failed" || state === "disconnected" ? "Call failed. Try again." :
      "Connecting…";
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

async function hangUp(notify) {
  stopRingtone();
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

async function startCall(peer) {
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
    await getMic();
    playRingtone();
    window.kyroSocket.emit("call-user", { to: peer.id, name: meName });
  } catch (err) {
    document.getElementById("callStatus").textContent = err.message || "Microphone permission is needed.";
  }
}

document.getElementById("threadCall").addEventListener("click", () => {
  if (currentPeer) startCall(currentPeer);
});
document.getElementById("endCall").addEventListener("click", () => hangUp(true));
document.getElementById("closeCallSheet").addEventListener("click", () => hangUp(true));
document.getElementById("rejectCall").addEventListener("click", () => {
  if (callPeer && window.kyroSocket) window.kyroSocket.emit("call-reject", { to: callPeer.id });
  hangUp(false);
});
document.getElementById("acceptCall").addEventListener("click", async () => {
  if (!callPeer) return;
  try {
    stopRingtone();
    await getMic();
    window.kyroSocket.emit("call-accept", { to: callPeer.id });
    document.getElementById("acceptCall").hidden = true;
    document.getElementById("rejectCall").hidden = true;
    document.getElementById("endCall").hidden = false;
    document.getElementById("callStatus").textContent = "Connecting…";
    if (incomingOffer) await answerOffer(incomingOffer);
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
    document.getElementById("callStatus").textContent = "Accepted. Connecting…";
    if (!callPeer) return;
    if (!localStream) await getMic();
    await makePeerConnection(callPeer.id);
    const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
    await peerConnection.setLocalDescription(offer);
    socket.emit("webrtc-offer", { to: callPeer.id, sdp: offer });
  });
  socket.on("webrtc-answer", async (data) => {
    if (!peerConnection || !data.sdp) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await flushIce();
    stopRingtone();
    document.getElementById("callStatus").textContent = "Connected";
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
document.getElementById("addStoryBtn").addEventListener("click", () => {
  const msg = document.getElementById("storyMsg");
  if (msg) msg.textContent = "";
  openModal("storyModal");
});
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
  box.innerHTML = "";
  const list = load(LS.stories, []).filter((s) => !s.expires || s.expires > Date.now());
  for (const s of list) {
    const row = document.createElement("div");
    row.className = "row story-card";
    row.innerHTML = "<div class='row-avatar'></div><div class='grow'><b></b><span></span></div>";
    setAvatar(row.querySelector(".row-avatar"), s.image || "", s.name);
    row.querySelector("b").textContent = s.name;
    row.querySelector("span").textContent = (s.type || "text") + " · " + (s.text || "");
    if (s.mediaId || s.music) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.style.width = "100%";
      audio.src = s.music || await storyMediaUrl(s.mediaId);
      row.querySelector(".grow").appendChild(audio);
    }
    box.appendChild(row);
  }
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
