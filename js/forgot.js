/* Forgot-password flow. Uses the backend routes that already exist:
   POST /api/auth/forgot-password  { email }
   POST /api/auth/reset-password   { email, otp, newPassword }
   Built on Kyro.request, so js/kyro.js is not modified. */
Kyro.bounceIfAuthed();

const panels = [...document.querySelectorAll(".panel")];
const dots = document.getElementById("stepDots");
const steps = ["email", "reset", "done"];
steps.forEach(() => {
  const el = document.createElement("span");
  el.className = "step-dot";
  dots.appendChild(el);
});

let step = "email";
let email = "";

function show(name) {
  step = name;
  panels.forEach((p) => p.classList.toggle("is-on", p.dataset.step === name));
  [...dots.children].forEach((d, i) => d.classList.toggle("is-on", i <= steps.indexOf(name)));
  const first = document.querySelector('.panel.is-on input:not([type="hidden"])');
  if (first) setTimeout(() => first.focus(), 60);
}
show("email");

function setError(id, msg) {
  document.getElementById(id).textContent = msg || "";
}

function post(path, body) {
  return Kyro.request(path, { method: "POST", body });
}

/* Resend with a short cooldown so the button can't be spammed */
const resendBtn = document.getElementById("resendBtn");
let cooldown = 0;
let cooldownTimer = null;
function startCooldown(seconds) {
  cooldown = seconds;
  resendBtn.disabled = true;
  clearInterval(cooldownTimer);
  const tick = () => {
    if (cooldown <= 0) {
      clearInterval(cooldownTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend code";
      return;
    }
    resendBtn.textContent = "Resend code in " + cooldown + "s";
    cooldown -= 1;
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

document.getElementById("forgotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter || document.querySelector(".panel.is-on button[type=submit]");

  if (step === "email") {
    setError("emailError", "");
    email = document.getElementById("email").value.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("emailError", "Enter the email you signed up with.");
      return;
    }
    btn.disabled = true;
    try {
      const data = await post("/api/auth/forgot-password", { email });
      if (data._ok) {
        document.getElementById("otpEmail").textContent = email;
        show("reset");
        startCooldown(30);
      } else {
        setError("emailError", data.message || "Could not send a code. Try again.");
      }
    } catch (err) {
      setError("emailError", err.message || "Network error. Try again.");
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (step === "reset") {
    setError("resetError", "");
    const otp = document.getElementById("otp").value.trim();
    const pw = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    if (!otp) return setError("resetError", "Enter the code from your email.");
    if (pw.length < 8) return setError("resetError", "Use at least 8 characters for your new password.");
    if (pw !== confirm) return setError("resetError", "The two passwords don’t match.");
    btn.disabled = true;
    try {
      const data = await post("/api/auth/reset-password", { email, otp, code: otp, newPassword: pw });
      if (data._ok) show("done");
      else setError("resetError", data.message || "That code did not work.");
    } catch (err) {
      setError("resetError", err.message || "Network error. Try again.");
    } finally {
      btn.disabled = false;
    }
  }
});

resendBtn.addEventListener("click", async () => {
  setError("resetError", "");
  startCooldown(30);
  const data = await post("/api/auth/forgot-password", { email });
  if (!data._ok) setError("resetError", data.message || "Could not resend the code.");
});
