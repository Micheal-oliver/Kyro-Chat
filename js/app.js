if (!Kyro.requireAuthPage()) throw new Error("redirect");

const user = Kyro.getUser() || {};
const meName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "You";
const meEmail = user.email || "";
const meId = user._id || user.id || user.userId || "";

document.getElementById("meName").textContent = meName;
document.getElementById("meEmail").textContent = meEmail || "Signed in";
const meAvatar = document.getElementById("meAvatar");
if (user.avatar || user.profilePicture) {
  meAvatar.style.backgroundImage = "url(" + (user.avatar || user.profilePicture) + ")";
  meAvatar.textContent = "";
} else {
  meAvatar.textContent = Kyro.initials(meName);
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  Kyro.clearSession();
  location.replace("login.html");
});

const chatList = document.getElementById("chatList");
const searchHint = document.getElementById("searchHint");
const emptyThread = document.getElementById("emptyThread");
const threadOn = document.getElementById("threadOn");
const messagesEl = document.getElementById("messages");
let currentPeer = null;
let chats = [];

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.chats)) return data.chats;
  if (Array.isArray(data.users)) return data.users;
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.data)) return data.data;
  if (data.user) return [data.user];
  return [];
}

function peerFromChat(item) {
  const other = item.user || item.otherUser || item.participant || item;
  return {
    id: other._id || other.id || item.otherUserId || item.userId || item.id || "",
    name: other.fullName || other.name || [other.firstName, other.lastName].filter(Boolean).join(" ") || other.email || "Chat",
    email: other.email || "",
    phone: other.phone || other.phoneNumber || "",
    avatar: other.avatar || other.profilePicture || "",
    preview: item.lastMessage && (item.lastMessage.text || item.lastMessage.content || item.lastMessage.message) || item.lastMessage || item.preview || "Tap to open"
  };
}

function renderChats(items) {
  chatList.innerHTML = "";
  if (!items.length) {
    chatList.innerHTML = '<p class="side-hint">No chats yet. Search by email or phone to start one.</p>';
    return;
  }
  items.forEach((item) => {
    const peer = peerFromChat(item);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "chat-row" + (currentPeer && currentPeer.id === peer.id ? " is-on" : "");
    row.innerHTML =
      '<div class="row-avatar">' + Kyro.initials(peer.name) + "</div>" +
      "<div><b></b><span></span></div>";
    row.querySelector("b").textContent = peer.name;
    row.querySelector("span").textContent = String(peer.preview).slice(0, 60);
    if (peer.avatar) {
      const av = row.querySelector(".row-avatar");
      av.style.backgroundImage = "url(" + peer.avatar + ")";
      av.textContent = "";
    }
    row.addEventListener("click", () => openThread(peer));
    chatList.appendChild(row);
  });
}

async function loadChats() {
  const data = await Kyro.api.chats();
  if (!data._ok) {
    searchHint.textContent = data.message || "Could not load chats.";
    renderChats([]);
    return;
  }
  chats = asArray(data);
  renderChats(chats);
}

async function openThread(peer) {
  currentPeer = peer;
  emptyThread.hidden = true;
  threadOn.hidden = false;
  document.querySelector(".app-shell").classList.add("show-thread");
  document.getElementById("peerName").textContent = peer.name;
  document.getElementById("peerMeta").textContent = peer.email || peer.phone || "Direct chat";
  const av = document.getElementById("peerAvatar");
  if (peer.avatar) {
    av.style.backgroundImage = "url(" + peer.avatar + ")";
    av.textContent = "";
  } else {
    av.style.backgroundImage = "";
    av.textContent = Kyro.initials(peer.name);
  }
  renderChats(chats);
  await loadMessages();
}

async function loadMessages() {
  if (!currentPeer || !currentPeer.id) {
    messagesEl.innerHTML = '<p class="side-hint">This contact is missing an id from the server.</p>';
    return;
  }
  const data = await Kyro.api.messages(currentPeer.id);
  const list = asArray(data);
  messagesEl.innerHTML = "";
  if (!data._ok) {
    messagesEl.innerHTML = '<p class="side-hint">' + (data.message || "Could not load messages.") + "</p>";
    return;
  }
  if (!list.length) {
    messagesEl.innerHTML = '<p class="side-hint">No messages yet. Say hello.</p>';
    return;
  }
  list.forEach((m) => {
    const text = m.text || m.content || m.message || "";
    const from = m.senderId || m.from || m.userId || (m.sender && (m.sender._id || m.sender.id));
    const mine = String(from) === String(meId) || m.mine === true || m.isMe === true;
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (mine ? "me" : "them");
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

document.getElementById("backChat").addEventListener("click", () => {
  document.querySelector(".app-shell").classList.remove("show-thread");
});

document.getElementById("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentPeer) return;
  input.value = "";
  const bubble = document.createElement("div");
  bubble.className = "bubble me";
  bubble.textContent = text;
  if (messagesEl.querySelector(".side-hint")) messagesEl.innerHTML = "";
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (window.kyroSocket && window.kyroSocket.connected) {
    window.kyroSocket.emit("send-message", { receiverId: currentPeer.id, text }, (res) => {
      if (res && res.ok === false) {
        bubble.style.opacity = "0.55";
        searchHint.textContent = res.message || "Message may not have sent.";
      }
    });
  } else {
    const data = await Kyro.api.sendMessage(currentPeer.id, text);
    if (!data._ok) {
      bubble.style.opacity = "0.55";
      searchHint.textContent = data.message || "Message may not have sent.";
    }
  }
});

async function searchUser() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) {
    searchHint.textContent = "";
    loadChats();
    return;
  }
  searchHint.textContent = "Searching…";
  const data = await Kyro.api.lookup(q);
  const found = asArray(data);
  if (!data._ok) {
    searchHint.textContent = data.message || "Lookup failed.";
    return;
  }
  if (!found.length) {
    searchHint.textContent = "No user found.";
    return;
  }
  searchHint.textContent = "Tap a result to chat.";
  renderChats(found.map((u) => ({ user: u, preview: u.email || u.phone || "New chat" })));
}

document.getElementById("searchBtn").addEventListener("click", searchUser);
document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchUser();
  }
});

(async () => {
  try {
    const me = await Kyro.api.me();
    if (me && me._ok) {
      const profile = Kyro.extractUser(me);
      if (profile && (profile.email || profile.firstName || profile._id)) {
        Kyro.setSession(Kyro.getToken(), profile);
        const name = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || meName;
        document.getElementById("meName").textContent = name;
        if (profile.email) document.getElementById("meEmail").textContent = profile.email;
      }
    } else if (me && me._status === 401 && Kyro.getToken() === "session") {
      // Local-only session after signup when backend did not return a JWT yet.
    } else if (me && me._status === 401) {
      Kyro.clearSession();
      location.replace("login.html");
      return;
    }
  } catch (_) {}
  await loadChats();
  connectSocket();
})();

function connectSocket() {
  if (typeof io !== "function") return;
  const token = Kyro.getToken();
  if (!token || token === "session") return;
  const socket = io(Kyro.API_BASE, {
    auth: { token },
    transports: ["websocket", "polling"]
  });
  window.kyroSocket = socket;
  socket.on("new-message", (msg) => {
    const from = String(msg.senderId || "");
    const to = String(msg.receiverId || "");
    const mine = from === String(meId);
    const peerId = currentPeer && String(currentPeer.id);
    const inThisThread = peerId && (from === peerId || to === peerId);
    if (inThisThread) {
      if (messagesEl.querySelector(".side-hint")) messagesEl.innerHTML = "";
      if (mine) return;
      const bubble = document.createElement("div");
      bubble.className = "bubble them";
      bubble.textContent = msg.text || msg.content || "";
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    loadChats();
  });
}
