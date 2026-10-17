/* Kyro "Start conversation" sheet, WhatsApp style: tap a person to open the chat.
   New contact and New group sit above the list. Uses the existing Add contact and
   Create group flows, so nothing else changes. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  function everyone() {
    const out = [], seen = new Set([String(meId)]);
    const add = (p) => {
      if (!p || !p.id) return;
      const id = String(p.id);
      if (seen.has(id) || String(id).startsWith("group:")) return;
      seen.add(id);
      out.push({ ...p, id, name: p.name || "Contact" });
    };
    try { load(LS.contacts, []).forEach(add); } catch (_) {}
    try { chats.map(peerFrom).forEach((p) => { if (p && p.name) add(p); }); } catch (_) {}
    return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function row(label, sub, onTap, avatarText) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "row kx-newchat-row";
    b.innerHTML = '<div class="row-avatar"></div><div class="kx-newchat-text"><b></b><span></span></div>';
    $(".kx-newchat-text b", b).textContent = label;
    $(".kx-newchat-text span", b).textContent = sub || "";
    $(".row-avatar", b).textContent = avatarText || "+";
    b.addEventListener("click", onTap);
    return b;
  }

  function render() {
    const sheet = $("#plusModal .sheet");
    if (!sheet) return;

    // Keep the original buttons in the DOM (other code clicks them) but hide them.
    ["chooseContact", "chooseGroup"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

    sheet.querySelectorAll(".kx-newchat").forEach((n) => n.remove());
    const wrap = document.createElement("div");
    wrap.className = "kx-newchat";

    const closeAnd = (fn) => () => { closeModal("plusModal"); fn(); };
    wrap.appendChild(row("New group", "Chat with several people", closeAnd(() => document.getElementById("chooseGroup").click()), "👥"));
    wrap.appendChild(row("New contact", "Add someone by phone or email", closeAnd(() => document.getElementById("chooseContact").click()), "＋"));

    const people = everyone();
    const heading = document.createElement("p");
    heading.className = "kx-newchat-heading";
    heading.textContent = people.length ? "Contacts on Kyro Chat" : "";
    if (people.length) wrap.appendChild(heading);

    if (!people.length) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "No contacts yet. Tap New contact to add someone.";
      wrap.appendChild(hint);
    }

    people.forEach((p) => {
      wrap.appendChild(row(p.name, p.phone || p.email || "", closeAnd(() => openThread(p)), String(p.name).slice(0, 1).toUpperCase()));
    });

    const title = sheet.querySelector("h3");
    title.after(wrap);
  }

  const plusBtn = document.getElementById("plusBtn");
  const emptyPlus = document.getElementById("emptyPlus");
  if (plusBtn) plusBtn.addEventListener("click", render);
  if (emptyPlus) emptyPlus.addEventListener("click", render);
})();
