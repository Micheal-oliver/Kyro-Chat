/* Kyro smart replies. Additive: remove the hook lines in app.html to undo.
   Suggests up to 3 short answers above the message box for the latest incoming text message.
   English only. Runs entirely on this device: nothing is sent anywhere. Tap a suggestion to send it.
   Switch: Settings > Chats > Smart replies (on by default). */
(function () {
  "use strict";
  if (window.KyroSmart) return;
  var KEY = "kyro.smart";
  function on() { return localStorage.getItem(KEY) !== "off"; }

  /* ---------- English check ---------- */
  var EN = ("the a an and or but if so to of in on at for with from by as is are was were be been am do does did have has had i you he she it we they me my your our " +
    "this that these those what when where who why how can could will would should may might not no yes yeah ok okay hi hello hey thanks thank please sorry good morning night " +
    "great nice cool sure lol today tomorrow tonight now later soon call meet see going gonna wanna want need there here just very really too also " +
    "im ill ive id dont cant wont its thats whats hows youre theyre were whos happy birthday congrats congratulations bye love miss morning night late running way omw on up out about back home work free busy tell know think let us them him her his its some any all more less much many long short big small new old first last next time day week thanks welcome sorry").split(" ");
  var ENSET = {}; EN.forEach(function (w) { ENSET[w] = 1; });
  function isEnglish(text) {
    var letters = text.replace(/[^\p{L}]/gu, "");
    if (!letters) return /^[\d\s.,!?:;()+\-]+$/.test(text) ? false : true;
    var ascii = letters.replace(/[^A-Za-z]/g, "").length;
    if (ascii / letters.length < 0.9) return false; // other scripts / mostly accented letters
    var words = text.toLowerCase().match(/[a-z']+/g) || [];
    if (!words.length) return false;
    var hits = words.filter(function (w) { return ENSET[w.replace(/'/g, "")] || ENSET[w]; }).length;
    return hits / words.length >= 0.25 || (words.length <= 3 && hits >= 1);
  }

  /* ---------- suggestion rules (first matches win, then neutral fallbacks) ---------- */
  var RULES = [
    [/\b(happy birthday|hbd)\b/, ["Thank you! 🎉", "Thanks so much!", "Aww thank you 🥳"]],
    [/\b(congrat|well done|so proud)\b/, ["Thank you! 😊", "Thanks, means a lot", "Thanks a lot!"]],
    [/\b(good morning|gm)\b/, ["Good morning! ☀️", "Morning! How are you?", "Good morning 😊"]],
    [/\b(good night|goodnight|gn|sleep well)\b/, ["Good night 🌙", "Sleep well!", "Night night 😴"]],
    [/\b(thank you|thanks|thx|ty|appreciate)\b/, ["You're welcome!", "Anytime 😊", "No problem!"]],
    [/\b(sorry|my bad|apologi[sz]e)\b/, ["No worries", "It's okay", "All good 👍"]],
    [/\b(love you|miss you|i miss)\b/, ["Love you too ❤️", "Miss you too!", "Aww ❤️"]],
    [/\b(how are you|how r u|how're you|how have you been|how's it going|hows it going|you good|you okay)\b/, ["I'm good, you?", "Doing well, thanks! You?", "All good here 🙂"]],
    [/\b(what'?s up|wassup|sup|what are you up to|wyd)\b/, ["Not much, you?", "Just relaxing. You?", "Nothing much 🙂"]],
    [/^(hi|hello|hey|hiya|yo|heyy+|hii+)\b/, ["Hey! 👋", "Hi, how are you?", "Hello! What's up?"]],
    [/\b(where are you|where r u|where're you|wya)\b/, ["On my way", "At home", "I'll tell you in a sec"]],
    [/\b(on my way|omw|be there soon|almost there|running late)\b/, ["Okay, see you soon", "Great, take your time", "No rush 👍"]],
    [/\b(call me|can you call|can we talk|give me a call|ring me)\b/, ["Calling you now", "Give me a few minutes", "I can't talk right now"]],
    [/\b(are you (free|available|around|busy)|you free|you around)\b/, ["Yes, I'm free", "Not right now", "Give me a few minutes"]],
    [/\b(when|what time|what day)\b.*\?/, ["Tonight", "Tomorrow", "Let me check"]],
    [/\b(where)\b.*\?/, ["Let me check", "At my place", "I'll send the location"]],
    [/\b(why)\b.*\?/, ["Long story 😅", "I'll explain later", "Not sure"]],
    [/\b(what do you think|your thoughts|any ideas|thoughts\?)/, ["Sounds good to me", "I think it's a great idea", "Let me think about it"]],
    [/\b(do you want|would you like|wanna|want to|shall we|should we|are you coming|can you come|join us|come over|let'?s)\b.*\?/, ["Yes, I'd love to", "Sorry, I can't", "Maybe later"]],
    [/\b(can you|could you|would you|will you|please)\b.*\?/, ["Sure, no problem", "Yes, on it", "Give me a minute"]],
    [/\b(did you|have you|had you|were you|was it)\b.*\?/, ["Yes, I did", "Not yet", "Let me check"]],
    [/\b(do you|are you|is it|is there|does it|can i|am i|have you)\b.*\?/, ["Yes", "No", "Not sure"]],
    [/(lol|lmao|haha+|hehe+|rofl|😂|🤣)/, ["😂", "Haha that's funny", "Lol 😄"]],
    [/\b(bye|see you|see ya|talk later|ttyl|cya|gotta go|got to go)\b/, ["Bye! 👋", "See you later", "Talk soon!"]],
    [/\b(ok|okay|k|alright|sure|sounds good|got it|noted|will do)\b[.!]*$/, ["👍", "Great!", "Perfect"]],
    [/\b(sad|upset|tired|stressed|sick|not feeling|bad day|rough day|exhausted)\b/, ["I'm sorry to hear that", "Hope you feel better soon", "Want to talk about it?"]]
  ];
  var QUESTION = ["Yes", "No", "Let me check"];
  var NEUTRAL = ["Okay 👍", "Got it", "Thanks!"];

  function suggest(text) {
    var t = String(text || "").trim();
    if (!t || t.length > 280 || !isEnglish(t)) return [];
    var low = t.toLowerCase().replace(/\s+/g, " ");
    var out = [];
    for (var i = 0; i < RULES.length && out.length < 3; i++) {
      var r = RULES[i];
      if (r[0].test(low)) {
        var list = r[1];
        out = list.slice(0, 3);
        break;
      }
    }
    if (!out.length) out = /\?\s*$/.test(low) ? QUESTION.slice() : NEUTRAL.slice();
    var seen = {};
    return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }).slice(0, 3);
  }

  /* ---------- UI ---------- */
  var strip = null, box = null, input = null, composer = null;
  function ensure() {
    box = document.getElementById("messages");
    input = document.getElementById("messageInput");
    composer = document.getElementById("composer");
    if (!box || !input || !composer) return false;
    if (!strip) {
      strip = document.createElement("div");
      strip.id = "krSmart";
      strip.className = "kr-smart";
      strip.hidden = true;
      strip.setAttribute("role", "group");
      strip.setAttribute("aria-label", "Suggested replies");
      composer.parentNode.insertBefore(strip, composer);
      strip.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-r]");
        if (!b) return;
        var text = b.getAttribute("data-r");
        hide();
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof composer.requestSubmit === "function") composer.requestSubmit();
        else composer.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      });
    }
    return true;
  }
  function hide() { if (strip) { strip.hidden = true; strip.innerHTML = ""; } }

  // the text of an incoming plain-text bubble (skips photos, voice, files, stickers, deleted messages)
  function bubbleText(b) {
    if (!b || !b.classList.contains("them")) return "";
    if (b.querySelector("img, audio, video, .file-tile, .voice, .poll, .view-once, canvas")) return "";
    if (b.classList.contains("deleted")) return "";
    var plain = b._plain;
    if (typeof plain === "string") return plain;
    var clone = b.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll(".meta, .ticks, .time, .reacts, .quote, small, time, button"), function (n) { n.remove(); });
    return (clone.textContent || "").trim();
  }

  var timer = null;
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  }
  function run() {
    if (!ensure()) return;
    var thread = document.getElementById("threadScreen");
    if (!on() || !thread || thread.hidden || input.value.trim()) return hide();
    var bubbles = box.querySelectorAll(".bubble");
    var last = bubbles[bubbles.length - 1];
    if (!last || last.classList.contains("me")) return hide();
    var age = Date.now() - (last._ts || Date.now());
    if (age > 6 * 60 * 60 * 1000) return hide(); // old conversation: don't nag
    var list = suggest(bubbleText(last));
    if (!list.length) return hide();
    var sig = list.join("|");
    if (!strip.hidden && strip.dataset.sig === sig) return;
    strip.dataset.sig = sig;
    strip.innerHTML = "";
    list.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kr-chip"; b.setAttribute("data-r", t); b.textContent = t;
      strip.appendChild(b);
    });
    strip.hidden = false;
  }

  function start() {
    if (!ensure()) return false;
    new MutationObserver(refresh).observe(box, { childList: true });
    input.addEventListener("input", function () { if (input.value.trim()) hide(); else refresh(); });
    composer.addEventListener("submit", hide);
    var thread = document.getElementById("threadScreen");
    if (thread) new MutationObserver(refresh).observe(thread, { attributes: true, attributeFilter: ["hidden", "class"] });
    refresh();
    return true;
  }

  /* ---------- settings switch (Settings > Chats) ---------- */
  function addSwitch() {
    if (document.getElementById("setSmart")) return;
    var anchor = document.getElementById("wallBtn");
    if (!anchor) return;
    var row = document.createElement("label");
    row.className = "set-row";
    row.innerHTML = '<span>Smart replies<small>Suggested answers above the message box. English only, made on your device</small></span>' +
      '<span class="switch"><input type="checkbox" id="setSmart" /><i></i></span>';
    anchor.insertAdjacentElement("beforebegin", row);
    var cb = row.querySelector("input");
    cb.checked = on();
    cb.addEventListener("change", function () {
      localStorage.setItem(KEY, cb.checked ? "on" : "off");
      if (cb.checked) refresh(); else hide();
    });
  }
  addSwitch();

  var n = 0, iv = setInterval(function () { if (start() || ++n > 40) clearInterval(iv); }, 250);
  window.KyroSmart = { suggest: suggest, isEnglish: isEnglish };
})();
