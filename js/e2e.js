(() => {
  const KEY = "kyro.e2e";

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }

  async function loadPair() {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const keys = {
      pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
      priv: await crypto.subtle.exportKey("jwk", pair.privateKey)
    };
    localStorage.setItem(KEY, JSON.stringify(keys));
    return keys;
  }

  async function publishKey() {
    const keys = await loadPair();
    try {
      await window.Kyro.request("/api/users/me", { method: "PATCH", body: { publicKey: JSON.stringify(keys.pub) } });
    } catch (_) {}
    return keys.pub;
  }

  async function aesFrom(theirPubJwk) {
    const mine = await loadPair();
    const priv = await crypto.subtle.importKey("jwk", mine.priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const pub = await crypto.subtle.importKey("jwk", theirPubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptText(plain, theirPub) {
    if (!theirPub) return plain;
    const jwk = typeof theirPub === "string" ? JSON.parse(theirPub) : theirPub;
    const key = await aesFrom(jwk);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
    return "ENC1:" + JSON.stringify({ iv: bufToB64(iv), data: bufToB64(data) });
  }

  async function decryptText(payload, theirPub) {
    if (!payload || !String(payload).startsWith("ENC1:")) return payload;
    if (!theirPub) return "[Encrypted message]";
    try {
      const jwk = typeof theirPub === "string" ? JSON.parse(theirPub) : theirPub;
      const pack = JSON.parse(payload.slice(5));
      const key = await aesFrom(jwk);
      const out = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(pack.iv)) },
        key,
        b64ToBuf(pack.data)
      );
      return new TextDecoder().decode(out);
    } catch (_) {
      return "[Encrypted message]";
    }
  }

  window.KyroE2E = { loadPair, publishKey, encryptText, decryptText };
})();
