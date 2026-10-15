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
6. Founders — Vael Tech & Jose Grid (frontend + backend repos)
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

## Added features

- **Clickable links** — `http(s)://` and `www.` URLs in messages are tappable (`js/rich.js`)
- **@mentions** — in groups, type `@` to pick a member; mentions are highlighted, and messages that mention you get an outline
- **Voice notes** — waveform, tap-to-seek, 1x / 1.5x / 2x speed, one note plays at a time (`js/rich.js`)
- **App lock** — 4-digit PIN (Settings > Privacy and safety). Locks on open and after the chosen time in the background; 5 wrong tries triggers a timeout; "Forgot PIN" logs out (`js/lock.js`)

## Kyro extras (polish layer)

All additive. Files: `kyro-extras.css`, `js/extras.js`, `manifest.webmanifest`, `sw.js`. Remove the 3 hook lines in `app.html` to turn them off.

- **Accent colours** — Aurora, Ember, Mint, Rose, Mono (Account tab). Recolours buttons, sent bubbles, highlights
- **Look polish** — grouped bubbles, accent hairline under headers, pill tab indicator, press feedback, slim scrollbars
- **Emoji bursts** — a live emoji-only message (🎉 🥳 🔥 ❤️ 💜 🎂 💯) fires a burst
- **Offline banner** — shows when the connection drops and when it returns
- **Install app** — manifest, icons and a network-first service worker (install card in Account)
- **Haptics** — light vibration on tabs, + and send

## Chat extras (drafts, forward, stickers)

Files: `kyro-chat-extras.css`, `js/chat-extras.js` (two hook lines in `app.html`).

- **Drafts** — unsent text is saved per chat, restored when you reopen it, and shown as "Draft: …" in the chat list
- **Forward** — the Forward action now has search and multi-select ("Send to 3 chats"); groups are included
- **Stickers** — smiley button in the composer; Reactions and Vibes packs plus Recent. Stickers are 240×240 PNGs sent as normal image messages, so no backend change is needed
- **Group files** — videos and documents can now be sent in groups (and forwarded to them). Groups send one copy per member, so the limit is 10 MB for groups of 3 or fewer and shrinks as the group grows (30 MB total upload budget)

## Pins and polls

Files: `kyro-pinpoll.css`, `js/pin-poll.js` (two hook lines in `app.html`). **Needs the updated backend** (`routes/polls.js`, pin routes in `routes/chats.js`).

- **Pinned messages** — long-press a message, then Pin. A banner shows at the top of the chat (up to 3 pins; tap to jump, × to unpin). In one-to-one chats pins are shared with the other person; in groups they are saved on this device only
- **Polls in groups** — the bar-chart button in a group's composer. 2-6 options, optional multiple answers, live results, creator can close it. Members see the poll in their chat with the sender and vote from there

## Link previews, folders, quick replies

Files: `kyro-more.css`, `js/more-extras.js` (two hook lines in `app.html`). Link previews need the updated backend (`routes/links.js`).

- **Link previews** — a title, description and picture card under the first link in a message. On by default; switch it off in Account. The server fetches the page (private addresses are blocked), so turn it off if you share private links
- **Chat folders** — long-press a chat and choose Folder (long-press a group row too). Folder chips with unread counts appear next to All/Unread/Pinned/Archived. Folders are saved on this device
- **Quick replies** — the Replies tab in the sticker panel, or type `/` in the message box to see matching replies. Add and delete your own (up to 20)

## Profile polish

File: `kyro-profile.css` (one hook line in `app.html`, CSS only). Same look as before, with:
a soft glow behind the avatar, a slowly turning gradient ring, staggered rise-in of the profile
and its cards every time the tab opens, light-sweep on Edit profile, springy accent swatches, and
accent colours that cross-fade instead of snapping. Respects "reduce motion".

## Disappearing messages and view once

Files: `kyro-vanish.css`, `js/vanish.js` (two hook lines in `app.html`). View once needs the updated backend.

- **Disappearing messages** — clock button in the chat header opens a picker: Off, 5 minutes, 1 hour, 24 hours, 7 days, 30 days, 90 days (one-to-one chats). A small badge shows the active timer and each message shows a countdown
- **View once** — tap the dashed "1" button in the composer, then attach a photo or video (one-to-one chats). The receiver sees a card, taps it, and the file opens full screen once. The server wipes the file in the same step, so it can't be fetched again. The sender sees "Opened" when they have looked. View-once messages can't be forwarded and don't appear in the media gallery
