/* Kyro stickers plus: three more packs (Mood, Chat, Fun) and a "Make" tab to design your own sticker.
   Plugs into the existing sticker picker through its public hooks (kxPickHooks / kx-picker-built).
   Stickers are 240x240 PNGs sent as normal image messages, same as the built-in packs. No backend change.
   Remove the <script> line in app.html to undo. */
(() => {
  "use strict";
  const SIZE = 240;
  const RK = "kyro.stickers.recent";
  const PACKS = {
    kxmood: ["Mood", [["😅", "oops"], ["🤯", "mind blown"], ["😬", "yikes"], ["🥱", "boring"], ["🤔", "hmm"], ["😇", "innocent"], ["🙄", "really"], ["🤗", "hug"], ["😏", "smirk"], ["🥺", "pls"], ["🤣", "dying"], ["😌", "relieved"]]],
    kxchat: ["Chat", [["👋", "hey"], ["✅", "done"], ["❌", "no"], ["⏳", "wait"], ["📞", "call me"], ["🏃", "omw"], ["🍽️", "food?"], ["🛌", "sleep"], ["💸", "broke"], ["📚", "studying"], ["🚗", "driving"], ["🤫", "secret"]]],
    kxfun: ["Fun", [["😘", "kiss"], ["💕", "miss u"], ["🌹", "for you"], ["🎂", "cake"], ["🎁", "gift"], ["🏆", "winner"], ["💪", "strong"], ["⚽", "goal"], ["🎶", "vibing"], ["🔥", "on fire"], ["🫂", "hug"], ["👑", "king"]]]
  };
  const EMOJI = ["😎", "😂", "🥹", "🔥", "💯", "🙏", "🎉", "❤️", "🚀", "👀", "💀", "🤝"];
  const TILES = [["", "Classic"], ["#6b3fe0", "Purple"], ["#0e7c86", "Teal"], ["#c2366f", "Pink"], ["#b86a0b", "Amber"], ["#1f2f6a", "Navy"]];
  const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  const cache = new Map();

  const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RK) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const tell = (t) => { if (typeof toast === "function") toast(t, "tip", 3500); };

  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
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
      x.fillStyle = tile;
      roundRect(x, 8, 8, SIZE - 16, SIZE - 16, 44);
      x.fill();
      x.font = "104px " + EMOJI_FONT;
      x.fillText(emoji, SIZE / 2, label ? 94 : SIZE / 2 + 4);
      if (label) {
        x.font = "800 30px Outfit, system-ui, sans-serif";
        x.fillStyle = "#ffffff";
        x.fillText(label, SIZE / 2, 192, SIZE - 40);
      }
    } else {
      x.font = "112px " + EMOJI_FONT;
      x.shadowColor = "#fff"; x.shadowBlur = 0;
      for (let a = 0; a < 16; a++) {
        x.shadowOffsetX = Math.cos((a / 16) * Math.PI * 2) * 7;
        x.shadowOffsetY = Math.sin((a / 16) * Math.PI * 2) * 7;
        x.fillText(emoji, SIZE / 2, label ? 98 : SIZE / 2);
      }
      x.shadowColor = "transparent";
      if (label) {
        x.font = "800 34px Outfit, system-ui, sans-serif";
        x.lineJoin = "round"; x.lineWidth = 10; x.strokeStyle = "#fff";
        x.strokeText(label, SIZE / 2, 200, SIZE - 20);
        x.fillStyle = "#1b1840";
        x.fillText(label, SIZE / 2, 200, SIZE - 20);
      }
    }
    const url = c.toDataURL("image/png");
    cache.set(key, url);
    return url;
  }

  async function send(media, recentItem, close) {
    if (typeof currentPeer === "undefined" || !currentPeer) return;
    const blocked = document.getElementById("blockedBar");
    if (blocked && !blocked.hidden) { tell("Unblock this contact to send stickers."); return; }
    if (recentItem) {
      const rec = readRecent().filter((r) => r[0] !== recentItem[0] || r[1] !== recentItem[1]);
      rec.unshift(recentItem);
      try { localStorage.setItem(RK, JSON.stringify(rec.slice(0, 12))); } catch (_) {}
    }
    const box = document.getElementById("messages");
    if (box.querySelector(".hint")) box.innerHTML = "";
    const bubble = makeBubble({ mine: true, senderId: meId, kind: "image", media, text: "sticker" });
    appendMsg(box, bubble);
    box.scrollTop = box.scrollHeight;
    if (close) close();
    try { await sendChat({ kind: "image", media, text: "sticker" }, bubble); }
    catch (_) { bubble.style.opacity = "0.6"; }
  }

  window.kxPickHooks = window.kxPickHooks || {};

  Object.keys(PACKS).forEach((name) => {
    window.kxPickHooks[name] = (grid, close) => {
      grid.classList.remove("kx-pick-list");
      PACKS[name][1].forEach(([emoji, label]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", "Send sticker: " + label);
        const img = document.createElement("img");
        img.alt = label;
        b.appendChild(img);
        grid.appendChild(b);
        b.addEventListener("click", () => draw(emoji, label, "").then((u) => send(u, [emoji, label], close)));
        draw(emoji, label, "").then((u) => { img.src = u; });
      });
    };
  });

  window.kxPickHooks.kxmake = (grid, close) => {
    grid.classList.remove("kx-pick-list");
    grid.classList.add("ks-mk-grid");
    const st = { emoji: "😎", tile: "" };
    const wrap = document.createElement("div");
    wrap.className = "ks-mk";
    wrap.innerHTML =
      '<div class="ks-mk-top"><img class="ks-mk-prev" alt="Sticker preview" />' +
      '<div class="ks-mk-ctl"><input maxlength="16" placeholder="Sticker text" autocomplete="off" aria-label="Sticker text" />' +
      '<div class="ks-mk-sw" role="group" aria-label="Style"></div></div></div>' +
      '<div class="ks-mk-emo" role="group" aria-label="Emoji"></div>' +
      '<button type="button" class="ks-mk-send">Send sticker</button>';
    grid.appendChild(wrap);
    const input = wrap.querySelector("input"), prev = wrap.querySelector(".ks-mk-prev");
    const sw = wrap.querySelector(".ks-mk-sw"), emo = wrap.querySelector(".ks-mk-emo");
    const label = () => input.value.trim();
    const refresh = () => draw(st.emoji, label(), st.tile).then((u) => { prev.src = u; });

    TILES.forEach(([col, name], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", name);
      b.className = "ks-sw" + (i === 0 ? " on" : "") + (col ? "" : " plain");
      if (col) b.style.background = col;
      b.addEventListener("click", () => {
        st.tile = col;
        sw.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        refresh();
      });
      sw.appendChild(b);
    });
    EMOJI.forEach((e, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = e; b.setAttribute("aria-label", "Emoji " + e);
      if (i === 0) b.classList.add("on");
      b.addEventListener("click", () => {
        st.emoji = e;
        emo.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        refresh();
      });
      emo.appendChild(b);
    });
    input.addEventListener("input", refresh);
    wrap.querySelector(".ks-mk-send").addEventListener("click", () => {
      draw(st.emoji, label(), st.tile).then((u) => send(u, null, close));
    });
    refresh();
  };

  const TABS = [["kxmood", "Mood"], ["kxchat", "Chat"], ["kxfun", "Fun"], ["kxmake", "Make"]];
  function addTabs(panel) {
    const tabs = panel && panel.querySelector(".kx-pick-tabs");
    if (!tabs || tabs.querySelector('[data-p="kxmood"]')) return;
    const before = tabs.querySelector('[data-p="replies"]');
    TABS.forEach(([p, text]) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.p = p; b.textContent = text;
      tabs.insertBefore(b, before);
    });
  }
  document.addEventListener("kx-picker-built", (e) => addTabs(e.detail));
  addTabs(document.querySelector(".kx-pick"));
})();
