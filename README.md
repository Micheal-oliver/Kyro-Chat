# Kyro Chat — Welcome / Onboarding Page

Animated introductory slideshow for Kyro Chat (HTML, CSS, vanilla JS).

## What’s included

- `index.html` — 7-slide welcome experience
- `styles.css` — dark theme, transitions, responsive layout
- `app.js` — auto-advance, dots, swipe, keyboard, skip
- `signup.html` / `login.html` — starter auth screens (wire to your API)
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
