# Kyro Chat — Welcome / Onboarding Page

Animated introductory slideshow for Kyro Chat (HTML, CSS, vanilla JS).

## What’s included

- `index.html` — 7-slide welcome experience
- `styles.css` — dark theme, transitions, responsive layout
- `app.js` — auto-advance, dots, swipe, keyboard, skip
- `signup.html` / `login.html` — working auth (OTP + profile photo)
- `app.html` — main chat screen after login
- `js/kyro.js` — API client for `https://chat-backend-tnii.onrender.com`
- `images/` — generated illustrations

## Slides

1. Welcome to Kyro Chat  
2. Enhanced privacy  
3. Groups & communities  
4. Enhanced security  
5. Seamless calls  
6. Founders — Carl Tech & Jose Grid (frontend + backend repos)
7. Join today (Create account + Login)

## How it works

- Each slide auto-advances after **6.5 seconds**
- Progress bar, dots, arrows, swipe, and arrow keys all work
- Last slide stops auto-play and shows the two buttons
- Skip jumps straight to the join screen
- Buttons go to `signup.html` and `login.html`
- If a session already exists, welcome is skipped and `app.html` opens
- Logout clears the session and returns to login (next login asks for OTP)

## Auth + backend

Backend: `https://chat-backend-tnii.onrender.com`

- Register: `POST /api/auth/register` with `firstName`, `lastName`, `email`, `password`, `phone`
- OTP: `POST /api/auth/verify-otp` `{ email, otp }` and `POST /api/auth/resend-otp` `{ email }`
- Login: `POST /api/auth/login` `{ email, password }`
- Session: `GET /api/auth/me` with `Authorization: Bearer <token>`
- Chat: `GET /api/chats`, `GET /api/users/lookup`, `GET /api/messages/:id`, `POST /api/messages`

## Preview locally

Open `index.html` in a browser, or from this folder:

```bash
npx serve .
```

## Serve from your Node.js app on Render

Put this folder in `public/` (or `client/`) and serve static files:

```js
const path = require("path");
const express = require("express");
const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Kyro Chat running on " + port));
```

Then point the signup/login forms at your MongoDB routes, for example:

- `POST /api/auth/signup`
- `POST /api/auth/login`

## Customize

- Slide timing: change `SLIDE_MS` in `app.js` and `--slide-ms` in `styles.css`
- Copy: edit text in `index.html`
- Colors: CSS variables at the top of `styles.css`
