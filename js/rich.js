(() => {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const state = {
    names: () => [],
    meNames: () => []
  };

  // ---------- Links + @mentions ----------
  function buildRegex() {
    const names = (state.names() || []).map((n) => String(n || "").trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    const parts = ["(?<link>https?:\\/\\/[^\\s<>\"']+|www\\.[^\\s<>\"']+)"];
    if (names.length) parts.push("(?<named>@(?:" + names.map(esc).join("|") + ")(?![\\p{L}\\p{N}_]))");
    parts.push("(?<gen>@[\\p{L}\\p{N}_.]*[\\p{L}\\p{N}_])");
    return new RegExp(parts.join("|"), "giu");
  }

  function isMe(token) {
    const t = token.replace(/^@/, "").trim().toLowerCase();
    return (state.meNames() || []).some((n) => n && String(n).trim().toLowerCase() === t);
  }

  function render(el, text) {
    text = String(text == null ? "" : text);
    el.textContent = "";
    let mentionsMe = false;
    const rx = buildRegex();
    let last = 0;
    let m;
    const addText = (s) => { if (s) el.appendChild(document.createTextNode(s)); };
    while ((m = rx.exec(text))) {
      const g = m.groups || {};
      const start = m.index;
      let raw = m[0];
      if (g.link) {
        let tail = "";
        const tm = raw.match(/[.,!?;:)\]]+$/);
        if (tm) { tail = tm[0]; raw = raw.slice(0, -tail.length); }
        addText(text.slice(last, start));
        const a = document.createElement("a");
        a.className = "msg-link";
        a.href = /^www\./i.test(raw) ? "https://" + raw : raw;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = raw;
        a.addEventListener("click", (e) => e.stopPropagation());
        el.appendChild(a);
        addText(tail);
        last = start + m[0].length;
        continue;
      }
      // mentions must not be glued to a word (e.g. an email address)
      const before = start > 0 ? text[start - 1] : "";
      if (before && /[\p{L}\p{N}_]/u.test(before)) { continue; }
      addText(text.slice(last, start));
      const span = document.createElement("span");
      span.className = "mention";
      if (isMe(raw)) { span.classList.add("me"); mentionsMe = true; }
      span.textContent = raw;
      el.appendChild(span);
      last = start + m[0].length;
    }
    addText(text.slice(last));
    return { mentionsMe };
  }

  // ---------- Voice note player ----------
  const BARS = 34;
  const SPEEDS = [1, 1.5, 2];
  let current = null;
  let ctx = null;

  function fmt(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const s = Math.round(sec);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function seeded(src) {
    let h = 2166136261;
    const k = String(src).length + ":" + String(src).slice(-64);
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out = [];
    for (let i = 0; i < BARS; i++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      out.push(0.25 + ((h >>> 0) % 1000) / 1000 * 0.75);
    }
    return out;
  }

  async function peaksFor(src) {
    if (String(src).length > 4000000) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    const buf = await (await fetch(src)).arrayBuffer();
    const audio = await new Promise((res, rej) => {
      const p = ctx.decodeAudioData(buf, res, rej);
      if (p && p.catch) p.catch(rej);
    });
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const peaks = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      const from = i * step;
      const to = Math.min(data.length, from + step);
      for (let j = from; j < to; j++) sum += Math.abs(data[j]);
      peaks.push(sum / Math.max(1, to - from));
    }
    const max = Math.max(...peaks) || 1;
    return { peaks: peaks.map((p) => 0.2 + (p / max) * 0.8), duration: audio.duration };
  }

  function voicePlayer(src) {
    const wrap = document.createElement("div");
    wrap.className = "voice";
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "voice-play";
    play.setAttribute("aria-label", "Play voice message");
    play.textContent = "\u25B6";

    const bars = document.createElement("div");
    bars.className = "voice-bars";
    const heights = seeded(src);
    const nodes = heights.map((h) => {
      const b = document.createElement("i");
      b.style.height = Math.round(h * 100) + "%";
      bars.appendChild(b);
      return b;
    });

    const time = document.createElement("small");
    time.className = "voice-time";
    time.textContent = "0:00";

    const speed = document.createElement("button");
    speed.type = "button";
    speed.className = "voice-speed";
    speed.textContent = "1x";
    let si = 0;

    let total = 0;
    const getTotal = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : total);
    const paint = () => {
      const t = getTotal();
      const ratio = t ? Math.min(1, audio.currentTime / t) : 0;
      const upto = Math.floor(ratio * BARS);
      nodes.forEach((n, i) => n.classList.toggle("on", i < upto || (ratio > 0 && i === upto && ratio >= 1)));
      time.textContent = audio.paused && audio.currentTime === 0 ? fmt(t) : fmt(audio.currentTime);
    };

    peaksFor(src).then((r) => {
      if (!r) return;
      total = r.duration || 0;
      r.peaks.forEach((p, i) => { nodes[i].style.height = Math.round(p * 100) + "%"; });
      paint();
    }).catch(() => {});

    audio.addEventListener("loadedmetadata", () => {
      if (!Number.isFinite(audio.duration)) {
        // MediaRecorder webm files report Infinity until seeked to the end
        const onFix = () => { audio.removeEventListener("timeupdate", onFix); audio.currentTime = 0; paint(); };
        audio.addEventListener("timeupdate", onFix);
        audio.currentTime = 1e101;
      } else paint();
    });
    audio.addEventListener("timeupdate", paint);
    audio.addEventListener("ended", () => {
      play.textContent = "\u25B6";
      audio.currentTime = 0;
      wrap.classList.remove("playing");
      nodes.forEach((n) => n.classList.remove("on"));
      paint();
    });
    audio.addEventListener("pause", () => { play.textContent = "\u25B6"; wrap.classList.remove("playing"); });
    audio.addEventListener("play", () => { play.textContent = "\u275A\u275A"; wrap.classList.add("playing"); });

    play.addEventListener("click", (e) => {
      e.stopPropagation();
      if (audio.paused) {
        if (current && current !== audio) current.pause();
        current = audio;
        audio.playbackRate = SPEEDS[si];
        audio.play().catch(() => {});
      } else audio.pause();
    });

    speed.addEventListener("click", (e) => {
      e.stopPropagation();
      si = (si + 1) % SPEEDS.length;
      audio.playbackRate = SPEEDS[si];
      speed.textContent = SPEEDS[si] + "x";
    });

    bars.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = getTotal();
      if (!t) return;
      const r = bars.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * t;
      paint();
    });

    wrap.append(play, bars, time, speed);
    wrap._audio = audio;
    return wrap;
  }

  window.Rich = {
    render,
    voicePlayer,
    setNames(fn) { if (typeof fn === "function") state.names = fn; },
    setMeNames(fn) { if (typeof fn === "function") state.meNames = fn; }
  };
})();
