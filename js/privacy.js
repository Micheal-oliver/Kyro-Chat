/* Kyro privacy layer (Settings > Privacy). Additive: remove the hook lines in app.html to undo.
   - Read receipts, Last seen and online, Typing indicator, Profile photo
   - Saved to the account (PATCH /api/users/me { privacy }); the server enforces every rule.
   - Reciprocal rules (same as WhatsApp): hide your read receipts and you stop seeing others' blue ticks;
     hide your last seen / online and you stop seeing theirs.
   Needs the updated backend (realtime.js, utils/profilePrivacy.js, models/User.js). */
(function () {
  "use strict";
  if (window.KyroPrivacy) return;

  var DEFAULTS = { lastSeen: "everyone", photo: "everyone", readReceipts: true, typing: true };
  var LEVELS = [["everyone", "Everyone"], ["contacts", "My contacts"], ["nobody", "Nobody"]];
  var hiddenIds = new Set(); // people who hide their presence from me (set by the server's flags)

  function $(s, r) { return (r || document).querySelector(s); }
  function mine() { return Object.assign({}, DEFAULTS, (typeof me !== "undefined" && me && me.privacy) || {}); }
  function say(t) { try { if (typeof toast === "function") toast(t); } catch (_) {} }
  function refreshUi() { try { if (typeof refreshPresenceUi === "function") refreshPresenceUi(); } catch (_) {} }

  /* ---------- presence text: honour "hidden" and the reciprocal rule ---------- */
  var origPresence = window.presenceText;
  if (typeof origPresence === "function") {
    window.presenceText = function (id, fallbackSeen) {
      if (mine().lastSeen === "nobody") return "";
      var key = String(id);
      var online = typeof onlineIds !== "undefined" && onlineIds.has(key);
      if (hiddenIds.has(key) && !online) return "";
      return origPresence.apply(this, arguments);
    };
  }

  /* ---------- learn who hides their presence from every API answer ---------- */
  function scan(o, depth) {
    if (!o || typeof o !== "object" || depth > 4) return;
    if (Array.isArray(o)) { o.forEach(function (x) { scan(x, depth + 1); }); return; }
    var id = o._id || o.id;
    if (id && ("lastSeen" in o || "lastSeenHidden" in o)) {
      if (o.lastSeenHidden) hiddenIds.add(String(id)); else hiddenIds.delete(String(id));
    }
    ["user", "users", "chats", "contacts", "members"].forEach(function (k) { if (o[k]) scan(o[k], depth + 1); });
  }
  if (typeof window.fetch === "function") {
    var origFetch = window.fetch;
    window.fetch = function () {
      var p = origFetch.apply(this, arguments);
      try {
        var url = String(arguments[0] && arguments[0].url ? arguments[0].url : arguments[0] || "");
        if (window.Kyro && url.indexOf(Kyro.API_BASE) === 0 && /\/api\/(chats|users)/.test(url)) {
          p.then(function (res) {
            return res.clone().json().then(function (data) { scan(data, 0); refreshUi(); }).catch(function () {});
          }).catch(function () {});
        }
      } catch (_) {}
      return p;
    };
  }

  /* ---------- live events from the server ---------- */
  function wireSocket() {
    var s = window.kyroSocket;
    if (!s || s._kpWired) return !!s;
    s._kpWired = true;
    s.on("user-hidden", function (d) {
      if (!d || !d.userId) return;
      hiddenIds.add(String(d.userId));
      if (typeof onlineIds !== "undefined") onlineIds.delete(String(d.userId));
      refreshUi();
    });
    s.on("user-online", function (d) { if (d && d.userId) { hiddenIds.delete(String(d.userId)); refreshUi(); } });
    s.on("presence", function () { refreshUi(); });
    return true;
  }
  var tries = 0;
  var wait = setInterval(function () { if (wireSocket() || ++tries > 60) clearInterval(wait); }, 500);

  /* ---------- saving ---------- */
  var saveTimer = null, pending = {};
  function save(patch, undo) {
    Object.assign(pending, patch);
    // optimistic: update the local copy right away so the reciprocal rules apply instantly
    var next = Object.assign({}, (me && me.privacy) || {}, patch);
    me = Object.assign({}, me, { privacy: next });
    try { Kyro.setSession(Kyro.getToken(), me); } catch (_) {}
    refreshUi();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      var body = pending; pending = {};
      var res = null;
      try { res = await Kyro.api.updateProfile({ privacy: body }); } catch (_) {}
      if (!res || res._ok === false || !res.user) {
        say("Couldn't save that. Check your connection.");
        if (undo) undo();
        return;
      }
      me = Object.assign({}, me, res.user);
      try { Kyro.setSession(Kyro.getToken(), me); } catch (_) {}
      refreshUi();
    }, 350);
  }

  /* ---------- the sheet ---------- */
  var modal = null;
  function opts(sel) {
    return LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === sel ? " selected" : "") + ">" + l[1] + "</option>"; }).join("");
  }
  function build() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal is-off";
    modal.id = "privacyModal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="sheet tall kp-sheet">' +
        '<h3>Privacy</h3>' +
        '<h4 class="set-h">Who can see my personal info</h4>' +
        '<label class="set-row"><span>Last seen and online<small id="kpSeenHint"></small></span><select id="kpSeen" class="lock-select">' + opts("everyone") + '</select></label>' +
        '<label class="set-row"><span>Profile photo<small>Others see your initials instead when hidden</small></span><select id="kpPhoto" class="lock-select">' + opts("everyone") + '</select></label>' +
        '<button class="set-link" id="kpAbout" type="button">About me<em>&rsaquo;</em></button>' +
        '<h4 class="set-h">Messages</h4>' +
        '<label class="set-row"><span>Read receipts<small id="kpRecHint"></small></span><span class="switch"><input type="checkbox" id="kpRec" /><i></i></span></label>' +
        '<label class="set-row"><span>Typing indicator<small>Show people when you are typing or recording</small></span><span class="switch"><input type="checkbox" id="kpTyp" /><i></i></span></label>' +
        '<h4 class="set-h">Safety</h4>' +
        '<button class="set-link" id="kpBlocked" type="button">Blocked contacts<em>&rsaquo;</em></button>' +
        '<p class="hint kp-note">Same rules as WhatsApp: if you hide your read receipts or last seen, you can\'t see other people\'s either. Group chats are not affected.</p>' +
        '<button class="sheet-btn ghost" id="kpClose" type="button">Done</button>' +
      '</div>';
    document.body.appendChild(modal);

    $("#kpClose", modal).addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    $("#kpSeen", modal).addEventListener("change", function () {
      var prev = mine().lastSeen, v = this.value, self = this;
      save({ lastSeen: v }, function () { self.value = prev; paint(); });
      paint();
    });
    $("#kpPhoto", modal).addEventListener("change", function () {
      var prev = mine().photo, v = this.value, self = this;
      save({ photo: v }, function () { self.value = prev; });
    });
    $("#kpRec", modal).addEventListener("change", function () {
      var prev = mine().readReceipts, v = this.checked, self = this;
      save({ readReceipts: v }, function () { self.checked = prev; paint(); });
      paint();
    });
    $("#kpTyp", modal).addEventListener("change", function () {
      var prev = mine().typing, v = this.checked, self = this;
      save({ typing: v }, function () { self.checked = prev; });
    });
    $("#kpAbout", modal).addEventListener("click", function () { close(); var b = document.getElementById("abEdit"); if (b) b.click(); });
    $("#kpBlocked", modal).addEventListener("click", function () { close(); var b = document.getElementById("blockedBtn"); if (b) b.click(); });
    return modal;
  }
  function paint() {
    var p = mine();
    $("#kpSeen", modal).value = p.lastSeen;
    $("#kpPhoto", modal).value = p.photo;
    $("#kpRec", modal).checked = p.readReceipts !== false;
    $("#kpTyp", modal).checked = p.typing !== false;
    $("#kpSeenHint", modal).textContent = p.lastSeen === "nobody" ? "You won't see other people's last seen or online either" : "Applies to your last seen and your online status";
    $("#kpRecHint", modal).textContent = p.readReceipts === false ? "Off: no blue ticks for you, and you won't see theirs" : "Blue ticks when someone has read your message";
  }
  function open() {
    build(); paint();
    modal.hidden = false; modal.classList.remove("is-off");
    // refresh from the server in case another device changed it
    Kyro.api.me && Kyro.api.me().then(function (r) {
      var u = r && (r.user || r);
      if (u && u.privacy) { me = Object.assign({}, me, { privacy: u.privacy }); paint(); }
    }).catch(function () {});
  }
  function close() { if (!modal) return; modal.hidden = true; modal.classList.add("is-off"); }

  /* ---------- entry point inside Settings > Privacy and safety ---------- */
  function addEntry() {
    var blocked = document.getElementById("blockedBtn");
    if (!blocked || document.getElementById("privBtn")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "privBtn"; b.className = "set-link";
    b.style.marginBottom = "8px";
    b.innerHTML = 'Privacy<em>&rsaquo;</em>';
    b.addEventListener("click", function () {
      try { closeModal("settingsModal"); } catch (_) {}
      open();
    });
    var head = blocked.previousElementSibling;
    // put it first in the "Privacy and safety" group (above App lock)
    var heading = Array.prototype.find.call(document.querySelectorAll(".set-h"), function (h) { return /privacy and safety/i.test(h.textContent); });
    if (heading) heading.insertAdjacentElement("afterend", b); else blocked.insertAdjacentElement("beforebegin", b);
  }
  addEntry();

  window.KyroPrivacy = { open: open, close: close, hidden: hiddenIds };
})();
