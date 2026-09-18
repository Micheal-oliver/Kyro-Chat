(() => {
  const API_BASE = "https://chat-backend-tnii.onrender.com";
  const TOKEN_KEY = "kyro.token";
  const USER_KEY = "kyro.user";

  async function request(path, { method = "GET", body, token } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const auth = token || getToken();
    if (auth) headers.Authorization = "Bearer " + auth;

    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(API_BASE + path, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const raw = await res.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
        data._ok = res.ok;
        data._status = res.status;
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt === 1) await new Promise((r) => setTimeout(r, 2500));
      }
    }
    return {
      _ok: false,
      _status: 0,
      message: "Failed to reach the server. Wait 30 seconds and try again — Render may be waking up."
    };
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  }

  function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) {
      const prev = getUser() || {};
      localStorage.setItem(USER_KEY, JSON.stringify({ ...prev, ...user }));
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  function extractToken(data) {
    return data.token || data.accessToken || data.jwt || (data.data && (data.data.token || data.data.accessToken)) || "";
  }

  function extractUser(data) {
    return data.user || data.profile || (data.data && (data.data.user || data.data.profile)) || data;
  }

  function splitName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || parts[0] || ""
    };
  }

  function ageFromDob(iso) {
    if (!iso) return null;
    const dob = new Date(iso + "T00:00:00");
    if (Number.isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
    return age;
  }

  function initials(name) {
    return String(name || "K")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] || "")
      .join("")
      .toUpperCase() || "K";
  }

  async function fileToDataUrl(file, max = 480) {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  const api = {
    register(payload) {
      return request("/api/auth/register", { method: "POST", body: payload });
    },
    verifyOtp(email, otp) {
      return request("/api/auth/verify-otp", { method: "POST", body: { email, otp, code: otp } });
    },
    resendOtp(email) {
      return request("/api/auth/resend-otp", { method: "POST", body: { email } });
    },
    login(payload) {
      return request("/api/auth/login", { method: "POST", body: payload });
    },
    me() {
      return request("/api/auth/me");
    },
    chats() {
      return request("/api/chats");
    },
    agoraToken(channel) {
      return request("/api/calls/agora?channel=" + encodeURIComponent(channel));
    },
    lookup(query) {
      const q = encodeURIComponent(query);
      return request("/api/users/lookup?q=" + q + "&email=" + q + "&phone=" + q);
    },
    messages(otherUserId) {
      return request("/api/messages/" + encodeURIComponent(otherUserId));
    },
    sendMessage(otherUserId, text, extra = {}) {
      const payload = typeof text === "object" ? text : { text, ...extra };
      return request("/api/messages", {
        method: "POST",
        body: {
          to: otherUserId,
          receiverId: otherUserId,
          recipientId: otherUserId,
          otherUserId,
          text: payload.text || payload.content || "",
          content: payload.text || payload.content || "",
          message: payload.text || "",
          kind: payload.kind || "text",
          media: payload.media || ""
        }
      });
    },
    updateProfile(payload) {
      return request("/api/users/me", { method: "PATCH", body: payload });
    }
  };

  function requireAuthPage() {
    if (!isLoggedIn()) {
      location.replace("login.html");
      return false;
    }
    return true;
  }

  function bounceIfAuthed() {
    if (isLoggedIn()) {
      location.replace("app.html");
      return true;
    }
    return false;
  }

  window.Kyro = {
    API_BASE, api, request,
    getToken, getUser, setSession, clearSession, isLoggedIn,
    extractToken, extractUser, splitName, ageFromDob, initials, fileToDataUrl,
    requireAuthPage, bounceIfAuthed
  };
})();
