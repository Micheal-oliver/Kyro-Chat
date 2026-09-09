Kyro.bounceIfAuthed();

const credsPanel = document.querySelector('[data-step="creds"]');
const otpPanel = document.querySelector('[data-step="otp"]');
let pending = { email: "", password: "" };

function showOtp() {
  credsPanel.classList.remove("is-on");
  otpPanel.classList.add("is-on");
  document.getElementById("otpEmail").textContent = pending.email;
}

function enterApp(data) {
  const token = Kyro.extractToken(data) || Kyro.getToken();
  const user = Kyro.extractUser(data);
  Kyro.setSession(token || "session", user && (user.email || user.firstName) ? user : { email: pending.email });
  location.replace("app.html");
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = document.getElementById("loginError");
  error.textContent = "";
  pending.email = document.getElementById("email").value.trim().toLowerCase();
  pending.password = document.getElementById("password").value;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const data = await Kyro.api.login({ email: pending.email, password: pending.password });
    const needsOtp = Boolean(
      data.needsVerification ||
      data.otpRequired ||
      data.requiresOtp ||
      /otp|verif|code sent|enter (the )?code/i.test(data.message || "")
    );

    if (data._ok && Kyro.extractToken(data) && !needsOtp) {
      Kyro.setSession(Kyro.extractToken(data), Kyro.extractUser(data));
      const resent = await Kyro.api.resendOtp(pending.email);
      if (resent._ok || resent.needsVerification || /sent|code|otp/i.test(resent.message || "")) {
        showOtp();
        return;
      }
      enterApp(data);
      return;
    }

    if (needsOtp || data._ok) {
      showOtp();
      return;
    }

    error.textContent = data.message || "Invalid email or password";
  } catch (err) {
    error.textContent = err.message || "Network error. Try again.";
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const otpError = document.getElementById("otpError");
  otpError.textContent = "";
  const otp = document.getElementById("otp").value.trim();
  if (!otp) {
    otpError.textContent = "Enter the OTP sent to you.";
    return;
  }
  const btn = document.getElementById("verifyBtn");
  btn.disabled = true;
  try {
    const verified = await Kyro.api.verifyOtp(pending.email, otp);
    if (Kyro.extractToken(verified)) {
      enterApp(verified);
      return;
    }
    const login = await Kyro.api.login({
      email: pending.email,
      password: pending.password,
      otp,
      code: otp
    });
    if (login._ok || Kyro.extractToken(login)) {
      enterApp(login);
      return;
    }
    if (verified._ok) {
      enterApp(verified);
      return;
    }
    otpError.textContent = login.message || verified.message || "That code did not work.";
  } catch (err) {
    otpError.textContent = err.message || "Could not verify OTP.";
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("resendBtn").addEventListener("click", async () => {
  const data = await Kyro.api.resendOtp(pending.email);
  document.getElementById("otpError").textContent =
    data.message || (data._ok ? "A new code is on the way." : "Could not resend OTP.");
});
