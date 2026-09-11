Kyro.bounceIfAuthed();

const panels = [...document.querySelectorAll(".panel")];
const dots = document.getElementById("stepDots");
const steps = ["details", "otp", "photo"];
steps.forEach(() => {
  const el = document.createElement("span");
  el.className = "step-dot";
  dots.appendChild(el);
});

let step = "details";
let pending = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  age: null,
  photo: ""
};

function show(name) {
  step = name;
  panels.forEach((p) => p.classList.toggle("is-on", p.dataset.step === name));
  [...dots.children].forEach((d, i) => d.classList.toggle("is-on", steps[i] === name));
}
show("details");

const dob = document.getElementById("dob");
const ageLine = document.getElementById("ageLine");
dob.addEventListener("input", () => {
  const age = Kyro.ageFromDob(dob.value);
  if (age === null) ageLine.textContent = "Age will appear here";
  else if (age < 0) ageLine.textContent = "Please pick a valid date";
  else ageLine.textContent = "You are " + age + " years old";
});

function setError(id, msg) {
  document.getElementById(id).textContent = msg || "";
}

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (step !== "details") return;
  setError("detailsError", "");
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const phone = document.getElementById("phone").value.trim();
  const password = document.getElementById("password").value;
  const dateOfBirth = dob.value;
  const age = Kyro.ageFromDob(dateOfBirth);
  if (!fullName || !email || !phone || !password || !dateOfBirth) {
    setError("detailsError", "Please fill in every field.");
    return;
  }
  if (age === null || age < 8) {
    setError("detailsError", "Please enter a valid date of birth.");
    return;
  }
  const { firstName, lastName } = Kyro.splitName(fullName);
  pending = { email, password, firstName, lastName, phone, dateOfBirth, age, photo: pending.photo };
  const btn = document.querySelector('#signupForm button[type="submit"]');
  btn.disabled = true;
  try {
    const data = await Kyro.api.register({
      firstName,
      lastName,
      fullName,
      name: fullName,
      email,
      phone,
      phoneNumber: phone,
      password,
      dateOfBirth,
      dob: dateOfBirth,
      age
    });
    if (data.needsVerification || data._ok || data._status === 200 || data._status === 201) {
      document.getElementById("otpEmail").textContent = email;
      if (data.otp) {
        document.getElementById("otp").value = data.otp;
        setError("otpError", "Email is not set up yet. Your code is " + data.otp);
      }
      show("otp");
      const token = Kyro.extractToken(data);
      if (token) Kyro.setSession(token, Kyro.extractUser(data));
    } else {
      setError("detailsError", data.message || "Could not create account.");
    }
  } catch (err) {
    setError("detailsError", err.message || "Network error. Try again.");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  setError("otpError", "");
  const otp = document.getElementById("otp").value.trim();
  if (!otp) {
    setError("otpError", "Enter the code we sent you.");
    return;
  }
  const btn = document.getElementById("verifyBtn");
  btn.disabled = true;
  try {
    const data = await Kyro.api.verifyOtp(pending.email, otp);
    if (!data._ok && !Kyro.extractToken(data) && /invalid|expired|wrong|required/i.test(data.message || "")) {
      setError("otpError", data.message);
      return;
    }
    const token = Kyro.extractToken(data);
    const user = {
      firstName: pending.firstName,
      lastName: pending.lastName,
      fullName: (pending.firstName + " " + pending.lastName).trim(),
      email: pending.email,
      phone: pending.phone,
      dateOfBirth: pending.dateOfBirth,
      age: pending.age
    };
    Kyro.setSession(token || Kyro.getToken(), user);
    show("photo");
  } catch (err) {
    setError("otpError", err.message || "Could not verify code.");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("resendBtn").addEventListener("click", async () => {
  setError("otpError", "");
  const data = await Kyro.api.resendOtp(pending.email);
  if (data.otp) {
    document.getElementById("otp").value = data.otp;
    setError("otpError", "Your code is " + data.otp);
  } else {
    setError("otpError", data.message || (data._ok ? "A new code is on the way." : "Could not resend code."));
  }
});

document.getElementById("photo").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    pending.photo = await Kyro.fileToDataUrl(file);
    const preview = document.getElementById("avatarPreview");
    preview.style.backgroundImage = "url(" + pending.photo + ")";
    preview.textContent = "";
  } catch (_) {
    setError("photoError", "Could not read that image.");
  }
});

async function finish(skip) {
  setError("photoError", "");
  const user = Object.assign(Kyro.getUser() || {}, {
    firstName: pending.firstName,
    lastName: pending.lastName,
    fullName: (pending.firstName + " " + pending.lastName).trim(),
    email: pending.email,
    phone: pending.phone,
    dateOfBirth: pending.dateOfBirth,
    age: pending.age,
    avatar: skip ? (Kyro.getUser() && Kyro.getUser().avatar) || "" : pending.photo
  });
  if (!skip && pending.photo) {
    try {
      await Kyro.api.updateProfile({
        profilePicture: pending.photo,
        avatar: pending.photo,
        photo: pending.photo
      });
    } catch (_) {}
  }
  if (!Kyro.getToken()) {
    const login = await Kyro.api.login({
      email: pending.email,
      password: pending.password,
      otp: document.getElementById("otp").value.trim()
    });
    const token = Kyro.extractToken(login);
    if (token) Kyro.setSession(token, login.user || user);
    else if (!login._ok && !login.needsVerification) {
      Kyro.setSession("", user);
      setError("photoError", login.message || "Account created. Please login.");
      setTimeout(() => { location.href = "login.html"; }, 1000);
      return;
    }
  }
  Kyro.setSession(Kyro.getToken() || "session", user);
  location.replace("app.html");
}

document.getElementById("finishBtn").addEventListener("click", () => finish(false));
document.getElementById("skipPhotoBtn").addEventListener("click", () => finish(true));
